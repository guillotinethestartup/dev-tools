import { useState, useCallback, useEffect } from 'react';

export interface ServerLog {
  text: string;
  level: string;
  ts: number;
}

const BRIDGE_URL = 'http://localhost:9100';
const POLL_INTERVAL = 3000;

export interface ServerLogsResult {
  getRecent: (n: number) => ServerLog[];
  getAll: () => ServerLog[];
  refresh: () => Promise<void>;
}

export function useServerLogs(active: boolean = true): ServerLogsResult {
  const [logs, setLogs] = useState<ServerLog[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/logs`);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs);
    } catch {
      // bridge not ready yet
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [active, refresh]);

  return {
    getRecent: (n: number) => logs.slice(-n),
    getAll: () => logs,
    refresh,
  };
}
