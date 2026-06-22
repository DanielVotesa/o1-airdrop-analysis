// Build public, fact-checkable evidence files for the repo:
//  - data/all_recipients.csv          : every recipient (16,314) with amount, cohort, claim block/tx
//  - evidence/address_sorted_sweeps/batch_wallets.csv : all 2,100 wallets of the 21 batches-of-100 (P01..P21)
//  - evidence/address_sorted_sweeps/example_batch_P01.csv : one full batch (100 wallets) for a quick look
const fs = require("fs"); const path = require("path"); const P = (f) => path.join(__dirname, f);
const claims = fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const nonces = JSON.parse(fs.readFileSync(P("nonces.json"), "utf8"));
const txfrom = new Map(); for (const ln of fs.readFileSync(P("tx_from.jsonl"), "utf8").trim().split("\n")) { if (ln) { const x = JSON.parse(ln); txfrom.set(x.k, x.v.split("|")[0]); } }
const isFresh = (a) => nonces[a] && nonces[a].at === 0;
const o = (w) => Number(BigInt(w)) / 1e18;
const bundler = (c) => c.method === "handleOps" ? (txfrom.get(c.tx) || "") : "self-claim";

// ---- all_recipients.csv (sorted by amount desc) ----
const rows = claims.map((c) => ({ a: c.to, o: o(c.value), cohort: isFresh(c.to) ? "fresh" : "non-fresh", n: nonces[c.to] ? nonces[c.to].at : "", block: c.block, ts: c.ts, method: c.method, tx: c.tx }))
  .sort((x, y) => y.o - x.o);
const arc = ["address,amount_O,cohort,nonce_at_claim,claim_block,claim_time,method,claim_tx"];
for (const r of rows) arc.push(`${r.a},${r.o},${r.cohort},${r.n},${r.block},${r.ts},${r.method},${r.tx}`);
fs.writeFileSync(P("github-repo/data/all_recipients.csv"), arc.join("\n") + "\n");

// ---- 21 batches of exactly 100 (block order) -> P01..P21 ----
const order = (arr) => [...arr].sort((a, b) => (a.block - b.block) || a.tx.localeCompare(b.tx) || a.to.localeCompare(b.to));
const fresh = order(claims.filter((c) => isFresh(c.to)));
const runs = []; let cur = [fresh[0]];
for (let i = 1; i < fresh.length; i++) { if (BigInt(fresh[i].to) > BigInt(fresh[i - 1].to)) cur.push(fresh[i]); else { runs.push(cur); cur = [fresh[i]]; } }
runs.push(cur);
const batches = runs.filter((r) => r.length === 100); // already in block order
const OUT = P("github-repo/evidence/address_sorted_sweeps");
const memHdr = "batch_id,seq_in_batch,address,amount_O,claim_block,claim_time,claim_tx,bundler_submitter";
const mem = [memHdr];
batches.forEach((r, bi) => {
  const id = "B" + String(bi + 1).padStart(2, "0");
  r.forEach((c, i) => mem.push(`${id},${i + 1},${c.to},${o(c.value)},${c.block},${c.ts},${c.tx},${bundler(c)}`));
});
fs.writeFileSync(path.join(OUT, "batch_wallets.csv"), mem.join("\n") + "\n");
// example: B01 only
const ex = [memHdr];
batches[0].forEach((c, i) => ex.push(`B01,${i + 1},${c.to},${o(c.value)},${c.block},${c.ts},${c.tx},${bundler(c)}`));
fs.writeFileSync(path.join(OUT, "example_batch_B01.csv"), ex.join("\n") + "\n");

// ---- batches_summary.csv (B-id, block order; richer than page_totals) ----
const sh = ["batch_id,wallets,start_block,end_block,start_time,duration_min,start_address,end_address,total_O,avg_per_wallet_O,min_wallet_O,max_wallet_O,bundlers"];
batches.forEach((r, bi) => {
  const id = "B" + String(bi + 1).padStart(2, "0");
  const amts = r.map((c) => o(c.value)); const tot = amts.reduce((a, b) => a + b, 0);
  const dur = ((new Date(r[r.length - 1].ts) - new Date(r[0].ts)) / 60000).toFixed(1);
  const bset = [...new Set(r.map(bundler))].length;
  sh.push(`${id},100,${r[0].block},${r[r.length - 1].block},${r[0].ts},${dur},${r[0].to},${r[r.length - 1].to},${tot.toFixed(2)},${(tot / 100).toFixed(2)},${Math.min(...amts).toFixed(2)},${Math.max(...amts).toFixed(2)},${bset}`);
});
fs.writeFileSync(path.join(OUT, "batches_summary.csv"), sh.join("\n") + "\n");

console.log(`all_recipients.csv: ${rows.length} rows`);
console.log(`batches: ${batches.length} -> batch_wallets.csv ${batches.length * 100} rows, batches_summary.csv, example_batch_B01.csv (100 rows)`);
console.log(`B01: blocks ${batches[0][0].block}-${batches[0][99].block}, ${batches[0][0].to} -> ${batches[0][99].to}`);
