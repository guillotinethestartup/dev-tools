import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './DevChatPane.module.css';
import type { DevChat, ChatMessage, ConversationSummary } from './useDevChat';
import type { ConsoleCaptureResult } from './useConsoleCapture';
import type { ServerLogsResult } from './useServerLogs';
import type { RawEventsResult } from './useRawEvents';
import type { Quadrant, ChatAttachments } from './devChatProtocol';
import { useScreenshot } from './useScreenshot';
import { MessageContent } from './MessageContent';

type Tab = 'chat' | 'console' | 'server' | 'raw';

interface Props {
  chat: DevChat;
  consoleLogs: ConsoleCaptureResult;
  serverLogs: ServerLogsResult;
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
      return { left: anchor.x + FAB_R - w, top: anchor.y - FAB_R - h };
    case 'bottom-left':
      return { left: anchor.x - FAB_R, top: anchor.y - FAB_R - h };
    case 'top-right':
      return { left: anchor.x + FAB_R - w, top: anchor.y + FAB_R };
    case 'top-left':
      return { left: anchor.x - FAB_R, top: anchor.y + FAB_R };
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

  // Fallback: show truncated JSON
  const json = JSON.stringify(e, null, 2);
  return <pre className={styles.rawFallback}>{json.length > 500 ? json.slice(0, 500) + '...' : json}</pre>;
}

function ChatMessageBubble({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);

  if (msg.type === 'text') {
    return (
      <div className={styles.message} data-role={msg.role}>
        <MessageContent content={msg.content} role={msg.role} />
      </div>
    );
  }

  if (msg.type === 'tool_use') {
    return (
      <div className={styles.message} data-role="tool">
        <button
          className={styles.toolToggle}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className={styles.toolIcon}>{expanded ? '▼' : '▶'}</span>
          <span className={styles.toolName}>{msg.name}</span>
        </button>
        {expanded && (
          <pre className={styles.toolInput}>
            {JSON.stringify(msg.input, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  if (msg.type === 'tool_result') {
    const text = msg.content.length > 300 ? msg.content.slice(0, 300) + '...' : msg.content;
    return (
      <div className={styles.message} data-role="tool">
        <pre className={styles.toolResult}>{text}</pre>
      </div>
    );
  }

  if (msg.type === 'error') {
    return (
      <div className={styles.message} data-role="error">
        <span>{msg.content}</span>
      </div>
    );
  }

  return null;
}

export function DevChatPane({ chat, consoleLogs, serverLogs, rawEvents, quadrant, anchorPos, isOpen, onClose, onDragPosition }: Props) {
  const { capture, isCapturing } = useScreenshot();

  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [input, setInput] = useState('');
  const [size, setSize] = useState(loadSize);
  const [attachments, setAttachments] = useState<ChatAttachments>({});
  const [showConversations, setShowConversations] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Header drag
  const isHeaderDragging = useRef(false);
  const headerDragOffset = useRef({ x: 0, y: 0 });

  // Refresh counter for log tabs (re-reads from refs)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (activeTab === 'console' || activeTab === 'server' || activeTab === 'raw') {
      const interval = setInterval(() => setTick((v) => v + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isHeaderDragging.current = true;
    headerDragOffset.current = {
      x: e.clientX - anchorPos.x,
      y: e.clientY - anchorPos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [anchorPos]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isHeaderDragging.current) return;
    const x = Math.max(24, Math.min(window.innerWidth - 24, e.clientX - headerDragOffset.current.x));
    const y = Math.max(24, Math.min(window.innerHeight - 24, e.clientY - headerDragOffset.current.y));
    onDragPosition({ x, y });
  }, [onDragPosition]);

  const onHeaderPointerUp = useCallback(() => {
    isHeaderDragging.current = false;
  }, []);

  // Persist size
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SIZE, JSON.stringify(size));
  }, [size]);

  // Auto-scroll chat to bottom (instant on mount, smooth for new messages)
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    const behavior = hasScrolledRef.current ? 'smooth' : 'instant';
    messagesEndRef.current?.scrollIntoView({ behavior });
    hasScrolledRef.current = true;
  }, [chat.messages]);

  // Auto-scroll logs to bottom when switching tabs (instant)
  useEffect(() => {
    if (activeTab !== 'chat') {
      logEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [activeTab]);

  // --- Attachment management ---
  const addScreenshot = useCallback(async () => {
    const data = await capture();
    if (data) {
      setAttachments((prev) => ({
        ...prev,
        screenshots: [...(prev.screenshots ?? []), data],
      }));
    }
  }, [capture]);

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
    setActiveTab('chat');
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
    setActiveTab('chat');
  }, [serverLogs]);

  const detachServerLogs = useCallback(() => {
    setAttachments((prev) => {
      const next = { ...prev };
      delete next.serverLogs;
      return next;
    });
  }, []);

  // --- Send ---
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');

    // Build attachments to send, only include non-empty
    const toSend: ChatAttachments = {};
    if (attachments.screenshots?.length) toSend.screenshots = attachments.screenshots;
    if (attachments.consoleLogs?.length) toSend.consoleLogs = attachments.consoleLogs;
    if (attachments.serverLogs?.length) toSend.serverLogs = attachments.serverLogs;

    chat.send(text, Object.keys(toSend).length > 0 ? toSend : undefined);
    setAttachments({});
  }, [input, chat, attachments]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

  const pos = getPanePosition(quadrant, anchorPos, size.w, size.h);
  const corner = getResizeCorner(quadrant);

  const hasAttachments = !!(
    attachments.screenshots?.length ||
    attachments.consoleLogs?.length ||
    attachments.serverLogs?.length
  );

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        className={styles.pane}
        style={{ ...pos, width: size.w, height: size.h }}
      >
        {/* Resize grip */}
        <div
          className={styles.resizeGrip}
          data-corner={corner}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        />

        {/* Header */}
        <div
          className={styles.header}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
        >
          <span className={styles.title}>Claude Dev</span>
          <button
            className={styles.headerBtn}
            onClick={async () => {
              if (showConversations) {
                setShowConversations(false);
              } else {
                const list = await chat.listConversations();
                setConversations(list);
                setShowConversations(true);
              }
            }}
            title="Conversation history"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
          <button
            className={styles.headerBtn}
            onClick={chat.newConversation}
            title="New conversation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
          <button className={styles.headerBtn} onClick={onClose} title="Minimize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          <button
            className={styles.tab}
            data-active={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={styles.tab}
            data-active={activeTab === 'console'}
            onClick={() => setActiveTab('console')}
          >
            Console
          </button>
          <button
            className={styles.tab}
            data-active={activeTab === 'server'}
            onClick={() => setActiveTab('server')}
          >
            Server
          </button>
          <button
            className={styles.tab}
            data-active={activeTab === 'raw'}
            onClick={() => setActiveTab('raw')}
          >
            Raw
          </button>
        </div>

        {/* Conversation list overlay */}
        {showConversations && (
          <div className={styles.conversationList}>
            <div className={styles.conversationListHeader}>
              <span>Conversations</span>
              <button
                className={styles.headerBtn}
                onClick={() => setShowConversations(false)}
              >
                &times;
              </button>
            </div>
            <div className={styles.conversationListItems}>
              {conversations.length === 0 ? (
                <div className={styles.empty}>No conversations yet.</div>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.sessionId}
                    className={styles.conversationItem}
                    data-active={c.sessionId === chat.sessionId}
                    onClick={async () => {
                      await chat.switchConversation(c.sessionId);
                      setShowConversations(false);
                    }}
                  >
                    <div className={styles.conversationPreview}>
                      {c.preview || '(empty)'}
                    </div>
                    <div className={styles.conversationTs}>
                      {new Date(c.updatedAt).toLocaleString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab content */}
        {activeTab === 'chat' && (
          <>
            <div className={styles.messages}>
              {chat.messages.length === 0 && (
                <div className={styles.empty}>
                  Ask Claude about this app. Screenshots and console logs are attached
                  automatically.
                </div>
              )}
              {chat.messages.map((msg, i) => (
                <ChatMessageBubble key={i} msg={msg} />
              ))}
              {chat.isStreaming && chat.messages[chat.messages.length - 1]?.role !== 'assistant' && (
                <div className={styles.message} data-role="assistant">
                  <div className={styles.thinking}>Thinking...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachment previews */}
            {hasAttachments && (
              <div className={styles.attachmentBar}>
                {attachments.screenshots?.map((_, i) => (
                  <button
                    key={`ss-${i}`}
                    className={styles.attachmentChip}
                    onClick={() => removeScreenshot(i)}
                    title="Click to remove"
                  >
                    <span className={styles.chipIcon}>&#128247;</span>
                    Screenshot {attachments.screenshots!.length > 1 ? i + 1 : ''}
                    <span className={styles.chipX}>&times;</span>
                  </button>
                ))}
                {attachments.consoleLogs && (
                  <button
                    className={styles.attachmentChip}
                    onClick={detachConsoleLogs}
                    title="Click to remove"
                  >
                    <span className={styles.chipIcon}>&gt;_</span>
                    Console logs
                    <span className={styles.chipX}>&times;</span>
                  </button>
                )}
                {attachments.serverLogs && (
                  <button
                    className={styles.attachmentChip}
                    onClick={detachServerLogs}
                    title="Click to remove"
                  >
                    <span className={styles.chipIcon}>&#9881;</span>
                    Server logs
                    <span className={styles.chipX}>&times;</span>
                  </button>
                )}
              </div>
            )}

            {/* Input area */}
            <div className={styles.inputArea}>
              <textarea
                className={styles.input}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  chat.isStreaming
                    ? 'Send to interrupt and ask something new...'
                    : 'Ask Claude about this app...'
                }
                rows={2}
              />
              <div className={styles.actions}>
                <button
                  className={styles.screenshotBtn}
                  onClick={addScreenshot}
                  disabled={isCapturing}
                  title="Capture screenshot"
                >
                  &#128247;
                </button>
                {chat.isStreaming ? (
                  <button className={styles.cancelBtn} onClick={chat.cancel}>
                    Stop
                  </button>
                ) : (
                  <button
                    className={styles.sendBtn}
                    onClick={handleSend}
                    disabled={!input.trim()}
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'console' && (
          <div className={styles.logTab}>
            <div className={styles.logContent}>
              {consoleLogs.getAll().length === 0 ? (
                <div className={styles.empty}>No console output captured yet.</div>
              ) : (
                consoleLogs.getAll().map((line, i) => (
                  <div key={i} className={styles.logLine} data-level={line.startsWith('[error]') ? 'error' : line.startsWith('[warn]') ? 'warn' : 'log'}>
                    {line}
                  </div>
                ))
              )}
              <div ref={activeTab === 'console' ? logEndRef : undefined} />
            </div>
            <div className={styles.logActions}>
              <button className={styles.attachBtn} onClick={attachConsoleLogs}>
                Attach to chat
              </button>
            </div>
          </div>
        )}

        {activeTab === 'server' && (
          <div className={styles.logTab}>
            <div className={styles.logContent}>
              {serverLogs.getAll().length === 0 ? (
                <div className={styles.empty}>No server logs yet. Start the bridge server.</div>
              ) : (
                serverLogs.getAll().map((log, i) => (
                  <div key={i} className={styles.logLine} data-level={log.level}>
                    <span className={styles.logTs}>
                      {new Date(log.ts).toLocaleTimeString()}
                    </span>
                    {log.text}
                  </div>
                ))
              )}
              <div ref={activeTab === 'server' ? logEndRef : undefined} />
            </div>
            <div className={styles.logActions}>
              <button className={styles.attachBtn} onClick={attachServerLogs}>
                Attach to chat
              </button>
            </div>
          </div>
        )}

        {activeTab === 'raw' && (
          <div className={styles.logTab}>
            <div className={styles.logContent}>
              {rawEvents.getAll().length === 0 ? (
                <div className={styles.empty}>No raw events yet. Send a message to Claude.</div>
              ) : (
                rawEvents.getAll().map((evt, i) => {
                  const e = evt.event;
                  const type = (e.type as string) || 'unknown';
                  return (
                    <div key={i} className={styles.rawEvent} data-type={type}>
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
              <div ref={activeTab === 'raw' ? logEndRef : undefined} />
            </div>
            <div className={styles.logActions}>
              <button className={styles.attachBtn} onClick={() => rawEvents.clear()}>
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
