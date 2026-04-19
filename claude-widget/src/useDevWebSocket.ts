import { useRef, useState, useCallback, useEffect } from 'react';
import type { ServerMessage, ClientMessage } from './devChatProtocol';

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

export interface DevWebSocket {
  status: WsStatus;
  send: (msg: ClientMessage) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => () => void;
  lastError: string | null;
}

const WS_URL = 'ws://localhost:9100';

export function useDevWebSocket(): DevWebSocket {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<(msg: ServerMessage) => void>>(new Set());
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(1000);
  const pingIntervalRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setLastError(null);
      reconnectDelayRef.current = 1000;

      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30_000);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        handlersRef.current.forEach((h) => h(msg));
      } catch {
        /* ignore parse errors */
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 16_000);
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      setLastError('WebSocket connection failed');
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const onMessage = useCallback((handler: (msg: ServerMessage) => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { status, send, onMessage, lastError };
}
