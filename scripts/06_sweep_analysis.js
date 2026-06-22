// Deep, defensible analysis of the address-sorted "pages of 100" sweep.
// Canonical claim order = (block asc, then tx-hash asc, then address asc). The tx-hash tiebreak is
// INDEPENDENT of the recipient address, so it cannot manufacture ascending runs. The headline 100-runs
// are one-claim-per-block (distinctBlocks==length) and therefore tiebreak-INVARIANT.
// Outputs: console summary + analysis/f1_summary.json + evidence CSVs for fact-checking.
const fs = require("fs"); const path = require("path"); const P = (f) => path.join(__dirname, f);
const claims = fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const nonces = JSON.parse(fs.readFileSync(P("nonces.json"), "utf8"));
const code = new Map(); for (const ln of fs.readFileSync(P("code.jsonl"), "utf8").trim().split("\n")) { if (ln) { const x = JSON.parse(ln); code.set(x.k, x.v); } }
const txfrom = new Map(); for (const ln of fs.readFileSync(P("tx_from.jsonl"), "utf8").trim().split("\n")) { if (ln) { const x = JSON.parse(ln); txfrom.set(x.k, x.v.split("|")[0]); } }
const isFresh = (a) => nonces[a] && nonces[a].at === 0;
const isKernel = (a) => { const v = code.get(a); return v && v.toLowerCase().startsWith("7702:") && v.toLowerCase().includes("d6cedde8"); };
const o = (w) => Number(BigInt(w)) / 1e18;
const bundler = (c) => c.method === "handleOps" ? (txfrom.get(c.tx) || "?") : "self-claim";

// canonical order
const order = (arr) => [...arr].sort((a, b) => (a.block - b.block) || a.tx.localeCompare(b.tx) || a.to.localeCompare(b.to));

// maximal strictly-ascending-by-address runs
function ascRuns(seq) {
  if (!seq.length) return [];
  const runs = []; let cur = [seq[0]];
  for (let i = 1; i < seq.length; i++) {
    if (BigInt(seq[i].to) > BigInt(seq[i - 1].to)) cur.push(seq[i]);
    else { runs.push(cur); cur = [seq[i]]; }
  }
  runs.push(cur); return runs;
}
// reset-based pages: a boundary only when address drops by a LARGE amount (tolerates small jitter dips)
function pages(seq, dropFrac = 0.30) {
  if (!seq.length) return [];
  const SPAN = (1n << 160n); const DROP = (SPAN * BigInt(Math.round(dropFrac * 1000))) / 1000n;
  const pgs = []; let cur = [seq[0]];
  for (let i = 1; i < seq.length; i++) {
    const prev = BigInt(seq[i - 1].to), now = BigInt(seq[i].to);
    if (now < prev && (prev - now) > DROP) { pgs.push(cur); cur = [seq[i]]; }
    else cur.push(seq[i]);
  }
  pgs.push(cur); return pgs;
}
const hist = (runs) => { const h = {}; for (const r of runs) h[r.length] = (h[r.length] || 0) + 1; return h; };
const coverage = (runs, k) => runs.filter((r) => r.length >= k).reduce((s, r) => s + r.length, 0);
const maxRun = (runs) => runs.reduce((m, r) => Math.max(m, r.length), 0);
const distinctBlockRun = (r) => new Set(r.map((c) => c.block)).size === r.length;

// cohorts
const fresh = order(claims.filter((c) => isFresh(c.to)));
const gaslessKernel = order(claims.filter((c) => c.method === "handleOps" && isKernel(c.to))); // fresh + warm farm wallets
const organic = order(claims.filter((c) => !isFresh(c.to)));
const all = order(claims);

// null model: same fresh wallets, address-independent (tx-hash) order
const shuffled = [...claims.filter((c) => isFresh(c.to))].sort((a, b) => a.tx.localeCompare(b.tx));

const cohorts = {
  fresh: ascRuns(fresh),
  gaslessKernel: ascRuns(gaslessKernel),
  organic: ascRuns(organic),
  allClaims: ascRuns(all),
  fresh_shuffled_null: ascRuns(shuffled),
};

console.log("=================== ADDRESS-SORTED SWEEP ANALYSIS ===================");
console.log(`claims ${claims.length} | fresh ${fresh.length} | gaslessKernel(fresh+warm) ${gaslessKernel.length} | organic ${organic.length}`);
const summary = {};
for (const [name, runs] of Object.entries(cohorts)) {
  const h = hist(runs);
  const big = Object.entries(h).map(([k, v]) => [+k, v]).filter(([k]) => k >= 40).sort((a, b) => a[0] - b[0]);
  const r100 = runs.filter((r) => r.length === 100), r99 = runs.filter((r) => r.length === 99);
  const r100clean = r100.filter(distinctBlockRun).length;
  summary[name] = {
    n: runs.reduce((s, r) => s + r.length, 0), totalRuns: runs.length, maxRun: maxRun(runs),
    runsExactly100: r100.length, runsExactly99: r99.length, runs100oneClaimPerBlock: r100clean,
    runsGte: { 50: runs.filter((r) => r.length >= 50).length, 90: runs.filter((r) => r.length >= 90).length, 99: runs.filter((r) => r.length >= 99).length },
    coverageGte: { 4: coverage(runs, 4), 10: coverage(runs, 10), 25: coverage(runs, 25), 50: coverage(runs, 50), 90: coverage(runs, 90) },
    histTailGte40: Object.fromEntries(big),
  };
  console.log(`\n--- ${name} ---`);
  console.log(`  total ${summary[name].n} | runs ${runs.length} | maxRun ${summary[name].maxRun}`);
  console.log(`  runs ==100: ${r100.length} (one-claim-per-block: ${r100clean}) | ==99: ${r99.length} | >=90: ${summary[name].runsGte[90]} | >=50: ${summary[name].runsGte[50]}`);
  console.log(`  coverage in runs >=4: ${coverage(runs, 4)} (${(100 * coverage(runs, 4) / summary[name].n).toFixed(1)}%) | >=50: ${coverage(runs, 50)} (${(100 * coverage(runs, 50) / summary[name].n).toFixed(1)}%) | >=90: ${coverage(runs, 90)}`);
  console.log(`  run-length tail (>=40): ${big.map(([k, v]) => k + ":" + v).join("  ")}`);
}

// tolerance / page analysis on fresh: do 99/98 merge into 100 under big-drop pagination?
console.log("\n=================== PAGE (reset-based) ANALYSIS on FRESH ===================");
for (const df of [0.30, 0.5]) {
  const pgs = pages(fresh, df);
  const ph = hist(pgs);
  const around100 = pgs.filter((p) => p.length >= 95 && p.length <= 105).length;
  const exactly100 = pgs.filter((p) => p.length === 100).length;
  const cov = pgs.filter((p) => p.length >= 90 && p.length <= 110).reduce((s, p) => s + p.length, 0);
  console.log(`drop>=${df * 100}% of range: pages ${pgs.length} | ==100 ${exactly100} | 95-105 ${around100} | claims in 90-110 pages ${cov} (${(100 * cov / fresh.length).toFixed(1)}%)`);
  const tail = Object.entries(ph).map(([k, v]) => [+k, v]).filter(([k]) => k >= 90).sort((a, b) => a[0] - b[0]);
  console.log(`   page-size tail (>=90): ${tail.map(([k, v]) => k + ":" + v).join("  ")}`);
}

// ---- EVIDENCE EXPORT ----
const OUT = P("github-repo/evidence/address_sorted_sweeps");
fs.mkdirSync(OUT, { recursive: true });
const freshRuns = cohorts.fresh;
const EXPORT_MIN = 20; // export every run >= 20 (captures all organized sweeps; tiny early-chaos runs excluded)
const exported = freshRuns.map((r, idx) => ({ r, idx })).filter((x) => x.r.length >= EXPORT_MIN).sort((a, b) => b.r.length - a.r.length);

// summary CSV: one row per exported run
const sumRows = ["run_id,length,one_claim_per_block,start_block,end_block,start_address,end_address,first_ts,last_ts,span_seconds,distinct_blocks,distinct_txs,distinct_bundlers,bundler_breakdown"];
let rid = 0;
const memberRows = ["run_id,seq_in_run,address,block,tx_hash,bundler_submitter,method,amount_O,ts"];
for (const { r } of exported) {
  rid++;
  const blocks = new Set(r.map((c) => c.block));
  const txs = new Set(r.map((c) => c.tx));
  const bcount = {}; for (const c of r) { const b = bundler(c); bcount[b] = (bcount[b] || 0) + 1; }
  const bbr = Object.entries(bcount).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b.slice(0, 10)}:${n}`).join(" | ");
  const span = (new Date(r[r.length - 1].ts) - new Date(r[0].ts)) / 1000;
  sumRows.push([`R${String(rid).padStart(3, "0")}`, r.length, distinctBlockRun(r), r[0].block, r[r.length - 1].block, r[0].to, r[r.length - 1].to, r[0].ts, r[r.length - 1].ts, span, blocks.size, txs.size, Object.keys(bcount).length, `"${bbr}"`].join(","));
  r.forEach((c, i) => memberRows.push([`R${String(rid).padStart(3, "0")}`, i + 1, c.to, c.block, c.tx, bundler(c), c.method, o(c.value), c.ts].join(",")));
}
fs.writeFileSync(path.join(OUT, "sweeps_summary.csv"), sumRows.join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "sweep_members.csv"), memberRows.join("\n") + "\n");

// full run-length histogram CSV (fresh)
const fh = hist(freshRuns);
const histRows = ["run_length,count,claims_covered"];
for (const k of Object.keys(fh).map(Number).sort((a, b) => a - b)) histRows.push(`${k},${fh[k]},${k * fh[k]}`);
fs.writeFileSync(path.join(OUT, "run_length_histogram.csv"), histRows.join("\n") + "\n");

fs.writeFileSync(P("analysis_f1_summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nEXPORTED ${exported.length} runs (>=${EXPORT_MIN}) -> ${exported.reduce((s, x) => s + x.r.length, 0)} member rows`);
console.log(`wrote github-repo/evidence/address_sorted_sweeps/{sweeps_summary.csv, sweep_members.csv, run_length_histogram.csv}`);
console.log("wrote analysis_f1_summary.json");
