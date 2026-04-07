import { useState, useEffect, useMemo, useCallback } from "react";
import { PARKS } from "./parks-data.mjs";

const STATUS = {
  aberto:   { label: "Aberto",             color: "#22c55e", bg: "#dcfce7", icon: "✅" },
  limitado: { label: "Estrutura limitada",  color: "#f59e0b", bg: "#fef3c7", icon: "⚠️" },
  fechado:  { label: "Fechado",             color: "#ef4444", bg: "#fee2e2", icon: "❌" },
};

const PAGE = 12;
const imgCache = {};

function fetchAllImages(slug) {
  const api = "https://pt.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    titles: slug,
    generator: "images",
    gimlimit: "30",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "800",
    format: "json",
    origin: "*",
  });
  return fetch(`${api}?${params}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data?.query?.pages) return [];
      return Object.values(data.query.pages)
        .filter(p => {
          const info = p.imageinfo?.[0];
          if (!info) return false;
          const mime = info.mime || "";
          if (!mime.startsWith("image/")) return false;
          // Filter out icons, logos, commons badges, SVGs, tiny images
          const title = (p.title || "").toLowerCase();
          if (title.includes("icon") || title.includes("logo") || title.includes("badge")
            || title.includes("symbol") || title.includes("commons")
            || title.includes("wikidata") || title.includes("edit-clear")
            || title.includes("padlock") || title.includes("crystal")
            || title.includes("flag") || title.includes("coat_of_arms")
            || title.includes("brasao") || title.includes("brasão")
            || title.includes("stub") || title.includes("ambox")
            || title.includes("question_book") || title.includes("disambig")
            || title.includes("wiki_letter") || title.includes("portal")
            || title.includes("red_pencil") || title.includes("searchtool")
            || title.includes("merge-arrow") || title.includes("unbalanced")) return false;
          if (mime === "image/svg+xml") return false;
          return true;
        })
        .map(p => {
          const info = p.imageinfo[0];
          return info.thumburl || info.url;
        })
        .filter(Boolean);
    })
    .catch(() => []);
}

function useParkImages(slug) {
  const [images, setImages] = useState(imgCache[slug] ?? null);
  const [done, setDone] = useState(slug in imgCache);

  useEffect(() => {
    if (slug in imgCache) { setImages(imgCache[slug]); setDone(true); return; }
    let alive = true;
    fetchAllImages(slug).then(imgs => {
      imgCache[slug] = imgs;
      if (alive) { setImages(imgs); setDone(true); }
    });
    return () => { alive = false; };
  }, [slug]);

  return { images: images || [], done };
}

function Carousel({ images, height, alt, onClickImage }) {
  const [idx, setIdx] = useState(0);
  const len = images.length;

  const prev = useCallback((e) => {
    e.stopPropagation();
    setIdx(i => (i - 1 + len) % len);
  }, [len]);

  const next = useCallback((e) => {
    e.stopPropagation();
    setIdx(i => (i + 1) % len);
  }, [len]);

  if (len === 0) return (
    <div style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
      <span style={{ fontSize: 34 }}>🌿</span><span style={{ marginTop: 6 }}>Sem foto</span>
    </div>
  );

  const btnStyle = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    background: "#000a", color: "#fff", border: "none", borderRadius: "50%",
    width: 28, height: 28, cursor: "pointer", fontSize: 14,
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 2, opacity: 0.8,
  };

  return (
    <div style={{ height, position: "relative", overflow: "hidden" }} onClick={onClickImage}>
      <img src={images[idx]} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      {len > 1 && <>
        <button onClick={prev} style={{ ...btnStyle, left: 6 }}>‹</button>
        <button onClick={next} style={{ ...btnStyle, right: 6 }}>›</button>
        <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 4, zIndex: 2 }}>
          {images.map((_, i) => (
            <div key={i} onClick={e => { e.stopPropagation(); setIdx(i); }}
              style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 3,
                background: i === idx ? "#fff" : "#fff8", cursor: "pointer",
                transition: "width .2s" }} />
          ))}
        </div>
        <div style={{ position: "absolute", bottom: 6, right: 8, background: "#000a",
          color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px",
          borderRadius: 8, zIndex: 2 }}>
          {idx + 1}/{len}
        </div>
      </>}
    </div>
  );
}

function ParkCard({ park, onClick }) {
  const { images, done } = useParkImages(park.slug);
  const meta = STATUS[park.status];
  const wikiUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(park.slug)}`;

  return (
    <div onClick={() => onClick({ ...park, images, wikiUrl })}
      style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", background: "#fff",
        boxShadow: "0 2px 12px #0001", transition: "transform .18s,box-shadow .18s", display: "flex", flexDirection: "column" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 28px #0002"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px #0001"; }}>
      <div style={{ height: 160, background: "#e2e8f0", position: "relative", overflow: "hidden" }}>
        {!done && <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 28, height: 28, border: "3px solid #cbd5e1", borderTopColor: "#64748b", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>}
        {done && <Carousel images={images} height={160} alt={park.name} />}
        <div style={{ position: "absolute", top: 8, right: 8, background: meta.bg, color: meta.color,
          fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, border: `1px solid ${meta.color}44`, zIndex: 3 }}>
          {meta.icon} {meta.label}
        </div>
        <div style={{ position: "absolute", top: 8, left: 8, background: "#1e293bcc", color: "#fff",
          fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, zIndex: 3 }}>#{park.id}</div>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", lineHeight: 1.3, marginBottom: 6 }}>{park.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{park.state}</span>
          <span style={{ fontSize: 12, color: "#475569" }}>{park.access} · <b>{park.dist.toLocaleString("pt-BR")} km</b></span>
        </div>
      </div>
    </div>
  );
}

function Modal({ park, onClose }) {
  const meta = STATUS[park.status];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, overflow: "hidden", maxWidth: 560, width: "100%", boxShadow: "0 20px 60px #0006" }}>
        <div style={{ height: 280, background: "#e2e8f0", position: "relative" }}>
          <Carousel images={park.images || []} height={280} alt={park.name} />
          <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "#000a", color: "#fff", border: "none",
            borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: "#1e293b", lineHeight: 1.3 }}>#{park.id} — {park.name}</h2>
            <span style={{ flexShrink: 0, background: meta.bg, color: meta.color, fontSize: 12, fontWeight: 700,
              padding: "4px 10px", borderRadius: 20, border: `1px solid ${meta.color}44` }}>{meta.icon} {meta.label}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["🗺️ Estado", park.state], ["📏 Distância", `${park.dist.toLocaleString("pt-BR")} km`], ["🚌 Acesso", park.access]].map(([k, v]) => (
              <div key={k} style={{ background: "#f8fafc", borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>{v}</div>
              </div>
            ))}
          </div>
          <a href={park.wikiUrl} target="_blank" rel="noreferrer"
            style={{ display: "block", marginTop: 16, textAlign: "center", background: "#0f172a", color: "#fff",
              padding: "10px", borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            🔗 Ver na Wikipedia
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => PARKS.filter(p => {
    const ms = p.name.toLowerCase().includes(search.toLowerCase()) || p.state.toLowerCase().includes(search.toLowerCase());
    return ms && (filter === "todos" || p.status === filter);
  }), [search, filter]);

  const totalPages = Math.ceil(filtered.length / PAGE);
  const visible = filtered.slice((page - 1) * PAGE, page * PAGE);
  const counts = {
    aberto: PARKS.filter(p => p.status === "aberto").length,
    limitado: PARKS.filter(p => p.status === "limitado").length,
    fechado: PARKS.filter(p => p.status === "fechado").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ background: "linear-gradient(135deg,#14532d,#166534,#15803d)", color: "#fff", padding: "32px 24px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🌳</div>
        <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, letterSpacing: -.5 }}>Parques Nacionais do Brasil</h1>
        <p style={{ margin: "0 0 20px", opacity: .8, fontSize: 14 }}>74 parques · ordenados por distância de SP</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          {[["todos", "Todos", 74], ["aberto", "Abertos", counts.aberto], ["limitado", "Limitados", counts.limitado], ["fechado", "Fechados", counts.fechado]].map(([k, l, cnt]) => (
            <button key={k} onClick={() => { setFilter(k); setPage(1); }} style={{
              border: "2px solid #fff", background: filter === k ? "#fff" : "transparent",
              color: filter === k ? "#14532d" : "#fff", padding: "6px 16px", borderRadius: 20,
              cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all .15s" }}>
              {l} <span style={{ opacity: .7 }}>({cnt})</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="🔍  Buscar por nome ou estado..."
          style={{ flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }} />
        <span style={{ fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>{filtered.length} parque{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
        {visible.length === 0
          ? <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}><div style={{ fontSize: 48 }}>🌿</div><p>Nenhum parque encontrado</p></div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
              {visible.map(p => <ParkCard key={p.id} park={p} onClick={setSelected} />)}
            </div>}

        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 32, flexWrap: "wrap" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", cursor: page === 1 ? "default" : "pointer", opacity: page === 1 ? .4 : 1, fontWeight: 600 }}>← Anterior</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .reduce((acc, n, i, arr) => {
                if (i > 0 && n - arr[i - 1] > 1) acc.push(<span key={`e${n}`} style={{ padding: "0 4px", color: "#94a3b8" }}>…</span>);
                acc.push(<button key={n} onClick={() => setPage(n)} style={{
                  width: 36, height: 36, borderRadius: 10, border: `1px solid ${n === page ? "#15803d" : "#e2e8f0"}`,
                  background: n === page ? "#15803d" : "#fff", color: n === page ? "#fff" : "#334155", cursor: "pointer", fontWeight: 700, fontSize: 14
                }}>{n}</button>);
                return acc;
              }, [])}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", cursor: page === totalPages ? "default" : "pointer", opacity: page === totalPages ? .4 : 1, fontWeight: 600 }}>Próxima →</button>
          </div>
        )}
      </div>

      {selected && <Modal park={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
