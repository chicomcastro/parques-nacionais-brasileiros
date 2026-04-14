import { useState, useEffect, useCallback } from "react";
import { getAllVisits, getVisit, saveVisit, deleteVisit } from "./db.mjs";

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
      setVisits(prev => ({
        ...prev,
        [parkId]: { parkId, date: data.date, notes: data.notes || "", photos: data.photos || [] },
      }));
    });
  }, []);

  const remove = useCallback((parkId) => {
    return deleteVisit(parkId).then(() => {
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
