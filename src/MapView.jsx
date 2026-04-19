import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

const STATUS_COLORS = { aberto: "#22c55e", limitado: "#f59e0b", fechado: "#ef4444" };

export default function MapView({ parks, onSelectPark }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let map;
    import("leaflet").then(L => {
      L = L.default;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      map = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView([-14, -52], 4);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
      L.control.zoom({ position: "topright" }).addTo(map);

      const bounds = [];
      parks.forEach(p => {
        const color = STATUS_COLORS[p.status] || "#64748b";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;box-shadow:0 2px 6px #0004;border:2px solid #fff">${p.id}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        marker.bindPopup(`<b>${p.name}</b><br/>${p.state} · ${p.bioma || ""}<br/><span style="color:${color};font-weight:600">${p.status}</span>`);
        marker.on("click", () => onSelectPark(p));
        bounds.push([p.lat, p.lng]);
      });
      if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [parks, onSelectPark]);

  return (
    <div style={{ position: "relative", height: "calc(100vh - 260px)", minHeight: 400, margin: "16px 24px", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px #0001" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", bottom: 12, left: 12, background: "#fff", padding: "8px 12px", borderRadius: 12, fontSize: 11, boxShadow: "0 2px 8px #0002", display: "flex", gap: 10, zIndex: 400 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#22c55e", borderRadius: "50%", marginRight: 4 }} />Aberto</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#f59e0b", borderRadius: "50%", marginRight: 4 }} />Limitado</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#ef4444", borderRadius: "50%", marginRight: 4 }} />Fechado</span>
      </div>
    </div>
  );
}
