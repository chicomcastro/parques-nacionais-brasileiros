import { writeFile, readFile, readdir, mkdir, unlink, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PARKS_DIR = resolve(ROOT, "public", "parks");
const OVERRIDES = resolve(PARKS_DIR, "overrides.json");
const MANIFEST = resolve(PARKS_DIR, "manifest.json");
const ALLOWLIST = resolve(PARKS_DIR, "allowlist.json");
const BLOCKLIST = resolve(PARKS_DIR, "blocklist.json");

const HEADERS = { "User-Agent": "parques-nacionais-brasileiros-admin/1.0" };

async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

async function regenerateManifest() {
  const files = await readdir(PARKS_DIR);
  const ids = files
    .map(f => /^(\d+)\.webp$/i.exec(f))
    .filter(Boolean)
    .map(m => parseInt(m[1]))
    .sort((a, b) => a - b);
  await writeFile(MANIFEST, JSON.stringify({ ids }), "utf8");
  return ids;
}

function sh(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: ROOT, ...opts });
    let out = "", err = "";
    p.stdout?.on("data", d => out += d);
    p.stderr?.on("data", d => err += d);
    p.on("close", code => code === 0 ? res(out) : rej(new Error(err || `exit ${code}`)));
    p.on("error", rej);
  });
}

async function convertToWebp(jpgPath, webpPath) {
  try {
    await sh("cwebp", ["-quiet", "-q", "75", jpgPath, "-o", webpPath]);
    await unlink(jpgPath);
    return true;
  } catch {
    return false;
  }
}

async function readBody(req) {
  return new Promise((res, rej) => {
    let data = "";
    req.on("data", c => data += c);
    req.on("end", () => { try { res(JSON.parse(data || "{}")); } catch (e) { rej(e); } });
    req.on("error", rej);
  });
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function adminPlugin() {
  return {
    name: "parques-admin",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__admin/")) return next();
        try {
          if (req.method === "POST" && req.url === "/__admin/apply") {
            const { parkId, url, notes } = await readBody(req);
            if (!parkId || !url) return send(res, 400, { error: "parkId and url required" });

            const imgRes = await fetch(url, { headers: HEADERS });
            if (!imgRes.ok) return send(res, 502, { error: `fetch failed ${imgRes.status}` });
            const buf = Buffer.from(await imgRes.arrayBuffer());

            await mkdir(PARKS_DIR, { recursive: true });
            const jpg = resolve(PARKS_DIR, `${parkId}.jpg`);
            const webp = resolve(PARKS_DIR, `${parkId}.webp`);
            await writeFile(jpg, buf);

            const converted = await convertToWebp(jpg, webp);
            if (!converted) {
              await writeFile(webp, buf);
              await unlink(jpg).catch(() => {});
            }

            const overrides = await readJson(OVERRIDES, {});
            overrides[parkId] = { url, notes: notes || "", appliedAt: Date.now() };
            await writeFile(OVERRIDES, JSON.stringify(overrides, null, 2), "utf8");

            const ids = await regenerateManifest();
            return send(res, 200, { ok: true, bytes: buf.length, webpUsed: converted, idsWithHero: ids.length });
          }

          if (req.method === "POST" && req.url === "/__admin/remove") {
            const { parkId } = await readBody(req);
            if (!parkId) return send(res, 400, { error: "parkId required" });
            const webp = resolve(PARKS_DIR, `${parkId}.webp`);
            const jpg = resolve(PARKS_DIR, `${parkId}.jpg`);
            if (await exists(webp)) await unlink(webp);
            if (await exists(jpg)) await unlink(jpg);
            const overrides = await readJson(OVERRIDES, {});
            delete overrides[parkId];
            await writeFile(OVERRIDES, JSON.stringify(overrides, null, 2), "utf8");
            const ids = await regenerateManifest();
            return send(res, 200, { ok: true, idsWithHero: ids.length });
          }

          if (req.method === "POST" && req.url === "/__admin/commit") {
            const { message } = await readBody(req);
            const msg = (message && message.trim()) || "Curate park hero images";
            try {
              await sh("git", ["add", "public/parks/"]);
              const status = await sh("git", ["status", "--porcelain", "public/parks/"]);
              if (!status.trim()) return send(res, 200, { ok: true, noop: true });
              await sh("git", ["commit", "-m", msg]);
              return send(res, 200, { ok: true });
            } catch (e) {
              return send(res, 500, { error: e.message });
            }
          }

          // Add URL to allowlist (remove from blocklist if present)
          if (req.method === "POST" && req.url === "/__admin/allow-url") {
            const { parkId, url } = await readBody(req);
            if (!parkId || !url) return send(res, 400, { error: "parkId and url required" });
            const key = String(parkId);
            const al = await readJson(ALLOWLIST, {});
            if (!al[key]) al[key] = [];
            if (!al[key].includes(url)) al[key].push(url);
            await writeFile(ALLOWLIST, JSON.stringify(al, null, 2), "utf8");
            const bl = await readJson(BLOCKLIST, {});
            if (bl[key]) { bl[key] = bl[key].filter(u => u !== url); if (!bl[key].length) delete bl[key]; }
            await writeFile(BLOCKLIST, JSON.stringify(bl, null, 2), "utf8");
            return send(res, 200, { ok: true });
          }

          // Remove URL from allowlist
          if (req.method === "POST" && req.url === "/__admin/disallow-url") {
            const { parkId, url } = await readBody(req);
            if (!parkId || !url) return send(res, 400, { error: "parkId and url required" });
            const key = String(parkId);
            const al = await readJson(ALLOWLIST, {});
            if (al[key]) { al[key] = al[key].filter(u => u !== url); if (!al[key].length) delete al[key]; }
            await writeFile(ALLOWLIST, JSON.stringify(al, null, 2), "utf8");
            return send(res, 200, { ok: true });
          }

          // Add URL to blocklist (remove from allowlist if present)
          if (req.method === "POST" && req.url === "/__admin/block") {
            const { parkId, url } = await readBody(req);
            if (!parkId || !url) return send(res, 400, { error: "parkId and url required" });
            const key = String(parkId);
            const bl = await readJson(BLOCKLIST, {});
            if (!bl[key]) bl[key] = [];
            if (!bl[key].includes(url)) bl[key].push(url);
            await writeFile(BLOCKLIST, JSON.stringify(bl, null, 2), "utf8");
            const al = await readJson(ALLOWLIST, {});
            if (al[key]) { al[key] = al[key].filter(u => u !== url); if (!al[key].length) delete al[key]; }
            await writeFile(ALLOWLIST, JSON.stringify(al, null, 2), "utf8");
            return send(res, 200, { ok: true });
          }

          // Remove URL from blocklist
          if (req.method === "POST" && req.url === "/__admin/unblock") {
            const { parkId, url } = await readBody(req);
            if (!parkId || !url) return send(res, 400, { error: "parkId and url required" });
            const key = String(parkId);
            const bl = await readJson(BLOCKLIST, {});
            if (bl[key]) { bl[key] = bl[key].filter(u => u !== url); if (!bl[key].length) delete bl[key]; }
            await writeFile(BLOCKLIST, JSON.stringify(bl, null, 2), "utf8");
            return send(res, 200, { ok: true });
          }

          if (req.method === "GET" && req.url === "/__admin/status") {
            const overrides = await readJson(OVERRIDES, {});
            const manifest = await readJson(MANIFEST, { ids: [] });
            const allowlist = await readJson(ALLOWLIST, {});
            const blocklist = await readJson(BLOCKLIST, {});
            return send(res, 200, { overrides, manifest, allowlist, blocklist });
          }

          return send(res, 404, { error: "not found" });
        } catch (err) {
          return send(res, 500, { error: err.message });
        }
      });
    },
  };
}
