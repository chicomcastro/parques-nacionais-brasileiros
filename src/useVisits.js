import { useState, useEffect, useCallback } from "react";
import { getAllVisits, getVisit, saveVisit, deleteVisit } from "./db.mjs";
import { track } from "./analytics.mjs";

export function useVisits() {
  // Map of parkId -> visit data
  const [visits, setVisits] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAllVisits().then(rows => {
      const map = {};
      for (const row of rows) {
        map[row.parkId] = row;
      }
      setVisits(map);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = useCallback((parkId, data) => {
    return saveVisit(parkId, data).then(() => {
      setVisits(prev => {
        const isUpdate = !!prev[parkId];
        track(isUpdate ? "visit_update" : "visit_save", {
          park_id: parkId,
          has_notes: !!(data.notes && data.notes.trim()),
          photo_count: (data.photos || []).length,
        });
        return {
          ...prev,
          [parkId]: { parkId, date: data.date, notes: data.notes || "", photos: data.photos || [] },
        };
      });
    });
  }, []);

  const remove = useCallback((parkId) => {
    return deleteVisit(parkId).then(() => {
      track("visit_remove", { park_id: parkId });
      setVisits(prev => {
        const next = { ...prev };
        delete next[parkId];
        return next;
      });
    });
  }, []);

  const isVisited = useCallback((parkId) => !!visits[parkId], [visits]);

  return { visits, loaded, save, remove, isVisited };
}
