// src/hooks/useNewAlerts.ts
// Compteur de nouvelles alertes arrivées depuis le dernier "clear".
// Utilisé pour la bannière "▲ X new alerts" sur le feed.

import { useRef, useState, useEffect } from "react";
import { useAlertsStore } from "@/src/store/alerts";

export function useNewAlerts() {
  const alerts = useAlertsStore((s) => s.alerts);
  const seenIdsRef = useRef(new Set(alerts.map((a) => a.id)));
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    const incoming = alerts.filter((a) => !seenIdsRef.current.has(a.id));
    if (incoming.length > 0) {
      setNewCount((c) => c + incoming.length);
      incoming.forEach((a) => seenIdsRef.current.add(a.id));
    }
  }, [alerts]);

  const clearNewAlerts = () => setNewCount(0);

  return { newCount, clearNewAlerts };
}
