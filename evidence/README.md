# `evidence/` derived, fact-checkable tables

Each file is regenerated from `../data/` by the scripts in `../scripts/`. Nothing here is hand-entered. The
finding numbers refer to the sections in `../README.md`.

- **`key_metrics.json`** every headline number in one place (totals, fresh cohort, holdings, the batch
  summary, per-batch budget balance, cap comparison, gas, distributor functions, and the delta versus the
  prior snapshot).
- **`address_sorted_sweeps/`** the batches-of-100 evidence (its own README): one full example batch, all 21
  batches' wallets with block and tx hash, the per-batch summary (totals plus min and max), and the
  run-length histogram. Findings 5, 6, 7.
- **`hourly_timeline.csv`** per-hour claim counts: `hour_utc, total, fresh, non_fresh, pct_fresh,
  fresh_pct_of_O`. Finding 4.
- **`amount_clusters.csv`** every $O amount shared by 5 or more fresh wallets:
  `amount_O, wallets, distinct_txs, distinct_blocks, first_ts, last_ts`.
- **`distributor_functions.json`** functions found in the unverified distributor bytecode. Finding 8.
- **`movers.csv`** / **`mover_destinations.csv`** the 61 fresh wallets that moved any $O and where it went.
  Treated as measurement margin (see `../CAVEATS.md`), included for completeness.

To re-verify any single claim, open the relevant file, take a `tx`, `block` or `address`, and check it on
basescan.org. To re-derive a whole table, run the matching script in `../scripts/`.
