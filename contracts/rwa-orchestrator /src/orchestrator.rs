use soroban_sdk::{
    Address, Bytes, BytesN, Env, Map, String, Symbol, contract, contractimpl, contracttype,
    symbol_short, xdr::ToXdr,
};

use crate::error::Error;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Storage {
    /// Wasm hash of the RWA token contract
    pub wasm_hash: BytesN<32>,
    /// XLM SAC contract address; initialized and then passed
    /// to deployed RWA token contracts (can be used for other collateral assets)
    pub xlm_sac: Address,
    /// Collateral oracle contract (Reflector Oracle for XLM, USDC, USDT, etc.), initialized and then passed
    /// to deployed RWA token contracts as the collateral price feed
    pub xlm_contract: Address, // TODO: rename to collateral_contract in future breaking change
    /// A map of deployed asset contracts to their asset symbol.
    /// This is used to check if a contract is a valid asset contract
    /// and to get the asset symbol from the contract address.
    /// The key is the asset symbol, the value is the asset contract address.
    pub assets: Map<String, Address>,
}

impl Storage {
    /// Get current state of the contract
    pub fn get_state(env: &Env) -> Storage {
        env.storage().instance().get(&STORAGE).unwrap()
    }

    pub fn set_state(env: &Env, storage: &Storage) {
        env.storage().instance().set(&STORAGE, &storage);
    }

    /// Set the wasm hash on the object and in instance storage
    pub fn set_wasm_hash(&mut self, env: &Env, wasm_hash: &BytesN<32>) {
        self.wasm_hash = wasm_hash.clone();
        Self::set_state(env, self);
    }
}

pub mod rwa_token {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/rwa_token.wasm");
}

const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const STORAGE: Symbol = symbol_short!("STORAGE");

#[contract]
pub struct OrchestratorContract;

#[contractimpl]
impl OrchestratorContract {
    pub fn __constructor(
        env: &Env,
        admin: Address,
        xlm_sac: Address,
        xlm_contract: Address, // Reflector Oracle for collateral (XLM, USDC, USDT, etc.)
        rwa_wasm_hash: BytesN<32>,
    ) -> Result<(), Error> {
        Self::set_admin(env, &admin);
        Storage::set_state(
            env,
            &Storage {
                wasm_hash: rwa_wasm_hash,
                xlm_sac,
                xlm_contract,
                assets: Map::new(env),
            },
        );
        Ok(())
    }

    /// Update the RWA token wasm hash used to deploy assets, or referenced when upgrading assets. Admin-only.
    pub fn update_rwa_wasm_hash(
        env: &Env,
        rwa_wasm_hash: BytesN<32>,
    ) -> Result<BytesN<32>, Error> {
        Self::require_admin(env);
        Storage::get_state(env).set_wasm_hash(env, &rwa_wasm_hash);
        Ok(rwa_wasm_hash)
    }

    /// Deploy a new RWA token contract for the given asset symbol and parameters. Admin-only.
    /// 
    /// - `asset_contract`: RWA Oracle address for the RWA token being lent
    /// - `pegged_asset`: Symbol of the RWA asset ("TREASURY_2024", etc.)
    /// - `xlm_contract` from storage: Reflector Oracle address for collateral (XLM, USDC, USDT, etc.)
    #[allow(clippy::too_many_arguments)]
    pub fn deploy_asset_contract(
        env: &Env,
        asset_contract: Address, // RWA Oracle for the RWA token being lent
        pegged_asset: Symbol,
        min_collat_ratio: u32,
        name: String,
        symbol: String,
        decimals: u32,
        annual_interest_rate: u32,
    ) -> Result<Address, Error> {
        Self::require_admin(env);
        let mut storage = Storage::get_state(env);
        // Check if the asset contract is already deployed
        if storage.assets.contains_key(symbol.clone()) {
            return Err(Error::AssetAlreadyDeployed);
        }

        // Deploy the contract, salting with the symbol
        let mut salt = Bytes::new(env);
        salt.append(&symbol.clone().to_xdr(env));
        // owner is the admin of this orchestrator contract
        // TODO; in the future, the orchestrator (C... address) should own and administer all asset contracts
        let owner = OrchestratorContract::admin(env).unwrap();
        let salt = env.crypto().sha256(&salt);
        let contract_address = env.deployer().with_current_contract(salt).deploy_v2(
            storage.wasm_hash.clone(),
            (
                owner,
                storage.xlm_sac.clone(),
                storage.xlm_contract.clone(),
                asset_contract,
                pegged_asset,
                min_collat_ratio,
                name,
                &symbol,
                &decimals,
                &annual_interest_rate,
            ),
        );

        // Store the deployed contract address in the assets map
        storage.assets.set(symbol, contract_address.clone());
        Storage::set_state(env, &storage);
        Ok(contract_address)
    }

    /// Get the asset contract address for a given asset symbol.
    pub fn get_asset_contract(env: &Env, asset_symbol: String) -> Result<Address, Error> {
        let storage = Storage::get_state(env);
        storage.assets.get(asset_symbol).ok_or(Error::NoSuchAsset)
    }

    /// Manually set a new asset symbol to a contract address. Admin-only.
    /// This should only be needed if there is a change in storage, or a situation where
    /// manual intervention is required.
    pub fn set_asset_contract(
        env: &Env,
        asset_symbol: String,
        asset_contract: Address,
    ) -> Result<(), Error> {
        Self::require_admin(env);
        let mut storage = Storage::get_state(env);
        if storage.assets.contains_key(asset_symbol.clone()) {
            return Err(Error::AssetAlreadyDeployed);
        }
        storage.assets.set(asset_symbol, asset_contract);
        Storage::set_state(env, &storage);
        Ok(())
    }

    /// Admin can manually set an existing asset symbol to an existing contract address.
    pub fn set_existing_asset_contract(
        env: &Env,
        asset_symbol: String,
        asset_contract: Address,
    ) -> Result<(), Error> {
        Self::require_admin(env);
        let mut storage = Storage::get_state(env);
        storage.assets.set(asset_symbol, asset_contract);
        Storage::set_state(env, &storage);
        Ok(())
    }

    /// Upgrade an existing asset contract to the current wasm hash. Admin-only.
    pub fn upgrade_existing_asset_contract(
        env: &Env,
        asset_symbol: String,
    ) -> Result<Address, Error> {
        Self::require_admin(env);
        let storage = Storage::get_state(env);
        if !storage.assets.contains_key(asset_symbol.clone()) {
            return Err(Error::NoSuchAsset);
        }
        let asset_contract = storage.assets.get(asset_symbol).unwrap();
        let client = rwa_token::Client::new(env, &asset_contract);
        let _ = client
            .try_upgrade(&storage.wasm_hash)
            .map_err(|_| Error::AssetUpgradeFailed)?;
        Ok(asset_contract)
    }

    /// Upgrade the contract to new wasm. Admin-only.
    pub fn upgrade(env: &Env, new_wasm_hash: BytesN<32>) {
        Self::require_admin(env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Get the admin address
    fn admin(env: &Env) -> Option<Address> {
        env.storage().instance().get(&ADMIN_KEY)
    }

    /// Set the admin address. Can only be called once.
    fn set_admin(env: &Env, admin: &Address) {
        // Check if admin is already set
        if env.storage().instance().has(&ADMIN_KEY) {
            panic!("admin already set");
        }
        env.storage().instance().set(&ADMIN_KEY, admin);
    }

    fn require_admin(env: &Env) {
        let admin = Self::admin(env).expect("admin not set");
        admin.require_auth();
    }
}
