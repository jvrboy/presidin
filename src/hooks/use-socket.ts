"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

export interface RealtimeEvent<T = any> {
  channel: string;
  data: T;
  timestamp: number;
}

export interface ConnectionInfo {
  connected: boolean;
  reconnectCount: number;
  lastEvent: number | null;
}

/**
 * PRESIDIN realtime WebSocket hook.
 * Connects to the presidin-realtime mini-service on port 3003 (via Caddy gateway).
 *
 * Usage:
 *   const { connected, subscribe } = useSocket();
 *   useEffect(() => {
 *     const unsub = subscribe("signals:new", (signal) => {
 *       console.log("New signal:", signal);
 *     });
 *     return unsub;
 *   }, []);
 */
export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  useEffect(() => {
    // Connect via Caddy gateway — uses XTransformPort=3003 query param
    const url = "/?XTransformPort=3003";
    const socket = io(url, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 5000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setReconnectCount(0);
      // Auto-subscribe to all channels for the dashboard
      socket.emit("subscribe", "all");
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("reconnect_attempt", () => setReconnectCount((c) => c + 1));
    socket.on("reconnect_failed", () => setConnected(false));

    // Universal event handler — routes to subscribed listeners
    const universalHandler = (channel: string) => (data: any) => {
      setLastEvent(Date.now());
      const listeners = listenersRef.current.get(channel);
      if (listeners) listeners.forEach((fn) => fn(data));
    };

    const channels = [
      "signals:new", "tick:update", "anomaly:alert", "drift:alert",
      "shadow:promoted", "trade:opened", "trade:closed", "ml:update",
    ];
    channels.forEach((ch) => socket.on(ch, universalHandler(ch)));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const subscribe = useCallback(<T = any>(channel: string, handler: (data: T) => void) => {
    if (!listenersRef.current.has(channel)) {
      listenersRef.current.set(channel, new Set());
    }
    listenersRef.current.get(channel)!.add(handler as (data: any) => void);
    socketRef.current?.emit("subscribe", channel);
    return () => {
      listenersRef.current.get(channel)?.delete(handler as (data: any) => void);
      socketRef.current?.emit("unsubscribe", channel);
    };
  }, []);

  const broadcast = useCallback((channel: string, data: any) => {
    socketRef.current?.emit("broadcast", { channel, data });
  }, []);

  return { connected, reconnectCount, lastEvent, subscribe, broadcast };
}
