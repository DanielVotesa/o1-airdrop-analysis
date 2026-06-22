# Address-sorted batches of 100: fact-check files

Backing data for findings 5, 6 and 7 in the main [README](../../README.md). Re-derive with
`node ../../scripts/06_sweep_analysis.js` and `node ../../scripts/12_build_public_evidence.js`.

## What to look at

An Ethereum address is just a number. Order the fresh claims by the order they happened on-chain (block
ascending) and the recipient addresses come out strictly sorted, in batches of exactly 100, each batch
resetting to a low address and climbing again: the trace of a pre-sorted list claimed batch by batch. On top
of that, each batch of 100 sums to about 240,728 $O (within 0.6%) even though the individual amounts swing
from about 70 to about 36,000, which is a deliberate equal-sum split.

## Files

- **`example_batch_B01.csv`** one full batch (100 wallets): `batch_id, seq_in_batch, address, amount_O,
  claim_block, claim_time, claim_tx, bundler_submitter`. Read top to bottom: the `address` climbs, the
  `claim_block` changes every row, and the `amount_O` jumps around, yet the 100 sum to 238,585 $O.
- **`batch_wallets.csv`** the same columns for all 21 batches (2,100 wallets). Filter by `batch_id`
  (B01 to B21). Every `claim_tx` is checkable at basescan.org/tx/{hash}.
- **`batches_summary.csv`** one row per batch: `batch_id, wallets, start_block, end_block, start_time,
  duration_min, start_address, end_address, total_O, avg_per_wallet_O, min_wallet_O, max_wallet_O, bundlers`.
  Note `total_O` is about 240,728 for every row while `min_wallet_O` and `max_wallet_O` vary widely: that is
  the equal-sum balancing with randomized per-wallet amounts.
- **`run_length_histogram.csv`** `run_length, count, claims_covered`. Note the pile-up at 97 to 100 then
  exactly zero above 100, a hard batch-size cap.

## Spot-check on Basescan (no code)
1. Open `example_batch_B01.csv`. The 100 `address` values are in strictly increasing numeric order, each in
   its own block (47479105 to 47479279, about 6 minutes).
2. Open a few `claim_tx` on Basescan: each is a gasless `handleOps` claim delivering `$O` to that row's
   address, submitted by one of 4 rotating relayers (`bundler_submitter`).
3. The addresses keep climbing while the submitter rotates, so the sort is above the relayer layer.
4. Add up `amount_O` for the batch: about 238,585 $O, and every other batch lands within 0.6% of 240,728.
