// Enumerate ALL outgoing O-token transfers (= airdrop claims) from the distributor contract.
const CONTRACT = "0x16557542aea17d4b2022d6c0a2e0e2fc0ce65631";
const TOKEN = "0x182FA643E5f29d5EcA75e7b9CF9336A3fe4620b2";
const BASE = `https://base.blockscout.com/api/v2/addresses/${CONTRACT}/token-transfers`;
const fs = require("fs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(800 * (attempt + 1));
    }
  }
}

(async () => {
  const out = fs.createWriteStream("claims.jsonl");
  let params = { filter: "from", type: "ERC-20" };
  let page = 0, total = 0;
  while (true) {
    const qs = new URLSearchParams(params).toString();
    const d = await getJson(`${BASE}?${qs}`);
    const items = d.items || [];
    for (const it of items) {
      // keep only transfers of the airdrop token, sent FROM the contract
      const tokenAddr = (it.token && it.token.address_hash || it.token && it.token.address || "").toLowerCase();
      if (tokenAddr && tokenAddr !== TOKEN.toLowerCase()) continue;
      const fromAddr = (it.from && it.from.hash || "").toLowerCase();
      if (fromAddr !== CONTRACT.toLowerCase()) continue;
      out.write(JSON.stringify({
        to: (it.to && it.to.hash || "").toLowerCase(),
        value: it.total && it.total.value,
        block: it.block_number,
        ts: it.timestamp,
        method: it.method,
        tx: it.transaction_hash,
      }) + "\n");
      total++;
    }
    page++;
    if (page % 20 === 0) console.log(`page ${page}, claims so far ${total}, last block ${items.length ? items[items.length-1].block_number : "?"}`);
    if (!d.next_page_params) break;
    params = d.next_page_params;
    params.type = "ERC-20";
    await sleep(120);
  }
  out.end();
  console.log(`DONE: ${total} claim transfers across ${page} pages`);
})();
