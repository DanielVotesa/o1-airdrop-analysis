// Full recompute from refreshed local data. No network.
// Produces: headline numbers, fresh cohort + INERT breakdown (token-based, robust to 7702 nonce),
// per-wallet stats, concentration, cumulative crossover, markdown hourly heatmap, clusters, wallet types,
// and delta vs the previous (2026-06-20) snapshot. Writes recompute_out.json + heatmap_md.txt.
const fs = require("fs"); const path = require("path"); const P = (f) => path.join(__dirname, f);
const WEI = 1e18; const o = (w) => Number(BigInt(w)) / WEI;
const pct = (a, b) => b ? (100 * a / b).toFixed(2) + "%" : "-";

const claims = fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const nonces = JSON.parse(fs.readFileSync(P("nonces.json"), "utf8"));
const isFresh = (a) => nonces[a] && nonces[a].at === 0;

// balances + code (optional)
const bal = new Map();
if (fs.existsSync(P("fresh_bal.jsonl"))) for (const ln of fs.readFileSync(P("fresh_bal.jsonl"), "utf8").trim().split("\n")) { if (ln) { const x = JSON.parse(ln); bal.set(x.k, BigInt(x.v || "0x0")); } }
const code = new Map();
if (fs.existsSync(P("code.jsonl"))) for (const ln of fs.readFileSync(P("code.jsonl"), "utf8").trim().split("\n")) { if (ln) { const x = JSON.parse(ln); code.set(x.k, x.v); } }

// ---------- totals ----------
const total = claims.length;
const recips = new Set(claims.map((c) => c.to));
let totalWei = 0n; const mCount = {}, mWei = {};
for (const c of claims) { totalWei += BigInt(c.value); mCount[c.method] = (mCount[c.method] || 0) + 1; mWei[c.method] = (mWei[c.method] || 0n) + BigInt(c.value); }

// ---------- fresh ----------
let claimsFresh = 0, weiFresh = 0n; const freshByMethod = {};
for (const c of claims) if (isFresh(c.to)) { claimsFresh++; weiFresh += BigInt(c.value); freshByMethod[c.method] = (freshByMethod[c.method] || 0) + 1; }
const freshWallets = [...recips].filter(isFresh);
const organicWallets = [...recips].filter((a) => !isFresh(a));

// received per wallet
const recvFresh = new Map(), recvOrg = new Map();
for (const c of claims) { const m = isFresh(c.to) ? recvFresh : recvOrg; m.set(c.to, (m.get(c.to) || 0n) + BigInt(c.value)); }

// ---------- INERT breakdown (the "fresh excluding those that transacted after") ----------
// 7702 caveat: every fresh in-app wallet's EOA nonce is bumped to >=1 by the bundled delegation,
// and token moves can happen gaslessly (4337) WITHOUT bumping the EOA nonce. So the robust "inert"
// signal is token-based: still holds the full received amount = never moved anything.
let holdFull = 0, movedSome = 0, zeroed = 0, balKnown = 0;
const movers = [];
for (const a of freshWallets) {
  if (!bal.has(a)) continue; balKnown++;
  const b = bal.get(a), r = recvFresh.get(a);
  if (b >= r) holdFull++;
  else { movedSome++; if (b === 0n) zeroed++; movers.push({ addr: a, received: o(r), balNow: o(b) }); }
}
// nonce-based (supporting): nonce_now distribution for fresh
const nnDist = { "0": 0, "1": 0, "2": 0, "3-10": 0, "11+": 0, unknown: 0 };
for (const a of freshWallets) { const n = nonces[a].now; if (n === undefined || n === null) nnDist.unknown++; else if (n === 0) nnDist["0"]++; else if (n === 1) nnDist["1"]++; else if (n === 2) nnDist["2"]++; else if (n <= 10) nnDist["3-10"]++; else nnDist["11+"]++; }

// ---------- per-wallet stats ----------
function stats(map) {
  const arr = [...map.values()].map((w) => o(w)).sort((a, b) => a - b);
  const n = arr.length; const sum = arr.reduce((a, b) => a + b, 0);
  const q = (p) => arr[Math.min(n - 1, Math.floor(p * n))];
  return { n, total: sum, median: q(0.5), mean: sum / n, p90: q(0.9), p99: q(0.99), max: arr[n - 1] };
}
const sFresh = stats(recvFresh), sOrg = stats(recvOrg);

// concentration of fresh O
const freshAmts = [...recvFresh.values()].map((w) => o(w)).sort((a, b) => b - a);
const freshSum = freshAmts.reduce((a, b) => a + b, 0);
const top = (k) => freshAmts.slice(0, k).reduce((a, b) => a + b, 0);
const conc = { top100: pct(top(100), freshSum), top1000: pct(top(1000), freshSum) };

// ---------- nonce@claim distribution ----------
const bucket = (n) => n === 0 ? "0" : n === 1 ? "1" : n <= 5 ? "2-5" : n <= 20 ? "6-20" : n <= 100 ? "21-100" : "100+";
const ndist = {};
for (const a of recips) { const n = nonces[a] ? nonces[a].at : undefined; const k = n === undefined ? "unknown" : bucket(n); ndist[k] = (ndist[k] || 0) + 1; }

// ---------- temporal ----------
const byTime = [...claims].sort((a, b) => (a.block - b.block) || a.tx.localeCompare(b.tx));
const t0 = new Date(byTime[0].ts).getTime();
// hourly
const hourly = {};
for (const c of claims) { const h = c.ts.slice(0, 13); (hourly[h] ||= { all: 0, fresh: 0, wei: 0n, freshWei: 0n }); hourly[h].all++; hourly[h].wei += BigInt(c.value); if (isFresh(c.to)) { hourly[h].fresh++; hourly[h].freshWei += BigInt(c.value); } }
// cumulative crossover
let cumF = 0, cumO = 0, cumFW = 0n, cumOW = 0n, crossCount = null, crossValue = null;
for (const c of byTime) { if (isFresh(c.to)) { cumF++; cumFW += BigInt(c.value); } else { cumO++; cumOW += BigInt(c.value); } if (crossCount === null && cumF > cumO) crossCount = c.ts; if (crossValue === null && cumFW > cumOW) crossValue = c.ts; }
// first 1/2/3h
function firstN(hours) { const cut = t0 + hours * 3600e3; const sub = byTime.filter((c) => new Date(c.ts).getTime() < cut); const f = sub.filter((c) => isFresh(c.to)); const fw = f.reduce((s, c) => s + BigInt(c.value), 0n); const w = sub.reduce((s, c) => s + BigInt(c.value), 0n); return { claims: sub.length, fresh: f.length, freshPctCount: pct(f.length, sub.length), freshPctO: pct(o(fw), o(w)) }; }

// ---------- identical-amount clusters (fresh) ----------
const byAmt = {};
for (const c of claims) if (isFresh(c.to)) (byAmt[c.value] ||= []).push(c);
const clusters = Object.entries(byAmt).map(([v, arr]) => ({ amount: o(v), wallets: arr.length, txs: new Set(arr.map((c) => c.tx)).size, blocks: new Set(arr.map((c) => c.block)).size, first: arr.reduce((m, c) => c.ts < m ? c.ts : m, arr[0].ts), last: arr.reduce((m, c) => c.ts > m ? c.ts : m, arr[0].ts) })).filter((c) => c.wallets >= 5).sort((a, b) => b.wallets - a.wallets);
const sharedWallets = Object.values(byAmt).filter((arr) => arr.length >= 5).reduce((s, arr) => s + arr.length, 0);

// ---------- wallet types ----------
function typeBreak(list) {
  let eoa = 0, kernel = 0, other = 0, unk = 0;
  for (const a of list) { const v = code.get(a); if (v === undefined) { unk++; continue; } if (v === "eoa") eoa++; else if (v.startsWith("7702:")) { if (v.toLowerCase().includes("d6cedde8")) kernel++; else other++; } else other++; }
  return { eoa, kernel, other, unk };
}
const tFresh = typeBreak(freshWallets), tOrg = typeBreak(organicWallets);

// ---------- inter-arrival gaps (fresh) ----------
const fT = byTime.filter((c) => isFresh(c.to)).map((c) => new Date(c.ts).getTime());
const gapHist = {}; for (let i = 1; i < fT.length; i++) { const g = (fT[i] - fT[i - 1]) / 1000; const k = g === 0 ? "0s" : g <= 2 ? "<=2s" : g <= 10 ? "3-10s" : g <= 30 ? "11-30s" : g <= 60 ? "31-60s" : g <= 300 ? "1-5m" : g <= 1800 ? "5-30m" : ">30m"; gapHist[k] = (gapHist[k] || 0) + 1; }

// ---------- delta vs previous snapshot ----------
let delta = null;
if (fs.existsSync(P("claims.backup-2026-06-20.jsonl"))) {
  const old = fs.readFileSync(P("claims.backup-2026-06-20.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  const oldTx = new Set(old.map((c) => c.tx + "|" + c.to));
  const newOnes = claims.filter((c) => !oldTx.has(c.tx + "|" + c.to));
  const oldRecip = new Set(old.map((c) => c.to));
  const newRecip = newOnes.filter((c) => !oldRecip.has(c.to));
  const newFresh = newOnes.filter((c) => isFresh(c.to));
  let newWei = 0n, newFreshWei = 0n; for (const c of newOnes) { newWei += BigInt(c.value); if (isFresh(c.to)) newFreshWei += BigInt(c.value); }
  delta = { oldClaims: old.length, newClaims: newOnes.length, newUniqueRecipients: new Set(newRecip.map((c) => c.to)).size, newFreshClaims: newFresh.length, newO: o(newWei), newFreshO: o(newFreshWei), newWindowEnd: byTime[byTime.length - 1].ts };
}

// ---------- markdown heatmap ----------
const md = [];
md.push("| hour (UTC) | total | fresh | non-fresh | % fresh | fresh % of O |");
md.push("|---|---|---|---|---|---|");
for (const h of Object.keys(hourly).sort()) { const x = hourly[h]; md.push(`| ${h.replace("T", " ")}:00 | ${x.all} | ${x.fresh} | ${x.all - x.fresh} | ${Math.round(100 * x.fresh / x.all)}% | ${Math.round(100 * (x.wei ? Number(x.freshWei) / Number(x.wei) : 0))}% |`); }
fs.writeFileSync(P("heatmap_md.txt"), md.join("\n") + "\n");

const out = {
  window: { start: byTime[0].ts, end: byTime[byTime.length - 1].ts },
  totals: { claims: total, uniqueRecipients: recips.size, distributedO: o(totalWei), distinctTxs: new Set(claims.map((c) => c.tx)).size },
  methods: Object.fromEntries(Object.keys(mCount).map((m) => [m, { count: mCount[m], pctCount: pct(mCount[m], total), o: o(mWei[m]), pctO: pct(o(mWei[m]), o(totalWei)) }])),
  fresh: { wallets: freshWallets.length, pctRecipients: pct(freshWallets.length, recips.size), claims: claimsFresh, pctClaims: pct(claimsFresh, total), o: o(weiFresh), pctO: pct(o(weiFresh), o(totalWei)), pctOexact: (100 * Number(weiFresh) / Number(totalWei)).toFixed(3) + "%", byMethod: freshByMethod },
  inert: { balKnown, holdFull, movedSome, zeroed, holdFullPct: pct(holdFull, balKnown), nonceNowDist: nnDist, movers: movers.sort((a, b) => b.received - a.received).slice(0, 40) },
  perWallet: { fresh: sFresh, organic: sOrg, gapMedianX: (sFresh.median / (sOrg.median || 1)).toFixed(0) + "x" },
  concentration: conc,
  nonceAtClaimDist: ndist,
  crossover: { byCount: crossCount, byValue: crossValue },
  firstHours: { h1: firstN(1), h2: firstN(2), h3: firstN(3) },
  clustersTop: clusters.slice(0, 15), clusterSharedWallets: sharedWallets, clusterSharedPct: pct(sharedWallets, freshWallets.length),
  walletTypes: { fresh: tFresh, organic: tOrg },
  gaps: gapHist,
  delta,
};
fs.writeFileSync(P("recompute_out.json"), JSON.stringify(out, null, 2));

// console summary
console.log(`WINDOW ${out.window.start} -> ${out.window.end}`);
console.log(`claims ${total} | recipients ${recips.size} | distributed ${o(totalWei).toLocaleString()} O | distinct tx ${out.totals.distinctTxs}`);
console.log(`methods:`, JSON.stringify(out.methods));
console.log(`FRESH wallets ${freshWallets.length} (${out.fresh.pctRecipients} of recips) | claims ${claimsFresh} (${out.fresh.pctClaims}) | O ${o(weiFresh).toLocaleString()} (${out.fresh.pctOexact})`);
console.log(`INERT: balKnown ${balKnown} | holdFull ${holdFull} (${out.inert.holdFullPct}) | movedSome ${movedSome} | zeroed ${zeroed}`);
console.log(`fresh nonce_now dist:`, JSON.stringify(nnDist));
console.log(`per-wallet fresh median ${sFresh.median} vs organic ${sOrg.median} (${out.perWallet.gapMedianX})`);
console.log(`concentration top100 ${conc.top100} top1000 ${conc.top1000}`);
console.log(`crossover count@${crossCount} value@${crossValue}`);
console.log(`first1h`, JSON.stringify(firstN(1)), `first2h`, JSON.stringify(firstN(2)), `first3h`, JSON.stringify(firstN(3)));
console.log(`clusters>=5: ${clusters.length}, sharedWallets ${sharedWallets} (${out.clusterSharedPct})`);
console.log(`wallet types fresh`, JSON.stringify(tFresh), `organic`, JSON.stringify(tOrg));
console.log(`DELTA`, JSON.stringify(delta));
console.log("\nwrote recompute_out.json + heatmap_md.txt");
