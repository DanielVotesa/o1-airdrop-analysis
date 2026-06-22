// #2: decompile the unverified distributor 0x16557542 - extract function selectors, flag admin/backdoor
// functions (owner / withdraw / setMerkleRoot / pause / upgrade), detect proxy, check verified status.
const fs = require("fs"); const path = require("path"); const P = (f) => path.join(__dirname, f);
const { keccak256 } = require(P("node_modules/js-sha3"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIST = "0x16557542aea17d4b2022d6c0a2e0e2fc0ce65631";
const RPCS = ["https://base-mainnet.public.blastapi.io", "https://mainnet.base.org", "https://1rpc.io/base"];
let rr = 0;
async function rpc(method, params) { for (let t = 0; t < 6; t++) { const url = RPCS[(rr++) % RPCS.length]; try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); if (r.status === 429 || r.status >= 500) { await sleep(400 * (t + 1)); continue; } const j = await r.json(); if (j.error) { await sleep(300); continue; } return j.result; } catch (e) { await sleep(400); } } return undefined; }
async function bs(p) { for (let a = 0; a < 4; a++) { try { const r = await fetch("https://base.blockscout.com" + p, { headers: { accept: "application/json" } }); if (r.ok) return await r.json(); if (r.status === 404) return { _status: 404 }; } catch (e) {} await sleep(400); } return null; }
const sel = (sig) => keccak256(sig).slice(0, 8);

(async () => {
  const code = await rpc("eth_getCode", [DIST, "latest"]);
  const hex = (code || "").replace(/^0x/, "");
  console.log(`distributor ${DIST}`);
  console.log(`bytecode size: ${hex.length / 2} bytes`);
  // EIP-1167 minimal proxy?
  const proxy = hex.startsWith("363d3d373d3d3d363d73") || hex.includes("5af43d82803e903d91602b57fd5bf3");
  console.log(`minimal-proxy (EIP-1167): ${proxy}`);
  // extract PUSH4 selectors (0x63 XXXXXXXX)
  const found = new Set();
  for (let i = 0; i + 10 <= hex.length; i += 2) if (hex.slice(i, i + 2) === "63") { const s = hex.slice(i + 2, i + 10); if (/^[0-9a-f]{8}$/.test(s)) found.add(s); }
  console.log(`distinct PUSH4 selectors: ${found.size}`);
  // dictionary of signatures to test
  const sigs = ["owner()", "transferOwnership(address)", "renounceOwnership()", "pendingOwner()", "acceptOwnership()",
    "pause()", "unpause()", "paused()", "merkleRoot()", "setMerkleRoot(bytes32)", "updateMerkleRoot(bytes32)",
    "isClaimed(uint256)", "claimed(address)", "claim(uint256,uint256,bytes32[])", "claim(address,uint256,bytes32[])",
    "claim(uint256,address,uint256,bytes32[])", "claim(uint256,uint256,address,bytes32[])",
    "withdraw()", "withdraw(address)", "withdraw(uint256)", "withdraw(address,uint256)", "withdrawTokens(address,uint256)",
    "emergencyWithdraw()", "emergencyWithdraw(address)", "sweep(address)", "rescue(address)", "recoverERC20(address,uint256)",
    "rescueERC20(address,uint256)", "rescueTokens(address,uint256)", "token()", "rewardToken()",
    "setClaimWindow(uint256,uint256)", "startTime()", "endTime()", "deadline()", "claimDeadline()", "setDeadline(uint256)",
    "setEndTime(uint256)", "initialize(bytes32,address)", "initialize(address,bytes32)", "admin()", "hasRole(bytes32,address)",
    "grantRole(bytes32,address)", "DEFAULT_ADMIN_ROLE()", "multicall(bytes[])", "implementation()", "upgradeTo(address)",
    "upgradeToAndCall(address,bytes)", "setToken(address)", "fund(uint256)", "depositTokens(uint256)"];
  const present = sigs.filter((s) => found.has(sel(s)));
  console.log(`\nKNOWN function signatures present in bytecode:`);
  for (const s of present) console.log(`  ${s}  [0x${sel(s)}]`);
  // categorize
  const admin = present.filter((s) => /owner|transferOwnership|renounceOwnership|pause|unpause|admin|Role|upgrade|implementation|initialize/i.test(s));
  const fundsExit = present.filter((s) => /withdraw|sweep|rescue|recover|emergency/i.test(s));
  const rootMut = present.filter((s) => /setMerkleRoot|updateMerkleRoot/i.test(s));
  const windowMut = present.filter((s) => /setDeadline|setEndTime|setClaimWindow/i.test(s));
  console.log(`\n=== backdoor / centralization summary ===`);
  console.log(`owner/admin/upgrade functions: ${admin.length ? admin.join(", ") : "NONE FOUND"}`);
  console.log(`funds-exit (withdraw/sweep/rescue): ${fundsExit.length ? fundsExit.join(", ") : "NONE FOUND"}`);
  console.log(`merkle-root mutators: ${rootMut.length ? rootMut.join(", ") : "NONE FOUND"}`);
  console.log(`claim-window mutators: ${windowMut.length ? windowMut.join(", ") : "NONE FOUND"}`);
  // owner() value if present
  if (found.has(sel("owner()"))) { const r = await rpc("eth_call", [{ to: DIST, data: "0x" + sel("owner()") }, "latest"]); if (r && r.length >= 42) console.log(`owner() => 0x${r.slice(-40)}`); }
  // verified on Blockscout?
  const sc = await bs(`/api/v2/smart-contracts/${DIST}`);
  const verified = sc && !sc._status && (sc.is_verified || sc.name);
  console.log(`\nBlockscout verified source: ${verified ? (sc.name || "yes") : "NO (unverified)"}`);
  fs.writeFileSync(P("decompile_distributor_out.json"), JSON.stringify({ address: DIST, bytecodeBytes: hex.length / 2, minimalProxy: proxy, selectorsTotal: found.size, knownPresent: present, admin, fundsExit, rootMut, windowMut, verified: !!verified, verifiedName: verified ? sc.name : null }, null, 2));
  console.log("\nwrote decompile_distributor_out.json");
})();
