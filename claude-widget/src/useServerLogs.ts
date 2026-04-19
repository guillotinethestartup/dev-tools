import { useRef, useEffect } from 'react';
import type { DevWebSocket } from './useDevWebSocket';
import type { ServerMessage } from './devChatProtocol';

export interface ServerLog {
  text: string;
  level: string;
  ts: number;
}

const MAX_LOGS = 500;

export interface ServerLogsResult {
  getRecent: (n: number) => ServerLog[];
  getAll: () => ServerLog[];
}

export function useServerLogs(ws: DevWebSocket): ServerLogsResult {
  const logsRef = useRef<ServerLog[]>([]);

  useEffect(() => {
    return ws.onMessage((msg: ServerMessage) => {
      if (msg.type === 'log.entry') {
        logsRef.current.push({ text: msg.text, level: msg.level, ts: msg.ts });
        if (logsRef.current.length > MAX_LOGS) {
          logsRef.current = logsRef.current.slice(-MAX_LOGS);
        }
      }
    });
  }, [ws]);

  return {
    getRecent: (n: number) => logsRef.current.slice(-n),
    getAll: () => [...logsRef.current],
  };
}
