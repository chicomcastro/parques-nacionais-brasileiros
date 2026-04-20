import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { saveRoute, deleteRoute } from "./db.mjs";
import { track } from "./analytics.mjs";
import "leaflet/dist/leaflet.css";

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
  let curLat = startLat, curLng = startLng, total = 0;
  while (remaining.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(curLat, curLng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const pick = remaining.splice(bestIdx, 1)[0];
    ordered.push(pick);
    legs.push(Math.round(bestDist));
    total += bestDist;
    curLat = pick.lat; curLng = pick.lng;
  }
  return { ordered, legs, total: Math.round(total) };
}

function estimateDays(totalKm, numParks) {
  return Math.max(Math.ceil(totalKm / 400), numParks);
}

function Icon({ name, size = 20, style = {} }) {
  return <span className="material-icons-round" style={{ fontSize: size, verticalAlign: "middle", ...style }}>{name}</span>;
}

function RouteMap({ startLat, startLng, ordered, legs }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const layersRef = useRef([]);
  const [L, setL] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then(mod => { if (!cancelled) setL(() => mod.default); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!L || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView([-14, -52], 4);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; layersRef.current = []; } };
  }, [L]);

  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;
    layersRef.current.forEach(l => l.remove());
    layersRef.current = [];
    const mkIcon = (html) => L.divIcon({ className: "", html, iconSize: [28, 28], iconAnchor: [14, 14] });
    const start = L.marker([startLat, startLng], { icon: mkIcon(`<div style="width:28px;height:28px;border-radius:50%;background:#15803d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px #0004;border:2px solid #fff"><span class="material-icons-round" style="font-size:16px">my_location</span></div>`) }).addTo(map);
    layersRef.current.push(start);
    const points = [[startLat, startLng]];
    ordered.forEach((p, i) => {
      points.push([p.lat, p.lng]);
      const marker = L.marker([p.lat, p.lng], { icon: mkIcon(`<div style="width:28px;height:28px;border-radius:50%;background:#fff;color:#15803d;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;box-shadow:0 2px 8px #0004;border:2px solid #15803d">${i + 1}</div>`) }).addTo(map);
      marker.bindPopup(`<b>${p.name}</b><br/>${p.state} · ${legs[i]} km`);
      layersRef.current.push(marker);
    });
    const poly = L.polyline(points, { color: "#15803d", weight: 3, opacity: 0.7, dashArray: "8 6" }).addTo(map);
    layersRef.current.push(poly);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], animate: false });
  }, [L, startLat, startLng, ordered, legs]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }} />;
}

export function SavedRoutes({ routes, onLoad, onDelete }) {
  if (routes.length === 0) return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
      <Icon name="route" size={48} style={{ opacity: 0.4, display: "block", margin: "0 auto 8px" }} />
      <div style={{ fontSize: 14 }}>Nenhum roteiro salvo ainda</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>Crie um roteiro selecionando parques</div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {routes.sort((a, b) => b.savedAt - a.savedAt).map(r => (
        <div key={r.id} style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px",
          display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => { track("saved_route_load", { route_id: r.id, park_count: r.parkIds.length, total_km: r.totalKm }); onLoad(r); }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#dcfce7", color: "#15803d",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="map" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {r.parkIds.length} parques · {r.totalKm.toLocaleString("pt-BR")} km · {new Date(r.savedAt).toLocaleDateString("pt-BR")}
            </div>
          </div>
          <button onClick={e => { e.stopPropagation(); track("saved_route_delete", { route_id: r.id }); onDelete(r.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4 }}>
            <Icon name="delete_outline" size={20} />
          </button>
        </div>
      ))}
    </div>
  );
}

function DraggableParks({ ordered, legs, onReorder }) {
  const [dragIdx, setDragIdx] = useState(null);
  const startY = useRef(0);
  const lastSwap = useRef(0);
  const itemHeight = 72;

  const onPointerDown = (idx, e) => {
    e.preventDefault();
    setDragIdx(idx);
    startY.current = e.clientY;
    lastSwap.current = e.clientY;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e) => {
    if (dragIdx === null) return;
    const dy = e.clientY - lastSwap.current;
    if (dy > itemHeight / 2 && dragIdx < ordered.length - 1) {
      onReorder(dragIdx, dragIdx + 1);
      setDragIdx(dragIdx + 1);
      lastSwap.current = e.clientY;
    } else if (dy < -itemHeight / 2 && dragIdx > 0) {
      onReorder(dragIdx, dragIdx - 1);
      setDragIdx(dragIdx - 1);
      lastSwap.current = e.clientY;
    }
  };

  const onPointerUp = () => setDragIdx(null);

  return (
    <div onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {ordered.map((park, i) => (
        <div key={park.id} style={{ opacity: dragIdx === i ? 0.5 : 1, transition: "opacity .15s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
            <div style={{ width: 32, display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: 2, height: 28, background: "#d1d5db" }} />
            </div>
            <span style={{ fontSize: 11, color: "#15803d", fontWeight: 600 }}>↓ {legs[i].toLocaleString("pt-BR")} km</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#dcfce7", color: "#15803d",
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
              border: "2px solid #15803d" }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{park.name}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{park.state} · {park.access}</div>
            </div>
            <button
              onPointerDown={(e) => onPointerDown(i, e)}
              style={{ background: "none", border: "none", cursor: "grab", color: "#94a3b8", padding: 8, touchAction: "none" }}
              title="Arraste para reordenar"
            >
              <Icon name="drag_indicator" size={22} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildGoogleMapsUrl(startLat, startLng, ordered) {
  const waypoints = ordered.map(p => `${p.lat},${p.lng}`).join("/");
  return `https://www.google.com/maps/dir/${startLat},${startLng}/${waypoints}`;
}

export default function RouteModal({ parks, startLabel, startLat, startLng, onClose, onClear, onEditParks, editingRoute }) {
  const [tab, setTab] = useState("mapa");
  const [routeName, setRouteName] = useState(editingRoute?.name || "");
  const [routeId, setRouteId] = useState(editingRoute?.id || null);
  const [saveMsg, setSaveMsg] = useState("");
  const [closing, setClosing] = useState(false);
  const [editingNameMode, setEditingNameMode] = useState(false);
  const [tempName, setTempName] = useState("");
  const isExisting = !!routeId;

  const animateClose = useCallback((cb) => {
    setClosing(true);
    setTimeout(cb || onClose, 250);
  }, [onClose]);

  const [customOrder, setCustomOrder] = useState(editingRoute?.parkIds || null);

  const optimized = useMemo(() => optimizeRoute(parks, startLat, startLng), [parks, startLat, startLng]);

  const ordered = useMemo(() => {
    if (!customOrder) return optimized.ordered;
    const byId = new Map(parks.map(p => [p.id, p]));
    const list = customOrder.map(id => byId.get(id)).filter(Boolean);
    const seen = new Set(list.map(p => p.id));
    for (const p of parks) if (!seen.has(p.id)) list.push(p);
    return list;
  }, [customOrder, optimized, parks]);

  const legs = useMemo(() => {
    if (!customOrder) return optimized.legs;
    let lat = startLat, lng = startLng;
    return ordered.map(p => {
      const d = Math.round(haversine(lat, lng, p.lat, p.lng));
      lat = p.lat; lng = p.lng;
      return d;
    });
  }, [customOrder, ordered, optimized, startLat, startLng]);

  const total = useMemo(() => customOrder ? legs.reduce((a, b) => a + b, 0) : optimized.total, [customOrder, legs, optimized]);

  const reorder = useCallback((from, to) => {
    setCustomOrder(prev => {
      const current = prev ? [...prev] : optimized.ordered.map(p => p.id);
      const [m] = current.splice(from, 1);
      current.splice(to, 0, m);
      track("route_reorder", { from, to });
      return current;
    });
  }, [optimized]);

  const days = useMemo(() => estimateDays(total, ordered.length), [total, ordered.length]);
  const mapsUrl = useMemo(() => buildGoogleMapsUrl(startLat, startLng, ordered), [startLat, startLng, ordered]);

  const lastSavedRef = useRef(editingRoute ? editingRoute.parkIds.join(",") : "");
  const handleSave = useCallback(() => {
    const name = routeName.trim() || `Roteiro ${new Date().toLocaleDateString("pt-BR")}`;
    const id = routeId || Date.now().toString();
    const isUpdate = !!routeId;
    const orderedIds = ordered.map(p => p.id);
    const route = { id, name, parkIds: orderedIds, totalKm: total, days, startLabel, startLat, startLng, savedAt: Date.now() };
    saveRoute(route).then(() => {
      lastSavedRef.current = orderedIds.join(",");
      track(isUpdate ? "route_update" : "route_save", { route_id: id, park_count: ordered.length, total_km: total, days });
      setRouteId(id);
      setRouteName(name);
      setSaveMsg(isUpdate ? "Atualizado!" : "Salvo!");
      setTimeout(() => setSaveMsg(""), 2000);
    });
  }, [ordered, total, days, routeName, routeId, startLabel, startLat, startLng]);

  useEffect(() => {
    if (!isExisting) return;
    const currentIds = ordered.map(p => p.id).join(",");
    if (currentIds !== lastSavedRef.current) {
      const t = setTimeout(() => handleSave(), 400);
      return () => clearTimeout(t);
    }
  }, [isExisting, ordered, handleSave]);

  const handleDelete = useCallback(() => {
    if (routeId) {
      track("route_delete", { route_id: routeId, park_count: ordered.length });
      deleteRoute(routeId).then(() => animateClose(onClear));
    } else {
      track("route_clear", { park_count: ordered.length });
      animateClose(onClear);
    }
  }, [routeId, ordered.length, animateClose, onClear]);

  const handleShare = useCallback(async () => {
    const url = `https://chicomcastro.github.io/parques-nacionais-brasileiros/app/#route=${ordered.map(p => p.id).join(",")}`;
    const text = `🌳 Meu roteiro de parques nacionais!\n\n${ordered.map((p, i) => `${i + 1}. ${p.name} (${p.state})`).join("\n")}\n\n📏 ${total.toLocaleString("pt-BR")} km · ~${days} dias\n\n🔗 ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Meu Roteiro de Parques", text, url }); track("route_share", { method: "native", park_count: ordered.length, total_km: total }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      track("route_share", { method: "clipboard", park_count: ordered.length, total_km: total });
      setSaveMsg("Copiado!");
      setTimeout(() => setSaveMsg(""), 2000);
    }
  }, [ordered, total, days]);

  const tabBtn = (key, label, icon) => (
    <button className="btn-press" key={key} onClick={() => { setTab(key); track("route_tab_change", { tab: key }); }} style={{
      flex: 1, padding: "8px 4px", borderRadius: 10, border: "none",
      background: tab === key ? "#fff" : "#ffffff22",
      color: tab === key ? "#14532d" : "#ffffffcc",
      cursor: "pointer", fontSize: 12, fontWeight: 700, transition: "all .15s",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
      boxShadow: tab === key ? "0 2px 8px #0002" : "none",
    }}><Icon name={icon} size={16} /> {label}</button>
  );

  const displayName = routeName || "Novo Roteiro";

  return (
    <div onClick={() => animateClose()} className={`modal-backdrop modal-wrap-mobile${closing ? " modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className={`modal-card modal-content-mobile${closing ? " modal-card-closing" : ""}`} style={{ background: "#fff", borderRadius: 20,
        overflow: "hidden", maxWidth: 560, width: "100%", maxHeight: "92vh",
        boxShadow: "0 20px 60px #0006", display: "flex", flexDirection: "column", position: "relative" }}>

        <div style={{ background: "linear-gradient(135deg,#14532d,#166534,#15803d)", color: "#fff", padding: "20px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingNameMode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input autoFocus value={tempName} onChange={e => setTempName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { setRouteName(tempName); setEditingNameMode(false); if (isExisting) setTimeout(handleSave, 0); } if (e.key === "Escape") setEditingNameMode(false); }}
                    style={{ flex: 1, fontSize: 17, fontWeight: 800, background: "#ffffff22", color: "#fff",
                      border: "1px solid #fff6", borderRadius: 8, padding: "4px 10px", outline: "none", minWidth: 0 }} />
                  <button onClick={() => { setRouteName(tempName); setEditingNameMode(false); track("route_rename"); if (isExisting) setTimeout(handleSave, 0); }} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 2 }}>
                    <Icon name="check" size={20} />
                  </button>
                  <button onClick={() => setEditingNameMode(false)} style={{ background: "none", border: "none", color: "#fffc", cursor: "pointer", padding: 2 }}>
                    <Icon name="close" size={20} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName}
                  </div>
                  <button onClick={() => { setTempName(routeName); setEditingNameMode(true); }} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                    <Icon name="edit" size={16} />
                  </button>
                </div>
              )}
              <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>
                {ordered.length} parques · {total.toLocaleString("pt-BR")} km · ~{days} dia{days !== 1 ? "s" : ""}
              </div>
            </div>
            {isExisting && onEditParks && (
              <button className="btn-press" title="Editar parques" onClick={() => { track("route_edit_parks", { route_id: routeId }); animateClose(onEditParks); }} style={{ background: "#ffffff22", color: "#fff", border: "none",
                borderRadius: "50%", width: 32, height: 32, cursor: "pointer", flexShrink: 0, marginLeft: 8,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="playlist_add" size={20} />
              </button>
            )}
            <button className="btn-press" onClick={() => animateClose()} style={{ background: "#ffffff22", color: "#fff", border: "none",
              borderRadius: "50%", width: 32, height: 32, cursor: "pointer", flexShrink: 0, marginLeft: 8,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {tabBtn("mapa", "Mapa", "map")}
            {tabBtn("rota", "Rota", "format_list_numbered")}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "rota" && (
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#15803d", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name="my_location" size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{startLabel}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Ponto de partida</div>
                </div>
              </div>

              <DraggableParks ordered={ordered} legs={legs} onReorder={reorder} />
              {onEditParks && (
                <button className="btn-press" onClick={() => { track("route_edit_parks", { route_id: routeId }); animateClose(onEditParks); }} style={{
                  width: "100%", marginTop: 12, padding: "10px", borderRadius: 10,
                  border: "2px dashed #bbf7d0", background: "#f0fdf4", color: "#15803d",
                  cursor: "pointer", fontSize: 13, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <Icon name="add" size={18} /> Adicionar parque
                </button>
              )}

              <div style={{ marginTop: 20, padding: "14px 16px", background: "#f0fdf4", borderRadius: 12,
                border: "1px solid #bbf7d0", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#15803d", fontWeight: 600, marginBottom: 2 }}>Distância total estimada</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#14532d" }}>{total.toLocaleString("pt-BR")} km</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>~{days} dia{days !== 1 ? "s" : ""} de viagem</div>
              </div>
            </div>
          )}

          {tab === "mapa" && (
            <div style={{ height: 400, padding: 12 }}>
              <RouteMap startLat={startLat} startLng={startLng} ordered={ordered} legs={legs} />
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #e2e8f0" }}>
          {saveMsg && <div style={{ textAlign: "center", color: "#15803d", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{saveMsg}</div>}
          {!isExisting && (
            <div style={{ marginBottom: 10 }}>
              <input value={routeName} onChange={e => setRouteName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                placeholder="Nome do roteiro (opcional)"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          {!isExisting && (
            <button className="btn-press" onClick={handleSave} style={{
              width: "100%", marginBottom: 8, padding: "12px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#14532d,#15803d)", color: "#fff", cursor: "pointer",
              fontSize: 14, fontWeight: 700, boxShadow: "0 4px 14px #15803d44",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}><Icon name="save" size={18} /> Salvar roteiro</button>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-press" onClick={() => track("route_open_maps", { park_count: ordered.length, total_km: total })} style={{
              flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "#fff", color: "#1e293b", cursor: "pointer", fontSize: 13, fontWeight: 600,
              textDecoration: "none", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
            }}><Icon name="directions" size={18} /> Abrir no Maps</a>
            <button className="btn-press" onClick={handleShare} style={{
              flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "#fff", color: "#1e293b", cursor: "pointer", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6
            }}><Icon name="share" size={18} /> Compartilhar</button>
          </div>
          <button className="btn-press" onClick={handleDelete} style={{
            width: "100%", padding: "8px", borderRadius: 10, border: "none",
            background: "transparent", color: "#ef4444", cursor: "pointer",
            fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}><Icon name={isExisting ? "delete" : "close"} size={16} /> {isExisting ? "Excluir roteiro" : "Descartar"}</button>
        </div>
      </div>
    </div>
  );
}
