# Methodology

Everything in this repo is derived from public Base (chain 8453) data. This file documents the exact
definitions, sources and ordering rules so any third party can reproduce or refute the results.

## Definitions

- **Claim**: an ERC-20 `Transfer` event of `$O` with `from =` the distributor
  `0x16557542aea17d4b2022d6c0a2e0e2fc0ce65631`. One transfer is one claim. The full set is `data/claims.jsonl`.
- **Fresh wallet**: a recipient whose account nonce was 0 at the block of its claim, measured as
  `eth_getTransactionCount(addr, claimBlock - 1) == 0` against a Base archive node. It had never sent a
  transaction before receiving the airdrop.
- **Non-fresh wallet**: nonce greater than 0 at claim. A neutral factual label only; it does not by itself
  mean the wallet is an independent real user.
- **o1 in-app wallet (on-chain signature)**: an EOA delegated via EIP-7702 to the ZeroDev Kernel
  implementation `0xd6CEDDe8...`. Detected from `eth_getCode`: the code begins `0xef0100` followed by the
  implementation address. The private keys for these wallets are generated and held off-chain by Turnkey
  (secure-enclave wallet infrastructure), and signing is orchestrated by the o1 platform. Turnkey is not
  visible on-chain; the on-chain detection signature is the EIP-7702 delegation to the Kernel implementation.
- **Bundler / submitter**: for a gasless (`handleOps`, ERC-4337) claim, the EOA that submitted the
  transaction on-chain (the tx `from`). The claim itself rides inside as a UserOperation. Recorded in
  `data/tx_submitters.jsonl`.
- **Mover**: a fresh wallet whose current `$O` balance is less than the amount it received. Holder: balance
  greater than or equal to received.

## Data sources

- **Claims**: every `from = distributor` ERC-20 transfer, paged from the public Blockscout v2 API
  (`base.blockscout.com/api/v2/addresses/{distributor}/token-transfers?filter=from`).
- **Nonce at claim and now**: `eth_getTransactionCount(addr, block)` over public Base RPC
  (`mainnet.base.org`, `base-mainnet.public.blastapi.io`, `1rpc.io/base`), for all recipients (nonce at
  claim) and all fresh wallets (nonce now).
- **Wallet type**: `eth_getCode(addr)` per recipient.
- **Balances**: `eth_call` `balanceOf(addr)` on the `$O` token per fresh wallet.
- **Distributor functions**: `eth_getCode` on the distributor, function-selector extraction, plus live
  `eth_call` on the read functions to confirm the contract is genuine.

All addresses (token, distributor, Merkle root, EntryPoint, bundlers) are checkable on basescan.org.

## Ordering rule (used for the batch analysis)

To look for address-sorted structure, claims are ordered by **block number ascending**, breaking ties by
**transaction hash ascending** (and address only as a last resort for claims sharing a block and a tx). The
tx-hash tiebreak is independent of the recipient address, so it cannot manufacture ascending-by-address order.

The headline "21 batches of exactly 100" are all one-claim-per-block (each spans 100 distinct blocks), so
block order alone fixes them and the result is tiebreak-invariant: the same 21 batches appear under
tx-ascending, tx-descending, a hostile address-descending tiebreak, and an alone-in-block restriction.

## Null models / controls

To show the sorted batches are not a chance artifact, the same run-finder was applied to:
1. the same fresh wallets re-ordered address-independently (by tx-hash, and by random shuffle): longest run
   about 7;
2. non-fresh claims in real on-chain order: longest run 6, zero runs of 50 or more;
3. a random size-matched subset of all claims in block order: longest run in the 60s to 70s, never 99 or 100.

The real fresh cohort produces 21 runs of exactly 100 and 53 runs of 50 or more. The contrast is the evidence.
For the equal-sum balance, the per-batch total spread (0.6%) is compared to 5,000 random regroupings of the
same amounts (median 14%, never below about 6%).

## Snapshot / freshness

Snapshot 2026-06-22. The claim window was still open (latest claim 2026-06-22 15:04 UTC), so claim counts and
distributed totals are lower bounds that keep rising. `data/` is the frozen snapshot used for every figure
here.
