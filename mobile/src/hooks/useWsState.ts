// src/hooks/useWsState.ts
// React hook exposant l'état de connexion WebSocket en temps réel.

import { useState, useEffect } from "react";
import { liveAlerts, type WsConnectionState } from "@/src/lib/websocket";

export function useWsState(): WsConnectionState {
  const [state, setState] = useState<WsConnectionState>(liveAlerts.getState());

  useEffect(() => {
    // Sync immédiatement au cas où l'état aurait changé entre le render et l'effet
    setState(liveAlerts.getState());
    return liveAlerts.subscribe(setState);
  }, []);

  return state;
}
