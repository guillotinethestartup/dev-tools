import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './DevChatPane.module.css';
import type { DevChat } from './useDevChat';
import type { ConsoleCaptureResult } from './useConsoleCapture';
import { useServerLogs } from './useServerLogs';
import type { RawEventsResult } from './useRawEvents';
import type { Quadrant, ChatAttachments } from './devChatProtocol';
import { useTextSelection } from './useTextSelection';
import { SelectionOverlay } from './SelectionOverlay';
import { ScreenshotPanel } from './ScreenshotPanel';
import { GitPanel } from './GitPanel';
import { LogPanel } from './LogPanel';
import { ChatHeader } from './ChatHeader';
import { ContextBar } from './ContextBar';
import { InputBar } from './InputBar';
import { ChatMessages } from './ChatMessages';

type PanelKey = 'page' | 'screenshot' | 'console' | 'server' | 'raw' | 'git';

const PANEL_LABELS: Record<PanelKey, string> = {
  page: 'Page context',
  screenshot: 'Screenshot',
  console: 'Console',
  server: 'Server logs',
  raw: 'Raw events',
  git: 'Git',
};

const PANEL_ICONS: Record<PanelKey, React.ReactNode> = {
  page: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  screenshot: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  ),
  console: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  server: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  raw: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  git: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="12" r="3" />
      <line x1="6" y1="9" x2="6" y2="15" />
      <path d="M9 6h5a4 4 0 0 1 4 4v1" />
    </svg>
  ),
};

interface Props {
  chat: DevChat;
  consoleLogs: ConsoleCaptureResult;
  rawEvents: RawEventsResult;
  quadrant: Quadrant;
  anchorPos: { x: number; y: number };
  isOpen: boolean;
  onClose: () => void;
  onDragPosition: (pos: { x: number; y: number }) => void;
}

const DEFAULT_W = 420;
const DEFAULT_H = 560;
const MIN_W = 300;
const MIN_H = 320;

const STORAGE_KEY_SIZE = 'dev-chat-pane-size';

function loadSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SIZE);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { w: DEFAULT_W, h: DEFAULT_H };
}

const FAB_R = 24;

function getPanePosition(
  quadrant: Quadrant,
  anchor: { x: number; y: number },
  w: number,
  h: number,
): { left: number; top: number } {
  switch (quadrant) {
    case 'bottom-right':
      return { left: anchor.x - w, top: anchor.y - h };
    case 'bottom-left':
      return { left: anchor.x, top: anchor.y - h };
    case 'top-right':
      return { left: anchor.x - w, top: anchor.y };
    case 'top-left':
      return { left: anchor.x, top: anchor.y };
  }
}

function getResizeCorner(quadrant: Quadrant): string {
  switch (quadrant) {
    case 'bottom-right': return 'top-left';
    case 'bottom-left': return 'top-right';
    case 'top-right': return 'bottom-left';
    case 'top-left': return 'bottom-right';
  }
}

function getIconSide(quadrant: Quadrant): 'left' | 'right' {
  return quadrant === 'top-left' || quadrant === 'bottom-left' ? 'right' : 'left';
}

const SIDE_PANEL_W = 420;
const GIT_WITH_DIFF_W = 1140;


export function DevChatPane({ chat, consoleLogs, rawEvents, quadrant, anchorPos, isOpen, onClose, onDragPosition }: Props) {
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null);
  const [gitDiffOpen, setGitDiffOpen] = useState(false);
  const serverLogs = useServerLogs(isOpen && activePanel === 'server');

  useEffect(() => {
    if (!activePanel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setActivePanel(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePanel]);
  const [input, setInput] = useState('');
  const [size, setSize] = useState(loadSize);
  const [attachments, setAttachments] = useState<ChatAttachments>({});
  const [contextToggles, setContextToggles] = useState<{ page: boolean }>(() => {
    try {
      const raw = localStorage.getItem('dev-chat-context-toggles');
      if (raw) {
        const parsed = JSON.parse(raw);
        return { page: parsed.page ?? true };
      }
    } catch { /* ignore */ }
    return { page: true };
  });
  const isResizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Persist size and context toggles
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SIZE, JSON.stringify(size));
  }, [size]);
  useEffect(() => {
    localStorage.setItem('dev-chat-context-toggles', JSON.stringify(contextToggles));
  }, [contextToggles]);

  // --- Attachment management ---
  const onScreenshotAttach = useCallback((data: string) => {
    setAttachments((prev) => ({
      ...prev,
      screenshots: [...(prev.screenshots ?? []), data],
    }));
    setActivePanel(null);
  }, []);

  const removeScreenshot = useCallback((index: number) => {
    setAttachments((prev) => ({
      ...prev,
      screenshots: (prev.screenshots ?? []).filter((_, i) => i !== index),
    }));
  }, []);

  const attachConsoleLogs = useCallback(() => {
    setAttachments((prev) => ({
      ...prev,
      consoleLogs: consoleLogs.getRecent(100),
    }));
    setActivePanel(null);
  }, [consoleLogs]);

  const detachConsoleLogs = useCallback(() => {
    setAttachments((prev) => {
      const next = { ...prev };
      delete next.consoleLogs;
      return next;
    });
  }, []);

  const attachServerLogs = useCallback(() => {
    setAttachments((prev) => ({
      ...prev,
      serverLogs: serverLogs.getRecent(100).map((l) => `[${l.level}] ${l.text}`),
    }));
    setActivePanel(null);
  }, [serverLogs]);

  const detachServerLogs = useCallback(() => {
    setAttachments((prev) => {
      const next = { ...prev };
      delete next.serverLogs;
      return next;
    });
  }, []);

  // --- Text selections from side panels ---
  const selection = useTextSelection();

  // --- Send ---
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text && selection.chips.length === 0) return;
    setInput('');

    const prefix = selection.chips.map(selection.formatChip).join('\n\n');
    const fullText = prefix ? (text ? `${prefix}\n\n${text}` : prefix) : text;

    const toSend: ChatAttachments = {};
    if (!contextToggles.page) toSend.pageUrl = false;
    if (attachments.consoleLogs?.length) toSend.consoleLogs = attachments.consoleLogs;
    else toSend.consoleLogs = false;
    if (attachments.screenshots?.length) toSend.screenshots = attachments.screenshots;
    if (attachments.serverLogs?.length) toSend.serverLogs = attachments.serverLogs;

    chat.send(fullText, toSend);
    setAttachments({});
    selection.clearChips();
  }, [input, chat, attachments, contextToggles, selection]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setAttachments((prev) => ({
            ...prev,
            screenshots: [...(prev.screenshots ?? []), dataUrl],
          }));
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, []);

  // --- Resize ---
  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    isResizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }, [size]);

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isResizing.current) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    const corner = getResizeCorner(quadrant);

    let newW = resizeStart.current.w;
    let newH = resizeStart.current.h;
    if (corner.includes('left')) newW = resizeStart.current.w - dx;
    else newW = resizeStart.current.w + dx;
    if (corner.includes('top')) newH = resizeStart.current.h - dy;
    else newH = resizeStart.current.h + dy;

    setSize({
      w: Math.max(MIN_W, Math.min(800, newW)),
      h: Math.max(MIN_H, Math.min(900, newH)),
    });
  }, [quadrant]);

  const onResizePointerUp = useCallback(() => {
    isResizing.current = false;
  }, []);

  const corner = getResizeCorner(quadrant);
  const iconSide = getIconSide(quadrant);
  const wideGit = activePanel === 'git' && gitDiffOpen;
  const extraW = !activePanel
    ? 0
    : wideGit
    ? GIT_WITH_DIFF_W
    : activePanel === 'screenshot'
    ? GIT_WITH_DIFF_W
    : SIDE_PANEL_W;
  const paneTotalW = size.w + extraW;
  const pos = getPanePosition(quadrant, anchorPos, paneTotalW, size.h);

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        className={styles.pane}
        style={{ ...pos, width: paneTotalW, height: size.h }}
      >
        {/* Resize grip */}
        <div
          className={styles.resizeGrip}
          data-corner={corner}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />

        {/* Chat (always visible) */}
        <div className={styles.paneBody} data-icon-side={iconSide}>
          <div className={styles.paneMain}>
            <ChatHeader
              chat={chat}
              anchorPos={anchorPos}
              onDragPosition={onDragPosition}
              onClose={onClose}
            />
            <ChatMessages
              messages={chat.messages}
              isStreaming={chat.isStreaming}
              isOpen={isOpen}
            />

            <ContextBar
              attachments={attachments}
              selection={selection}
              onRemoveScreenshot={removeScreenshot}
              onDetachConsoleLogs={detachConsoleLogs}
              onDetachServerLogs={detachServerLogs}
            />

            <InputBar
              value={input}
              onChange={setInput}
              onSend={handleSend}
              onCancel={chat.cancel}
              onPaste={handlePaste}
              isStreaming={chat.isStreaming}
            />
          </div>
          {activePanel && (
            <div className={styles.expandedPanel} style={{ width: extraW }}>
          {activePanel !== 'git' && (
            <div className={styles.sidePanelHeader}>
              <span className={styles.sidePanelTitle}>{PANEL_LABELS[activePanel]}</span>
              {(activePanel === 'console' ||
                activePanel === 'server' ||
                activePanel === 'raw') && (
                <span className={styles.sidePanelHint}>select to attach</span>
              )}
              <button
                className={styles.sidePanelClose}
                onClick={() => setActivePanel(null)}
                aria-label="Close panel"
              >
                ×
              </button>
            </div>
          )}
          <div className={styles.sidePanelBody}>
            {activePanel === 'page' && (
              <div className={styles.screenshotPanel}>
                <label className={styles.screenshotCheckbox}>
                  <input
                    type="checkbox"
                    checked={contextToggles.page}
                    onChange={(e) =>
                      setContextToggles((t) => ({ ...t, page: e.target.checked }))
                    }
                  />
                  Attach page context
                </label>
                <div className={styles.screenshotHint}>
                  {contextToggles.page
                    ? 'The following will be attached to each message:'
                    : 'Page context is disabled — nothing will be attached.'}
                </div>
                {contextToggles.page && (
                  <pre className={styles.contextTileContent} style={{ margin: 0 }}>
{`## Current Page
URL: \`${typeof window !== 'undefined' ? window.location.pathname : '/'}\``}
                  </pre>
                )}
              </div>
            )}
            {activePanel === 'screenshot' && (
              <ScreenshotPanel active onAttach={onScreenshotAttach} />
            )}
            {activePanel === 'console' && (
              <LogPanel kind="console" logs={consoleLogs} />
            )}
            {activePanel === 'server' && (
              <LogPanel kind="server" logs={serverLogs} />
            )}
            {activePanel === 'raw' && (
              <LogPanel kind="raw" events={rawEvents} />
            )}
            {activePanel === 'git' && (
              <GitPanel
                quadrant={quadrant}
                onClose={() => setActivePanel(null)}
                onDiffOpenChange={setGitDiffOpen}
              />
            )}
          </div>
        </div>
      )}
          <div className={styles.iconStrip}>
            {(Object.keys(PANEL_LABELS) as PanelKey[])
              .filter((k) => k !== 'page')
              .map((key) => (
                <button
                  key={key}
                  className={styles.iconBtn}
                  data-active={activePanel === key}
                  onClick={() => {
                    if (activePanel === key) setActivePanel(null);
                    else setActivePanel(key);
                  }}
                  title={PANEL_LABELS[key]}
                >
                  {PANEL_ICONS[key]}
                </button>
              ))}
            <div className={styles.iconStripSeparator} />
            <button
              className={styles.iconBtn}
              data-active={activePanel === 'page'}
              onClick={() => setActivePanel(activePanel === 'page' ? null : 'page')}
              title={PANEL_LABELS.page}
            >
              {PANEL_ICONS.page}
            </button>
          </div>
        </div>
      </div>
      <SelectionOverlay selection={selection} />
    </>
  );
}
