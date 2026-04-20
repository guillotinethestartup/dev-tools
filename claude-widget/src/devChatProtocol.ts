export type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Attachments passed with a chat message
export interface ChatAttachments {
  pageUrl?: string | false;
  screenshots?: string[];
  consoleLogs?: string[] | false;
  serverLogs?: string[];
}

// --- Chat message types (used in conversation history and live rendering) ---

export interface TextMessage {
  type: 'text';
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolUseMessage {
  type: 'tool_use';
  role: 'assistant';
  name: string;
  toolId: string;
  input: Record<string, unknown>;
}

export interface ToolResultMessage {
  type: 'tool_result';
  role: 'tool';
  toolId: string;
  content: string;
}

export interface ErrorMessage {
  type: 'error';
  role: 'error';
  content: string;
}

export interface SystemPromptMessage {
  type: 'system_prompt';
  role: 'system';
  name: string;
  content: string;
}

export type ChatMessage = TextMessage | ToolUseMessage | ToolResultMessage | ErrorMessage | SystemPromptMessage;

// --- Client -> Server ---

export interface ChatSendMessage {
  type: 'chat.send';
  content: string;
  widgetId: string;
  pageUrl?: string;
  screenshots?: string[];
  consoleLogs?: string[];
  serverLogs?: string[];
}

export interface ChatCancelMessage {
  type: 'chat.cancel';
}

export interface ChatSwitchMessage {
  type: 'chat.switch';
  widgetId: string;
  sessionId: string;
}

export interface ChatNewMessage {
  type: 'chat.new';
  widgetId: string;
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage =
  | ChatSendMessage
  | ChatCancelMessage
  | ChatSwitchMessage
  | ChatNewMessage
  | PingMessage;

// --- Server -> Client ---

export interface StreamInitMessage {
  type: 'stream.init';
  sessionId: string;
}

export interface StreamTextMessage {
  type: 'stream.text';
  text: string;
}

export interface StreamToolUseMessage {
  type: 'stream.tool_use';
  name: string;
  toolId: string;
  input: Record<string, unknown>;
}

export interface StreamToolResultMessage {
  type: 'stream.tool_result';
  toolId: string;
  content: string;
}

export interface StreamDoneMessage {
  type: 'stream.done';
  sessionId: string;
  cancelled?: boolean;
}

export interface StreamErrorMessage {
  type: 'stream.error';
  error: string;
}

export interface ChatSwitchedMessage {
  type: 'chat.switched';
  sessionId: string;
}

export interface ChatClearedMessage {
  type: 'chat.cleared';
}

export interface StreamSystemPromptsMessage {
  type: 'stream.system_prompts';
  prompts: { name: string; content: string }[];
}

export interface PongMessage {
  type: 'pong';
}

export interface LogEntryMessage {
  type: 'log.entry';
  text: string;
  level: string;
  ts: number;
}

export interface RawEventMessage {
  type: 'raw.event';
  event: Record<string, unknown>;
  ts: number;
}

export type ServerMessage =
  | StreamInitMessage
  | StreamSystemPromptsMessage
  | StreamTextMessage
  | StreamToolUseMessage
  | StreamToolResultMessage
  | StreamDoneMessage
  | StreamErrorMessage
  | ChatSwitchedMessage
  | ChatClearedMessage
  | PongMessage
  | LogEntryMessage
  | RawEventMessage;

// --- Git status types ---

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied';
  staged: boolean;
  unstaged: boolean;
}

export interface GitRepoStatus {
  name: string;
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
}

export interface GitStatusResponse {
  repos: GitRepoStatus[];
}

export interface GitDiffResponse {
  repo: string;
  file: string;
  diff: string;
}
