// Trace where O went for the fresh wallets that moved tokens (bal < received).
// EFFICIENT: ONE getLogs sweep over the token with ALL movers in topic1 (OR-array), 10k-block chunks.
const fs = require("fs"); const path = require("path"); const P = (f) => path.join(__dirname, f);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TOKEN = "0x182FA643E5f29d5EcA75e7b9CF9336A3fe4620b2".toLowerCase();
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RPCS = ["https://base-mainnet.public.blastapi.io", "https://1rpc.io/base", "https://mainnet.base.org"];
const o = (w) => Number(BigInt(w)) / 1e18;
const pad = (a) => "0x000000000000000000000000" + a.toLowerCase().replace(/^0x/, "");
let rr = 0;
async function rpc(method, params, tries = 5) { for (let t = 0; t < tries; t++) { const url = RPCS[(rr++) % RPCS.length]; try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); if (r.status === 429 || r.status >= 500) { await sleep(300 * (t + 1)); continue; } const j = await r.json(); if (j.error) { await sleep(250 * (t + 1)); continue; } return j.result; } catch (e) { await sleep(300 * (t + 1)); } } return undefined; }
async function bs(p) { for (let a = 0; a < 4; a++) { try { const r = await fetch("https://base.blockscout.com" + p, { headers: { accept: "application/json" } }); if (r.ok) return await r.json(); if (r.status === 404) return { _status: 404 }; } catch (e) {} await sleep(400); } return null; }

(async () => {
  const claims = fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  const nonces = JSON.parse(fs.readFileSync(P("nonces.json"), "utf8"));
  const isFresh = (a) => nonces[a] && nonces[a].at === 0;
  const bal = new Map(); for (const ln of fs.readFileSync(P("fresh_bal.jsonl"), "utf8").trim().split("\n")) { if (ln) { const x = JSON.parse(ln); bal.set(x.k, BigInt(x.v || "0x0")); } }
  const recv = new Map(); for (const c of claims) if (isFresh(c.to)) recv.set(c.to, (recv.get(c.to) || 0n) + BigInt(c.value));
  const movers = [...recv.keys()].filter((a) => bal.has(a) && bal.get(a) < recv.get(a));
  const moverSet = new Set(movers.map((a) => a.toLowerCase()));
  const firstBlock = Math.min(...claims.map((c) => c.block));
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  console.log(`movers ${movers.length}; sweeping token Transfer logs ${firstBlock}-${latest} in 10k chunks`);

  const topic1 = movers.map((a) => pad(a));
  const all = [];
  const CH = 10000; let done = 0;
  for (let from = firstBlock; from <= latest; from += CH) {
    const to = Math.min(from + CH - 1, latest);
    const logs = await rpc("eth_getLogs", [{ address: TOKEN, topics: [TRANSFER, topic1], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
    if (Array.isArray(logs)) all.push(...logs);
    done++; if (done % 5 === 0) console.log(`  chunk ${done}: ${all.length} logs so far`);
  }
  console.log(`total outgoing transfers from movers: ${all.length}`);

  // aggregate destinations + per-mover
  const dest = new Map(); const perMover = new Map();
  for (const a of movers) perMover.set(a, { wallet: a, received: o(recv.get(a)), sent: 0n, tos: [] });
  all.sort((x, y) => parseInt(x.blockNumber, 16) - parseInt(y.blockNumber, 16));
  for (const l of all) {
    const fromA = "0x" + l.topics[1].slice(26); const toA = "0x" + l.topics[2].slice(26); const v = BigInt(l.data);
    dest.set(toA, (dest.get(toA) || 0n) + v);
    const pm = perMover.get(fromA); if (pm) { pm.sent += v; pm.tos.push({ to: toA, o: o(v), tx: l.transactionHash, block: parseInt(l.blockNumber, 16) }); }
  }

  // classify destinations
  const destArr = [...dest.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1));
  const enriched = [];
  for (const [d, v] of destArr) {
    const code = await rpc("eth_getCode", [d, "latest"]); const isContract = code && code !== "0x";
    let label = ""; const info = await bs(`/api/v2/addresses/${d}`);
    if (info && !info._status) { label = info.name || (info.is_contract ? "contract" : "EOA"); if (info.metadata && info.metadata.tags && info.metadata.tags.length) label += " [" + info.metadata.tags.map((t) => t.name).join(",") + "]"; if (info.implementations && info.implementations[0] && info.implementations[0].name) label += " impl:" + info.implementations[0].name; }
    const nMovers = movers.filter((m) => perMover.get(m).tos.some((t) => t.to === d)).length;
    enriched.push({ to: d, o: o(v), type: isContract ? "contract" : "EOA", label, fromMovers: nMovers });
  }

  console.log("\n=== destinations of moved O (aggregated, desc) ===");
  for (const e of enriched) console.log(`  ${e.to}  ${e.o.toLocaleString()} O  ${e.type}  fromMovers=${e.fromMovers}  ${e.label}`);
  console.log(`\ndistinct destinations ${enriched.length}; contracts ${enriched.filter((e) => e.type === "contract").length}; EOAs ${enriched.filter((e) => e.type === "EOA").length}`);
  if (enriched.length) console.log(`top destination ${enriched[0].to} received ${enriched[0].o.toLocaleString()} O from ${enriched[0].fromMovers}/${movers.length} movers`);
  const moversNoOut = movers.filter((m) => perMover.get(m).tos.length === 0);
  console.log(`movers with 0 captured outgoing transfers: ${moversNoOut.length}`);

  fs.writeFileSync(P("trace_movers_out.json"), JSON.stringify({ movers: movers.length, totalTransfers: all.length, destinations: enriched, perMover: [...perMover.values()].map((m) => ({ wallet: m.wallet, received: m.received, sent: o(m.sent), nOut: m.tos.length, tos: m.tos })) }, null, 2));
  console.log("\nwrote trace_movers_out.json");
})();
