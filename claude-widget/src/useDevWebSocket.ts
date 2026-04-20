import { useState, useCallback, useEffect } from 'react';
import type { ServerMessage, ClientMessage } from './devChatProtocol';

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

export interface DevWebSocket {
  status: WsStatus;
  send: (msg: ClientMessage) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => () => void;
  lastError: string | null;
}

const WS_URL = 'ws://localhost:9100';

// --- Module-level singleton WebSocket ---
// Lives outside React so it survives HMR, component crashes, and remounts.

const handlers = new Set<(msg: ServerMessage) => void>();
const statusListeners = new Set<(status: WsStatus) => void>();

let ws: WebSocket | null = null;
let currentStatus: WsStatus = 'disconnected';
let reconnectTimer: number | null = null;
let reconnectDelay = 1000;
let pingInterval: number | null = null;

function setStatus(s: WsStatus) {
  currentStatus = s;
  statusListeners.forEach((fn) => fn(s));
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    ws.close();
  }

  setStatus('connecting');
  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) { socket.close(); return; }
    setStatus('connected');
    reconnectDelay = 1000;

    pingInterval = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30_000);
  };

  socket.onmessage = (event) => {
    if (ws !== socket) return;
    try {
      const msg: ServerMessage = JSON.parse(event.data);
      handlers.forEach((h) => h(msg));
    } catch {
      /* ignore */
    }
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    setStatus('disconnected');
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }

    reconnectTimer = window.setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 16_000);
      connect();
    }, reconnectDelay);
  };

  socket.onerror = () => {
    /* onclose will fire after this */
  };
}

// Connect immediately on module load
connect();

function sendMessage(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// --- React hook that reads from the singleton ---

export function useDevWebSocket(): DevWebSocket {
  const [status, setLocalStatus] = useState<WsStatus>(currentStatus);

  useEffect(() => {
    setLocalStatus(currentStatus);
    statusListeners.add(setLocalStatus);
    return () => { statusListeners.delete(setLocalStatus); };
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    sendMessage(msg);
  }, []);

  const onMessage = useCallback((handler: (msg: ServerMessage) => void) => {
    handlers.add(handler);
    return () => { handlers.delete(handler); };
  }, []);

  return { status, send, onMessage, lastError: null };
}
