import { useState, useRef, useEffect, useCallback } from 'react';
import type { DevWebSocket } from './useDevWebSocket';
import type { ServerMessage, ChatAttachments, ChatMessage } from './devChatProtocol';

export type { ChatMessage };

const STORAGE_KEY_WIDGET_ID = 'dev-chat-widget-id';
const BRIDGE_URL = 'http://localhost:9100';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getWidgetId(): string {
  let id = localStorage.getItem(STORAGE_KEY_WIDGET_ID);
  if (!id) {
    id = generateId();
    localStorage.setItem(STORAGE_KEY_WIDGET_ID, id);
  }
  return id;
}

const widgetId = getWidgetId();

async function fetchConversation(sessionId: string): Promise<{ messages: ChatMessage[]; raw: unknown[] }> {
  try {
    const res = await fetch(`${BRIDGE_URL}/conversations/${sessionId}`);
    if (!res.ok) return { messages: [], raw: [] };
    const data = await res.json();
    return {
      messages: data.messages || [],
      raw: data.raw || [],
    };
  } catch {
    return { messages: [], raw: [] };
  }
}

export interface ConversationSummary {
  sessionId: string;
  updatedAt: number;
  preview: string;
}

async function fetchConversationList(): Promise<ConversationSummary[]> {
  try {
    const res = await fetch(`${BRIDGE_URL}/conversations`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.conversations || [];
  } catch {
    return [];
  }
}

async function fetchWidgetSession(wid: string): Promise<string | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/widget-session/${wid}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.sessionId || null;
  } catch {
    return null;
  }
}

export interface DevChat {
  messages: ChatMessage[];
  isStreaming: boolean;
  sessionId: string | null;
  widgetId: string;
  send: (text: string, attachments?: ChatAttachments) => void;
  cancel: () => void;
  newConversation: () => void;
  switchConversation: (sessionId: string) => Promise<void>;
  listConversations: () => Promise<ConversationSummary[]>;
  loadConversation: (sessionId: string) => Promise<void>;
}

export function useDevChat(ws: DevWebSocket, consoleLogs: { getRecent: (n: number) => string[] }): DevChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const streamBufferRef = useRef('');

  // Restore previous conversation on mount
  useEffect(() => {
    fetchWidgetSession(widgetId).then(async (sid) => {
      if (sid) {
        const { messages: loaded } = await fetchConversation(sid);
        if (loaded.length > 0) {
          setMessages(loaded);
          setSessionId(sid);
        }
      }
    });
  }, []);

  // Subscribe to WebSocket messages
  useEffect(() => {
    return ws.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'stream.init':
          setSessionId(msg.sessionId);
          break;

        case 'stream.text':
          streamBufferRef.current += msg.text;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.type === 'text' && last.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { ...last, content: streamBufferRef.current },
              ];
            }
            return [
              ...prev,
              { type: 'text', role: 'assistant', content: streamBufferRef.current },
            ];
          });
          break;

        case 'stream.tool_use':
          setMessages((prev) => [
            ...prev,
            {
              type: 'tool_use',
              role: 'assistant',
              name: msg.name,
              toolId: msg.toolId,
              input: msg.input,
            },
          ]);
          break;

        case 'stream.done':
          setIsStreaming(false);
          if (msg.sessionId) setSessionId(msg.sessionId);
          streamBufferRef.current = '';
          break;

        case 'stream.error':
          setMessages((prev) => [
            ...prev,
            { type: 'error', role: 'error', content: msg.error },
          ]);
          setIsStreaming(false);
          streamBufferRef.current = '';
          break;

        case 'chat.switched':
          setSessionId(msg.sessionId);
          break;

        case 'chat.cleared':
          setMessages([]);
          setSessionId(null);
          break;
      }
    });
  }, [ws]);

  const send = useCallback(
    (text: string, attachments?: ChatAttachments) => {
      // Add user message to UI
      const parts: string[] = [];
      if (attachments?.screenshots?.length) {
        const n = attachments.screenshots.length;
        parts.push(n === 1 ? 'screenshot' : `${n} screenshots`);
      }
      if (attachments?.consoleLogs?.length) parts.push('console');
      if (attachments?.serverLogs?.length) parts.push('server logs');
      const suffix = parts.length ? ` [+ ${parts.join(', ')}]` : '';

      setMessages((prev) => [
        ...prev,
        { type: 'text', role: 'user', content: text + suffix },
      ]);
      setIsStreaming(true);
      streamBufferRef.current = '';

      ws.send({
        type: 'chat.send',
        content: text,
        widgetId,
        screenshots: attachments?.screenshots,
        consoleLogs: attachments?.consoleLogs ?? consoleLogs.getRecent(50),
        serverLogs: attachments?.serverLogs,
      });
    },
    [ws, consoleLogs],
  );

  const cancel = useCallback(() => {
    ws.send({ type: 'chat.cancel' });
    setIsStreaming(false);
    streamBufferRef.current = '';
  }, [ws]);

  const newConversation = useCallback(() => {
    ws.send({ type: 'chat.new', widgetId });
    setMessages([]);
    setSessionId(null);
    streamBufferRef.current = '';
    setIsStreaming(false);
  }, [ws]);

  const switchConversation = useCallback(
    async (targetSessionId: string) => {
      ws.send({ type: 'chat.switch', widgetId, sessionId: targetSessionId });
      // Load conversation history
      const { messages: loaded } = await fetchConversation(targetSessionId);
      setMessages(loaded);
      setSessionId(targetSessionId);
      streamBufferRef.current = '';
      setIsStreaming(false);
    },
    [ws],
  );

  const loadConversation = useCallback(async (targetSessionId: string) => {
    const { messages: loaded } = await fetchConversation(targetSessionId);
    if (loaded.length > 0) {
      setMessages(loaded);
      setSessionId(targetSessionId);
    }
  }, []);

  const listConversations = useCallback(() => fetchConversationList(), []);

  return {
    messages,
    isStreaming,
    sessionId,
    widgetId,
    send,
    cancel,
    newConversation,
    switchConversation,
    listConversations,
    loadConversation,
  };
}
