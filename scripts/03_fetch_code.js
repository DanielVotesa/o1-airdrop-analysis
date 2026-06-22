// eth_getCode for every recipient -> classify wallet type (plain EOA / 7702->Kernel / other contract).
const fs = require("fs"); const path = require("path"); const P = (f) => path.join(__dirname, f);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EPS = [{ url: "https://base-mainnet.public.blastapi.io", max: 100 }, { url: "https://mainnet.base.org", max: 10 }, { url: "https://1rpc.io/base", max: 40 }];
const claims = fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const addrs = [...new Set(claims.map((c) => c.to))];
async function send(ep, body) { try { const r = await fetch(ep.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (r.status === 429 || r.status >= 500) return null; const j = await r.json(); return Array.isArray(j) ? j : null; } catch (e) { return null; } }
(async () => {
  const cp = P("code.jsonl"); const done = new Map();
  if (fs.existsSync(cp)) for (const ln of fs.readFileSync(cp, "utf8").trim().split("\n")) { if (ln) { const o = JSON.parse(ln); done.set(o.k, o.v); } }
  const out = fs.createWriteStream(cp, { flags: "a" });
  let queue = addrs.filter((a) => !done.has(a)); let qi = 0, completed = done.size, rr = 0;
  console.log(`${done.size} cached, ${queue.length} to fetch`);
  async function worker() { while (true) { const ep = EPS[(rr++) % EPS.length]; const take = []; while (qi < queue.length && take.length < ep.max) take.push(queue[qi++]); if (!take.length) return;
    const body = take.map((a, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getCode", params: [a, "latest"] }));
    let arr = null; for (let t = 0; t < 5 && !arr; t++) { arr = await send(ep, body); if (!arr) await sleep(300 * (t + 1)); }
    const miss = []; if (arr) { const m = new Map(arr.map((r) => [r.id, r])); for (let i = 0; i < take.length; i++) { const r = m.get(i); if (r && typeof r.result === "string") { const code = r.result; const v = code === "0x" ? "eoa" : (code.slice(0, 8) === "0xef0100" ? "7702:" + code.slice(8, 48) : "contract:" + code.length); done.set(take[i], v); out.write(JSON.stringify({ k: take[i], v }) + "\n"); completed++; } else miss.push(take[i]); } } else miss.push(...take);
    if (miss.length) { for (const x of miss) queue.push(x); await sleep(250); }
    if (completed % 3000 < ep.max) console.log(`${completed}/${addrs.length}`); await sleep(35); } }
  await Promise.all([0, 1, 2].map(worker)); out.end(); console.log("DONE code");
})();
