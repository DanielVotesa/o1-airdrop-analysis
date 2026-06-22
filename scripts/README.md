# `scripts/` the reproduction pipeline

Plain Node.js (v18+ for global `fetch`). The only dependency is `js-sha3` (Merkle leaf hashing); everything
else uses public Base RPC and the public Blockscout indexer. All scripts read and write the `.jsonl` / `.json`
files via `__dirname`, so run them from a directory that contains the data files (or copy the data in).

```
npm install                                  js-sha3 only
node 01_enumerate_claims.js                  -> claims.jsonl   (every claim from the distributor)
node 02_fetch_nonces.js                      -> nonces.json    (nonce at claim for all, nonce now for fresh)
node 03_fetch_code.js                        -> code.jsonl     (wallet type via eth_getCode)
node 04_fetch_balances_and_submitters.js     -> fresh_bal.jsonl, tx_from.jsonl
node 05_recompute.js                         -> recompute_out.json, heatmap_md.txt (headline metrics)
node 06_sweep_analysis.js                    -> the address-sorted batch analysis
node 07_export_evidence.js                   -> evidence CSVs, key_metrics.json
node 08_trace_movers.js                      -> where the 61 movers' $O went
node 09_verify_balance.js                    -> per-batch totals and the random-grouping test (finding 6)
node 10_decompile_distributor.js             -> distributor_functions.json (finding 8)
node 11_build_public_evidence.js             -> data/all_recipients.csv, batch_wallets.csv, example batch
node 12_gen_timeline_svg.js                  -> evidence/timeline.svg (the finding 4 chart)
```

Notes:
- Scripts 01 to 04 hit the network and are resumable (they checkpoint to their output files; delete an output
  to force a full refetch, needed for a fresh snapshot of nonce-now or balances).
- Public RPC endpoints rate-limit; the fetchers rotate endpoints and retry. A full run takes a few minutes.
- Filenames inside the scripts use the working-copy names (`claims.jsonl`, `nonces.json`, `code.jsonl`,
  `fresh_bal.jsonl`, `tx_from.jsonl`); in this repo those are published under `../data/` with clearer names
  (`wallet_code.jsonl`, `fresh_balances.jsonl`, `tx_submitters.jsonl`). Rename or symlink if re-running.
- These are research scripts kept as-is for transparency, not a polished library.
