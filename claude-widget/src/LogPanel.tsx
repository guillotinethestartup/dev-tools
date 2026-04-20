import { useEffect, useRef, useState } from 'react';
import styles from './DevChatPane.module.css';
import type { ConsoleCaptureResult } from './useConsoleCapture';
import type { ServerLogsResult } from './useServerLogs';
import type { RawEventsResult } from './useRawEvents';

interface ConsoleProps {
  kind: 'console';
  logs: ConsoleCaptureResult;
}

interface ServerProps {
  kind: 'server';
  logs: ServerLogsResult;
}

interface RawProps {
  kind: 'raw';
  events: RawEventsResult;
}

type Props = ConsoleProps | ServerProps | RawProps;

function renderRawContent(e: Record<string, unknown>): React.ReactNode {
  const type = (e.type as string) || '';
  if (type === 'assistant') {
    const content = ((e.message as Record<string, unknown>)?.content as unknown[]) ?? [];
    return (
      <>
        {content.map((block, i) => {
          if (!block || typeof block !== 'object') return null;
          const b = block as Record<string, unknown>;
          if (b.type === 'thinking') {
            return (
              <div key={i} className={styles.rawThinking}>
                <span className={styles.rawLabel}>thinking</span>
                <pre>{(b.thinking as string) || ''}</pre>
              </div>
            );
          }
          if (b.type === 'text') {
            return (
              <div key={i} className={styles.rawText}>
                <pre>{(b.text as string) || ''}</pre>
              </div>
            );
          }
          if (b.type === 'tool_use') {
            return (
              <div key={i} className={styles.rawToolUse}>
                <span className={styles.rawLabel}>tool: {b.name as string}</span>
                <pre>{JSON.stringify(b.input, null, 2)}</pre>
              </div>
            );
          }
          return null;
        })}
      </>
    );
  }
  if (type === 'result') {
    const result = e.result as Record<string, unknown> | undefined;
    if (result) {
      const content = (result.content as unknown[]) ?? [];
      return (
        <>
          {content.map((block, i) => {
            if (!block || typeof block !== 'object') return null;
            const b = block as Record<string, unknown>;
            if (b.type === 'text') {
              return <pre key={i} className={styles.rawResultText}>{(b.text as string) || ''}</pre>;
            }
            return null;
          })}
        </>
      );
    }
  }
  if (type === 'system') {
    const subtype = (e.subtype as string) || '';
    return <div className={styles.rawSystem}>{subtype}{e.session_id ? ` (${e.session_id})` : ''}</div>;
  }
  const json = JSON.stringify(e, null, 2);
  return <pre className={styles.rawFallback}>{json.length > 500 ? json.slice(0, 500) + '...' : json}</pre>;
}

export function LogPanel(props: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (props.kind === 'console') {
    const all = props.logs.getAll();
    return (
      <div className={styles.logTab}>
        <div className={styles.logContent} data-selection-source="console">
          {all.length === 0 ? (
            <div className={styles.empty}>No console output captured yet.</div>
          ) : (
            all.map((line, i) => (
              <div
                key={i}
                className={styles.logLine}
                data-selection-line={i}
                data-level={line.startsWith('[error]') ? 'error' : line.startsWith('[warn]') ? 'warn' : 'log'}
              >
                {line}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>
    );
  }

  if (props.kind === 'server') {
    const all = props.logs.getAll();
    return (
      <div className={styles.logTab}>
        <div className={styles.logContent} data-selection-source="server">
          {all.length === 0 ? (
            <div className={styles.empty}>No backend logs yet.</div>
          ) : (
            all.map((log, i) => (
              <div key={i} className={styles.logLine} data-selection-line={i} data-level={log.level}>
                <span className={styles.logTs}>
                  {new Date(log.ts).toLocaleTimeString()}
                </span>
                {log.text}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>
    );
  }

  const all = props.events.getAll();
  return (
    <div className={styles.logTab}>
      <div className={styles.logContent} data-selection-source="raw">
        {all.length === 0 ? (
          <div className={styles.empty}>No raw events yet. Send a message to Claude.</div>
        ) : (
          all.map((evt, i) => {
            const e = evt.event;
            const type = (e.type as string) || 'unknown';
            return (
              <div key={i} className={styles.rawEvent} data-selection-line={i} data-type={type}>
                <div className={styles.rawHeader}>
                  <span className={styles.rawType}>{type}</span>
                  <span className={styles.logTs}>
                    {new Date(evt.ts).toLocaleTimeString()}
                  </span>
                </div>
                {renderRawContent(e)}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div className={styles.logActions}>
        <button className={styles.attachBtn} onClick={() => props.events.clear()}>
          Clear
        </button>
      </div>
    </div>
  );
}
