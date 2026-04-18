# Termorchestra — Design Spec
_2026-04-18_

## Product Principle

> Termorchestra shall not replace terminal behavior.
> It shall make multiple real terminal sessions easier to start, read, organize and resume.

**Tagline:** *"A terminal-first app for the way people actually work in 2026: Claude, SSH, WSL, servers, logs and shell sessions — without IDE bloat."*

---

## What This Is

A cross-platform desktop app (Tauri) that hosts multiple real PTY sessions inside a clean, organized UI. It is a terminal orchestrator — a wrapper around real shells, not a replacement for them.

It is **not**:
- A new shell or shell language
- An IDE or code editor
- An AI chat interface
- A dashboard with a terminal embedded
- A tmux clone with a GUI

The user runs the same commands as always. The app makes it easier to run them across many sessions simultaneously without losing context.

---

## Target Users

Developers doing real multi-session work:
- Running Claude Code alongside an app dev server
- SSHing into a remote machine while watching local logs
- Switching between multiple projects without losing session state

Distribution: open-source, cross-platform (Windows-first, Linux/macOS in scope).

---

## Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| App shell | Tauri (Rust backend + WebView) |
| PTY management | `portable-pty` (Rust) |
| Terminal rendering | `xterm.js` + `xterm-addon-fit` |
| Frontend framework | React + TypeScript |
| Frontend state | Zustand |
| Persistence | `serde_json` → disk (JSON file) |
| Styling | Tailwind CSS |

### Structure

```
Rust backend
  ├── PTY Manager       — spawns and holds PTY processes (HashMap<SessionId, PtyHandle>)
  ├── Session Store     — in-memory session state
  └── Persistence       — read/write ~/.config/termorchestra/state.json

Tauri IPC Bridge
  ├── Commands (invoke) — create_session, write_pty, resize_pty, kill_session, rename_session
  └── Events (emit)     — pty_output, session_exited, session_status_changed

React frontend
  ├── Sidebar           — WorkspaceList, SessionList, SessionItem
  ├── TerminalPane      — xterm.js instance, one per active session
  └── StatusBar         — shell type, cwd, error state for problem sessions
```

### Communication

- PTY output → Rust reads stdout → emits `pty_output` event → xterm.js renders
- User keystrokes → xterm.js captures → `invoke("write_pty")` → Rust writes to PTY stdin
- Session metadata → Zustand store (frontend) synced from Tauri state events

---

## Data Model

```typescript
type SessionType = "local" | "wsl" | "ssh"  // "ssh" reserved for v1.1
type SessionRole = "claude" | "shell" | "server" | "logs" | "git" | "ssh"
type SessionStatus = "active" | "idle" | "exited"

interface Session {
  id: string
  name: string
  type: SessionType
  role: SessionRole
  status: SessionStatus
  cwd: string
  createdAt: number
}

interface Workspace {
  id: string
  name: string
  sessions: Session[]
  lastOpenedSessionId: string | null
}

interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string
}
```

State persists automatically on change via Tauri's `app_data_dir()` — resolves to the correct platform path (`%APPDATA%\termorchestra` on Windows, `~/.config/termorchestra` on Linux, `~/Library/Application Support/termorchestra` on macOS).

**Important:** PTY processes do not survive app restart. On reopen, a new PTY is spawned in the saved `cwd`. Scrollback history is not persisted in v1.

---

## UI Layout

### Default layout: Sidebar + Main Terminal

```
┌─────────────────────────────────────────────────────┐
│ ● ● ●  termorchestra          CloudLab ▾      ⊕     │  ← minimal toolbar
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  SESSIONS    │   $ claude code .                    │
│              │   ╭──────────────────────╮           │
│ ▐ ⬡ Claude  │   │  Claude Code v1.2.0  │           │  ← active session
│   $ App     │   ╰──────────────────────╯           │
│   ◈ Server  │   ❯ ▌                                │
│   ⌁ SSH Pi  │                                      │
│             │                                      │
│  ▸ EXITED(2)│                                      │
│             │                                      │
├─────────────┤                                      │
│ + New   ⟨  │                                      │
├─────────────┴──────────────────────────────────────┤
│ local · bash · ~/projects/spritepose    ⚠ SSH Pi   │  ← status bar
└─────────────────────────────────────────────────────┘
```

**Sidebar widths:**
- Normal mode: 160px
- Compact mode: 44px (icons + status dots only, toggle via ⟨⟩ button)

### Session item (normal mode)
- Icon + name on one line, status dot on right
- cwd or host on second line in small muted text
- Active session: left border accent + background highlight
- Exited sessions: collapsed to "▸ EXITED (n)", expandable

### Status bar
Additive information only — does not repeat sidebar dots:
- Left: `local · bash · ~/projects/spritepose` (shell type + cwd of active session)
- Right: error/warning states for other sessions (e.g. `⚠ SSH Pi`)

### Toolbar
Only two elements: workspace switcher (dropdown) + new session button (⊕). No more.

### Overview mode
A ⊞ button in the status bar triggers an optional workspace grid view (all sessions as mini-panes). This is a glance feature, not the default. Disabled/greyed in v1, enabled in v1.1.

---

## Session Types (V1)

| Type | How it works |
|---|---|
| `local` | Spawns system default shell (cmd, pwsh, or bash depending on OS) |
| `wsl` | Spawns `wsl.exe` — treated as a first-class type |

SSH is v1.1. Docker is not a session type — it is a workflow (run docker commands in a shell session).

## Session Roles

Roles are labels only. They affect the sidebar icon and default session name. They do not change terminal behavior.

| Role | Icon | Default name |
|---|---|---|
| `claude` | ⬡ | "Claude" |
| `shell` | $ | "Shell" |
| `server` | ◈ | "Server" |
| `logs` | ≡ | "Logs" |
| `git` | ⑂ | "Git" |
| `ssh` | ⌁ | "SSH" |

**Claude as hero role:** The Claude role gets a slightly more prominent session row (name rendered in accent color), but the terminal pane itself is identical to any other session. No chat UI, no special output parsing, no AI widgets.

---

## Workspaces

A workspace is a named group of sessions. Users can have multiple workspaces (e.g. "CloudLab", "Pi Monitor", "Personal").

- Create, rename, switch, delete workspaces
- Each workspace remembers its last active session
- Workspace switcher in toolbar (dropdown)

### Recent / Open Folder

Part of the new-session flow: when creating a session, the user is offered:
1. Recent folders (last 10 cwds used across all sessions)
2. Browse (native OS folder picker)
3. Current workspace's last cwd (default)

This removes the friction of `cd`-ing to the right place after opening a new terminal.

---

## Session Restore

On app reopen:
- All workspaces and sessions are restored from `state.json`
- Sessions that were `active` or `idle` are re-spawned as new PTYs in their saved `cwd`
- Sessions that were `exited` remain in the exited list (expandable)
- SSH sessions show as disconnected — user reconnects manually (v1.1)

---

## V1.0 Feature List (Locked)

| # | Feature |
|---|---|
| 1 | Multiple local PTY sessions (cmd / pwsh / bash) |
| 2 | WSL as first-class session type |
| 3 | Named sessions with role badges |
| 4 | Workspace grouping (create, switch, delete) |
| 5 | Sidebar: normal mode (160px) and compact mode (44px) |
| 6 | Session restore on app reopen (name, cwd, type) |
| 7 | Recent/open folder in new-session flow |
| 8 | Exited sessions collapsed to expandable group |
| 9 | Status bar: shell type, cwd, error state |
| 10 | Overview mode button (disabled, placeholder for v1.1) |

## V1.1 (Next)

- SSH sessions (via system `ssh` subprocess or `russh`)
- Overview grid mode (⊞) enabled
- Reconnect SSH manually from sidebar

## V2+ (Later, No Promises)

- Split panes
- Launch presets / workspace startup commands
- Saved commands per workspace
- Session notes
- Scrollback persistence
- Auto-reconnect SSH

## Hard No (Never)

- Git panel, docker list, or any tool-specific UI pane
- AI suggestion widget or inline AI assistant
- Right panel, inspector panel, bottom drawer
- Anything that makes the terminal pane smaller without user action

---

## Implementation Approach

**Terminal-first MVP (Approach A):** Build a real working PTY session before any UI polish. Validate the Rust ↔ xterm.js pipeline first. Add sidebar, workspaces, and persistence once a single real terminal works end-to-end.

Milestone order:
1. Single PTY session renders in WebView (no sidebar)
2. Multiple sessions, basic tab/list switching
3. Sidebar UI with session naming and roles
4. Workspace grouping and persistence
5. Session restore on reopen
6. WSL session type
7. Recent folder flow
8. Compact sidebar mode
9. Status bar
10. Polish + open source release
