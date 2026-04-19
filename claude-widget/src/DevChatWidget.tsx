import { useState, useCallback, useRef, useEffect } from 'react';
import styles from './DevChatWidget.module.css';
import theme from './theme.module.css';
import { DevChatPane } from './DevChatPane';
import { useDevWebSocket } from './useDevWebSocket';
import { useDevChat } from './useDevChat';
import { useConsoleCapture } from './useConsoleCapture';
import { useServerLogs } from './useServerLogs';
import { useRawEvents } from './useRawEvents';
import type { Quadrant } from './devChatProtocol';

interface Position {
  x: number;
  y: number;
}

function getQuadrant(pos: Position): Quadrant {
  const midX = window.innerWidth / 2;
  const midY = window.innerHeight / 2;
  const isRight = pos.x > midX;
  const isBottom = pos.y > midY;
  if (isBottom && isRight) return 'bottom-right';
  if (isBottom && !isRight) return 'bottom-left';
  if (!isBottom && isRight) return 'top-right';
  return 'top-left';
}

const STORAGE_KEY_POS = 'dev-chat-widget-pos';

function loadPosition(): Position {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POS);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { x: window.innerWidth - 72, y: window.innerHeight - 72 };
}

export function DevChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<Position>(loadPosition);
  const ws = useDevWebSocket();
  const consoleLogs = useConsoleCapture();
  const serverLogs = useServerLogs(ws);
  const rawEvents = useRawEvents(ws);
  const chat = useDevChat(ws, consoleLogs);

  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(position));
  }, [position]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    hasDragged.current = false;
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    hasDragged.current = true;
    const x = Math.max(24, Math.min(window.innerWidth - 24, e.clientX - dragOffset.current.x));
    const y = Math.max(24, Math.min(window.innerHeight - 24, e.clientY - dragOffset.current.y));
    setPosition({ x, y });
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleClick = useCallback(() => {
    if (!hasDragged.current) {
      setIsOpen((prev) => !prev);
    }
  }, []);

  const quadrant = getQuadrant(position);

  return (
    <div className={theme.root}>
      <DevChatPane
        chat={chat}
        consoleLogs={consoleLogs}
        serverLogs={serverLogs}
        rawEvents={rawEvents}
        quadrant={quadrant}
        anchorPos={position}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onDragPosition={setPosition}
      />
      <button
        className={styles.fab}
        style={{ left: position.x - 24, top: position.y - 24 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={handleClick}
        title="Claude Dev Chat"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {ws.status === 'connected' && <span className={styles.dot} />}
        {ws.status === 'disconnected' && <span className={styles.dotOff} />}
      </button>
    </div>
  );
}
