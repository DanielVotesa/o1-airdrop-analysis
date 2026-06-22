// Independent re-derivation (from raw claims.jsonl, NOT from the exported CSVs) of:
//  (1) per-page totals for the 21 exactly-100 runs + avg per page + CV
//  (2) bootstrap: is the per-page-sum tightness anomalous vs random grouping of the SAME amounts? (mulberry32 RNG)
//  (3) avg-per-wallet by run-length bucket -> is it ~2400 regardless of run size? is the tightness size-dependent?
const fs = require("fs"); const path = require("path"); const P = (f) => path.join(__dirname, f);
const claims = fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const nonces = JSON.parse(fs.readFileSync(P("nonces.json"), "utf8"));
const isFresh = (a) => nonces[a] && nonces[a].at === 0;
const o = (w) => Number(BigInt(w)) / 1e18;
const order = (arr) => [...arr].sort((a, b) => (a.block - b.block) || a.tx.localeCompare(b.tx) || a.to.localeCompare(b.to));
function ascRuns(seq) { if (!seq.length) return []; const runs = []; let cur = [seq[0]]; for (let i = 1; i < seq.length; i++) { if (BigInt(seq[i].to) > BigInt(seq[i - 1].to)) cur.push(seq[i]); else { runs.push(cur); cur = [seq[i]]; } } runs.push(cur); return runs; }
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
function mulberry32(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const fresh = order(claims.filter((c) => isFresh(c.to)));
const runs = ascRuns(fresh);
const runTotal = (r) => r.reduce((s, c) => s + o(c.value), 0);

// (1) the 21 exactly-100 runs
const r100 = runs.filter((r) => r.length === 100);
console.log(`fresh ${fresh.length} | total runs ${runs.length} | runs==100 ${r100.length}`);
const rows = ["run_id,length,start_block,end_block,total_O,avg_per_wallet_O"];
console.log("\n=== per-page totals (21 runs of exactly 100) ===");
console.log("run  start_block  end_block      total_O   avg/wallet");
r100.forEach((r, i) => {
  const t = runTotal(r); const id = "P" + String(i + 1).padStart(2, "0");
  rows.push(`${id},100,${r[0].block},${r[r.length - 1].block},${t.toFixed(2)},${(t / 100).toFixed(2)}`);
  console.log(`${id}  ${r[0].block}    ${r[r.length - 1].block}   ${t.toFixed(0).padStart(9)}   ${(t / 100).toFixed(1)}`);
});
fs.writeFileSync(P("github-repo/evidence/address_sorted_sweeps/page_totals.csv"), rows.join("\n") + "\n");
const sums100 = r100.map(runTotal);
console.log(`\nmean per page ${mean(sums100).toFixed(1)} O | SD ${sd(sums100).toFixed(1)} | CV ${(100 * sd(sums100) / mean(sums100)).toFixed(3)}% | min ${Math.min(...sums100).toFixed(0)} | max ${Math.max(...sums100).toFixed(0)}`);

// (2) bootstrap with mulberry32 (independent RNG), 5000 trials, on the SAME 2100 amounts
const pool = r100.flatMap((r) => r.map((c) => o(c.value)));
const realCV = 100 * sd(sums100) / mean(sums100);
const rnd = mulberry32(20260621);
let cvs = [], le = 0;
for (let t = 0; t < 5000; t++) {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
  const gs = []; for (let g = 0; g < 21; g++) { let s = 0; for (let k = 0; k < 100; k++) s += a[g * 100 + k]; gs.push(s); }
  const cv = 100 * sd(gs) / mean(gs); cvs.push(cv); if (cv <= realCV) le++;
}
cvs.sort((x, y) => x - y);
console.log(`\n=== BOOTSTRAP (mulberry32, 5000 trials, same 2100 amounts repartitioned into 21x100) ===`);
console.log(`real per-page CV ${realCV.toFixed(3)}%`);
console.log(`random CV: min ${cvs[0].toFixed(2)}% | 1st-pct ${cvs[50].toFixed(2)}% | median ${cvs[2500].toFixed(2)}% | max ${cvs[4999].toFixed(2)}%`);
console.log(`random trials with CV <= real (${realCV.toFixed(3)}%): ${le}/5000`);

// (3) avg-per-wallet by run-length bucket
console.log(`\n=== avg per wallet by run-length bucket (is it ~2400 regardless of size?) ===`);
const buckets = [[2, 3], [4, 9], [10, 19], [20, 49], [50, 89], [90, 98], [99, 99], [100, 100]];
console.log("bucket        #runs   #wallets   avg/wallet_O   per-run total: mean / CV%");
for (const [lo, hi] of buckets) {
  const rs = runs.filter((r) => r.length >= lo && r.length <= hi);
  if (!rs.length) continue;
  const wallets = rs.reduce((s, r) => s + r.length, 0);
  const totO = rs.reduce((s, r) => s + runTotal(r), 0);
  const perRunTotals = rs.map(runTotal);
  const cvTot = rs.length > 1 ? (100 * sd(perRunTotals) / mean(perRunTotals)).toFixed(1) : "-";
  console.log(`${(lo + "-" + hi).padEnd(12)}  ${String(rs.length).padStart(4)}   ${String(wallets).padStart(7)}   ${(totO / wallets).toFixed(1).padStart(10)}    ${mean(perRunTotals).toFixed(0).padStart(8)} / ${cvTot}`);
}
// global cohort mean for reference
const allFreshO = fresh.reduce((s, c) => s + o(c.value), 0);
console.log(`\nGLOBAL fresh cohort mean per wallet = ${(allFreshO / fresh.length).toFixed(1)} O (so '~2400/wallet' for big buckets is partly just the cohort mean; the ANOMALY is the low CV of equal-size pages).`);

// (3b) do the 99-runs sum to ~full page (240k) or are they fragments?
const r99 = runs.filter((r) => r.length === 99); const r99sums = r99.map(runTotal);
console.log(`\n99-runs: ${r99.length} | mean total ${mean(r99sums).toFixed(0)} O | CV ${(100 * sd(r99sums) / mean(r99sums)).toFixed(2)}%  (compare 100-page ${mean(sums100).toFixed(0)})`);
console.log("wrote github-repo/evidence/address_sorted_sweeps/page_totals.csv");
