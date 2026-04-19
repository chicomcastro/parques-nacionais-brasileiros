import { PARKS } from "../src/parks-data.mjs";
import { writeFile, mkdir, access, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "public", "parks");

const API = "https://pt.wikipedia.org/w/api.php";

const BAD_KEYWORDS = [
  "icon", "logo", "badge", "symbol", "commons", "wikidata",
  "edit-clear", "padlock", "crystal", "flag", "coat_of_arms",
  "brasao", "brasão", "stub", "ambox", "question_book", "disambig",
  "wiki_letter", "portal", "red_pencil", "searchtool", "merge-arrow",
  "unbalanced", "fairytale", "nuvola", "konqueror", "gnome",
  "oxygen", "tango",
];

const HEADERS = { "User-Agent": "parques-nacionais-brasileiros/1.0 (https://github.com/chicomcastro/parques-nacionais-brasileiros)" };

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchFirstImage(slug) {
  const params = new URLSearchParams({
    action: "query",
    titles: slug,
    generator: "images",
    gimlimit: "20",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "1200",
    format: "json",
    origin: "*",
  });
  const res = await fetch(`${API}?${params}`, { headers: HEADERS });
  if (res.status === 429) {
    const retry = parseInt(res.headers.get("retry-after")) || 5;
    await sleep(retry * 1000);
    return fetchFirstImage(slug);
  }
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.query?.pages) return null;

  const candidates = Object.values(data.query.pages)
    .filter(p => {
      const info = p.imageinfo?.[0];
      if (!info) return false;
      const mime = info.mime || "";
      if (!mime.startsWith("image/")) return false;
      if (mime === "image/svg+xml") return false;
      const title = (p.title || "").toLowerCase();
      if (BAD_KEYWORDS.some(k => title.includes(k))) return false;
      const w = info.width || 0;
      const h = info.height || 0;
      if (w > 0 && h > 0 && w < 400 && h < 300) return false;
      return true;
    })
    .map(p => p.imageinfo[0].thumburl || p.imageinfo[0].url)
    .filter(Boolean);

  return candidates[0] || null;
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function downloadPark(park, { force = false } = {}) {
  const out = resolve(OUT, `${park.id}.jpg`);
  const outWebp = resolve(OUT, `${park.id}.webp`);
  if (!force && (await exists(out) || await exists(outWebp))) {
    return { id: park.id, status: "skip" };
  }
  try {
    const url = await fetchFirstImage(park.slug);
    if (!url) return { id: park.id, status: "no-image" };
    const img = await fetch(url, { headers: HEADERS });
    if (!img.ok) return { id: park.id, status: `http-${img.status}` };
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 2000) return { id: park.id, status: "too-small" };
    await writeFile(out, buf);
    return { id: park.id, status: "ok", bytes: buf.length };
  } catch (err) {
    return { id: park.id, status: `error:${err.message}` };
  }
}

async function main() {
  const force = process.argv.includes("--force");
  await mkdir(OUT, { recursive: true });
  const results = [];
  // fetch sequentially to be kind to Wikipedia
  for (const park of PARKS) {
    process.stdout.write(`#${park.id.toString().padStart(2, " ")} ${park.name}... `);
    const r = await downloadPark(park, { force });
    results.push({ ...r, name: park.name });
    console.log(r.status + (r.bytes ? ` (${(r.bytes / 1024).toFixed(0)} KB)` : ""));
    if (r.status === "ok") await sleep(800);
  }
  const ok = results.filter(r => r.status === "ok").length;
  const skip = results.filter(r => r.status === "skip").length;
  const fail = results.length - ok - skip;
  console.log(`\nDone: ${ok} downloaded, ${skip} already existed, ${fail} failed.`);

  const files = await readdir(OUT);
  const ids = files
    .map(f => /^(\d+)\.(webp|jpg)$/i.exec(f))
    .filter(Boolean)
    .map(m => parseInt(m[1]))
    .sort((a, b) => a - b);
  await writeFile(resolve(OUT, "manifest.json"), JSON.stringify({ ids }), "utf8");
  console.log(`Manifest: ${ids.length} park hero images`);
  if (fail > 0) {
    console.log("Failures:");
    for (const r of results.filter(r => r.status !== "ok" && r.status !== "skip")) {
      console.log(`  #${r.id} ${r.name}: ${r.status}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
