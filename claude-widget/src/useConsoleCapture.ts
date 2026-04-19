import { useRef, useEffect } from 'react';

const MAX_LOGS = 200;

export interface ConsoleCaptureResult {
  getRecent: (n: number) => string[];
  getAll: () => string[];
}

export function useConsoleCapture(): ConsoleCaptureResult {
  const logsRef = useRef<string[]>([]);

  useEffect(() => {
    const originals = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };

    function capture(level: string, ...args: unknown[]) {
      const line = `[${level}] ${args
        .map((a) => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ')}`;

      logsRef.current.push(line);
      if (logsRef.current.length > MAX_LOGS) {
        logsRef.current = logsRef.current.slice(-MAX_LOGS);
      }
    }

    console.log = (...args: unknown[]) => {
      capture('log', ...args);
      originals.log.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      capture('warn', ...args);
      originals.warn.apply(console, args);
    };
    console.error = (...args: unknown[]) => {
      capture('error', ...args);
      originals.error.apply(console, args);
    };

    return () => {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
    };
  }, []);

  return {
    getRecent: (n: number) => logsRef.current.slice(-n),
    getAll: () => [...logsRef.current],
  };
}
