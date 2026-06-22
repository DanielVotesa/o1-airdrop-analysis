// Robust, resumable nonce fetcher. Checkpoints to nonce_at.jsonl / nonce_now.jsonl.
const fs = require("fs");
const path = require("path");
const P = (f) => path.join(__dirname, f);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => "0x" + n.toString(16);

const EPS = [
  { url: "https://base-mainnet.public.blastapi.io", max: 100 },
  { url: "https://mainnet.base.org", max: 10 },
  { url: "https://base.gateway.tenderly.co", max: 15 },
  { url: "https://1rpc.io/base", max: 40 },
];

// ---- load claims, build per-address min block ----
const addrMin = new Map();
for (const ln of fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n")) {
  const c = JSON.parse(ln);
  if (!c.to) continue;
  if (!addrMin.has(c.to) || c.block < addrMin.get(c.to)) addrMin.set(c.to, c.block);
}
const addrs = [...addrMin.keys()];
console.log(`unique recipients: ${addrs.length}`);

function loadCheckpoint(file) {
  const m = new Map();
  if (fs.existsSync(file)) for (const ln of fs.readFileSync(file, "utf8").trim().split("\n")) { if (!ln) continue; const o = JSON.parse(ln); m.set(o.a, o.n); }
  return m;
}

async function sendBatch(ep, reqs) {
  const body = reqs.map((r) => ({ jsonrpc: "2.0", id: r.id, method: "eth_getTransactionCount", params: [r.addr, r.block] }));
  try {
    const res = await fetch(ep.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 429 || res.status >= 500) return null;
    const j = await res.json();
    const arr = Array.isArray(j) ? j : null;
    if (!arr) return null;
    const map = new Map();
    for (const r of arr) if (r && typeof r.result === "string") map.set(r.id, parseInt(r.result, 16));
    return map; // may be partial
  } catch (e) { return null; }
}

async function fetchAll(jobs, checkpointFile, label) {
  const done = loadCheckpoint(checkpointFile);
  const out = fs.createWriteStream(checkpointFile, { flags: "a" });
  let queue = jobs.filter((j) => !done.has(j.addr));
  console.log(`  ${label}: ${done.size} cached, ${queue.length} to fetch`);
  let qi = 0, completed = done.size, epRR = 0;
  const CONC = 3;
  async function worker(wid) {
    while (true) {
      const ep = EPS[(epRR++) % EPS.length];
      // grab a batch
      const take = [];
      while (qi < queue.length && take.length < ep.max) { take.push(queue[qi++]); }
      if (take.length === 0) return;
      const reqs = take.map((j, i) => ({ id: i, addr: j.addr, block: j.block }));
      let map = null;
      for (let attempt = 0; attempt < 4 && !map; attempt++) { map = await sendBatch(ep, reqs); if (!map) await sleep(300 * (attempt + 1)); }
      const missing = [];
      if (map) { for (const r of reqs) { if (map.has(r.id)) { const a = take[r.id].addr, n = map.get(r.id); done.set(a, n); out.write(JSON.stringify({ a, n }) + "\n"); completed++; } else missing.push(take[r.id]); } }
      else missing.push(...take);
      // requeue missing at end
      if (missing.length) { for (const m of missing) queue.push(m); await sleep(250); }
      if (completed % 2000 < ep.max) console.log(`  ${label}: ${completed}/${jobs.length}`);
      await sleep(40);
    }
  }
  await Promise.all(Array.from({ length: CONC }, (_, i) => worker(i)));
  out.end();
  // last-resort: any still missing -> single calls on base.org
  let still = jobs.filter((j) => !done.has(j.addr));
  if (still.length) {
    console.log(`  ${label}: single-call fallback for ${still.length}`);
    const out2 = fs.createWriteStream(checkpointFile, { flags: "a" });
    for (const j of still) {
      let n = null;
      for (let attempt = 0; attempt < 10 && n === null; attempt++) {
        const m = await sendBatch({ url: "https://mainnet.base.org", max: 1 }, [{ id: 0, addr: j.addr, block: j.block }]);
        if (m && m.has(0)) n = m.get(0); else await sleep(400 * (attempt + 1));
      }
      if (n === null) throw new Error("could not resolve " + j.addr);
      done.set(j.addr, n); out2.write(JSON.stringify({ a: j.addr, n }) + "\n");
    }
    out2.end();
  }
  return done;
}

(async () => {
  const jobs1 = addrs.map((a) => ({ addr: a, block: hex(addrMin.get(a) - 1) }));
  const atMap = await fetchAll(jobs1, P("nonce_at.jsonl"), "nonce@claim");
  const fresh = addrs.filter((a) => atMap.get(a) === 0);
  console.log(`fresh (nonce@claim==0): ${fresh.length}`);

  const jobs2 = fresh.map((a) => ({ addr: a, block: "latest" }));
  const nowMap = fresh.length ? await fetchAll(jobs2, P("nonce_now.jsonl"), "nonce@now") : new Map();

  const freshSet = new Set(fresh);
  const obj = {};
  for (const a of addrs) obj[a] = { at: atMap.get(a), now: freshSet.has(a) ? nowMap.get(a) : undefined };
  fs.writeFileSync(P("nonces.json"), JSON.stringify(obj));
  console.log(`DONE: wrote nonces.json (${addrs.length} addrs, ${fresh.length} fresh)`);
})();
