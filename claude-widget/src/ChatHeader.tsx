import { useCallback, useRef, useState } from 'react';
import styles from './DevChatPane.module.css';
import type { DevChat, ConversationSummary } from './useDevChat';

interface Props {
  chat: DevChat;
  anchorPos: { x: number; y: number };
  onDragPosition: (pos: { x: number; y: number }) => void;
  onClose: () => void;
}

export function ChatHeader({ chat, anchorPos, onDragPosition, onClose }: Props) {
  const [showConversations, setShowConversations] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      isDragging.current = true;
      dragOffset.current = { x: e.clientX - anchorPos.x, y: e.clientY - anchorPos.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [anchorPos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const x = Math.max(24, Math.min(window.innerWidth - 24, e.clientX - dragOffset.current.x));
      const y = Math.max(24, Math.min(window.innerHeight - 24, e.clientY - dragOffset.current.y));
      onDragPosition({ x, y });
    },
    [onDragPosition],
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <>
      <div
        className={styles.header}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
        <button className={styles.headerBtn} onClick={chat.newConversation} title="New conversation">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className={styles.headerBtn} onClick={onClose} title="Minimize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      {showConversations && (
        <div className={styles.conversationList}>
          <div className={styles.conversationListHeader}>
            <span>Conversations</span>
            <button className={styles.headerBtn} onClick={() => setShowConversations(false)}>
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
                  <div className={styles.conversationPreview}>{c.preview || '(empty)'}</div>
                  <div className={styles.conversationTs}>
                    {new Date(c.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
