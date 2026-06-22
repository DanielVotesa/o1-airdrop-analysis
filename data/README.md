# `data/` raw on-chain data (dictionary)

Frozen snapshot, 2026-06-22. Every figure in this repo is derived from these files, which are themselves
derived only from public Base RPC and a public indexer (see `../METHODOLOGY.md`) and can be regenerated with
the scripts in `../scripts/`.

## `all_recipients.csv` every recipient, ready to read (16,523 rows)
Plain table of all claims, sorted by amount descending (so the 41,500-$O cap wallets and the largest
recipients are at the top). Columns: `address, amount_O, cohort (fresh|non-fresh), nonce_at_claim,
claim_block, claim_time, method, claim_tx`. This is the human-readable master list; the `.jsonl` files below
are the machine inputs.

## `fresh_wallets.csv` the fresh cohort only (10,924 rows)
Columns: `address, o_amount, nonce_at_claim, nonce_now, claim_time, block, method, tx`. `nonce_at_claim` is 0
for every row by definition.

## `claims.jsonl` every claim (16,523 lines)
One JSON object per line: the complete set of ERC-20 `Transfer`s of `$O` with `from =` the distributor.
```json
{"to":"0x...","value":"<wei string>","block":47640000,"ts":"2026-06-22T15:04:23.000000Z","method":"handleOps","tx":"0x..."}
```
`to` recipient (lowercase). `value` amount in wei (18 decimals; divide by 1e18 for $O). `block`, `ts` Base
block and timestamp. `method` is `handleOps` (gasless, ERC-4337) or `claim` (claimer paid own gas). `tx`
transaction hash (basescan.org/tx/{tx}).

## `nonces.json` account nonce per recipient
```json
{ "0x...": { "at": 0, "now": 1 }, ... }
```
`at` nonce at `claimBlock - 1` (0 means fresh). `now` current nonce (present for fresh wallets; 1 means the
only transaction ever is the wallet-setup delegation).

## `fresh_balances.jsonl` current $O balance of each fresh wallet
```json
{"k":"0x...","v":"0x<hex balance in wei>"}
```
Compare `v` (hex to BigInt) with the amount received in `claims.jsonl`: `v >= received` means holder.

## `wallet_code.jsonl` wallet type per recipient (`eth_getCode`)
```json
{"k":"0x...","v":"eoa" | "7702:<impl40hex>" | "contract:<len>"}
```
`eoa` plain account, no code. `7702:<impl>` EIP-7702 delegated EOA; `...d6cedde8...` is the ZeroDev Kernel
implementation that o1's in-app wallets use. `contract:<len>` has bytecode of that length.

## `tx_submitters.jsonl` on-chain submitter (bundler) per handleOps tx
```json
{"k":"0x<txhash>","v":"<from>|<to>"}
```
`from` is the relayer/bundler EOA that submitted the gasless transaction; `to` is the ERC-4337 EntryPoint.

All addresses are lowercase. `$O` has 18 decimals; wei strings are exact, divide by 1e18 only for display.
