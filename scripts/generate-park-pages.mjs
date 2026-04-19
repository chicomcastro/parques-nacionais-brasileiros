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

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderParkPage(park) {
  const urlSlug = slugify(park.name);
  const appUrl = `${BASE}/app/?park=${park.id}`;
  const pageUrl = `${BASE}/parque/${urlSlug}/`;
  const ogImage = `${BASE}/icon-512.png`;
  const title = `Parque Nacional ${park.name} — ${park.state}`;
  const desc = `Parque Nacional ${park.name} em ${park.state}, bioma ${park.bioma}. Entrada: ${park.entrada}. Horário: ${park.horario}. Melhor época: ${park.melhorEpoca}.`;
  const trilhas = park.trilhas && park.trilhas.length > 0 ? park.trilhas : [];
  const intro = `O Parque Nacional ${park.name} está localizado em ${park.state} e faz parte do bioma ${park.bioma}. ` +
    (park.status === "aberto" ? "Atualmente está aberto para visitação. " : park.status === "limitado" ? "A visitação está limitada — consulte o ICMBio antes de ir. " : "Atualmente está fechado para visitação. ") +
    (park.entrada && park.entrada !== "Consultar ICMBio" && park.entrada !== "Fechado" ? `A entrada é ${park.entrada.toLowerCase()}. ` : "") +
    (park.melhorEpoca && park.melhorEpoca !== "Ano todo" ? `A melhor época para visitar é ${park.melhorEpoca.toLowerCase()}. ` : "Pode ser visitado o ano todo. ") +
    (trilhas.length > 0 ? `Entre as principais trilhas estão: ${trilhas.join(", ")}.` : "");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    "name": `Parque Nacional ${park.name}`,
    "description": desc,
    "url": pageUrl,
    "image": ogImage,
    "touristType": "Nature lovers, hikers, ecotourists",
    "geo": { "@type": "GeoCoordinates", "latitude": park.lat, "longitude": park.lng },
    "address": { "@type": "PostalAddress", "addressRegion": park.state, "addressCountry": "BR" },
    "isAccessibleForFree": park.entrada === "Gratuito",
    "publicAccess": park.status === "aberto",
  };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${pageUrl}" />
<link rel="icon" type="image/svg+xml" href="${BASE}/favicon.svg" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:site_name" content="Parques Nacionais do Brasil" />
<meta property="og:locale" content="pt_BR" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${ogImage}" />
<meta name="theme-color" content="#14532d" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 32px 24px 64px; color: #1e293b; background: #f0fdf4; line-height: 1.5; }
  a { color: #15803d; }
  .back { font-size: 13px; color: #15803d; text-decoration: none; }
  h1 { color: #14532d; font-size: 30px; margin: 16px 0 8px; letter-spacing: -.5px; }
  .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .status-aberto { background: #dcfce7; color: #15803d; }
  .status-limitado { background: #fef3c7; color: #b45309; }
  .status-fechado { background: #fee2e2; color: #b91c1c; }
  .intro { font-size: 16px; color: #334155; margin: 0 0 24px; }
  dl { display: grid; grid-template-columns: 160px 1fr; gap: 10px 20px; margin: 0 0 32px; background: #fff; padding: 20px 24px; border-radius: 12px; box-shadow: 0 1px 4px #0001; }
  dt { font-weight: 600; color: #64748b; font-size: 14px; }
  dd { margin: 0; font-size: 14px; }
  .cta { display: inline-flex; align-items: center; gap: 6px; padding: 12px 24px; background: linear-gradient(135deg,#14532d,#15803d); color: #fff; text-decoration: none; border-radius: 999px; font-weight: 700; box-shadow: 0 4px 14px #15803d44; }
  .cta:hover { transform: translateY(-1px); }
  h2 { font-size: 18px; color: #14532d; margin: 32px 0 12px; }
  ul { padding-left: 20px; }
</style>
</head>
<body>
<p><a class="back" href="${BASE}/">← Parques Nacionais do Brasil</a></p>
<h1>Parque Nacional ${esc(park.name)}</h1>
<p class="meta">${esc(park.state)} · Bioma ${esc(park.bioma)} · <span class="status status-${park.status}">${esc(park.status)}</span></p>
<p class="intro">${esc(intro)}</p>
<dl>
  <dt>Estado</dt><dd>${esc(park.state)}</dd>
  <dt>Bioma</dt><dd>${esc(park.bioma)}</dd>
  <dt>Status</dt><dd>${esc(park.status)}</dd>
  <dt>Entrada</dt><dd>${esc(park.entrada)}</dd>
  <dt>Horário</dt><dd>${esc(park.horario)}</dd>
  <dt>Melhor época</dt><dd>${esc(park.melhorEpoca)}</dd>
  ${trilhas.length > 0 ? `<dt>Trilhas</dt><dd>${trilhas.map(esc).join(", ")}</dd>` : ""}
</dl>
<a class="cta" href="${appUrl}">Abrir no app interativo →</a>
<h2>Mais parques nacionais</h2>
<p>Explore os 74 parques nacionais do Brasil no <a href="${BASE}/">app</a>: descubra por distância, monte roteiros e registre suas visitas.</p>
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
