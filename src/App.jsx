import { useState, useEffect, useMemo, useCallback } from "react";
import { PARKS, SAO_PAULO } from "./parks-data.mjs";
import { track } from "./analytics.mjs";
import { useVisits } from "./useVisits.js";

// ── Route planning helpers ──────────────────────────────────────────

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function optimizeRoute(parks, startLat, startLng) {
  if (parks.length === 0) return { ordered: [], legs: [], total: 0 };
  const remaining = [...parks];
  const ordered = [];
  const legs = [];
  let curLat = startLat;
  let curLng = startLng;
  let total = 0;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(curLat, curLng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const pick = remaining.splice(bestIdx, 1)[0];
    ordered.push(pick);
    legs.push(Math.round(bestDist));
    total += bestDist;
    curLat = pick.lat;
    curLng = pick.lng;
  }

  return { ordered, legs, total: Math.round(total) };
}

function RouteModal({ parks, startLabel, startLat, startLng, onClose, onClear }) {
  const { ordered, legs, total } = useMemo(
    () => optimizeRoute(parks, startLat, startLng),
    [parks, startLat, startLng]
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20,
        overflow: "hidden", maxWidth: 560, width: "100%", maxHeight: "85vh",
        boxShadow: "0 20px 60px #0006", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#14532d,#166534,#15803d)", color: "#fff",
          padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🗺️ Seu Roteiro</div>
            <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>{ordered.length} parques · {total.toLocaleString("pt-BR")} km total</div>
          </div>
          <button onClick={onClose} style={{ background: "#ffffff22", color: "#fff", border: "none",
            borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 18,
            display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Route steps */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {/* Starting point */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#15803d", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>📍</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{startLabel}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>Ponto de partida</div>
            </div>
          </div>

          {ordered.map((park, i) => (
            <div key={park.id}>
              {/* Connector line + distance */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                <div style={{ width: 32, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: 2, height: 28, background: "#d1d5db" }} />
                </div>
                <span style={{ fontSize: 11, color: "#15803d", fontWeight: 600 }}>↓ {legs[i].toLocaleString("pt-BR")} km</span>
              </div>
              {/* Park step */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#dcfce7", color: "#15803d",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
                  border: "2px solid #15803d" }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{park.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{park.state} · {park.access}</div>
                </div>
              </div>
            </div>
          ))}

          {/* Total */}
          <div style={{ marginTop: 20, padding: "14px 16px", background: "#f0fdf4", borderRadius: 12,
            border: "1px solid #bbf7d0", textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#15803d", fontWeight: 600, marginBottom: 2 }}>Distância total estimada</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#14532d" }}>{total.toLocaleString("pt-BR")} km</div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: "12px 24px 16px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 12 }}>
          <button onClick={() => { onClear(); onClose(); }} style={{
            flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e2e8f0",
            background: "#fff", color: "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 600
          }}>🗑️ Limpar roteiro</button>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px", borderRadius: 10, border: "none",
            background: "#15803d", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600
          }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

const LS_GEO = "parques-geolocation";

function loadGeo() {
  try {
    const s = localStorage.getItem(LS_GEO);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function useGeolocation() {
  const saved = loadGeo();
  const [location, setLocation] = useState(saved);
  const [status, setStatus] = useState(saved ? "granted" : "idle"); // idle | loading | granted | denied

  const request = useCallback(() => {
    if (!navigator.geolocation) { setStatus("denied"); return; }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc); setStatus("granted");
        try { localStorage.setItem(LS_GEO, JSON.stringify(loc)); } catch {}
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  const reset = useCallback(() => {
    setLocation(null); setStatus("idle");
    try { localStorage.removeItem(LS_GEO); } catch {}
  }, []);

  return { location, status, request, reset };
}

const STATUS = {
  aberto:   { label: "Aberto",             color: "#22c55e", bg: "#dcfce7", icon: "✅" },
  limitado: { label: "Estrutura limitada",  color: "#f59e0b", bg: "#fef3c7", icon: "⚠️" },
  fechado:  { label: "Fechado",             color: "#ef4444", bg: "#fee2e2", icon: "❌" },
};

const PAGE = 12;
const imgCache = {};
const LS_KEY = "parques-favoritos";

function loadFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
  catch { return new Set(); }
}

function saveFavorites(set) {
  localStorage.setItem(LS_KEY, JSON.stringify([...set]));
}

function useFavorites() {
  const [favs, setFavs] = useState(loadFavorites);
  const toggle = useCallback((id) => {
    setFavs(prev => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (adding) next.add(id); else next.delete(id);
      saveFavorites(next);
      track(adding ? "favorite_add" : "favorite_remove", { park_id: id });
      return next;
    });
  }, []);
  return { favs, toggle };
}

function FavButton({ active, onClick, size = 24 }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", cursor: "pointer", padding: 0,
      fontSize: size, lineHeight: 1, filter: active ? "none" : "grayscale(1) opacity(.5)",
      transition: "transform .15s, filter .15s",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.2)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
    title={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
      {active ? "❤️" : "🤍"}
    </button>
  );
}

function fetchAllImages(slug) {
  const api = "https://pt.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    titles: slug,
    generator: "images",
    gimlimit: "30",
    prop: "imageinfo",
    iiprop: "url|mime|size",
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
            || title.includes("merge-arrow") || title.includes("unbalanced")
            || title.includes("fairytale") || title.includes("nuvola")
            || title.includes("konqueror") || title.includes("gnome")
            || title.includes("oxygen") || title.includes("tango")) return false;
          if (mime === "image/svg+xml") return false;
          // Filter out small UI icons by pixel size
          const w = info.width || 0;
          const h = info.height || 0;
          if (w > 0 && h > 0 && w < 200 && h < 200) return false;
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
    <div style={{ height, position: "relative", overflow: "hidden" }}
      onClick={() => onClickImage?.(idx)}>
      <img src={images[idx]} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block",
        cursor: onClickImage ? "zoom-in" : "default" }} />
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

function ParkCard({ park, onClick, isFav, onToggleFav, isVisited, routeMode, routeSelected, onRouteToggle }) {
  const { images, done } = useParkImages(park.slug);
  const meta = STATUS[park.status];
  const wikiUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(park.slug)}`;

  const handleClick = () => {
    if (routeMode) { onRouteToggle(park.id); }
    else { onClick({ ...park, images, wikiUrl }); }
  };

  return (
    <div onClick={handleClick}
      style={{ borderRadius: 16, overflow: "hidden", cursor: "pointer", background: "#fff",
        boxShadow: routeSelected ? "0 0 0 3px #15803d" : "0 2px 12px #0001",
        transition: "transform .18s,box-shadow .18s", display: "flex", flexDirection: "column",
        position: "relative" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = routeSelected ? "0 0 0 3px #15803d, 0 8px 28px #0002" : "0 8px 28px #0002"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = routeSelected ? "0 0 0 3px #15803d" : "0 2px 12px #0001"; }}>
      {routeMode && (
        <div style={{ position: "absolute", top: 8, left: 8, zIndex: 5, width: 26, height: 26,
          borderRadius: "50%", background: routeSelected ? "#15803d" : "#fff", border: "2px solid #15803d",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 6px #0003", transition: "background .15s" }}>
          {routeSelected && <span style={{ color: "#fff", fontSize: 14, fontWeight: 800, lineHeight: 1 }}>✓</span>}
        </div>
      )}
      <div style={{ height: 160, background: "#e2e8f0", position: "relative", overflow: "hidden" }}>
        {!done && <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 28, height: 28, border: "3px solid #cbd5e1", borderTopColor: "#64748b", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>}
        {done && <Carousel images={images} height={160} alt={park.name} />}
        <div style={{ position: "absolute", top: 8, right: 8, background: meta.bg, color: meta.color,
          fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, border: `1px solid ${meta.color}44`, zIndex: 3 }}>
          {meta.icon} {meta.label}
        </div>
        {!routeMode && <div style={{ position: "absolute", top: 8, left: 8, background: "#1e293bcc", color: "#fff",
          fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, zIndex: 3 }}>#{park.id}</div>}
        {isVisited && (
          <div style={{ position: "absolute", bottom: 8, left: 8, background: "#15803ddd", color: "#fff",
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, zIndex: 3,
            display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 12 }}>&#10003;</span> Visitado
          </div>
        )}
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", lineHeight: 1.3 }}>{park.name}</div>
          {!routeMode && <FavButton active={isFav} size={18} onClick={e => { e.stopPropagation(); onToggleFav(park.id); }} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{park.state}</span>
          <span style={{ fontSize: 12, color: "#475569" }}>{park.access} · <b>{park.dist.toLocaleString("pt-BR")} km</b></span>
        </div>
      </div>
    </div>
  );
}

function Lightbox({ images, startIdx, onClose }) {
  const [idx, setIdx] = useState(startIdx);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const len = images.length;

  useEffect(() => { setScale(1); setPos({ x: 0, y: 0 }); }, [idx]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") { setIdx(i => (i - 1 + len) % len); }
      if (e.key === "ArrowRight") { setIdx(i => (i + 1) % len); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [len, onClose]);

  const handleWheel = useCallback(e => {
    e.preventDefault();
    setScale(s => Math.min(5, Math.max(0.5, s - e.deltaY * 0.002)));
  }, []);

  const handlePointerDown = useCallback(e => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  }, [scale, pos]);

  const handlePointerMove = useCallback(e => {
    if (!dragging) return;
    setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const handlePointerUp = useCallback(() => setDragging(false), []);

  const toggleZoom = useCallback(e => {
    e.stopPropagation();
    if (scale > 1) { setScale(1); setPos({ x: 0, y: 0 }); }
    else setScale(3);
  }, [scale]);

  const navBtn = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    background: "#fff2", color: "#fff", border: "none", borderRadius: "50%",
    width: 44, height: 44, cursor: "pointer", fontSize: 22,
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000e", zIndex: 1100,
      display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}
      onClick={e => { if (e.target === e.currentTarget && scale <= 1) onClose(); }}
      onWheel={handleWheel}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8, zIndex: 12 }}>
        <button onClick={toggleZoom} style={{
          background: "#fff2", color: "#fff", border: "none", borderRadius: "50%",
          width: 36, height: 36, cursor: "pointer", fontSize: 16,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          {scale > 1 ? "−" : "+"}
        </button>
        <button onClick={onClose} style={{
          background: "#fff2", color: "#fff", border: "none", borderRadius: "50%",
          width: 36, height: 36, cursor: "pointer", fontSize: 18,
          display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>
      {len > 1 && <>
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + len) % len); }}
          style={{ ...navBtn, left: 12 }}>‹</button>
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % len); }}
          style={{ ...navBtn, right: 12 }}>›</button>
      </>}
      <img src={images[idx]} alt="" draggable={false}
        onPointerDown={handlePointerDown}
        onDoubleClick={toggleZoom}
        style={{
          maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain",
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transition: dragging ? "none" : "transform .2s",
          cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
          userSelect: "none",
        }} />
      {len > 1 && (
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          background: "#000a", color: "#fff", fontSize: 13, fontWeight: 600,
          padding: "4px 12px", borderRadius: 12, zIndex: 10 }}>
          {idx + 1} / {len}
        </div>
      )}
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function VisitSection({ parkId, visit, onSave, onRemove }) {
  const today = new Date().toISOString().slice(0, 10);
  const [editing, setEditing] = useState(!visit);
  const [date, setDate] = useState(visit?.date || today);
  const [notes, setNotes] = useState(visit?.notes || "");
  const [photos, setPhotos] = useState(visit?.photos || []);
  const [saving, setSaving] = useState(false);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files);
    const results = await Promise.all(files.map(fileToBase64));
    setPhotos(prev => [...prev, ...results]);
  };

  const removePhoto = (idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(parkId, { date, notes, photos });
    setSaving(false);
    setEditing(false);
  };

  const handleRemove = async () => {
    setSaving(true);
    await onRemove(parkId);
    setSaving(false);
    setEditing(true);
    setDate(today);
    setNotes("");
    setPhotos([]);
  };

  const inputStyle = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db",
    fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  if (visit && !editing) {
    return (
      <div style={{ marginTop: 16, background: "#f0fdf4", borderRadius: 12, padding: 16, border: "1px solid #bbf7d0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#15803d" }}>&#10003; Visitado em {visit.date}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(true)} style={{
              background: "#e2e8f0", border: "none", borderRadius: 8, padding: "4px 10px",
              cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#475569" }}>Editar</button>
            <button onClick={handleRemove} disabled={saving} style={{
              background: "#fee2e2", border: "none", borderRadius: 8, padding: "4px 10px",
              cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626" }}>Remover</button>
          </div>
        </div>
        {visit.notes && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{visit.notes}</p>}
        {visit.photos && visit.photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {visit.photos.map((src, i) => (
              <img key={i} src={src} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #d1d5db" }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, background: "#f8fafc", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#334155", marginBottom: 10 }}>
        {visit ? "Editar visita" : "Marcar como visitado"}
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Data da visita</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Notas (opcional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="Suas impressoes sobre o parque..."
          style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>Fotos (opcional)</label>
        <input type="file" accept="image/*" multiple onChange={handleFiles}
          style={{ fontSize: 12 }} />
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {photos.map((src, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={src} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid #d1d5db" }} />
                <button onClick={() => removePhoto(i)} style={{
                  position: "absolute", top: -4, right: -4, background: "#ef4444", color: "#fff",
                  border: "none", borderRadius: "50%", width: 16, height: 16, fontSize: 10,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  lineHeight: 1, padding: 0 }}>x</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} disabled={saving} style={{
          flex: 1, background: "#15803d", color: "#fff", border: "none", borderRadius: 8,
          padding: "8px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
          {saving ? "Salvando..." : "Salvar visita"}
        </button>
        {visit && (
          <button onClick={() => setEditing(false)} style={{
            background: "#e2e8f0", border: "none", borderRadius: 8, padding: "8px 14px",
            cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475569" }}>Cancelar</button>
        )}
      </div>
    </div>
  );
}

function Modal({ park, onClose, isFav, onToggleFav, visit, onSaveVisit, onRemoveVisit }) {
  const meta = STATUS[park.status];
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const imgs = park.images || [];
  return (
    <>
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, overflow: "hidden", maxWidth: 560, width: "100%", boxShadow: "0 20px 60px #0006", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ height: 280, background: "#e2e8f0", position: "relative" }}>
          <Carousel images={imgs} height={280} alt={park.name}
            onClickImage={idx => { if (imgs.length > 0) { setLightboxIdx(idx); track("lightbox_open", { park_id: park.id }); } }} />
          <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "#000a", color: "#fff", border: "none",
            borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#1e293b", lineHeight: 1.3 }}>#{park.id} — {park.name}</h2>
              <FavButton active={isFav} size={22} onClick={() => onToggleFav(park.id)} />
            </div>
            <span style={{ flexShrink: 0, background: meta.bg, color: meta.color, fontSize: 12, fontWeight: 700,
              padding: "4px 10px", borderRadius: 20, border: `1px solid ${meta.color}44` }}>{meta.icon} {meta.label}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["🗺️ Estado", park.state], ["📏 Distância", `${park.dist.toLocaleString("pt-BR")} km`], ["🚌 Acesso", park.access], ["🎫 Entrada", park.entrada], ["🕐 Horário", park.horario], ["📅 Melhor época", park.melhorEpoca], ["🥾 Trilhas", park.trilhas?.length > 0 ? park.trilhas.join(", ") : "Sem trilhas cadastradas"]].map(([k, v]) => (
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
          <VisitSection parkId={park.id} visit={visit} onSave={onSaveVisit} onRemove={onRemoveVisit} />
        </div>
      </div>
    </div>
    {lightboxIdx !== null && (
      <Lightbox images={imgs} startIdx={lightboxIdx} onClose={() => setLightboxIdx(null)} />
    )}
    </>
  );
}

function PassaporteView({ visits, parks, onSelectPark }) {
  const visitedParks = useMemo(() => {
    return parks.filter(p => visits[p.id]).map(p => ({
      ...p,
      visit: visits[p.id],
    })).sort((a, b) => (b.visit.date || "").localeCompare(a.visit.date || ""));
  }, [parks, visits]);

  const total = Object.keys(visits).length;
  const pct = ((total / 74) * 100).toFixed(1);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, marginBottom: 24,
        boxShadow: "0 2px 12px #0001", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🛂</div>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, color: "#14532d", fontWeight: 800 }}>Meu Passaporte</h2>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b" }}>
          Registro das suas visitas aos parques nacionais
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ background: "#f0fdf4", borderRadius: 12, padding: "12px 24px", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#15803d" }}>{total}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>de 74 visitados</div>
          </div>
          <div style={{ background: "#f0fdf4", borderRadius: 12, padding: "12px 24px", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#15803d" }}>{pct}%</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>completo</div>
          </div>
        </div>
        {total > 0 && (
          <div style={{ marginTop: 16, background: "#e2e8f0", borderRadius: 8, height: 10, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(90deg, #15803d, #22c55e)", height: "100%",
              width: `${(total / 74) * 100}%`, borderRadius: 8, transition: "width .3s" }} />
          </div>
        )}
      </div>

      {visitedParks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
          <div style={{ fontSize: 48 }}>🌿</div>
          <p>Nenhum parque visitado ainda. Abra um parque e marque como visitado!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {visitedParks.map(p => (
            <div key={p.id} onClick={() => onSelectPark(p)}
              style={{ background: "#fff", borderRadius: 16, overflow: "hidden", cursor: "pointer",
                boxShadow: "0 2px 12px #0001", transition: "transform .18s, box-shadow .18s" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 28px #0002"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px #0001"; }}>
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>#{p.id} {p.name}</div>
                  <span style={{ fontSize: 12, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{p.state}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 12 }}>&#10003; {p.visit.date}</span>
                </div>
                {p.visit.notes && (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569", lineHeight: 1.4,
                    whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{p.visit.notes}</p>
                )}
                {p.visit.photos && p.visit.photos.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {p.visit.photos.slice(0, 4).map((src, i) => (
                      <img key={i} src={src} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    ))}
                    {p.visit.photos.length > 4 && (
                      <div style={{ width: 56, height: 56, borderRadius: 8, background: "#e2e8f0",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700, color: "#64748b" }}>+{p.visit.photos.length - 4}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("grid"); // "grid" | "passaporte"
  const { favs, toggle: toggleFav } = useFavorites();
  const { visits, save: saveVisit, remove: removeVisit, isVisited } = useVisits();
  const geo = useGeolocation();

  // Route planning state (persisted in localStorage)
  const [routeMode, setRouteMode] = useState(() => {
    try { return localStorage.getItem("parques-route-mode") === "1"; } catch { return false; }
  });
  const [routeIds, setRouteIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("parques-route-ids") || "[]")); }
    catch { return new Set(); }
  });
  const [showRoute, setShowRoute] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("parques-route-mode", routeMode ? "1" : "0"); } catch {}
  }, [routeMode]);

  useEffect(() => {
    try { localStorage.setItem("parques-route-ids", JSON.stringify([...routeIds])); } catch {}
  }, [routeIds]);

  const toggleRouteMode = useCallback(() => {
    setRouteMode(prev => {
      const next = !prev;
      if (prev) setRouteIds(new Set());
      return next;
    });
  }, []);

  const toggleRouteId = useCallback((id) => {
    setRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearRoute = useCallback(() => {
    setRouteIds(new Set());
  }, []);

  const ref = geo.location || SAO_PAULO;
  const usingGeo = !!geo.location;

  const parksWithDist = useMemo(() =>
    PARKS.map(p => ({
      ...p,
      dist: usingGeo ? Math.round(haversine(ref.lat, ref.lng, p.lat, p.lng)) : p.dist,
    })).sort((a, b) => a.dist - b.dist),
  [ref.lat, ref.lng, usingGeo]);

  const filtered = useMemo(() => parksWithDist.filter(p => {
    const ms = p.name.toLowerCase().includes(search.toLowerCase()) || p.state.toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (filter === "favoritos") return favs.has(p.id);
    return filter === "todos" || p.status === filter;
  }), [parksWithDist, search, filter, favs]);

  const totalPages = Math.ceil(filtered.length / PAGE);
  const visible = filtered.slice((page - 1) * PAGE, page * PAGE);
  const counts = {
    aberto: PARKS.filter(p => p.status === "aberto").length,
    limitado: PARKS.filter(p => p.status === "limitado").length,
    fechado: PARKS.filter(p => p.status === "fechado").length,
  };

  const routeParks = useMemo(() =>
    parksWithDist.filter(p => routeIds.has(p.id)),
  [parksWithDist, routeIds]);

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ background: "linear-gradient(135deg,#14532d,#166534,#15803d)", color: "#fff", padding: "32px 24px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🌳</div>
        <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, letterSpacing: -.5 }}>Parques Nacionais do Brasil</h1>
        <p style={{ margin: "0 0 12px", opacity: .8, fontSize: 14 }}>
          74 parques · ordenados por distância de {usingGeo ? "você" : "SP"}
        </p>
        <div style={{ marginBottom: 16 }}>
          {geo.status === "idle" && (
            <button onClick={() => { geo.request(); track("geolocation_request"); }} style={{
              background: "#ffffff22", border: "1px solid #fff6", color: "#fff",
              padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              📍 Usar minha localização
            </button>
          )}
          {geo.status === "loading" && (
            <span style={{ fontSize: 12, opacity: .8 }}>📍 Obtendo localização...</span>
          )}
          {geo.status === "granted" && (
            <button onClick={geo.reset} style={{
              background: "#ffffff22", border: "1px solid #fff6", color: "#fff",
              padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              📍 Usando sua localização · Voltar para SP
            </button>
          )}
          {geo.status === "denied" && (
            <span style={{ fontSize: 12, opacity: .7 }}>📍 Localização negada · usando SP</span>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          {[["todos", "Todos", 74], ["favoritos", "Favoritos", favs.size], ["aberto", "Abertos", counts.aberto], ["limitado", "Limitados", counts.limitado], ["fechado", "Fechados", counts.fechado]].map(([k, l, cnt]) => (
            <button key={k} onClick={() => { setFilter(k); setPage(1); setView("grid"); track("filter_change", { filter: k }); }} style={{
              border: "2px solid #fff", background: filter === k && view === "grid" ? "#fff" : "transparent",
              color: filter === k && view === "grid" ? "#14532d" : "#fff", padding: "6px 16px", borderRadius: 20,
              cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all .15s" }}>
              {l} <span style={{ opacity: .7 }}>({cnt})</span>
            </button>
          ))}
          <button onClick={() => setView(v => v === "passaporte" ? "grid" : "passaporte")} style={{
            border: "2px solid #fbbf24", background: view === "passaporte" ? "#fbbf24" : "transparent",
            color: view === "passaporte" ? "#14532d" : "#fbbf24", padding: "6px 16px", borderRadius: 20,
            cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all .15s" }}>
            🛂 Passaporte <span style={{ opacity: .7 }}>({Object.keys(visits).length} / 74)</span>
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="🔍  Buscar por nome ou estado..."
          style={{ flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }} />
        <button onClick={toggleRouteMode} style={{
          padding: "8px 16px", borderRadius: 20, border: "none", cursor: "pointer",
          fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", transition: "all .15s",
          background: routeMode ? "linear-gradient(135deg,#14532d,#15803d)" : "#f0fdf4",
          color: routeMode ? "#fff" : "#15803d",
          boxShadow: routeMode ? "0 2px 8px #15803d44" : "none",
        }}>
          {routeMode ? "✕ Sair do roteiro" : "🗺️ Montar Roteiro"}
        </button>
        <span style={{ fontSize: 13, color: "#64748b", whiteSpace: "nowrap" }}>{filtered.length} parque{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {view === "passaporte" ? (
        <PassaporteView visits={visits} parks={parksWithDist} onSelectPark={(p) => {
          const wikiUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(p.slug)}`;
          setSelected({ ...p, images: imgCache[p.slug] || [], wikiUrl });
        }} />
      ) : (
        <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
          {visible.length === 0
            ? <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}><div style={{ fontSize: 48 }}>🌿</div><p>Nenhum parque encontrado</p></div>
            : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
                {visible.map(p => <ParkCard key={p.id} park={p} onClick={p => { track("park_open", { park_id: p.id, park_name: p.name }); setSelected(p); }} isFav={favs.has(p.id)} onToggleFav={toggleFav} isVisited={isVisited(p.id)}
                  routeMode={routeMode} routeSelected={routeIds.has(p.id)} onRouteToggle={toggleRouteId} />)}
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
      )}

      {selected && <Modal park={selected} onClose={() => setSelected(null)} isFav={favs.has(selected.id)} onToggleFav={toggleFav}
        visit={visits[selected.id] || null} onSaveVisit={saveVisit} onRemoveVisit={removeVisit} />}

      {routeMode && routeIds.size > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 900,
          background: "linear-gradient(135deg,#14532d,#166534,#15803d)",
          padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 -4px 20px #0003" }}>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
            {routeIds.size} parque{routeIds.size !== 1 ? "s" : ""} selecionado{routeIds.size !== 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={clearRoute} style={{
              padding: "8px 16px", borderRadius: 20, border: "1px solid #fff6",
              background: "transparent", color: "#fff", cursor: "pointer",
              fontSize: 13, fontWeight: 600 }}>
              Limpar
            </button>
            <button onClick={() => setShowRoute(true)} style={{
              padding: "8px 20px", borderRadius: 20, border: "none",
              background: "#fff", color: "#14532d", cursor: "pointer",
              fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px #0003" }}>
              Ver Roteiro
            </button>
          </div>
        </div>
      )}

      {showRoute && routeIds.size > 0 && (
        <RouteModal
          parks={routeParks}
          startLabel={usingGeo ? "Sua localização" : "São Paulo"}
          startLat={ref.lat}
          startLng={ref.lng}
          onClose={() => setShowRoute(false)}
          onClear={() => { clearRoute(); setShowRoute(false); }}
        />
      )}

      <footer style={{ textAlign: "center", padding: "24px", color: "#94a3b8", fontSize: 12, borderTop: "1px solid #e2e8f0",
        marginBottom: routeMode && routeIds.size > 0 ? 60 : 0 }}>
        Atualizado em 07/04/2026 · Dados: Wikipedia
      </footer>
    </div>
  );
}
