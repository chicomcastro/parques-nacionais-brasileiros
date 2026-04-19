import { PARKS } from "../src/parks-data.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");
const BASE = "https://chicomcastro.github.io/parques-nacionais-brasileiros";

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function renderParkPage(park) {
  const urlSlug = slugify(park.name);
  const appUrl = `${BASE}/app/?park=${park.id}`;
  const pageUrl = `${BASE}/parque/${urlSlug}/`;
  const title = `Parque Nacional ${park.name} — ${park.state}`;
  const desc = `Parque Nacional ${park.name} (${park.state}), bioma ${park.bioma}. Entrada: ${park.entrada}. Horário: ${park.horario}. Melhor época: ${park.melhorEpoca}. Status: ${park.status}.`;
  const trilhas = park.trilhas && park.trilhas.length > 0 ? park.trilhas.join(", ") : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<link rel="canonical" href="${pageUrl}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${pageUrl}" />
<meta name="theme-color" content="#14532d" />
<script>window.location.replace(${JSON.stringify(appUrl)});</script>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 24px; color: #1e293b; background: #f0fdf4; }
  h1 { color: #14532d; font-size: 28px; margin: 0 0 8px; }
  .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
  dl { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; margin: 0 0 24px; }
  dt { font-weight: 600; color: #64748b; }
  dd { margin: 0; }
  .cta { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #14532d; color: #fff; text-decoration: none; border-radius: 999px; font-weight: 700; }
  .back { font-size: 13px; color: #15803d; text-decoration: none; }
</style>
</head>
<body>
<p><a class="back" href="${BASE}/">← Parques Nacionais do Brasil</a></p>
<h1>Parque Nacional ${park.name}</h1>
<p class="meta">${park.state} · Bioma ${park.bioma}</p>
<dl>
  <dt>Status</dt><dd>${park.status}</dd>
  <dt>Entrada</dt><dd>${park.entrada}</dd>
  <dt>Horário</dt><dd>${park.horario}</dd>
  <dt>Melhor época</dt><dd>${park.melhorEpoca}</dd>
  ${trilhas ? `<dt>Trilhas</dt><dd>${trilhas}</dd>` : ""}
</dl>
<a class="cta" href="${appUrl}">Abrir no app →</a>
<noscript><p style="margin-top:24px;color:#64748b">Se não for redirecionado automaticamente, <a href="${appUrl}">clique aqui</a>.</p></noscript>
</body>
</html>
`;
}

function renderSitemap() {
  const urls = [
    `${BASE}/`,
    `${BASE}/app/`,
    ...PARKS.map(p => `${BASE}/parque/${slugify(p.name)}/`),
  ];
  const now = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${now}</lastmod></url>`).join("\n")}
</urlset>
`;
}

function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${BASE}/sitemap.xml
`;
}

async function main() {
  let count = 0;
  for (const park of PARKS) {
    const urlSlug = slugify(park.name);
    const dir = resolve(DIST, "parque", urlSlug);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "index.html"), renderParkPage(park), "utf8");
    count++;
  }
  await writeFile(resolve(DIST, "sitemap.xml"), renderSitemap(), "utf8");
  await writeFile(resolve(DIST, "robots.txt"), renderRobots(), "utf8");
  console.log(`Generated ${count} park pages + sitemap.xml + robots.txt`);
}

main().catch(err => { console.error(err); process.exit(1); });
