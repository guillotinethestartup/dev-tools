import { useRef, useEffect } from 'react';
import type { DevWebSocket } from './useDevWebSocket';
import type { ServerMessage } from './devChatProtocol';

export interface RawEvent {
  event: Record<string, unknown>;
  ts: number;
}

const MAX_EVENTS = 500;

export interface RawEventsResult {
  getRecent: (n: number) => RawEvent[];
  getAll: () => RawEvent[];
  clear: () => void;
}

export function useRawEvents(ws: DevWebSocket): RawEventsResult {
  const eventsRef = useRef<RawEvent[]>([]);

  useEffect(() => {
    return ws.onMessage((msg: ServerMessage) => {
      if (msg.type === 'raw.event') {
        const eventType = (msg.event as Record<string, unknown>).type;

        // Skip all streaming fragment events
        if (eventType === 'stream_event') return;

        // Only keep final assistant messages (with stop_reason)
        if (eventType === 'assistant') {
          const message = (msg.event as Record<string, unknown>).message as Record<string, unknown> | undefined;
          if (!message?.stop_reason) return;
        }

        eventsRef.current.push({ event: msg.event, ts: msg.ts });
        if (eventsRef.current.length > MAX_EVENTS) {
          eventsRef.current = eventsRef.current.slice(-MAX_EVENTS);
        }
      }
    });
  }, [ws]);

  return {
    getRecent: (n: number) => eventsRef.current.slice(-n),
    getAll: () => [...eventsRef.current],
    clear: () => { eventsRef.current = []; },
  };
}
