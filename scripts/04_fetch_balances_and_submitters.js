// Verify: (A) O still held by fresh wallets; (B) who submitted the relayed claims.
const fs = require("fs");
const path = require("path");
const P = (f) => path.join(__dirname, f);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKEN = "0x182FA643E5f29d5EcA75e7b9CF9336A3fe4620b2";
const EPS = [
  { url: "https://base-mainnet.public.blastapi.io", max: 100 },
  { url: "https://mainnet.base.org", max: 10 },
  { url: "https://base.gateway.tenderly.co", max: 15 },
  { url: "https://1rpc.io/base", max: 40 },
];

const claims = fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const nonces = JSON.parse(fs.readFileSync(P("nonces.json"), "utf8"));
const isFresh = (a) => nonces[a] && nonces[a].at === 0;

async function send(ep, body) {
  try {
    const res = await fetch(ep.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 429 || res.status >= 500) return null;
    const j = await res.json();
    return Array.isArray(j) ? j : null;
  } catch (e) { return null; }
}

async function batchRun(items, makeReq, parseRes, checkpointFile, label, maxBatch) {
  const done = new Map();
  if (fs.existsSync(checkpointFile)) for (const ln of fs.readFileSync(checkpointFile, "utf8").trim().split("\n")) { if (ln) { const o = JSON.parse(ln); done.set(o.k, o.v); } }
  const out = fs.createWriteStream(checkpointFile, { flags: "a" });
  let queue = items.filter((it) => !done.has(it.k));
  console.log(`  ${label}: ${done.size} cached, ${queue.length} to fetch`);
  let qi = 0, completed = done.size, rr = 0;
  async function worker() {
    while (true) {
      const ep = EPS[(rr++) % EPS.length];
      const cap = Math.min(ep.max, maxBatch);
      const take = [];
      while (qi < queue.length && take.length < cap) take.push(queue[qi++]);
      if (!take.length) return;
      const body = take.map((it, i) => makeReq(it, i));
      let arr = null;
      for (let a = 0; a < 4 && !arr; a++) { arr = await send(ep, body); if (!arr) await sleep(300 * (a + 1)); }
      const missing = [];
      if (arr) {
        const byId = new Map(arr.map((r) => [r.id, r]));
        for (let i = 0; i < take.length; i++) {
          const r = byId.get(i);
          const v = r ? parseRes(r) : undefined;
          if (v === undefined || v === null) missing.push(take[i]);
          else { done.set(take[i].k, v); out.write(JSON.stringify({ k: take[i].k, v }) + "\n"); completed++; }
        }
      } else missing.push(...take);
      if (missing.length) { for (const m of missing) queue.push(m); await sleep(250); }
      if (completed % 2000 < cap) console.log(`  ${label}: ${completed}/${items.length}`);
      await sleep(40);
    }
  }
  await Promise.all([0, 1, 2, 3].map(worker));
  out.end();
  return done;
}

(async () => {
  // ---- A: O balance of every fresh wallet ----
  const fresh = [...new Set(claims.filter((c) => isFresh(c.to)).map((c) => c.to))];
  const pad = (a) => "000000000000000000000000" + a.slice(2);
  const balItems = fresh.map((a) => ({ k: a, addr: a }));
  const balMap = await batchRun(
    balItems,
    (it, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to: TOKEN, data: "0x70a08231" + pad(it.addr) }, "latest"] }),
    (r) => (typeof r.result === "string" ? r.result : null),
    P("fresh_bal.jsonl"), "balanceOf(fresh)", 100
  );
  let heldWei = 0n, zeroBal = 0, full = 0;
  const recv = new Map();
  for (const c of claims) if (isFresh(c.to)) recv.set(c.to, (recv.get(c.to) || 0n) + BigInt(c.value));
  for (const a of fresh) {
    const w = BigInt(balMap.get(a) || "0x0");
    heldWei += w;
    if (w === 0n) zeroBal++;
    if (w >= recv.get(a)) full++;
  }
  console.log(`\nFRESH WALLETS: ${fresh.length}`);
  console.log(`O received (sum):  ${(Number([...recv.values()].reduce((x, y) => x + y, 0n)) / 1e18).toLocaleString()} O`);
  console.log(`O still held now:  ${(Number(heldWei) / 1e18).toLocaleString()} O`);
  console.log(`wallets holding >= received: ${full}/${fresh.length};  wallets with 0 balance: ${zeroBal}`);

  // ---- B: submitter of each relayed (handleOps) claim tx ----
  const hoTxs = [...new Set(claims.filter((c) => c.method === "handleOps").map((c) => c.tx))].map((h) => ({ k: h, h }));
  const fromMap = await batchRun(
    hoTxs,
    (it, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getTransactionByHash", params: [it.h] }),
    (r) => (r.result && r.result.from ? r.result.from.toLowerCase() + "|" + (r.result.to || "").toLowerCase() : null),
    P("tx_from.jsonl"), "txByHash(handleOps)", 25
  );
  const opCount = {}, opTo = {};
  for (const t of hoTxs) { const v = fromMap.get(t.k); if (!v) continue; const [from, to] = v.split("|"); opCount[from] = (opCount[from] || 0) + 1; opTo[to] = (opTo[to] || 0) + 1; }
  const opTokens = {};
  for (const c of claims) { if (c.method !== "handleOps") continue; const v = fromMap.get(c.tx); if (!v) continue; const from = v.split("|")[0]; opTokens[from] = (opTokens[from] || 0n) + BigInt(c.value); }
  console.log(`\nRELAYED handleOps txs: ${hoTxs.length}`);
  console.log("Top submitters (operator EOA -> #txs, O relayed):");
  Object.entries(opCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([a, n]) => console.log(`  ${a}  ${n} txs  ${(Number(opTokens[a] || 0n) / 1e18).toLocaleString()} O`));
  console.log("distinct operator EOAs:", Object.keys(opCount).length);

  fs.writeFileSync(P("verify2_summary.json"), JSON.stringify({
    fresh: fresh.length, heldO: Number(heldWei) / 1e18, full, zeroBal,
    operators: Object.entries(opCount).sort((a, b) => b[1] - a[1]).map(([a, n]) => ({ op: a, txs: n, o: Number(opTokens[a] || 0n) / 1e18 })),
    entrypoints: opTo,
  }, null, 2));
  console.log("\nDONE verify2");
})();
