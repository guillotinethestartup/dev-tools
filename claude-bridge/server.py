"""
Claude Bridge Server

WebSocket server that bridges browser chat to a persistent Claude CLI subprocess.
Streams stdin/stdout directly through the WebSocket. Conversations are read from
Claude's native .claude/ JSONL files.

Usage:
    uvicorn server:app --host localhost --port 9100 --reload

Connects to: ws://localhost:9100
"""

import asyncio
import json
import os
import tempfile
import time
import base64
import glob
from collections import deque
from typing import Optional

from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CLAUDE = os.path.expanduser("~/.local/bin/claude")
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

REPOS = {
    "gtv-frontend": os.path.join(PROJECT_DIR, "gtv-frontend"),
    "gtv-backend": os.path.join(PROJECT_DIR, "gtv-backend"),
    "dev-tools": os.path.join(PROJECT_DIR, "dev-tools"),
}

APP_CONTEXT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app_context.md")
CLAUDE_PROJECTS_DIR = os.path.expanduser(
    "~/.claude/projects/" + PROJECT_DIR.replace("/", "-").replace("_", "-")
)

FRONTEND_APP_DIR = os.path.join(PROJECT_DIR, "gtv-frontend", "apps", "web", "src", "app")

CLAUDE_MD_FILES = [
    os.path.join(PROJECT_DIR, repo, "CLAUDE.md")
    for repo in ["dev-tools", "gtv-frontend", "gtv-backend"]
]

GTV_MODE = os.environ.get("GTV_MODE", "local")
BACKEND_LOG_FILE = os.environ.get("BACKEND_LOG_FILE")
RAILWAY_ENVIRONMENT = os.environ.get("RAILWAY_ENVIRONMENT")


def collect_system_prompts() -> list[dict]:
    """Read app_context.md and CLAUDE.md files into a list of {name, content} dicts."""
    prompts = []
    if os.path.isfile(APP_CONTEXT_FILE):
        with open(APP_CONTEXT_FILE) as f:
            prompts.append({"name": "app_context.md", "content": f.read()})
    for path in CLAUDE_MD_FILES:
        if os.path.isfile(path):
            repo = os.path.basename(os.path.dirname(path))
            with open(path) as f:
                prompts.append({"name": f"{repo}/CLAUDE.md", "content": f.read()})
    return prompts


def build_route_map() -> list[tuple[str, str]]:
    """Scan Next.js app directory and build a list of (regex_pattern, file_path) tuples."""
    import re as _re
    routes = []
    if not os.path.isdir(FRONTEND_APP_DIR):
        return routes

    for root, _dirs, files in os.walk(FRONTEND_APP_DIR):
        if "page.tsx" not in files and "page.ts" not in files:
            continue
        page_file = "page.tsx" if "page.tsx" in files else "page.ts"
        rel = os.path.relpath(root, FRONTEND_APP_DIR)

        # Build URL pattern from directory structure
        segments = [] if rel == "." else rel.split(os.sep)
        url_parts = []
        for seg in segments:
            if seg.startswith("(") and seg.endswith(")"):
                continue  # route groups don't appear in URL
            elif seg.startswith("[") and seg.endswith("]"):
                url_parts.append("[^/]+")
            else:
                url_parts.append(_re.escape(seg))

        pattern = "^/" + "/".join(url_parts) + "/?$" if url_parts else "^/?$"
        filepath = os.path.join(root, page_file)
        rel_filepath = os.path.relpath(filepath, PROJECT_DIR)
        routes.append((pattern, rel_filepath))

    # Sort longer patterns first so specific routes match before generic ones
    routes.sort(key=lambda r: -len(r[0]))
    return routes


route_map = build_route_map()


def resolve_page_url(pathname: str) -> str | None:
    """Match a URL pathname to its Next.js page source file."""
    import re as _re
    for pattern, filepath in route_map:
        if _re.match(pattern, pathname):
            return filepath
    return None

# In-memory cache for Claude to write data, frontend to read
cache: dict[str, any] = {}

# Widget UUID → Claude session ID mapping
WIDGET_SESSIONS_FILE = os.path.join(DATA_DIR, "widget_sessions.json")
widget_sessions: dict[str, str] = {}  # widget_uuid → session_id

# Live sessions with persistent processes
sessions: dict[str, "Session"] = {}  # session_id → Session

# --- Logging ---
MAX_LOG_ENTRIES = 500
log_buffer: deque = deque(maxlen=MAX_LOG_ENTRIES)
_backend_log_pos: int = 0


def now_ms() -> int:
    return int(time.time() * 1000)


def server_log(text: str, level: str = "info"):
    """Bridge-internal log line (printed to terminal, not sent to widget)."""
    print(f"[bridge:{level}] {text}")


def backend_log(text: str, level: str = "info"):
    """Append a backend log line to the in-memory buffer (served via GET /logs)."""
    log_buffer.append({
        "text": text,
        "level": level,
        "ts": now_ms(),
    })


def _parse_log_level(line: str) -> str:
    """Extract log level from a uvicorn/Python log line."""
    upper = line.lstrip().upper()
    if upper.startswith(("ERROR:", "CRITICAL:")):
        return "error"
    if upper.startswith(("WARNING:", "WARN:")):
        return "warn"
    if upper.startswith("DEBUG:"):
        return "debug"
    return "info"


def _ingest_backend_log_file():
    """Read new lines from the backend log file into the buffer."""
    global _backend_log_pos
    if not BACKEND_LOG_FILE or not os.path.isfile(BACKEND_LOG_FILE):
        return
    with open(BACKEND_LOG_FILE, "r") as f:
        f.seek(_backend_log_pos)
        for line in f:
            text = line.rstrip("\n\r")
            if text:
                log_buffer.append({
                    "text": text,
                    "level": _parse_log_level(text),
                    "ts": now_ms(),
                })
        _backend_log_pos = f.tell()


async def _stream_railway_logs():
    """Stream logs from Railway for the staging backend."""
    server_log("Starting Railway log streaming...")

    backend_dir = os.path.join(PROJECT_DIR, "gtv-backend")
    cmd = ["railway", "logs", "--json"]
    if RAILWAY_ENVIRONMENT:
        cmd.extend(["--environment", RAILWAY_ENVIRONMENT])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=backend_dir,
        )

        async for line_bytes in proc.stdout:
            line = line_bytes.decode().strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                text = obj.get("message", line)
                severity = obj.get("severity", "info").lower()
                level_map = {"error": "error", "warn": "warn", "warning": "warn",
                             "debug": "debug", "info": "info"}
                backend_log(text, level_map.get(severity, "info"))
            except json.JSONDecodeError:
                backend_log(line, _parse_log_level(line))

        await proc.wait()
        if proc.returncode != 0:
            stderr_out = await proc.stderr.read()
            err = stderr_out.decode().strip()
            backend_log(f"Railway logs stopped: {err}", "error")

    except FileNotFoundError:
        backend_log("Railway CLI not found. Install: npm i -g @railway/cli", "error")
    except Exception as e:
        backend_log(f"Railway log streaming failed: {e}", "error")


# --- Widget session mapping persistence ---

def save_widget_sessions():
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(WIDGET_SESSIONS_FILE, "w") as f:
        json.dump(widget_sessions, f)


def load_widget_sessions():
    global widget_sessions
    if not os.path.isfile(WIDGET_SESSIONS_FILE):
        return
    try:
        with open(WIDGET_SESSIONS_FILE) as f:
            widget_sessions = json.load(f)
        server_log(f"Loaded {len(widget_sessions)} widget session mapping(s)")
    except Exception as e:
        server_log(f"Failed to load widget sessions: {e}", "error")


load_widget_sessions()


# --- Session class ---

class Session:
    """Manages a persistent Claude subprocess."""

    def __init__(self, session_id: Optional[str] = None):
        self.session_id: Optional[str] = session_id
        self.process: Optional[asyncio.subprocess.Process] = None
        self.stdout_task: Optional[asyncio.Task] = None
        self.stderr_task: Optional[asyncio.Task] = None
        self.websocket: Optional[WebSocket] = None

    async def start_process(self, resume_id: Optional[str] = None):
        """Spawn a persistent Claude process."""
        cmd = [
            CLAUDE, "-p",
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--model", "claude-opus-4-7",
            "--effort", "max",
            "--verbose",
            "--include-partial-messages",
            "--dangerously-skip-permissions",
        ]
        if resume_id:
            cmd.extend(["--resume", resume_id])
        else:
            cmd.extend(["--append-system-prompt-file", APP_CONTEXT_FILE])

        label = f"resume={resume_id}" if resume_id else "new"
        server_log(f"Starting Claude process ({label})")

        self.process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=PROJECT_DIR,
            limit=1024 * 1024,
        )

        self.stdout_task = asyncio.create_task(self._read_stdout())
        self.stderr_task = asyncio.create_task(self._read_stderr())

    @property
    def is_alive(self) -> bool:
        return self.process is not None and self.process.returncode is None

    async def send(self, content: str):
        """Write a user message to Claude's stdin."""
        if not self.is_alive:
            return
        msg = json.dumps({
            "type": "user",
            "message": {"role": "user", "content": content},
        })
        self.process.stdin.write((msg + "\n").encode())
        await self.process.stdin.drain()

    async def kill(self):
        """Terminate the process and cancel background tasks."""
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
        if self.stdout_task:
            self.stdout_task.cancel()
        if self.stderr_task:
            self.stderr_task.cancel()
        self.process = None
        server_log(f"Killed Claude process (session={self.session_id})")

    def attach(self, ws: WebSocket):
        self.websocket = ws

    def detach(self):
        self.websocket = None

    async def _send_ws(self, msg: dict):
        """Send a message to the attached WebSocket, if any."""
        if self.websocket:
            try:
                await self.websocket.send_json(msg)
            except Exception:
                self.websocket = None

    async def _read_stdout(self):
        """Persistent background task: read Claude stdout, forward events to WebSocket."""
        try:
            async for line_bytes in self.process.stdout:
                line = line_bytes.decode().strip()
                if not line:
                    continue

                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Always forward raw event
                await self._send_ws({
                    "type": "raw.event",
                    "event": event,
                    "ts": now_ms(),
                })

                # Capture session_id from any event that has it
                if "session_id" in event:
                    self.session_id = event["session_id"]

                event_type = event.get("type", "")

                if event_type == "system":
                    subtype = event.get("subtype", "")
                    if subtype == "init":
                        await self._send_ws({
                            "type": "stream.init",
                            "sessionId": event.get("session_id", ""),
                        })
                        await self._send_ws({
                            "type": "stream.system_prompts",
                            "prompts": collect_system_prompts(),
                        })

                elif event_type == "stream_event":
                    se = event.get("event", {})
                    if se.get("type") == "content_block_delta":
                        delta = se.get("delta", {})
                        if delta.get("type") == "text_delta" and delta.get("text"):
                            await self._send_ws({
                                "type": "stream.text",
                                "text": delta["text"],
                            })

                elif event_type == "assistant":
                    content = event.get("message", {}).get("content", [])
                    for block in content:
                        if not isinstance(block, dict):
                            continue
                        if block.get("type") == "tool_use":
                            await self._send_ws({
                                "type": "stream.tool_use",
                                "name": block.get("name", "unknown"),
                                "toolId": block.get("id", ""),
                                "input": block.get("input", {}),
                            })

                elif event_type == "user":
                    content = event.get("message", {}).get("content", [])
                    if isinstance(content, list):
                        for item in content:
                            if isinstance(item, dict) and item.get("type") == "tool_result":
                                await self._send_ws({
                                    "type": "stream.tool_result",
                                    "toolId": item.get("tool_use_id", ""),
                                    "content": flatten_text_content(item.get("content", "")),
                                })

                elif event_type == "result":
                    await self._send_ws({
                        "type": "stream.done",
                        "sessionId": self.session_id or "",
                    })

        except asyncio.CancelledError:
            return
        except Exception as e:
            server_log(f"stdout reader error: {e}", "error")

        # Process exited
        if self.process and self.process.returncode is not None:
            code = self.process.returncode
            if code != 0:
                server_log(f"Claude process exited with code {code}", "error")
                await self._send_ws({
                    "type": "stream.error",
                    "error": f"Claude process exited with code {code}",
                })

    async def _read_stderr(self):
        """Read stderr and emit as server debug logs."""
        try:
            async for line_bytes in self.process.stderr:
                line = line_bytes.decode().strip()
                if line:
                    server_log(f"[claude] {line}", "debug")
        except asyncio.CancelledError:
            return
        except Exception:
            pass


# --- Prompt building ---

def flatten_text_content(content) -> str:
    """Flatten Claude message content (str or list of text blocks) into a plain string."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return str(content)


def build_prompt(msg: dict) -> str:
    """Combine user text with optional screenshots/console/server log context."""
    parts = []

    page_url = msg.get("pageUrl")
    if page_url:
        source_file = resolve_page_url(page_url)
        parts.append("## Current Page")
        if source_file:
            parts.append(f"URL: `{page_url}` → `{source_file}`")
        else:
            parts.append(f"URL: `{page_url}` (no matching source file found)")
        parts.append("")

    if msg.get("consoleLogs"):
        logs = msg["consoleLogs"]
        parts.append("## Recent Browser Console Output")
        parts.append("```")
        parts.append("\n".join(logs))
        parts.append("```")
        parts.append("")

    if msg.get("serverLogs"):
        logs = msg["serverLogs"]
        parts.append("## Recent Backend Server Logs")
        parts.append("```")
        parts.append("\n".join(logs))
        parts.append("```")
        parts.append("")

    screenshots = msg.get("screenshots", [])
    if not screenshots and msg.get("screenshot"):
        screenshots = [msg["screenshot"]]

    for i, screenshot in enumerate(screenshots):
        try:
            raw = screenshot.split(",", 1)[-1] if "," in screenshot else screenshot
            img_bytes = base64.b64decode(raw)
            fd, path = tempfile.mkstemp(suffix=".png", prefix=f"devchat_ss{i}_")
            with os.fdopen(fd, "wb") as f:
                f.write(img_bytes)
            label = "Screenshot" if len(screenshots) == 1 else f"Screenshot {i + 1}"
            parts.append(f"## {label} of Current Page")
            parts.append(f"[{label} saved to: {path}]")
            parts.append("")
        except Exception as e:
            parts.append(f"[Screenshot capture failed: {e}]")
            parts.append("")

    parts.append(msg["content"])
    return "\n".join(parts)


# --- Conversation reading from .claude/ JSONL ---

def parse_jsonl_messages(filepath: str) -> tuple[list[dict], list[dict]]:
    """Parse a .claude/ JSONL file into structured messages and raw entries."""
    messages = []
    raw = []

    with open(filepath) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            raw.append(entry)
            entry_type = entry.get("type", "")

            if entry_type == "user":
                content = entry.get("message", {}).get("content", "")
                if isinstance(content, str):
                    messages.append({
                        "type": "text",
                        "role": "user",
                        "content": content,
                    })
                elif isinstance(content, list):
                    for item in content:
                        if not isinstance(item, dict):
                            continue
                        if item.get("type") == "text":
                            messages.append({
                                "type": "text",
                                "role": "user",
                                "content": item.get("text", ""),
                            })
                        elif item.get("type") == "tool_result":
                            messages.append({
                                "type": "tool_result",
                                "role": "tool",
                                "toolId": item.get("tool_use_id", ""),
                                "content": flatten_text_content(item.get("content", "")),
                            })

            elif entry_type == "assistant":
                for block in entry.get("message", {}).get("content", []):
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text":
                        messages.append({
                            "type": "text",
                            "role": "assistant",
                            "content": block["text"],
                        })
                    elif block.get("type") == "tool_use":
                        messages.append({
                            "type": "tool_use",
                            "role": "assistant",
                            "name": block.get("name", ""),
                            "toolId": block.get("id", ""),
                            "input": block.get("input", {}),
                        })

    return messages, raw


def get_conversation_preview(filepath: str) -> str:
    """Get the first user text message from a JSONL file."""
    with open(filepath) as f:
        for line in f:
            try:
                entry = json.loads(line.strip())
            except (json.JSONDecodeError, ValueError):
                continue
            if entry.get("type") == "user":
                content = entry.get("message", {}).get("content", "")
                if isinstance(content, str) and content.strip():
                    return content[:100]
    return ""


# --- Session lookup helpers ---

async def get_or_create_session(widget_id: str, msg: dict) -> Session:
    """Find an existing session for this widget, or create a new one."""
    session_id = widget_sessions.get(widget_id)

    # Existing session with live process
    if session_id and session_id in sessions and sessions[session_id].is_alive:
        return sessions[session_id]

    # Known session but process is dead — resume
    if session_id:
        session = Session(session_id)
        await session.start_process(resume_id=session_id)
        sessions[session_id] = session
        return session

    # Brand new session
    session = Session()
    await session.start_process()
    return session


def register_session(widget_id: str, session: Session):
    """Store the widget → session mapping once we have a session_id."""
    if session.session_id:
        widget_sessions[widget_id] = session.session_id
        sessions[session.session_id] = session
        save_widget_sessions()


# --- WebSocket endpoint ---

@app.websocket("/")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    current_session: Optional[Session] = None
    current_widget_id: Optional[str] = None
    server_log("Client connected")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "chat.cancel":
                if current_session and current_session.is_alive:
                    await current_session.send("Stop. Cancel the current operation and wait for my next message.")
                    server_log("Sent cancel message to Claude via stdin")
                    await websocket.send_json({
                        "type": "stream.done",
                        "sessionId": current_session.session_id or "",
                        "cancelled": True,
                    })

            elif msg_type == "chat.send":
                widget_id = msg.get("widgetId", "default")
                current_widget_id = widget_id

                # Get or create session for this widget
                session = await get_or_create_session(widget_id, msg)

                # Detach old session if switching
                if current_session and current_session is not session:
                    current_session.detach()

                current_session = session
                session.attach(websocket)

                # Build prompt and send
                prompt = build_prompt(msg)
                await session.send(prompt)

                # Register mapping once session_id is known
                # (For new sessions, session_id comes from system.init in stdout reader.
                #  We register on a short delay to let the init event arrive.)
                if not session.session_id:
                    asyncio.create_task(_deferred_register(widget_id, session))
                else:
                    register_session(widget_id, session)

            elif msg_type == "chat.switch":
                widget_id = msg.get("widgetId", "default")
                target_session_id = msg.get("sessionId")
                current_widget_id = widget_id

                if not target_session_id:
                    continue

                # Kill old process if different session
                old_session_id = widget_sessions.get(widget_id)
                if old_session_id and old_session_id != target_session_id:
                    old_session = sessions.get(old_session_id)
                    if old_session:
                        old_session.detach()
                        await old_session.kill()
                        del sessions[old_session_id]

                # Update mapping
                widget_sessions[widget_id] = target_session_id
                save_widget_sessions()

                # Create session object (don't start process until first message)
                session = Session(target_session_id)
                sessions[target_session_id] = session
                session.attach(websocket)

                if current_session:
                    current_session.detach()
                current_session = session

                server_log(f"Switched to session {target_session_id}")
                await websocket.send_json({
                    "type": "chat.switched",
                    "sessionId": target_session_id,
                })

            elif msg_type == "chat.new":
                widget_id = msg.get("widgetId", "default")
                current_widget_id = widget_id

                # Kill old process
                old_session_id = widget_sessions.get(widget_id)
                if old_session_id and old_session_id in sessions:
                    old_session = sessions[old_session_id]
                    old_session.detach()
                    await old_session.kill()
                    del sessions[old_session_id]

                # Clear mapping
                widget_sessions.pop(widget_id, None)
                save_widget_sessions()

                if current_session:
                    current_session.detach()
                current_session = None

                server_log("Started new conversation")
                await websocket.send_json({"type": "chat.cleared"})

    except (WebSocketDisconnect, RuntimeError):
        server_log("Client disconnected")
    finally:
        if current_session:
            current_session.detach()
        server_log("Client cleaned up (process stays alive)")


async def _deferred_register(widget_id: str, session: Session):
    """Wait briefly for system.init to provide session_id, then register mapping."""
    for _ in range(50):  # up to 5 seconds
        if session.session_id:
            register_session(widget_id, session)
            return
        await asyncio.sleep(0.1)
    server_log("Warning: session_id not received within timeout", "error")


# --- HTTP endpoints ---

@app.get("/health")
async def health():
    return {"status": "ok", "claude": os.path.isfile(CLAUDE)}


@app.get("/widget-session/{widget_id}")
async def get_widget_session(widget_id: str):
    """Return the session ID mapped to a widget UUID."""
    session_id = widget_sessions.get(widget_id)
    return {"sessionId": session_id}


@app.get("/conversations/{session_id}")
async def get_conversation(session_id: str):
    """Read conversation history from Claude's .claude/ JSONL file."""
    filepath = os.path.join(CLAUDE_PROJECTS_DIR, f"{session_id}.jsonl")
    if not os.path.isfile(filepath):
        return JSONResponse({"error": "not found"}, status_code=404)

    messages, raw = parse_jsonl_messages(filepath)
    return {"sessionId": session_id, "messages": messages, "raw": raw, "systemPrompts": collect_system_prompts()}


@app.get("/conversations")
async def list_conversations():
    """List all conversations from Claude's .claude/ JSONL files."""
    pattern = os.path.join(CLAUDE_PROJECTS_DIR, "*.jsonl")
    files = sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)

    result = []
    for filepath in files:
        session_id = os.path.basename(filepath).replace(".jsonl", "")
        mtime = os.path.getmtime(filepath)
        preview = get_conversation_preview(filepath)
        result.append({
            "sessionId": session_id,
            "updatedAt": int(mtime * 1000),
            "preview": preview,
        })

    return {"conversations": result}


# --- Cache routes ---

@app.put("/cache/{key:path}")
async def cache_put(key: str, request: Request):
    body = await request.json()
    cache[key] = body
    return {"key": key, "status": "ok"}


@app.get("/cache/{key:path}")
async def cache_get(key: str):
    if key not in cache:
        return JSONResponse({"error": "not found"}, status_code=404)
    return cache[key]


@app.delete("/cache/{key:path}")
async def cache_delete(key: str):
    removed = cache.pop(key, None)
    return {"key": key, "removed": removed is not None}


@app.get("/cache")
async def cache_list():
    return {"keys": list(cache.keys())}


# --- File serving ---

@app.get("/files/{filepath:path}")
async def serve_file(filepath: str):
    full_path = Path(DATA_DIR) / filepath
    if not full_path.resolve().is_relative_to(Path(DATA_DIR).resolve()):
        return JSONResponse({"error": "forbidden"}, status_code=403)
    if not full_path.is_file():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(full_path)


# --- Git endpoints ---

async def run_git(repo_dir: str, *args: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=repo_dir,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().rstrip()


def parse_porcelain_line(line: str) -> dict:
    if len(line) < 4:
        return None
    x, y = line[0], line[1]
    path = line[3:]

    if " -> " in path:
        path = path.split(" -> ", 1)[1]

    if x == "?" and y == "?":
        return {"path": path, "status": "untracked", "staged": False, "unstaged": True}

    staged = x not in (" ", "?")
    unstaged = y not in (" ", "?")
    indicator = x if staged else y
    status_map = {"M": "modified", "A": "added", "D": "deleted", "R": "renamed", "C": "copied"}
    return {"path": path, "status": status_map.get(indicator, "modified"), "staged": staged, "unstaged": unstaged}


@app.get("/git/status")
async def git_status():
    repos = []
    for name, repo_dir in REPOS.items():
        if not os.path.isdir(repo_dir):
            continue

        branch, status_output = await asyncio.gather(
            run_git(repo_dir, "branch", "--show-current"),
            run_git(repo_dir, "status", "--porcelain"),
        )

        ahead, behind = 0, 0
        try:
            counts = await run_git(repo_dir, "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
            if counts:
                parts = counts.split("\t")
                ahead, behind = int(parts[0]), int(parts[1])
        except Exception:
            pass

        files = []
        for line in status_output.splitlines():
            parsed = parse_porcelain_line(line)
            if parsed:
                files.append(parsed)

        repos.append({
            "name": name,
            "branch": branch,
            "ahead": ahead,
            "behind": behind,
            "files": files,
        })

    return {"repos": repos}


@app.get("/git/diff")
async def git_diff(repo: str, file: str, staged: bool = False, context: int | None = None):
    repo_dir = REPOS.get(repo)
    if not repo_dir or not os.path.isdir(repo_dir):
        return JSONResponse({"error": "unknown repo"}, status_code=404)

    args = ["diff"]
    if context is not None:
        args.append(f"-U{max(0, context)}")
    if staged:
        args.append("--cached")
    args.extend(["--", file])

    diff = await run_git(repo_dir, *args)

    if not diff:
        untracked = await run_git(repo_dir, "ls-files", "--others", "--exclude-standard", "--", file)
        if untracked.strip():
            full_path = os.path.join(repo_dir, file)
            try:
                with open(full_path, "r", errors="replace") as f:
                    content = f.read()
                diff = "\n".join(f"+{line}" for line in content.splitlines())
            except OSError:
                pass

    return {"repo": repo, "file": file, "diff": diff}


# --- Backend logs endpoint ---

@app.get("/logs")
async def get_logs():
    _ingest_backend_log_file()
    return {"logs": list(log_buffer)}


# --- Lifecycle ---

@app.on_event("startup")
async def startup():
    if GTV_MODE == "staging":
        asyncio.create_task(_stream_railway_logs())


@app.on_event("shutdown")
async def shutdown():
    server_log("Shutting down, killing all Claude processes...")
    for session in sessions.values():
        await session.kill()
