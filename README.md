<img width="2940" height="770" alt="image" src="https://github.com/user-attachments/assets/7f6504f2-1849-4507-9216-5f413b0e32c2" />

# RWA Oracle (Stellar + ZK)

This repository contains an early PoC implementation of the Neko Protocol RWA price oracle for the Stellar ecosystem. The goal is to provide trust‑minimized, verifiable pricing data for tokenized real‑world assets (RWAs) such as equities, bonds, and other financial instruments.

Although this version focuses on simplicity, the architecture is designed to evolve toward higher security, more resilient data ingestion, and advanced cryptographic guarantees.

## Overview

The oracle fetches asset prices from two independent API providers. Instead of publishing raw API values on‑chain, the system generates a zero‑knowledge proof (ZKP) that shows the following:

* The two or more feeds are close enough to each other according to a predefined tolerance rule.
* A final aggregated price was computed correctly.
* No party learns which specific API returned which value.

The on‑chain smart contract (Soroban) verifies the proof and updates the RWA price stored in the protocol.

This design allows Neko Protocol to operate a lending and borrowing system backed by real‑world assets without exposing sensitive or proprietary feed data.

## How It Works

1. **Fetch Prices:** The off‑chain oracle service retrieves price data for a given asset from two or more external APIs.
2. **Normalize:** Both values are converted into a unified integer‑based format compatible with ZK circuits. Floating‑point operations are avoided as Noir doesn't exactly work with floats.
3. **Prove:** A Noir/Barretenberg circuit checks alignment between feeds (e.g., the difference must not exceed a percentage threshold). It then computes the final price.
4. **Verify:** The Soroban smart contract verifies the proof and writes the aggregated, verified price on‑chain.
5. **Consume:** Neko Protocol's lending/borrowing contracts read the verified RWA price to calculate collateral values and liquidation thresholds.

## Current Limitations (Roadmap)

This initial implementation is intentionally lightweight. The roadmap includes:

* Integrating more than five data sources.
* Implementing feed attestation, signatures, and Merkle proofs.
* Adding detection for outliers and adversarial price behavior.
* Introducing distributed oracle operators and proof rotation.
* Deploying a high‑availability, fault‑tolerant oracle relay.
* Expanding support to additional RWA categories (treasuries, corporate bonds, commodities).

## Architecture Diagram

<img width="300" height="1000" alt="Diagram RWA Lending" src="https://github.com/user-attachments/assets/125c403a-07c7-4453-85f6-a29343bf62a1" />

## License

MIT License.
