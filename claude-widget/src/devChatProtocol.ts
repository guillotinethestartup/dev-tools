export type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Attachments passed with a chat message
export interface ChatAttachments {
  screenshots?: string[];
  consoleLogs?: string[];
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

export type ChatMessage = TextMessage | ToolUseMessage | ToolResultMessage | ErrorMessage;

// --- Client -> Server ---

export interface ChatSendMessage {
  type: 'chat.send';
  content: string;
  widgetId: string;
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
  | StreamTextMessage
  | StreamToolUseMessage
  | StreamDoneMessage
  | StreamErrorMessage
  | ChatSwitchedMessage
  | ChatClearedMessage
  | PongMessage
  | LogEntryMessage
  | RawEventMessage;
