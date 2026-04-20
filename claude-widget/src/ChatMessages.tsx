import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './DevChatPane.module.css';
import type { ChatMessage } from './useDevChat';
import { MessageContent } from './MessageContent';

interface ToolCall {
  use: ChatMessage & { type: 'tool_use' };
  result?: ChatMessage & { type: 'tool_result' };
}

interface MessageGroup {
  type: 'text' | 'error' | 'tools';
  messages?: ChatMessage[];
  tools?: ToolCall[];
}

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentTools: ToolCall[] = [];

  const flushTools = () => {
    if (currentTools.length > 0) {
      groups.push({ type: 'tools', tools: [...currentTools] });
      currentTools = [];
    }
  };

  for (const msg of messages) {
    if (msg.type === 'tool_use') {
      currentTools.push({ use: msg });
    } else if (msg.type === 'tool_result') {
      const matching = currentTools.find((t) => t.use.toolId === msg.toolId && !t.result);
      if (matching) {
        matching.result = msg;
      }
    } else {
      flushTools();
      groups.push({ type: msg.type === 'error' ? 'error' : 'text', messages: [msg] });
    }
  }
  flushTools();
  return groups;
}

function ToolCallGroup({ tools, isLatest }: { tools: ToolCall[]; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  useEffect(() => {
    if (isLatest) setExpanded(true);
  }, [isLatest]);

  const allDone = tools.every((t) => t.result);

  return (
    <div style={{
      alignSelf: 'flex-start', maxWidth: '92%', fontSize: 11, lineHeight: 1.5,
      borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.02)', color: '#d4d1dc',
      fontFamily: "'SF Mono','JetBrains Mono','Fira Code',monospace",
    }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
          background: 'rgba(255,255,255,0.03)', color: '#908a9e', cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 8, width: 10 }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ flex: 1 }}>
          {tools.length} tool {tools.length === 1 ? 'call' : 'calls'}
        </span>
        {allDone && <span style={{ color: '#6dba96', fontWeight: 600 }}>✓</span>}
        {!allDone && <span className={styles.toolSpinner} />}
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {tools.map((tool, idx) => {
            const isDone = !!tool.result;
            const isToolExpanded = expandedTool === tool.use.toolId;
            return (
              <div key={tool.use.toolId} style={idx < tools.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.06)' } : undefined}>
                <div
                  onClick={() => setExpandedTool(isToolExpanded ? null : tool.use.toolId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                    color: '#585268', cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  {isDone
                    ? <span style={{ color: '#6dba96', fontSize: 10, width: 14, textAlign: 'center', flexShrink: 0 }}>✓</span>
                    : <span className={styles.toolSpinner} />
                  }
                  <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.use.name}</span>
                  <span style={{ fontSize: 8, width: 10, flexShrink: 0 }}>{isToolExpanded ? '▼' : '▶'}</span>
                </div>
                {isToolExpanded && (
                  <div style={{ padding: '0 10px 8px' }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#585268', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '6px 0 2px' }}>Input</div>
                    <pre style={{ margin: 0, padding: '6px 8px', background: '#0c0a10', borderRadius: 6, fontSize: 10, overflowX: 'auto', maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#908a9e' }}>
                      {JSON.stringify(tool.use.input, null, 2)}
                    </pre>
                    {tool.result && (
                      <>
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#585268', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '6px 0 2px' }}>Output</div>
                        <pre style={{ margin: 0, padding: '6px 8px', background: '#0c0a10', borderRadius: 6, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.7, maxHeight: 200, overflowY: 'auto' }}>
                          {tool.result.content.length > 500
                            ? tool.result.content.slice(0, 500) + '...'
                            : tool.result.content}
                        </pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ContextSection {
  type: 'page' | 'console' | 'server' | 'screenshot' | 'selection';
  label: string;
  content: string;
}

function parseUserContext(text: string): { sections: ContextSection[]; userText: string } {
  const sections: ContextSection[] = [];
  let remaining = text;

  const pageMatch = remaining.match(/^## Current Page\n(.*?)(?:\n\n|$)/s);
  if (pageMatch) {
    const raw = pageMatch[1].trim();
    const urlFileMatch = raw.match(/URL:\s*`([^`]+)`\s*→\s*`([^`]+)`/);
    const label = urlFileMatch ? urlFileMatch[1] : 'Current Page';
    sections.push({ type: 'page', label, content: raw });
    remaining = remaining.slice(pageMatch[0].length);
  }

  const consoleMatch = remaining.match(/^## Recent Browser Console Output\n```\n(.*?)\n```\n?\n?/s);
  if (consoleMatch) {
    const lines = consoleMatch[1].split('\n');
    sections.push({ type: 'console', label: `Console (${lines.length} lines)`, content: consoleMatch[1] });
    remaining = remaining.slice(consoleMatch[0].length);
  }

  const serverMatch = remaining.match(/^## Recent Bridge Server Logs\n```\n(.*?)\n```\n?\n?/s);
  if (serverMatch) {
    const lines = serverMatch[1].split('\n');
    sections.push({ type: 'server', label: `Server Logs (${lines.length} lines)`, content: serverMatch[1] });
    remaining = remaining.slice(serverMatch[0].length);
  }

  const ssRegex = /^## Screenshot(?: \d+)? of Current Page\n\[.*?\]\n?\n?/g;
  let ssMatch;
  while ((ssMatch = ssRegex.exec(remaining)) !== null) {
    sections.push({ type: 'screenshot', label: 'Screenshot', content: '' });
  }
  remaining = remaining.replace(/## Screenshot(?: \d+)? of Current Page\n\[.*?\]\n?\n?/g, '');

  const selRegex = /## Selection from ([^\n]+)\n```\n([\s\S]*?)\n```\n?\n?/g;
  let selMatch: RegExpExecArray | null;
  while ((selMatch = selRegex.exec(remaining)) !== null) {
    sections.push({
      type: 'selection',
      label: `Selection: ${selMatch[1].trim()}`,
      content: selMatch[2],
    });
  }
  remaining = remaining.replace(
    /## Selection from [^\n]+\n```\n[\s\S]*?\n```\n?\n?/g,
    '',
  );

  return { sections, userText: remaining.trim() };
}

function ContextTiles({ sections }: { sections: ContextSection[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (sections.length === 0) return null;

  return (
    <div className={styles.contextTiles}>
      {sections.map((sec, i) => (
        <div key={i} className={styles.contextTile} data-type={sec.type}>
          <button
            className={styles.contextTileHeader}
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <span className={styles.contextTileLabel}>{sec.label}</span>
            {sec.content && (
              <span className={styles.toolExpandIcon}>{expanded === i ? '▼' : '▶'}</span>
            )}
          </button>
          {expanded === i && sec.content && (
            <pre className={styles.contextTileContent}>
              {sec.type === 'console' || sec.type === 'server'
                ? sec.content.split('\n').map((line, j) => (
                    <span
                      key={j}
                      className={styles.contextLogLine}
                      data-level={line.startsWith('[error]') ? 'error' : line.startsWith('[warn]') ? 'warn' : 'log'}
                    >
                      {line}{'\n'}
                    </span>
                  ))
                : sec.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function ChatMessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.type === 'text') {
    if (msg.role === 'user') {
      const { sections, userText } = parseUserContext(msg.content);
      if (sections.length > 0) {
        return (
          <div className={styles.userMessageGroup}>
            <ContextTiles sections={sections} />
            <div className={styles.message} data-role="user">
              <MessageContent content={userText} role="user" />
            </div>
          </div>
        );
      }
    }
    return (
      <div className={styles.message} data-role={msg.role}>
        <MessageContent content={msg.content} role={msg.role} />
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

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  isOpen: boolean;
}

export function ChatMessages({ messages, isStreaming, isOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  useLayoutEffect(() => {
    if (!isOpen) {
      hasScrolledRef.current = false;
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    if (!hasScrolledRef.current) {
      el.scrollTop = el.scrollHeight;
      hasScrolledRef.current = true;
    }
  }, [isOpen]);

  return (
    <div className={styles.messages} ref={containerRef}>
      {messages.length === 0 && (
        <div className={styles.empty}>
          Ask Claude about this app. Screenshots and console logs are attached automatically.
        </div>
      )}
      {groupMessages(messages).map((group, i, groups) => {
        if (group.type === 'tools' && group.tools) {
          const isLatest = !groups.slice(i + 1).some((g) => g.type === 'tools');
          return <ToolCallGroup key={i} tools={group.tools} isLatest={isLatest} />;
        }
        if (!group.messages) return null;
        return group.messages.map((msg, j) => <ChatMessageBubble key={`${i}-${j}`} msg={msg} />);
      })}
      {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className={styles.message} data-role="assistant">
          <div className={styles.thinking}>Thinking...</div>
        </div>
      )}
    </div>
  );
}
