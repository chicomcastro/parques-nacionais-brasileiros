import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PARKS, SAO_PAULO, BIOMAS } from "./parks-data.mjs";
import { track } from "./analytics.mjs";
import { useVisits } from "./useVisits.js";
import RouteModal, { SavedRoutes } from "./RouteView.jsx";
import MapView from "./MapView.jsx";
import { t, getLang, setLang, onLangChange } from "./i18n.mjs";

function useLang() {
  const [lang, setL] = useState(getLang());
  useEffect(() => onLangChange(setL), []);
  return lang;
}
import { getAllRoutes, deleteRoute as deleteRouteDB } from "./db.mjs";

// ── Helpers ──────────────────────────────────────────

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
        track("geolocation_granted");
        try { localStorage.setItem(LS_GEO, JSON.stringify(loc)); } catch {}
      },
      () => { setStatus("denied"); track("geolocation_denied"); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  const reset = useCallback(() => {
    setLocation(null); setStatus("idle");
    track("geolocation_reset");
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

const heroManifest = new Set();
fetch(`${import.meta.env.BASE_URL}parks/manifest.json`)
  .then(r => r.ok ? r.json() : { ids: [] })
  .then(d => { for (const id of d.ids || []) heroManifest.add(id); })
  .catch(() => {});

function heroUrl(parkId) {
  return heroManifest.has(parkId) ? `${import.meta.env.BASE_URL}parks/${parkId}.webp` : null;
}
const impressionSeen = new Set();

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
      if (next.has(id)) next.delete(id); else next.add(id);
      saveFavorites(next);
      return next;
    });
  }, []);
  const toggleWithTrack = useCallback((id) => {
    const adding = !favs.has(id);
    track(adding ? "favorite_add" : "favorite_remove", { park_id: id });
    toggle(id);
  }, [favs, toggle]);
  return { favs, toggle: toggleWithTrack };
}

function FavButton({ active, onClick, size = 24 }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", cursor: "pointer", padding: 0,
      lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
      color: active ? "#ef4444" : "#94a3b8",
      transition: "transform .15s, color .15s",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.2)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
    title={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
      <span className="material-icons-round" style={{ fontSize: size }}>
        {active ? "favorite" : "favorite_border"}
      </span>
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

function useParkImages(slug, parkId) {
  const hero = parkId ? heroUrl(parkId) : null;
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

  const combined = useMemo(() => {
    const remote = images || [];
    if (!hero) return remote;
    return [hero, ...remote.slice(1)];
  }, [hero, images]);

  return { images: combined, done: done || !!hero };
}

function Carousel({ images, height, alt, onClickImage, compact = false }) {
  const [idx, setIdx] = useState(0);
  const [drag, setDrag] = useState(0);
  const [width, setWidth] = useState(0);
  const len = images.length;
  const touchStart = useRef(null);
  const touchMoved = useRef(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const prev = useCallback((e) => {
    e.stopPropagation();
    setIdx(i => (i - 1 + len) % len);
  }, [len]);

  const next = useCallback((e) => {
    e.stopPropagation();
    setIdx(i => (i + 1) % len);
  }, [len]);

  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    touchMoved.current = false;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      touchMoved.current = true;
      setDrag(dx);
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    setDrag(0);
    if (len > 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) setIdx(i => (i + 1) % len);
      else setIdx(i => (i - 1 + len) % len);
    }
  }, [len]);

  const onImgClick = useCallback(() => {
    if (touchMoved.current) { touchMoved.current = false; return; }
    onClickImage?.(idx);
  }, [idx, onClickImage]);

  if (len === 0) return (
    <div style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
      <span style={{ fontSize: 34 }}>🌿</span><span style={{ marginTop: 6 }}>Sem foto</span>
    </div>
  );

  const hitWidth = compact ? 40 : 56;
  const circleSize = compact ? 24 : 32;
  const btnStyle = {
    position: "absolute", top: 0, bottom: 0,
    background: "transparent", border: "none", cursor: "pointer",
    width: hitWidth, padding: 0, zIndex: 2,
    display: "flex", alignItems: "center", justifyContent: "center",
    WebkitTapHighlightColor: "transparent",
  };
  const btnInner = {
    width: circleSize, height: circleSize, borderRadius: "50%",
    background: "#000a", color: "#fff", fontSize: compact ? 13 : 16,
    display: "flex", alignItems: "center", justifyContent: "center",
    opacity: 0.8,
  };

  const dragging = drag !== 0;
  const offset = width ? -idx * width + drag : 0;

  return (
    <div ref={containerRef} style={{ height, position: "relative", overflow: "hidden", touchAction: "pan-y" }}
      onClick={onImgClick}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div style={{
        display: "flex", height: "100%",
        transform: `translate3d(${offset}px, 0, 0)`,
        transition: dragging ? "none" : "transform .28s cubic-bezier(.2,.8,.2,1)",
        willChange: "transform",
      }}>
        {images.map((src, i) => (
          <img key={i} src={src} alt={i === idx ? alt : ""} draggable={false}
            loading={i === 0 ? "eager" : "lazy"} decoding="async"
            fetchPriority={i === 0 ? "high" : "low"}
            style={{ width: width || "100%", height: "100%", objectFit: "cover", display: "block",
              cursor: onClickImage ? "zoom-in" : "default", userSelect: "none", pointerEvents: "none", flexShrink: 0 }} />
        ))}
      </div>
      {len > 1 && <>
        <button aria-label="Anterior" onClick={prev} className="carousel-arrow" style={{ ...btnStyle, left: 0 }}><span style={btnInner}>‹</span></button>
        <button aria-label="Próximo" onClick={next} className="carousel-arrow" style={{ ...btnStyle, right: 0 }}><span style={btnInner}>›</span></button>
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

function ParkCard({ park, onClick, isFav, onToggleFav, isVisited, routeMode, routeSelected, onRouteToggle, onLongPress, position }) {
  const { images, done } = useParkImages(park.slug, park.id);
  const meta = STATUS[park.status];
  const wikiUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(park.slug)}`;
  const longPressTimer = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (impressionSeen.has(park.id)) return;
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !impressionSeen.has(park.id)) {
        impressionSeen.add(park.id);
        track("park_impression", { park_id: park.id, park_name: park.name, position });
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [park.id, park.name, position]);
  const pointerStart = useRef(null);

  const handleClick = () => {
    if (routeMode) { onRouteToggle(park.id); }
    else { onClick({ ...park, images, wikiUrl }); }
  };

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (routeMode) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      if (onLongPress) onLongPress(park.id);
    }, 500);
  }, [routeMode, park.id, onLongPress]);

  const handlePointerMove = useCallback((e) => {
    if (!pointerStart.current || !longPressTimer.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelLongPress();
  }, [cancelLongPress]);

  const handlePointerUp = useCallback(() => {
    cancelLongPress();
    pointerStart.current = null;
  }, [cancelLongPress]);

  return (
    <div ref={cardRef} onClick={handleClick} className="card-enter btn-press"
      onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove} onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ borderRadius: 14, overflow: "hidden", cursor: "pointer", background: "#fff",
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
      <div className="card-image" style={{ height: 160, background: "#e2e8f0", position: "relative", overflow: "hidden" }}>
        {!done && <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 28, height: 28, border: "3px solid #cbd5e1", borderTopColor: "#64748b", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        </div>}
        {done && <Carousel images={images} height="100%" alt={park.name} compact />}
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
      <div className="card-body" style={{ padding: "12px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 6 }}>
          <div className="card-title" style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", lineHeight: 1.3 }}>{park.name}</div>
          {!routeMode && <FavButton active={isFav} size={18} onClick={e => { e.stopPropagation(); onToggleFav(park.id); }} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <span className="card-state" style={{ fontSize: 12, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 12 }}>{park.state}</span>
          <span className="card-meta" style={{ fontSize: 12, color: "#475569" }}>{park.access} · <b>{park.dist.toLocaleString("pt-BR")} km</b></span>
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
      if (e.key === "Escape") { track("lightbox_close", { method: "key" }); onClose(); }
      if (e.key === "ArrowLeft") { setIdx(i => (i - 1 + len) % len); track("lightbox_navigate", { direction: "prev", method: "key" }); }
      if (e.key === "ArrowRight") { setIdx(i => (i + 1) % len); track("lightbox_navigate", { direction: "next", method: "key" }); }
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
    <div style={{ position: "fixed", inset: 0, background: "#000e", zIndex: 2100,
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
        <button onClick={() => { track("lightbox_close", { method: "button" }); onClose(); }} style={{
          background: "#fff2", color: "#fff", border: "none", borderRadius: "50%",
          width: 36, height: 36, cursor: "pointer", fontSize: 18,
          display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>
      {len > 1 && <>
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + len) % len); track("lightbox_navigate", { direction: "prev", method: "button" }); }}
          style={{ ...navBtn, left: 12 }}>‹</button>
        <button onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % len); track("lightbox_navigate", { direction: "next", method: "button" }); }}
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
  const [editing, setEditing] = useState(false);
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

  if (!visit && !editing) {
    return (
      <button onClick={() => setEditing(true)} style={{
        width: "100%", marginTop: 4, padding: "14px",
        background: "linear-gradient(135deg,#14532d,#15803d)", color: "#fff",
        border: "none", borderRadius: 12, cursor: "pointer",
        fontSize: 15, fontWeight: 700, boxShadow: "0 4px 14px #15803d44",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        <span className="material-icons-round" style={{ fontSize: 20 }}>check_circle</span>
        {t("mark_visited")}
      </button>
    );
  }

  if (visit && !editing) {
    return (
      <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 16, border: "1px solid #bbf7d0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#15803d", whiteSpace: "nowrap" }}>&#10003; {t("visited_on")} {visit.date}</span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setEditing(true)} style={{
              background: "#e2e8f0", border: "none", borderRadius: 8, padding: "4px 10px",
              cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#475569" }}>{t("edit")}</button>
            <button onClick={handleRemove} disabled={saving} style={{
              background: "#fee2e2", border: "none", borderRadius: 8, padding: "4px 10px",
              cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#dc2626" }}>{t("remove")}</button>
          </div>
        </div>
        {visit.notes && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{visit.notes}</p>}
        {visit.photos && visit.photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {visit.photos.map((src, i) => (
              <img key={i} src={src} alt="" loading="lazy" decoding="async" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #d1d5db" }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "#f8fafc", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#334155", marginBottom: 10 }}>
        {visit ? t("edit_visit") : t("mark_visited")}
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>{t("visit_date")}</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>{t("notes_optional")}</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder={t("notes_placeholder")}
          style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 3 }}>{t("photos_optional")}</label>
        <input type="file" accept="image/*" multiple onChange={handleFiles}
          style={{ fontSize: 12 }} />
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {photos.map((src, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={src} alt="" loading="lazy" decoding="async" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid #d1d5db" }} />
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
          {saving ? t("saving") : t("save_visit")}
        </button>
        <button onClick={() => setEditing(false)} style={{
          background: "#e2e8f0", border: "none", borderRadius: 8, padding: "8px 14px",
          cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475569" }}>{t("cancel")}</button>
      </div>
    </div>
  );
}

function Modal({ park, onClose, isFav, onToggleFav, visit, onSaveVisit, onRemoveVisit }) {
  const meta = STATUS[park.status];
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [closing, setClosing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const fetched = useParkImages(park.slug, park.id);
  const imgs = (park.images && park.images.length > 0) ? park.images : fetched.images;

  const handleClose = useCallback(() => {
    track("park_close", { park_id: park.id });
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose, park.id]);

  const handleShare = useCallback(async () => {
    const url = `https://chicomcastro.github.io/parques-nacionais-brasileiros/app/?park=${park.id}`;
    const text = `🌳 ${park.name} (${park.state}) — Parque Nacional`;
    if (navigator.share) {
      try { await navigator.share({ title: park.name, text, url }); track("park_share", { park_id: park.id, method: "native" }); } catch {}
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      track("park_share", { park_id: park.id, method: "clipboard" });
      setShareMsg("Link copiado!");
      setTimeout(() => setShareMsg(""), 2000);
    }
  }, [park.id, park.name, park.state]);

  return (
    <>
    <div onClick={handleClose} className={`modal-backdrop modal-wrap-mobile${closing ? " modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className={`modal-card modal-content-mobile${closing ? " modal-card-closing" : ""}`} style={{ background: "#fff", borderRadius: 20, overflow: "hidden", maxWidth: 560, width: "100%", boxShadow: "0 20px 60px #0006", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
        <div className="modal-hero" style={{ height: 280, background: "#e2e8f0", position: "relative" }}>
          <Carousel images={imgs} height="100%" alt={park.name}
            onClickImage={idx => { if (imgs.length > 0) { setLightboxIdx(idx); track("lightbox_open", { park_id: park.id }); } }} />
          <button className="modal-close" onClick={handleClose} style={{ position: "absolute", top: 12, right: 12, background: "#000a", color: "#fff", border: "none",
            borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>×</button>
        </div>
        <div className="modal-body" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#1e293b", lineHeight: 1.3 }}>#{park.id} — {park.name}</h2>
              <FavButton active={isFav} size={22} onClick={() => onToggleFav(park.id)} />
            </div>
            <span style={{ flexShrink: 0, background: meta.bg, color: meta.color, fontSize: 12, fontWeight: 700,
              padding: "4px 10px", borderRadius: 20, border: `1px solid ${meta.color}44` }}>{meta.icon} {meta.label}</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <VisitSection parkId={park.id} visit={visit} onSave={onSaveVisit} onRemove={onRemoveVisit} />
          </div>
          <div className="modal-info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[[t("state"), park.state], [t("distance"), `${park.dist.toLocaleString("pt-BR")} km`], [t("biome"), park.bioma || "—"], [t("access"), park.access], [t("entry"), park.entrada], [t("hours"), park.horario], [t("best_season"), park.melhorEpoca]].map(([k, v]) => (
              <div key={k} style={{ background: "#f8fafc", borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>{v}</div>
              </div>
            ))}
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{t("trails")}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>{park.trilhas?.length > 0 ? park.trilhas.join(", ") : t("no_trails")}</div>
            </div>
          </div>
          {shareMsg && <div style={{ textAlign: "center", color: "#15803d", fontSize: 12, fontWeight: 600, marginTop: 12 }}>{shareMsg}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <a href={park.wikiUrl} target="_blank" rel="noreferrer"
              onClick={() => track("wikipedia_open", { park_id: park.id })}
              style={{ flex: 1, textAlign: "center", background: "#fff", color: "#475569",
                padding: "10px", borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 600,
                border: "1px solid #e2e8f0",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span className="material-icons-round" style={{ fontSize: 18 }}>link</span> {t("wikipedia")}
            </a>
            <button onClick={handleShare} style={{
              flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "#fff", color: "#475569", cursor: "pointer", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span className="material-icons-round" style={{ fontSize: 18 }}>share</span> {t("share")}
            </button>
          </div>
        </div>
      </div>
    </div>
    {lightboxIdx !== null && (
      <Lightbox images={imgs} startIdx={lightboxIdx} onClose={() => setLightboxIdx(null)} />
    )}
    </>
  );
}

function generatePassportImage(visits, parks) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, "#14532d"); grad.addColorStop(0.5, "#166534"); grad.addColorStop(1, "#15803d");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = "#ffffff18";
  ctx.beginPath(); ctx.arc(900, 180, 240, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(180, 900, 180, 0, Math.PI * 2); ctx.fill();

  ctx.textAlign = "center"; ctx.fillStyle = "#fff";
  ctx.font = "600 36px -apple-system, system-ui, sans-serif";
  ctx.fillText("🛂  MEU PASSAPORTE", 540, 200);

  const total = Object.keys(visits).length;
  const pct = Math.round((total / 74) * 100);

  ctx.font = "800 280px -apple-system, system-ui, sans-serif";
  ctx.fillText(`${total}`, 540, 540);
  ctx.font = "600 48px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#ffffffcc";
  ctx.fillText(`de 74 parques nacionais`, 540, 610);

  const barX = 140, barY = 700, barW = 800, barH = 24;
  ctx.fillStyle = "#ffffff33";
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 12); ctx.fill();
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(barW * total / 74, 24), barH, 12); ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "700 56px -apple-system, system-ui, sans-serif";
  ctx.fillText(`${pct}% completo`, 540, 810);

  const states = new Set();
  for (const p of parks) if (visits[p.id]) p.state.split("/").forEach(s => states.add(s));
  ctx.font = "500 30px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#ffffffcc";
  if (states.size > 0) ctx.fillText(`${states.size} estado${states.size !== 1 ? "s" : ""} visitado${states.size !== 1 ? "s" : ""}`, 540, 870);

  ctx.font = "600 26px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#ffffff99";
  ctx.fillText("parques-nacionais-brasileiros", 540, 1000);
  ctx.font = "700 34px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("🌳 Parques Nacionais do Brasil", 540, 960);

  return new Promise(res => canvas.toBlob(res, "image/png"));
}

function PassaporteView({ visits, parks, onSelectPark }) {
  const [shareMsg, setShareMsg] = useState("");
  const total = Object.keys(visits).length;

  const handleShare = async () => {
    const blob = await generatePassportImage(visits, parks);
    if (!blob) return;
    const file = new File([blob], "meu-passaporte.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Meu Passaporte", text: `Visitei ${total} de 74 parques nacionais do Brasil 🌳` });
        track("passport_share", { method: "native", visited: total });
      } catch {}
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "meu-passaporte.png"; a.click();
      URL.revokeObjectURL(url);
      track("passport_share", { method: "download", visited: total });
      setShareMsg(t("image_saved"));
      setTimeout(() => setShareMsg(""), 2000);
    }
  };

  const visitedParks = useMemo(() => {
    return parks.filter(p => visits[p.id]).map(p => ({
      ...p,
      visit: visits[p.id],
    })).sort((a, b) => (b.visit.date || "").localeCompare(a.visit.date || ""));
  }, [parks, visits]);

  const pct = ((total / 74) * 100).toFixed(1);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, marginBottom: 24,
        boxShadow: "0 2px 12px #0001", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🛂</div>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, color: "#14532d", fontWeight: 800 }}>{t("my_passport")}</h2>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#64748b" }}>
          {t("passport_desc")}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ background: "#f0fdf4", borderRadius: 12, padding: "12px 24px", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#15803d" }}>{total}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{t("of_74_visited")}</div>
          </div>
          <div style={{ background: "#f0fdf4", borderRadius: 12, padding: "12px 24px", border: "1px solid #bbf7d0" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#15803d" }}>{pct}%</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{t("complete")}</div>
          </div>
        </div>
        {total > 0 && (
          <div style={{ marginTop: 16, background: "#e2e8f0", borderRadius: 8, height: 10, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(90deg, #15803d, #22c55e)", height: "100%",
              width: `${(total / 74) * 100}%`, borderRadius: 8, transition: "width .3s" }} />
          </div>
        )}
        {total > 0 && (
          <button onClick={handleShare} style={{
            marginTop: 16, padding: "10px 20px", borderRadius: 999, border: "none",
            background: "linear-gradient(135deg,#14532d,#15803d)", color: "#fff",
            cursor: "pointer", fontSize: 13, fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 4px 14px #15803d44",
          }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>share</span>
            {t("share_passport")}
          </button>
        )}
        {shareMsg && <div style={{ marginTop: 8, color: "#15803d", fontSize: 12, fontWeight: 600 }}>{shareMsg}</div>}
      </div>

      {visitedParks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
          <div style={{ fontSize: 48 }}>🌿</div>
          <p>{t("no_parks_visited")}</p>
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
                      <img key={i} src={src} alt="" loading="lazy" decoding="async" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
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

function BottomNav({ view, filter, routeMode, favCount, visitCount, onNavigate }) {
  const tabs = [
    { key: "explorar", icon: "explore", label: t("nav_explore"), active: view === "grid" && filter !== "favoritos" && !routeMode },
    { key: "favoritos", icon: "favorite", label: t("nav_favorites"), active: view === "grid" && filter === "favoritos" && !routeMode, badge: favCount },
    { key: "passaporte", icon: "badge", label: t("nav_passport"), active: view === "passaporte", badge: visitCount },
    { key: "roteiro", icon: "map", label: t("nav_route"), active: view === "roteiros" || routeMode },
  ];
  return (
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button key={t.key} className={`bottom-nav-btn${t.active ? " active" : ""}`}
          onClick={() => onNavigate(t.key)}>
          <span className="material-icons-round bottom-nav-icon">{t.icon}</span>
          <span>{t.label}</span>
          {t.badge > 0 && <span className="bottom-nav-badge">{t.badge}</span>}
        </button>
      ))}
    </nav>
  );
}

function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    view: p.get("view") || "grid",
    filter: p.get("filter") || "todos",
    bioma: p.get("bioma") || "todos",
    page: parseInt(p.get("page")) || 1,
  };
}

function setUrlParams(params) {
  const p = new URLSearchParams();
  if (params.view && params.view !== "grid") p.set("view", params.view);
  if (params.filter && params.filter !== "todos") p.set("filter", params.filter);
  if (params.bioma && params.bioma !== "todos") p.set("bioma", params.bioma);
  if (params.page && params.page > 1) p.set("page", String(params.page));
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const on = e => setMobile(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

export default function App() {
  const initial = getUrlParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(initial.filter);
  const [biomaFilter, setBiomaFilter] = useState(initial.bioma);
  const [page, setPage] = useState(initial.page);
  const isMobile = useIsMobile();
  const lang = useLang();
  const sentinelRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(initial.view);
  const { favs, toggle: toggleFav } = useFavorites();
  const { visits, save: saveVisit, remove: removeVisit, isVisited } = useVisits();
  const geo = useGeolocation();

  const initialParkId = useRef(parseInt(new URLSearchParams(window.location.search).get("park")) || null);

  useEffect(() => { setUrlParams({ view, filter, bioma: biomaFilter, page }); }, [view, filter, biomaFilter, page]);

  useEffect(() => {
    if (!initialParkId.current) return;
    const p = PARKS.find(x => x.id === initialParkId.current);
    initialParkId.current = null;
    if (!p) return;
    const wikiUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(p.slug)}`;
    setSelected({ ...p, images: imgCache[p.slug] || [], wikiUrl });
    track("park_open", { park_id: p.id, park_name: p.name, source: "deep_link" });
  }, []);

  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => track("search", { query_length: search.length }), 600);
    return () => clearTimeout(t);
  }, [search]);

  // Route planning state (persisted in localStorage)
  const [routeMode, setRouteMode] = useState(() => {
    try { return localStorage.getItem("parques-route-mode") === "1"; } catch { return false; }
  });
  const [routeIds, setRouteIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("parques-route-ids") || "[]")); }
    catch { return new Set(); }
  });
  const [showRoute, setShowRoute] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [viewingSavedRoute, setViewingSavedRoute] = useState(null);

  useEffect(() => { getAllRoutes().then(setSavedRoutes).catch(() => {}); }, []);

  const refreshSavedRoutes = useCallback(() => {
    getAllRoutes().then(setSavedRoutes).catch(() => {});
  }, []);

  const startRouteMode = useCallback((initialParkId) => {
    setView("grid"); setFilter("todos"); setPage(1);
    setRouteMode(true);
    track("route_mode_start", { trigger: initialParkId ? "long_press" : "manual" });
    if (initialParkId) setRouteIds(new Set([initialParkId]));
  }, []);

  useEffect(() => {
    try { localStorage.setItem("parques-route-mode", routeMode ? "1" : "0"); } catch {}
  }, [routeMode]);

  useEffect(() => {
    try { localStorage.setItem("parques-route-ids", JSON.stringify([...routeIds])); } catch {}
  }, [routeIds]);

  const toggleRouteMode = useCallback(() => {
    track(routeMode ? "route_mode_exit" : "route_mode_start", { trigger: "toggle" });
    setRouteMode(prev => {
      if (prev) setRouteIds(new Set());
      return !prev;
    });
  }, [routeMode]);

  const toggleRouteId = useCallback((id) => {
    const adding = !routeIds.has(id);
    track(adding ? "route_park_add" : "route_park_remove", { park_id: id, route_size: adding ? routeIds.size + 1 : routeIds.size - 1 });
    setRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [routeIds]);

  const clearRoute = useCallback(() => {
    track("route_selection_clear");
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
    if (biomaFilter !== "todos" && p.bioma !== biomaFilter) return false;
    if (filter === "favoritos") return favs.has(p.id);
    return filter === "todos" || p.status === filter;
  }), [parksWithDist, search, filter, biomaFilter, favs]);

  const totalPages = Math.ceil(filtered.length / PAGE);
  const visible = isMobile
    ? filtered.slice(0, page * PAGE)
    : filtered.slice((page - 1) * PAGE, page * PAGE);

  useEffect(() => {
    if (!isMobile) return;
    if (page >= totalPages) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setPage(p => {
          const np = Math.min(totalPages, p + 1);
          if (np !== p) track("page_change", { page: np, direction: "infinite" });
          return np;
        });
      }
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [isMobile, page, totalPages, view]);

  useEffect(() => { if (isMobile) setPage(1); }, [filter, search, biomaFilter, isMobile]);

  const biomaIcons = { "Amazônia": "🌴", "Cerrado": "🌾", "Mata Atlântica": "🌳", "Caatinga": "🌵", "Pantanal": "🐊", "Pampa": "🐎", "Marinho": "🐚" };
  const biomaCounts = useMemo(() => {
    const c = {};
    for (const b of BIOMAS) c[b] = PARKS.filter(p => p.bioma === b).length;
    return c;
  }, []);
  const counts = {
    aberto: PARKS.filter(p => p.status === "aberto").length,
    limitado: PARKS.filter(p => p.status === "limitado").length,
    fechado: PARKS.filter(p => p.status === "fechado").length,
  };

  const routeParks = useMemo(() =>
    parksWithDist.filter(p => routeIds.has(p.id)),
  [parksWithDist, routeIds]);

  return (
    <div className="app-root" style={{ minHeight: "100vh", background: "#f0fdf4" }}>
      <div className="app-header" style={{ background: "linear-gradient(135deg,#14532d,#166534,#15803d)", color: "#fff", padding: "24px 24px 16px", textAlign: "center", fontSize: 24, position: "relative" }}>
        <div className="logo" style={{ fontSize: 32, marginBottom: 4 }}>🌳</div>
        <h1 style={{ margin: "0 0 2px", fontWeight: 800, letterSpacing: -.5, fontSize: 22 }}>{t("app_title")}</h1>
        <p className="subtitle" style={{ margin: "0 0 10px", opacity: .8, fontSize: 12 }}>
          {t("subtitle_count")} {usingGeo ? t("subtitle_you") : t("subtitle_sp")}
        </p>
        <button onClick={() => { const nl = lang === "pt" ? "en" : "pt"; setLang(nl); track("lang_change", { lang: nl }); }} style={{
          position: "absolute", top: 12, right: 12, background: "#ffffff22", border: "1px solid #fff6",
          color: "#fff", padding: "4px 10px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
          {lang === "pt" ? "EN" : "PT"}
        </button>
        <div style={{ marginBottom: 10 }}>
          {geo.status === "idle" && (
            <button className="btn-press" onClick={() => { geo.request(); track("geolocation_request"); }} style={{
              background: "#ffffff22", border: "1px solid #fff6", color: "#fff",
              padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              {t("use_my_location")}
            </button>
          )}
          {geo.status === "loading" && (
            <span style={{ fontSize: 12, opacity: .8 }}>{t("getting_location")}</span>
          )}
          {geo.status === "granted" && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "#ffffff22", border: "1px solid #fff6", color: "#fff",
              padding: "4px 6px 4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {t("using_your_location")}
              <button className="btn-press" onClick={geo.reset} title={t("reset_to_sp")} style={{
                background: "#ffffff33", border: "none", color: "#fff", cursor: "pointer",
                width: 20, height: 20, borderRadius: "50%", padding: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
              </button>
            </span>
          )}
          {geo.status === "denied" && (
            <div>
              <button className="btn-press" onClick={() => { geo.request(); track("geolocation_retry"); }} style={{
                background: "#ffffff22", border: "1px solid #fff6", color: "#fff",
                padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {t("location_denied_retry")}
              </button>
              <div style={{ fontSize: 11, opacity: .7, marginTop: 6 }}>
                {t("location_hint")}
              </div>
            </div>
          )}
        </div>
        <div className="status-filters" style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
          {[["todos", t("all"), 74], ["aberto", t("open"), counts.aberto], ["limitado", t("limited"), counts.limitado], ["fechado", t("closed"), counts.fechado]].map(([k, l, cnt]) => {
            const on = filter === k && (view === "grid" || view === "mapa");
            return (
              <button className="btn-press" key={k} onClick={() => { setFilter(k); setPage(1); setView(v => v === "mapa" ? "mapa" : "grid"); track("filter_change", { filter: k }); }} style={{
                border: "1.5px solid #fff", background: on ? "#fff" : "transparent",
                color: on ? "#14532d" : "#fff", padding: "4px 10px", borderRadius: 16,
                cursor: "pointer", fontWeight: 700, fontSize: 12, transition: "all .15s", whiteSpace: "nowrap" }}>
                {l} <span style={{ opacity: .7, fontWeight: 600 }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {(view === "grid" || view === "mapa") && <div className="search-bar" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder={t("search_among", filtered.length)}
          style={{ flex: 1, minWidth: 160, height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        <div style={{ position: "relative", display: "inline-flex" }}>
          <button className="btn-press" title={biomaFilter === "todos" ? t("filter_biome") : `${biomaIcons[biomaFilter]} ${biomaFilter}`} onClick={e => { const s = e.currentTarget.nextElementSibling; s.focus(); s.click(); }} style={{
            height: 38, width: 110, padding: "0 10px", borderRadius: 10, border: "1px solid #e2e8f0",
            background: biomaFilter !== "todos" ? "#f0fdf4" : "#fff",
            color: biomaFilter !== "todos" ? "#15803d" : "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 600,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, boxSizing: "border-box",
          }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>filter_alt</span>
            <span>{biomaFilter === "todos" ? t("biome_short") : biomaIcons[biomaFilter]}</span>
          </button>
          <select value={biomaFilter} onChange={e => { setBiomaFilter(e.target.value); setPage(1); track("bioma_filter_change", { bioma: e.target.value }); }} style={{
            position: "absolute", inset: 0, opacity: 0, cursor: "pointer",
          }}>
            <option value="todos">{t("all_biomes")}</option>
            {BIOMAS.map(b => <option key={b} value={b}>{biomaIcons[b]} {b} ({biomaCounts[b]})</option>)}
          </select>
        </div>
        <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 10, padding: 2 }}>
          {[["grid", t("list"), "view_module"], ["mapa", t("map"), "map"]].map(([k, label, icon]) => (
            <button key={k} className="btn-press" onClick={() => { setView(k); track("view_change", { view: k, source: "toggle" }); }} style={{
              padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 12,
              background: view === k ? "#fff" : "transparent",
              color: view === k ? "#15803d" : "#64748b",
              boxShadow: view === k ? "0 1px 3px #0001" : "none",
              display: "inline-flex", alignItems: "center", gap: 4, transition: "all .15s",
            }}>
              <span className="material-icons-round" style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <button className="btn-press toggle-route-btn" onClick={toggleRouteMode} style={{
          padding: "8px 14px", borderRadius: 20, border: "none", cursor: "pointer",
          fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", transition: "all .15s",
          background: routeMode ? "linear-gradient(135deg,#14532d,#15803d)" : "#f0fdf4",
          color: routeMode ? "#fff" : "#15803d",
          boxShadow: routeMode ? "0 2px 8px #15803d44" : "none",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>{routeMode ? "close" : "route"}</span>
          {routeMode ? t("exit_route_short") : t("route_short")}
        </button>
      </div>}

      {view === "mapa" ? (
        <MapView parks={filtered} onSelectPark={(p) => {
          track("park_open", { park_id: p.id, park_name: p.name, source: "map" });
          const wikiUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(p.slug)}`;
          setSelected({ ...p, images: imgCache[p.slug] || [], wikiUrl });
        }} />
      ) : view === "passaporte" ? (
        <PassaporteView visits={visits} parks={parksWithDist} onSelectPark={(p) => {
          track("park_open", { park_id: p.id, park_name: p.name, source: "passaporte" });
          const wikiUrl = `https://pt.wikipedia.org/wiki/${encodeURIComponent(p.slug)}`;
          setSelected({ ...p, images: imgCache[p.slug] || [], wikiUrl });
        }} />
      ) : view === "roteiros" ? (
        <div className="parks-container" style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e293b" }}>{t("my_routes")}</h2>
            <button className="btn-press" onClick={() => startRouteMode()} style={{
              padding: "8px 16px", borderRadius: 20, border: "none",
              background: "linear-gradient(135deg,#14532d,#15803d)", color: "#fff",
              cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              {t("create_new")}
            </button>
          </div>
          <SavedRoutes routes={savedRoutes}
            onLoad={(r) => {
              setRouteIds(new Set(r.parkIds));
              setViewingSavedRoute(r);
              setShowRoute(true);
            }}
            onDelete={(id) => { deleteRouteDB(id).then(() => { track("saved_route_delete_confirmed", { route_id: id }); setSavedRoutes(prev => prev.filter(r => r.id !== id)); }); }}
          />
        </div>
      ) : (
        <div className="parks-container" style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
          {visible.length === 0
            ? <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}><div style={{ fontSize: 48 }}>🌿</div><p>{t("no_parks_found")}</p></div>
            : <div className="parks-grid" style={{ display: "grid" }}>
                {visible.map((p, i) => <ParkCard key={p.id} park={p} position={i} onClick={p => { track("park_open", { park_id: p.id, park_name: p.name, position: i }); setSelected(p); }} isFav={favs.has(p.id)} onToggleFav={toggleFav} isVisited={isVisited(p.id)}
                  routeMode={routeMode} routeSelected={routeIds.has(p.id)} onRouteToggle={toggleRouteId} onLongPress={startRouteMode} />)}
              </div>}

          {isMobile && page < totalPages && (
            <div ref={sentinelRef} style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <div style={{ width: 24, height: 24, border: "3px solid #cbd5e1", borderTopColor: "#15803d", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            </div>
          )}

          {!isMobile && totalPages > 1 && (
            <div className="pagination" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 32, flexWrap: "wrap" }}>
              <button onClick={() => setPage(p => { const np = Math.max(1, p - 1); if (np !== p) track("page_change", { page: np, direction: "prev" }); return np; })} disabled={page === 1}
                style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", cursor: page === 1 ? "default" : "pointer", opacity: page === 1 ? .4 : 1, fontWeight: 600 }}>← Anterior</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce((acc, n, i, arr) => {
                  if (i > 0 && n - arr[i - 1] > 1) acc.push(<span key={`e${n}`} style={{ padding: "0 4px", color: "#94a3b8" }}>…</span>);
                  acc.push(<button key={n} onClick={() => { setPage(n); track("page_change", { page: n, direction: "jump" }); }} style={{
                    width: 36, height: 36, borderRadius: 10, border: `1px solid ${n === page ? "#15803d" : "#e2e8f0"}`,
                    background: n === page ? "#15803d" : "#fff", color: n === page ? "#fff" : "#334155", cursor: "pointer", fontWeight: 700, fontSize: 14
                  }}>{n}</button>);
                  return acc;
                }, [])}
              <button onClick={() => setPage(p => { const np = Math.min(totalPages, p + 1); if (np !== p) track("page_change", { page: np, direction: "next" }); return np; })} disabled={page === totalPages}
                style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", cursor: page === totalPages ? "default" : "pointer", opacity: page === totalPages ? .4 : 1, fontWeight: 600 }}>Próxima →</button>
            </div>
          )}
        </div>
      )}

      {selected && <Modal park={selected} onClose={() => setSelected(null)} isFav={favs.has(selected.id)} onToggleFav={toggleFav}
        visit={visits[selected.id] || null} onSaveVisit={saveVisit} onRemoveVisit={removeVisit} />}

      {routeMode && routeIds.size > 0 && (
        <div className="route-bottom-bar" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 900,
          background: "linear-gradient(135deg,#14532d,#166534,#15803d)",
          padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 -4px 20px #0003" }}>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>
            {t("parks_selected", routeIds.size)}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={clearRoute} style={{
              padding: "8px 16px", borderRadius: 20, border: "1px solid #fff6",
              background: "transparent", color: "#fff", cursor: "pointer",
              fontSize: 13, fontWeight: 600 }}>
              {t("clear")}
            </button>
            <button onClick={() => { track("route_modal_open", { park_count: routeIds.size, editing: !!viewingSavedRoute }); setShowRoute(true); }} style={{
              padding: "8px 20px", borderRadius: 20, border: "none",
              background: "#fff", color: "#14532d", cursor: "pointer",
              fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px #0003" }}>
              {viewingSavedRoute ? t("update_route") : t("view_route")}
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
          editingRoute={viewingSavedRoute}
          onClose={() => { setShowRoute(false); setViewingSavedRoute(null); refreshSavedRoutes(); }}
          onClear={() => { clearRoute(); setShowRoute(false); setViewingSavedRoute(null); refreshSavedRoutes(); }}
          onEditParks={() => { setShowRoute(false); setRouteMode(true); setView("grid"); setFilter("todos"); setPage(1); }}
        />
      )}

      <footer style={{ textAlign: "center", padding: "24px", color: "#94a3b8", fontSize: 12, borderTop: "1px solid #e2e8f0",
        marginBottom: routeMode && routeIds.size > 0 ? 60 : 0 }}>
        {t("footer_updated")}
      </footer>

      <BottomNav
        view={view} filter={filter} routeMode={routeMode}
        favCount={favs.size} visitCount={Object.keys(visits).length}
        onNavigate={key => {
          track("bottom_nav_click", { tab: key });
          if (key === "explorar") { setView("grid"); setFilter("todos"); setPage(1); if (routeMode) toggleRouteMode(); }
          else if (key === "favoritos") { setView("grid"); setFilter("favoritos"); setPage(1); if (routeMode) toggleRouteMode(); track("filter_change", { filter: "favoritos" }); }
          else if (key === "passaporte") { setView("passaporte"); if (routeMode) toggleRouteMode(); }
          else if (key === "roteiro") {
            if (routeMode) { toggleRouteMode(); setView("roteiros"); }
            else { setView("roteiros"); }
          }
        }}
      />
    </div>
  );
}
