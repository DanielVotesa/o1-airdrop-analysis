// Generate a stacked bar chart SVG (fresh red, non-fresh gray) of claims per hour, for the README.
// White background so it reads in GitHub light AND dark mode. No scripts, no external refs (GitHub-safe).
const fs = require("fs"); const path = require("path"); const P = (f) => path.join(__dirname, f);
const claims = fs.readFileSync(P("claims.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const nonces = JSON.parse(fs.readFileSync(P("nonces.json"), "utf8"));
const isFresh = (a) => nonces[a] && nonces[a].at === 0;

const H = {};
for (const c of claims) { const h = c.ts.slice(0, 13); (H[h] ||= { f: 0, n: 0 }); if (isFresh(c.to)) H[h].f++; else H[h].n++; }
const hours = Object.keys(H).sort();
const totalFresh = claims.filter((c) => isFresh(c.to)).length;
const totalNon = claims.length - totalFresh;
const pF = (100 * totalFresh / claims.length).toFixed(1);
const pN = (100 * totalNon / claims.length).toFixed(1);

// layout
const padL = 64, padR = 24, padT = 56, padB = 70;
const plotW = Math.max(1180, hours.length * 13);
const W = padL + plotW + padR, plotH = 430, H0 = padT + plotH + padB;
const yMax = 1800;
const RED = "#e0523b", GRAY = "#9b9b9b", TXT = "#6b6b6b", GRID = "#ececec", AXIS = "#cfcfcf";
const yOf = (v) => padT + plotH - (v / yMax) * plotH;
const bw = plotW / hours.length, bar = Math.max(3, bw * 0.78);

let s = "";
s += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H0}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">`;
s += `<rect x="0" y="0" width="${W}" height="${H0}" fill="#ffffff"/>`;
// legend
s += `<rect x="${padL}" y="20" width="13" height="13" rx="2" fill="${RED}"/>`;
s += `<text x="${padL + 19}" y="31" font-size="14" fill="#333">Fresh wallets, nonce 0 at claim (${totalFresh.toLocaleString("en-US")} / ${pF}%)</text>`;
const lx = padL + 360;
s += `<rect x="${lx}" y="20" width="13" height="13" rx="2" fill="${GRAY}"/>`;
s += `<text x="${lx + 19}" y="31" font-size="14" fill="#333">Pre-existing wallets, nonce &gt; 0 (${totalNon.toLocaleString("en-US")} / ${pN}%)</text>`;
// y grid + labels
for (let v = 0; v <= yMax; v += 200) {
  const y = yOf(v);
  s += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`;
  s += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" font-size="11" fill="${TXT}" text-anchor="end">${v ? v.toLocaleString("en-US") : "0"}</text>`;
}
// y axis title
s += `<text transform="translate(16,${padT + plotH / 2}) rotate(-90)" font-size="12" fill="${TXT}" text-anchor="middle">claims per hour</text>`;
// bars (fresh red at bottom, non-fresh gray stacked on top)
hours.forEach((h, i) => {
  const x = padL + i * bw + (bw - bar) / 2;
  const fH = (H[h].f / yMax) * plotH, nH = (H[h].n / yMax) * plotH;
  const yF = padT + plotH - fH;
  if (fH > 0) s += `<rect x="${x.toFixed(1)}" y="${yF.toFixed(1)}" width="${bar.toFixed(1)}" height="${fH.toFixed(1)}" fill="${RED}"/>`;
  if (nH > 0) s += `<rect x="${x.toFixed(1)}" y="${(yF - nH).toFixed(1)}" width="${bar.toFixed(1)}" height="${nH.toFixed(1)}" fill="${GRAY}"/>`;
});
// x labels every Nth hour (angled)
const step = Math.ceil(hours.length / 36);
hours.forEach((h, i) => {
  if (i % step) return;
  const x = padL + i * bw + bw / 2;
  const lab = h.slice(5).replace("T", " ");
  s += `<text x="${x.toFixed(1)}" y="${padT + plotH + 14}" font-size="10" fill="${TXT}" text-anchor="end" transform="rotate(-55 ${x.toFixed(1)} ${padT + plotH + 14})">${lab}</text>`;
});
// baseline
s += `<line x1="${padL}" y1="${(padT + plotH).toFixed(1)}" x2="${padL + plotW}" y2="${(padT + plotH).toFixed(1)}" stroke="${AXIS}" stroke-width="1"/>`;
s += `</svg>`;

const out = P("github-repo/evidence/timeline.svg");
fs.writeFileSync(out, s);
console.log(`wrote timeline.svg (${hours.length} hours, ${(s.length/1024).toFixed(1)}KB) | fresh ${totalFresh} ${pF}% | non-fresh ${totalNon} ${pN}%`);
