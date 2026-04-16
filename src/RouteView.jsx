import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { saveRoute } from "./db.mjs";
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
  const drivingDays = Math.ceil(totalKm / 400);
  const visitDays = numParks;
  return Math.max(drivingDays, visitDays);
}

function RouteMap({ startLat, startLng, ordered, legs }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let L;
    let map;
    import("leaflet").then(mod => {
      L = mod.default;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      map = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView([-14, -52], 4);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      L.control.zoom({ position: "topright" }).addTo(map);

      const startIcon = L.divIcon({ className: "", html: `<div style="width:28px;height:28px;border-radius:50%;background:#15803d;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;box-shadow:0 2px 8px #0004;border:2px solid #fff">📍</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([startLat, startLng], { icon: startIcon }).addTo(map);

      const points = [[startLat, startLng]];
      ordered.forEach((p, i) => {
        points.push([p.lat, p.lng]);
        const numIcon = L.divIcon({ className: "", html: `<div style="width:28px;height:28px;border-radius:50%;background:#fff;color:#15803d;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;box-shadow:0 2px 8px #0004;border:2px solid #15803d">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        const marker = L.marker([p.lat, p.lng], { icon: numIcon }).addTo(map);
        marker.bindPopup(`<b>${p.name}</b><br/>${p.state} · ${legs[i]} km`);
      });

      L.polyline(points, { color: "#15803d", weight: 3, opacity: 0.7, dashArray: "8 6" }).addTo(map);

      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
      }
    });

    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [startLat, startLng, ordered, legs]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }} />;
}

export function SavedRoutes({ routes, onLoad, onDelete }) {
  if (routes.length === 0) return (
    <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8", fontSize: 13 }}>
      Nenhum roteiro salvo ainda
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {routes.sort((a, b) => b.savedAt - a.savedAt).map(r => (
        <div key={r.id} style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px",
          display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, cursor: "pointer" }} onClick={() => onLoad(r)}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{r.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {r.parkIds.length} parques · {r.totalKm.toLocaleString("pt-BR")} km · {new Date(r.savedAt).toLocaleDateString("pt-BR")}
            </div>
          </div>
          <button onClick={() => onDelete(r.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#94a3b8", padding: 4 }}>🗑️</button>
        </div>
      ))}
    </div>
  );
}

export default function RouteModal({ parks, startLabel, startLat, startLng, onClose, onClear, onLoadRoute, editingRoute }) {
  const [tab, setTab] = useState("mapa");
  const [routeName, setRouteName] = useState(editingRoute?.name || "");
  const [routeId, setRouteId] = useState(editingRoute?.id || null);
  const [saveMsg, setSaveMsg] = useState("");
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

  const { ordered, legs, total } = useMemo(
    () => optimizeRoute(parks, startLat, startLng),
    [parks, startLat, startLng]
  );

  const days = useMemo(() => estimateDays(total, ordered.length), [total, ordered.length]);

  const handleSave = useCallback(() => {
    const name = routeName.trim() || `Roteiro ${new Date().toLocaleDateString("pt-BR")}`;
    const id = routeId || Date.now().toString();
    const route = {
      id,
      name,
      parkIds: ordered.map(p => p.id),
      totalKm: total,
      days,
      startLabel,
      startLat,
      startLng,
      savedAt: Date.now(),
    };
    saveRoute(route).then(() => {
      setRouteId(id);
      setSaveMsg(routeId ? "Roteiro atualizado!" : "Roteiro salvo!");
      setTimeout(() => setSaveMsg(""), 2000);
    });
  }, [ordered, total, days, routeName, routeId, startLabel, startLat, startLng]);

  const handleShare = useCallback(async () => {
    const text = `🌳 Meu roteiro de parques nacionais!\n\n${ordered.map((p, i) => `${i + 1}. ${p.name} (${p.state})`).join("\n")}\n\n📏 ${total.toLocaleString("pt-BR")} km · ${days} dias estimados\n\n🔗 https://chicomcastro.github.io/parques-nacionais-brasileiros/`;
    if (navigator.share) {
      try { await navigator.share({ title: "Meu Roteiro de Parques", text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      setSaveMsg("Copiado!");
      setTimeout(() => setSaveMsg(""), 2000);
    }
  }, [ordered, total, days]);

  const tabBtn = (key, label, icon) => (
    <button className="btn-press" key={key} onClick={() => setTab(key)} style={{
      flex: 1, padding: "8px 4px", borderRadius: 10, border: "none",
      background: tab === key ? "#15803d" : "#f1f5f9",
      color: tab === key ? "#fff" : "#64748b",
      cursor: "pointer", fontSize: 12, fontWeight: 700,
      transition: "all .15s"
    }}>{icon} {label}</button>
  );

  return (
    <div onClick={handleClose} className={`modal-backdrop modal-wrap-mobile${closing ? " modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className={`modal-card modal-content-mobile${closing ? " modal-card-closing" : ""}`} style={{ background: "#fff", borderRadius: 20,
        overflow: "hidden", maxWidth: 560, width: "100%", maxHeight: "92vh",
        boxShadow: "0 20px 60px #0006", display: "flex", flexDirection: "column", position: "relative" }}>

        <div style={{ background: "linear-gradient(135deg,#14532d,#166534,#15803d)", color: "#fff",
          padding: "20px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>🗺️ Seu Roteiro</div>
              <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>
                {ordered.length} parques · {total.toLocaleString("pt-BR")} km · ~{days} dia{days !== 1 ? "s" : ""}
              </div>
            </div>
            <button className="btn-press" onClick={handleClose} style={{ background: "#ffffff22", color: "#fff", border: "none",
              borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {tabBtn("mapa", "Mapa", "🗺️")}
            {tabBtn("rota", "Rota", "📋")}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>

          {tab === "rota" && (
            <div style={{ padding: "16px 20px" }}>
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
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{park.name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{park.state} · {park.access}</div>
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 20, padding: "14px 16px", background: "#f0fdf4", borderRadius: 12,
                border: "1px solid #bbf7d0", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#15803d", fontWeight: 600, marginBottom: 2 }}>Distância total estimada</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#14532d" }}>{total.toLocaleString("pt-BR")} km</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>~{days} dia{days !== 1 ? "s" : ""} de viagem (estimativa)</div>
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
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={routeName} onChange={e => setRouteName(e.target.value)}
              placeholder="Nome do roteiro (opcional)"
              style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13, outline: "none" }} />
            <button className="btn-press" onClick={handleSave} style={{
              padding: "8px 16px", borderRadius: 10, border: "none", whiteSpace: "nowrap",
              background: "#15803d", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600
            }}>💾 Salvar</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-press" onClick={handleShare} style={{
              flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "#fff", color: "#1e293b", cursor: "pointer", fontSize: 13, fontWeight: 600
            }}>📤 Compartilhar</button>
            <button className="btn-press" onClick={() => { setClosing(true); setTimeout(() => onClear(), 250); }} style={{
              flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #fee2e2",
              background: "#fff", color: "#ef4444", cursor: "pointer", fontSize: 13, fontWeight: 600
            }}>🗑️ Limpar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
