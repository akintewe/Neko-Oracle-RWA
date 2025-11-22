# RWA Orchestrator Contract

This contract manages the deployment and lifecycle of RWA Token contracts.

## Features

- **Deploy RWA Token Contracts**: Deploy new RWA token contracts for different assets
- **Manage Contract Registry**: Map asset symbols to contract addresses
- **Upgrade Contracts**: Update the WASM hash for deployed contracts
- **Admin Controls**: All administrative functions require admin authentication

## Functions

- `deploy_asset_contract()`: Deploy a new RWA token contract for a given asset
- `get_asset_contract()`: Retrieve the contract address for an asset symbol
- `set_asset_contract()`: Manually set an asset symbol to a contract address (admin-only)
- `update_rwa_wasm_hash()`: Update the WASM hash for deploying new contracts (admin-only)
- `upgrade_asset_contract()`: Upgrade an existing asset contract to a new WASM version (admin-only)

## Usage

The orchestrator is initialized with:
- Admin address
- XLM SAC (Stellar Asset Contract) address
- Collateral oracle address (Reflector Oracle)
- RWA token WASM hash

When deploying a new RWA token contract, the orchestrator:
1. Creates a new contract instance using the stored WASM hash
2. Initializes it with the provided parameters (oracle addresses, asset symbol, etc.)
3. Registers the asset symbol → contract address mapping
4. Returns the new contract address
