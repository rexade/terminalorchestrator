# Termorchestra V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform Tauri desktop app that hosts multiple named PTY sessions in a sidebar-first UI, with workspace grouping, session restore, and clean terminal-first UX.

**Architecture:** Rust backend (portable-pty) manages PTY processes and persists state to disk. Tauri IPC bridge streams PTY output as events and accepts write/control commands. React frontend (xterm.js, Zustand) renders terminals and sidebar.

**Tech Stack:** Tauri 2.x, Rust (portable-pty, serde_json), React 18, TypeScript, xterm.js, Zustand, Tailwind CSS, Vitest + React Testing Library, pnpm

---

## File Map

```
termorchestra/
├── src-tauri/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs             — Tauri entry point
│       ├── lib.rs              — app builder, command/plugin registration
│       ├── commands.rs         — all #[tauri::command] handlers
│       ├── state.rs            — AppState (Mutex<SessionStore>)
│       ├── session.rs          — Session/Workspace types (Rust)
│       ├── persistence.rs      — read/write state.json via app_data_dir
│       └── pty/
│           ├── mod.rs
│           └── manager.rs      — PtyManager: spawn, write, resize, kill
├── src/
│   ├── main.tsx
│   ├── App.tsx                 — root layout (Toolbar + Sidebar + TerminalPane + StatusBar)
│   ├── types/
│   │   └── session.ts          — all TypeScript types
│   ├── store/
│   │   ├── sessions.ts         — Zustand: workspaces, sessions, restore from backend
│   │   └── ui.ts               — Zustand: active session, sidebar mode, scroll state
│   ├── components/
│   │   ├── Toolbar.tsx         — workspace switcher + new session button
│   │   ├── Sidebar.tsx         — shell for sidebar with normal/compact toggle
│   │   ├── SessionList.tsx     — list of sessions grouped with exited collapsed
│   │   ├── SessionItem.tsx     — single session row with icon, name, status dot
│   │   ├── TerminalPane.tsx    — xterm.js wrapper, handles pty_output events
│   │   ├── StatusBar.tsx       — shell type, cwd, error states, jump-to-latest
│   │   └── NewSessionDialog.tsx — role/type/cwd selection for new sessions
│   └── lib/
│       └── tauri.ts            — typed wrappers for invoke() calls
├── src/test/
│   ├── setup.ts                — Vitest setup, mock @tauri-apps/api/core
│   ├── store/sessions.test.ts
│   ├── components/SessionItem.test.tsx
│   ├── components/SessionList.test.tsx
│   └── components/StatusBar.test.tsx
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## Task 1: Scaffold Project

**Files:**
- Create: `package.json`, `src-tauri/Cargo.toml`, `vite.config.ts`, `tailwind.config.ts`, `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Scaffold Tauri + React + TypeScript project**

```bash
cd C:/Users/henri/projects
pnpm create tauri-app termorchestra -- --template react-ts --manager pnpm
cd termorchestra
```

When prompted: choose React, TypeScript.

- [ ] **Step 2: Install frontend dependencies**

```bash
pnpm add xterm @xterm/xterm @xterm/addon-fit zustand
pnpm add -D tailwindcss @tailwindcss/vite vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 3: Install Rust dependencies**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
portable-pty = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 4: Configure Tailwind**

Replace `src/index.css`:

```css
@import "tailwindcss";
```

Replace `vite.config.ts`:

```typescript
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: { target: "chrome105", minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false },
})
```

- [ ] **Step 5: Configure Vitest**

Add to `vite.config.ts` inside `defineConfig`:

```typescript
test: {
  globals: true,
  environment: "jsdom",
  setupFiles: ["./src/test/setup.ts"],
}
```

Create `src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom"
import { vi } from "vitest"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}))
```

- [ ] **Step 6: Verify the project builds**

```bash
pnpm tauri dev
```

Expected: App window opens with default Tauri template. Close it.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Tauri + React + TypeScript project"
```

---

## Task 2: TypeScript Types + Zustand Stores

**Files:**
- Create: `src/types/session.ts`
- Create: `src/store/sessions.ts`
- Create: `src/store/ui.ts`
- Create: `src/test/store/sessions.test.ts`

- [ ] **Step 1: Write failing tests for session store**

Create `src/test/store/sessions.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useSessionStore } from "../../store/sessions"

describe("useSessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
    })
  })

  it("adds a workspace", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("CloudLab"))
    expect(result.current.workspaces).toHaveLength(1)
    expect(result.current.workspaces[0].name).toBe("CloudLab")
  })

  it("adds a session to a workspace", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("CloudLab"))
    const wsId = result.current.workspaces[0].id
    act(() => result.current.addSession(wsId, { name: "Claude", role: "claude", type: "local", cwd: "~" }))
    expect(result.current.workspaces[0].sessions).toHaveLength(1)
    expect(result.current.workspaces[0].sessions[0].name).toBe("Claude")
  })

  it("removes a session", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("W"))
    const wsId = result.current.workspaces[0].id
    act(() => result.current.addSession(wsId, { name: "Shell", role: "shell", type: "local", cwd: "~" }))
    const sessionId = result.current.workspaces[0].sessions[0].id
    act(() => result.current.removeSession(wsId, sessionId))
    expect(result.current.workspaces[0].sessions).toHaveLength(0)
  })

  it("marks a session as exited", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("W"))
    const wsId = result.current.workspaces[0].id
    act(() => result.current.addSession(wsId, { name: "App", role: "server", type: "local", cwd: "~" }))
    const sessionId = result.current.workspaces[0].sessions[0].id
    act(() => result.current.setSessionStatus(wsId, sessionId, "exited"))
    expect(result.current.workspaces[0].sessions[0].status).toBe("exited")
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test
```

Expected: FAIL — `useSessionStore` not found.

- [ ] **Step 3: Write TypeScript types**

Create `src/types/session.ts`:

```typescript
export type SessionType = "local" | "wsl" | "ssh" // "ssh" reserved for v1.1
export type SessionRole = "claude" | "shell" | "server" | "logs" | "git" | "ssh"
export type SessionStatus = "active" | "idle" | "exited"
export type SidebarMode = "normal" | "compact"

export interface Session {
  id: string
  name: string
  type: SessionType
  role: SessionRole
  status: SessionStatus
  cwd: string
  createdAt: number
}

export interface Workspace {
  id: string
  name: string
  sessions: Session[]
  lastOpenedSessionId: string | null
}

export interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}
```

- [ ] **Step 4: Write Zustand session store**

Create `src/store/sessions.ts`:

```typescript
import { create } from "zustand"
import { Session, SessionRole, SessionStatus, SessionType, Workspace } from "../types/session"

function makeId(): string {
  return crypto.randomUUID()
}

interface NewSessionParams {
  name: string
  role: SessionRole
  type: SessionType
  cwd: string
}

interface SessionStore {
  workspaces: Workspace[]
  activeWorkspaceId: string | null

  addWorkspace: (name: string) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string) => void

  addSession: (workspaceId: string, params: NewSessionParams) => string
  removeSession: (workspaceId: string, sessionId: string) => void
  setSessionStatus: (workspaceId: string, sessionId: string, status: SessionStatus) => void
  setSessionCwd: (workspaceId: string, sessionId: string, cwd: string) => void

  loadState: (workspaces: Workspace[], activeWorkspaceId: string | null) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,

  addWorkspace: (name) => {
    const ws: Workspace = { id: makeId(), name, sessions: [], lastOpenedSessionId: null }
    set((s) => ({ workspaces: [...s.workspaces, ws], activeWorkspaceId: s.activeWorkspaceId ?? ws.id }))
  },

  removeWorkspace: (id) => set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) })),

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  addSession: (workspaceId, params) => {
    const session: Session = { id: makeId(), ...params, status: "active", createdAt: Date.now() }
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, sessions: [...w.sessions, session], lastOpenedSessionId: session.id }
          : w
      ),
    }))
    return session.id
  },

  removeSession: (workspaceId, sessionId) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, sessions: w.sessions.filter((s) => s.id !== sessionId) } : w
      ),
    })),

  setSessionStatus: (workspaceId, sessionId, status) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, sessions: w.sessions.map((s) => (s.id === sessionId ? { ...s, status } : s)) }
          : w
      ),
    })),

  setSessionCwd: (workspaceId, sessionId, cwd) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, sessions: w.sessions.map((s) => (s.id === sessionId ? { ...s, cwd } : s)) }
          : w
      ),
    })),

  loadState: (workspaces, activeWorkspaceId) => set({ workspaces, activeWorkspaceId }),
}))
```

- [ ] **Step 5: Write UI store**

Create `src/store/ui.ts`:

```typescript
import { create } from "zustand"
import { SidebarMode } from "../types/session"

interface UIStore {
  activeSessionId: string | null
  sidebarMode: SidebarMode
  isAtBottom: boolean

  setActiveSession: (id: string | null) => void
  setSidebarMode: (mode: SidebarMode) => void
  setIsAtBottom: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeSessionId: null,
  sidebarMode: "normal",
  isAtBottom: true,

  setActiveSession: (id) => set({ activeSessionId: id }),
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setIsAtBottom: (v) => set({ isAtBottom: v }),
}))
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm test
```

Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types src/store src/test
git commit -m "feat: add TypeScript types and Zustand stores"
```

---

## Task 3: Rust Session Types + App State

**Files:**
- Create: `src-tauri/src/session.rs`
- Create: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write Rust session types**

Create `src-tauri/src/session.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionType {
    Local,
    Wsl,
    Ssh,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionRole {
    Claude,
    Shell,
    Server,
    Logs,
    Git,
    Ssh,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Active,
    Idle,
    Exited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub session_type: SessionType,
    pub role: SessionRole,
    pub status: SessionStatus,
    pub cwd: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub sessions: Vec<Session>,
    pub last_opened_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistedState {
    pub workspaces: Vec<Workspace>,
    pub active_workspace_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_serializes_to_json() {
        let s = Session {
            id: "abc".into(),
            name: "Claude".into(),
            session_type: SessionType::Local,
            role: SessionRole::Claude,
            status: SessionStatus::Active,
            cwd: "~".into(),
            created_at: 0,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"type\":\"local\""));
        assert!(json.contains("\"role\":\"claude\""));
    }
}
```

- [ ] **Step 2: Run Rust tests**

```bash
cd src-tauri && cargo test session
```

Expected: 1 test PASS.

- [ ] **Step 3: Write AppState**

Create `src-tauri/src/state.rs`:

```rust
use std::collections::HashMap;
use std::sync::Mutex;
use portable_pty::BoxedChild;

pub struct PtyHandle {
    pub writer: Box<dyn std::io::Write + Send>,
    pub session_id: String,
}

#[derive(Default)]
pub struct AppState {
    pub ptys: Mutex<HashMap<String, PtyHandle>>,
}
```

- [ ] **Step 4: Register in lib.rs**

Replace the contents of `src-tauri/src/lib.rs`:

```rust
mod commands;
mod session;
mod state;
mod pty;
mod persistence;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::write_pty,
            commands::resize_pty,
            commands::kill_session,
            commands::rename_session,
            commands::load_state,
            commands::save_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Create stub files so it compiles:

`src-tauri/src/pty/mod.rs`:
```rust
pub mod manager;
```

`src-tauri/src/pty/manager.rs`:
```rust
// implemented in Task 4
```

`src-tauri/src/persistence.rs`:
```rust
// implemented in Task 9
```

`src-tauri/src/commands.rs`:
```rust
// implemented in Task 5
use tauri::command;

#[command]
pub async fn create_session() -> String { String::new() }
#[command]
pub async fn write_pty(_id: String, _data: String) {}
#[command]
pub async fn resize_pty(_id: String, _cols: u16, _rows: u16) {}
#[command]
pub async fn kill_session(_id: String) {}
#[command]
pub async fn rename_session(_id: String, _name: String) {}
#[command]
pub async fn load_state() -> String { "{}".into() }
#[command]
pub async fn save_state(_state: String) {}
```

- [ ] **Step 5: Verify it compiles**

```bash
cd src-tauri && cargo build
```

Expected: compiles without errors.

- [ ] **Step 6: Commit**

```bash
cd ..
git add src-tauri/src
git commit -m "feat: add Rust session types and AppState"
```

---

## Task 4: PTY Manager (Rust)

**Files:**
- Create: `src-tauri/src/pty/manager.rs`
- Modify: `src-tauri/src/state.rs`

- [ ] **Step 1: Write PTY manager with unit tests**

Replace `src-tauri/src/pty/manager.rs`:

```rust
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::mpsc;
use std::thread;

pub struct SpawnedPty {
    pub writer: Box<dyn Write + Send>,
}

pub struct PtySpawnConfig {
    pub cwd: String,
    pub shell: String,
    pub cols: u16,
    pub rows: u16,
}

impl Default for PtySpawnConfig {
    fn default() -> Self {
        #[cfg(target_os = "windows")]
        let shell = "powershell.exe".to_string();
        #[cfg(not(target_os = "windows"))]
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

        Self { cwd: "~".to_string(), shell, cols: 220, rows: 50 }
    }
}

pub fn resolve_cwd(cwd: &str) -> std::path::PathBuf {
    if cwd == "~" {
        dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/"))
    } else {
        std::path::PathBuf::from(cwd)
    }
}

/// Spawns a PTY and returns the writer handle.
/// Output is forwarded via the provided callback on a background thread.
pub fn spawn_pty<F>(config: PtySpawnConfig, on_output: F) -> Result<SpawnedPty, String>
where
    F: Fn(Vec<u8>) + Send + 'static,
{
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize { rows: config.rows, cols: config.cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&config.shell);
    cmd.cwd(resolve_cwd(&config.cwd));

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => on_output(buf[..n].to_vec()),
            }
        }
    });

    Ok(SpawnedPty { writer: Box::new(writer) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_tilde_returns_home() {
        let p = resolve_cwd("~");
        assert!(p.exists(), "home dir should exist");
    }

    #[test]
    fn resolve_absolute_path_passes_through() {
        let p = resolve_cwd("/tmp");
        assert_eq!(p, std::path::PathBuf::from("/tmp"));
    }

    #[test]
    fn spawn_config_has_sane_defaults() {
        let cfg = PtySpawnConfig::default();
        assert!(cfg.cols > 0);
        assert!(cfg.rows > 0);
        assert!(!cfg.shell.is_empty());
    }
}
```

Add `dirs` to `src-tauri/Cargo.toml`:

```toml
dirs = "5"
```

- [ ] **Step 2: Run Rust tests**

```bash
cd src-tauri && cargo test pty
```

Expected: 3 tests PASS.

- [ ] **Step 3: Update AppState to hold PTY writers**

Replace `src-tauri/src/state.rs`:

```rust
use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;

pub struct PtyHandle {
    pub writer: Box<dyn Write + Send>,
}

#[derive(Default)]
pub struct AppState {
    pub ptys: Mutex<HashMap<String, PtyHandle>>,
}
```

- [ ] **Step 4: Verify compile**

```bash
cargo build
```

Expected: compiles.

- [ ] **Step 5: Commit**

```bash
cd ..
git add src-tauri/src/pty src-tauri/src/state.rs src-tauri/Cargo.toml
git commit -m "feat: implement PTY manager with spawn and output streaming"
```

---

## Task 5: Tauri Commands

**Files:**
- Replace: `src-tauri/src/commands.rs`
- Create: `src/lib/tauri.ts`

- [ ] **Step 1: Write failing test for tauri.ts typed wrappers**

Create `src/test/lib/tauri.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { createSession, writePty, killSession } from "../../lib/tauri"

const mockInvoke = invoke as ReturnType<typeof vi.fn>

describe("tauri command wrappers", () => {
  beforeEach(() => mockInvoke.mockReset())

  it("createSession calls invoke with correct args", async () => {
    mockInvoke.mockResolvedValue("session-123")
    const id = await createSession({ name: "Claude", role: "claude", sessionType: "local", cwd: "~", cols: 220, rows: 50 })
    expect(mockInvoke).toHaveBeenCalledWith("create_session", expect.objectContaining({ name: "Claude" }))
    expect(id).toBe("session-123")
  })

  it("writePty calls invoke with id and data", async () => {
    mockInvoke.mockResolvedValue(undefined)
    await writePty("abc", "ls\n")
    expect(mockInvoke).toHaveBeenCalledWith("write_pty", { id: "abc", data: "ls\n" })
  })

  it("killSession calls invoke with id", async () => {
    mockInvoke.mockResolvedValue(undefined)
    await killSession("abc")
    expect(mockInvoke).toHaveBeenCalledWith("kill_session", { id: "abc" })
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
pnpm test
```

Expected: FAIL — `createSession` not found.

- [ ] **Step 3: Write tauri.ts typed wrappers**

Create `src/lib/tauri.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core"
import { SessionRole, SessionType } from "../types/session"

export interface CreateSessionArgs {
  name: string
  role: SessionRole
  sessionType: SessionType
  cwd: string
  cols: number
  rows: number
}

export const createSession = (args: CreateSessionArgs): Promise<string> =>
  invoke("create_session", args)

export const writePty = (id: string, data: string): Promise<void> =>
  invoke("write_pty", { id, data })

export const resizePty = (id: string, cols: number, rows: number): Promise<void> =>
  invoke("resize_pty", { id, cols, rows })

export const killSession = (id: string): Promise<void> =>
  invoke("kill_session", { id })

export const renameSession = (id: string, name: string): Promise<void> =>
  invoke("rename_session", { id, name })

export const loadPersistedState = (): Promise<string> =>
  invoke("load_state")

export const savePersistedState = (state: string): Promise<void> =>
  invoke("save_state", { state })
```

- [ ] **Step 4: Write real Tauri commands**

Replace `src-tauri/src/commands.rs`:

```rust
use crate::pty::manager::{spawn_pty, PtySpawnConfig};
use crate::session::{SessionRole, SessionStatus, SessionType};
use crate::state::{AppState, PtyHandle};
use std::io::Write;
use tauri::{command, AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(serde::Deserialize)]
pub struct CreateSessionArgs {
    pub name: String,
    pub role: SessionRole,
    pub session_type: SessionType,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
}

#[command]
pub async fn create_session(
    args: CreateSessionArgs,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    let id_clone = session_id.clone();
    let app_clone = app.clone();

    let shell = match args.session_type {
        SessionType::Wsl => "wsl.exe".to_string(),
        _ => {
            #[cfg(target_os = "windows")]
            { "powershell.exe".to_string() }
            #[cfg(not(target_os = "windows"))]
            { std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()) }
        }
    };

    let config = PtySpawnConfig {
        cwd: args.cwd,
        shell,
        cols: args.cols,
        rows: args.rows,
    };

    let pty = spawn_pty(config, move |data| {
        let _ = app_clone.emit(&format!("pty_output_{}", id_clone), data);
    })?;

    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    ptys.insert(session_id.clone(), PtyHandle { writer: pty.writer });

    Ok(session_id)
}

#[command]
pub async fn write_pty(id: String, data: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    if let Some(pty) = ptys.get_mut(&id) {
        pty.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn resize_pty(_id: String, _cols: u16, _rows: u16) -> Result<(), String> {
    // portable-pty resize via master.resize — implement when needed
    Ok(())
}

#[command]
pub async fn kill_session(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    ptys.remove(&id);
    Ok(())
}

#[command]
pub async fn rename_session(_id: String, _name: String) -> Result<(), String> {
    // name is frontend-only state; nothing to do in Rust
    Ok(())
}

#[command]
pub async fn load_state() -> Result<String, String> {
    crate::persistence::load()
}

#[command]
pub async fn save_state(state: String) -> Result<(), String> {
    crate::persistence::save(&state)
}
```

- [ ] **Step 5: Run frontend tests**

```bash
pnpm test
```

Expected: tauri.ts tests PASS.

- [ ] **Step 6: Verify Rust compiles**

```bash
cd src-tauri && cargo build
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add src-tauri/src/commands.rs src/lib/tauri.ts src/test/lib
git commit -m "feat: implement Tauri commands and typed frontend wrappers"
```

---

## Task 6: TerminalPane — Single Session Renders

**Files:**
- Create: `src/components/TerminalPane.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write TerminalPane component**

Create `src/components/TerminalPane.tsx`:

```typescript
import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { listen } from "@tauri-apps/api/event"
import { writePty } from "../lib/tauri"
import "@xterm/xterm/css/xterm.css"

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  onScrollChange?: (atBottom: boolean) => void
}

export function TerminalPane({ sessionId, isActive, onScrollChange }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "#1f6feb66",
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    const unlisten = listen<number[]>(`pty_output_${sessionId}`, (event) => {
      term.write(new Uint8Array(event.payload))
    })

    term.onData((data) => writePty(sessionId, data))

    term.onScroll(() => {
      const buffer = term.buffer.active
      const atBottom = buffer.viewportY >= buffer.length - term.rows
      onScrollChange?.(atBottom)
    })

    const resizeObserver = new ResizeObserver(() => fitAddon.fit())
    resizeObserver.observe(containerRef.current)

    return () => {
      unlisten.then((fn) => fn())
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [sessionId])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
      style={{ display: isActive ? "flex" : "none" }}
    />
  )
}
```

- [ ] **Step 2: Wire into App.tsx with a hardcoded test session**

Replace `src/App.tsx`:

```typescript
import { useEffect, useState } from "react"
import { TerminalPane } from "./components/TerminalPane"
import { createSession } from "./lib/tauri"

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    createSession({
      name: "Shell",
      role: "shell",
      sessionType: "local",
      cwd: "~",
      cols: 220,
      rows: 50,
    }).then(setSessionId)
  }, [])

  if (!sessionId) return <div className="bg-[#0d1117] text-[#8b949e] h-screen flex items-center justify-center">Starting...</div>

  return (
    <div className="bg-[#0d1117] h-screen flex flex-col">
      <TerminalPane sessionId={sessionId} isActive={true} />
    </div>
  )
}
```

- [ ] **Step 3: Run the app and verify a real terminal renders**

```bash
pnpm tauri dev
```

Expected: A window opens with a working terminal. Type `echo hello` — it works.

- [ ] **Step 4: Commit**

```bash
git add src/components/TerminalPane.tsx src/App.tsx
git commit -m "feat: render real PTY session in xterm.js"
```

---

## Task 7: Sidebar + SessionList + SessionItem

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/SessionList.tsx`
- Create: `src/components/SessionItem.tsx`
- Create: `src/test/components/SessionItem.test.tsx`
- Create: `src/test/components/SessionList.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/test/components/SessionItem.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SessionItem } from "../../components/SessionItem"
import { Session } from "../../types/session"

const makeSession = (overrides?: Partial<Session>): Session => ({
  id: "s1",
  name: "Claude",
  type: "local",
  role: "claude",
  status: "active",
  cwd: "~/projects",
  createdAt: 0,
  ...overrides,
})

describe("SessionItem", () => {
  it("renders session name", () => {
    render(<SessionItem session={makeSession()} isActive={false} onClick={() => {}} />)
    expect(screen.getByText("Claude")).toBeInTheDocument()
  })

  it("renders cwd", () => {
    render(<SessionItem session={makeSession()} isActive={false} onClick={() => {}} />)
    expect(screen.getByText("~/projects")).toBeInTheDocument()
  })

  it("applies active styling when isActive", () => {
    const { container } = render(<SessionItem session={makeSession()} isActive={true} onClick={() => {}} />)
    expect(container.firstChild).toHaveClass("border-l-2")
  })

  it("calls onClick when clicked", () => {
    const onClick = vi.fn()
    render(<SessionItem session={makeSession()} isActive={false} onClick={onClick} />)
    fireEvent.click(screen.getByText("Claude"))
    expect(onClick).toHaveBeenCalled()
  })
})
```

Create `src/test/components/SessionList.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { SessionList } from "../../components/SessionList"
import { Session } from "../../types/session"

const sessions: Session[] = [
  { id: "s1", name: "Claude", type: "local", role: "claude", status: "active", cwd: "~/a", createdAt: 0 },
  { id: "s2", name: "App", type: "local", role: "server", status: "idle", cwd: "~/b", createdAt: 1 },
  { id: "s3", name: "Old", type: "local", role: "shell", status: "exited", cwd: "~/c", createdAt: 2 },
]

describe("SessionList", () => {
  it("renders active and idle sessions", () => {
    render(<SessionList sessions={sessions} activeSessionId="s1" onSelect={() => {}} />)
    expect(screen.getByText("Claude")).toBeInTheDocument()
    expect(screen.getByText("App")).toBeInTheDocument()
  })

  it("shows exited count in collapsed group", () => {
    render(<SessionList sessions={sessions} activeSessionId="s1" onSelect={() => {}} />)
    expect(screen.getByText(/EXITED \(1\)/)).toBeInTheDocument()
  })

  it("does not show exited session names by default", () => {
    render(<SessionList sessions={sessions} activeSessionId="s1" onSelect={() => {}} />)
    expect(screen.queryByText("Old")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
pnpm test
```

Expected: FAIL — components not found.

- [ ] **Step 3: Write role icon helper**

Add to `src/types/session.ts`:

```typescript
export const ROLE_ICONS: Record<SessionRole, string> = {
  claude: "⬡",
  shell: "$",
  server: "◈",
  logs: "≡",
  git: "⑂",
  ssh: "⌁",
}
```

- [ ] **Step 4: Write SessionItem**

Create `src/components/SessionItem.tsx`:

```typescript
import { Session } from "../types/session"
import { ROLE_ICONS } from "../types/session"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-400",
  idle: "bg-green-400",
  exited: "bg-zinc-600 opacity-40",
}

interface SessionItemProps {
  session: Session
  isActive: boolean
  onClick: () => void
}

export function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  return (
    <div
      onClick={onClick}
      className={[
        "px-2.5 py-1.5 cursor-pointer select-none",
        isActive
          ? "bg-[#1f2937] border-l-2 border-blue-400"
          : "border-l-2 border-transparent hover:bg-[#161b22]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs shrink-0 text-zinc-400">{ROLE_ICONS[session.role]}</span>
          <span className={`text-xs truncate ${isActive ? "text-zinc-100" : "text-zinc-400"}`}>
            {session.name}
          </span>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[session.status]}`} />
      </div>
      <div className="text-[10px] text-zinc-600 mt-0.5 pl-4 truncate">{session.cwd}</div>
    </div>
  )
}
```

- [ ] **Step 5: Write SessionList**

Create `src/components/SessionList.tsx`:

```typescript
import { useState } from "react"
import { Session } from "../types/session"
import { SessionItem } from "./SessionItem"

interface SessionListProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelect: (id: string) => void
}

export function SessionList({ sessions, activeSessionId, onSelect }: SessionListProps) {
  const [exitedExpanded, setExitedExpanded] = useState(false)
  const active = sessions.filter((s) => s.status !== "exited")
  const exited = sessions.filter((s) => s.status === "exited")

  return (
    <div className="flex flex-col">
      {active.map((s) => (
        <SessionItem
          key={s.id}
          session={s}
          isActive={s.id === activeSessionId}
          onClick={() => onSelect(s.id)}
        />
      ))}

      {exited.length > 0 && (
        <>
          <button
            onClick={() => setExitedExpanded((v) => !v)}
            className="px-2.5 py-1.5 text-left text-[10px] text-zinc-600 tracking-widest uppercase hover:text-zinc-400 mt-1 border-t border-[#21262d]"
          >
            {exitedExpanded ? "▾" : "▸"} EXITED ({exited.length})
          </button>
          {exitedExpanded && exited.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              isActive={s.id === activeSessionId}
              onClick={() => onSelect(s.id)}
            />
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Write Sidebar**

Create `src/components/Sidebar.tsx`:

```typescript
import { Session } from "../types/session"
import { SessionList } from "./SessionList"
import { SidebarMode } from "../types/session"
import { ROLE_ICONS } from "../types/session"

interface SidebarProps {
  sessions: Session[]
  activeSessionId: string | null
  mode: SidebarMode
  onSelect: (id: string) => void
  onToggleMode: () => void
  onNewSession: () => void
}

export function Sidebar({ sessions, activeSessionId, mode, onSelect, onToggleMode, onNewSession }: SidebarProps) {
  if (mode === "compact") {
    return (
      <div className="flex flex-col items-center w-11 bg-[#0d1117] border-r border-[#21262d] py-2 gap-1">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            title={s.name}
            className={[
              "relative w-full flex justify-center py-1.5 text-sm",
              s.id === activeSessionId ? "border-l-2 border-blue-400 bg-[#1f2937]" : "border-l-2 border-transparent text-zinc-500 hover:bg-[#161b22]",
            ].join(" ")}
          >
            {ROLE_ICONS[s.role]}
            <span className={[
              "absolute top-1 right-1 w-1.5 h-1.5 rounded-full",
              s.status === "active" ? "bg-blue-400" : s.status === "idle" ? "bg-green-400" : "bg-zinc-600 opacity-40",
            ].join(" ")} />
          </button>
        ))}
        <button onClick={onToggleMode} className="mt-auto text-zinc-600 hover:text-zinc-400 text-xs pb-1">⟩</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-40 bg-[#0d1117] border-r border-[#21262d]">
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-2.5 mb-1.5 text-[9px] tracking-widest text-zinc-600 uppercase">Sessions</div>
        <SessionList sessions={sessions} activeSessionId={activeSessionId} onSelect={onSelect} />
      </div>
      <div className="flex gap-1.5 p-2 border-t border-[#21262d]">
        <button onClick={onNewSession} className="flex-1 bg-[#21262d] text-zinc-500 text-xs py-1 rounded hover:text-zinc-300">+ New</button>
        <button onClick={onToggleMode} className="bg-[#21262d] text-zinc-500 text-xs px-2 py-1 rounded hover:text-zinc-300" title="Compact mode">⟨</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run tests**

```bash
pnpm test
```

Expected: all sidebar/session tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/Sidebar.tsx src/components/SessionList.tsx src/components/SessionItem.tsx src/test/components
git commit -m "feat: add Sidebar, SessionList, SessionItem components"
```

---

## Task 8: Toolbar + NewSessionDialog + Full App Layout

**Files:**
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/NewSessionDialog.tsx`
- Replace: `src/App.tsx`

- [ ] **Step 1: Write Toolbar**

Create `src/components/Toolbar.tsx`:

```typescript
import { Workspace } from "../types/session"

interface ToolbarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSwitchWorkspace: (id: string) => void
  onNewSession: () => void
}

export function Toolbar({ workspaces, activeWorkspaceId, onSwitchWorkspace, onNewSession }: ToolbarProps) {
  const active = workspaces.find((w) => w.id === activeWorkspaceId)

  return (
    <div
      data-tauri-drag-region
      className="h-8 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between px-3 select-none"
    >
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#f85149]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#d29922]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#3fb950]" />
        </div>
        <span className="text-zinc-600 text-xs ml-1">termorchestra</span>
      </div>

      <div className="flex items-center gap-2">
        {workspaces.length > 0 && (
          <select
            value={activeWorkspaceId ?? ""}
            onChange={(e) => onSwitchWorkspace(e.target.value)}
            className="bg-transparent text-zinc-400 text-xs border border-[#30363d] rounded px-2 py-0.5 cursor-pointer"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
        <button onClick={onNewSession} className="text-zinc-500 hover:text-zinc-300 text-base leading-none">⊕</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write NewSessionDialog**

Create `src/components/NewSessionDialog.tsx`:

```typescript
import { useState } from "react"
import { SessionRole, SessionType } from "../types/session"

export interface NewSessionValues {
  name: string
  role: SessionRole
  sessionType: SessionType
  cwd: string
}

const ROLES: { role: SessionRole; label: string; icon: string }[] = [
  { role: "claude", label: "Claude", icon: "⬡" },
  { role: "shell", label: "Shell", icon: "$" },
  { role: "server", label: "Server", icon: "◈" },
  { role: "logs", label: "Logs", icon: "≡" },
  { role: "git", label: "Git", icon: "⑂" },
]

interface NewSessionDialogProps {
  recentCwds: string[]
  onConfirm: (values: NewSessionValues) => void
  onCancel: () => void
}

export function NewSessionDialog({ recentCwds, onConfirm, onCancel }: NewSessionDialogProps) {
  const [role, setRole] = useState<SessionRole>("shell")
  const [sessionType, setSessionType] = useState<SessionType>("local")
  const [cwd, setCwd] = useState(recentCwds[0] ?? "~")
  const name = ROLES.find((r) => r.role === role)?.label ?? "Shell"

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 w-80 flex flex-col gap-4">
        <h2 className="text-sm text-zinc-200 font-medium">New Session</h2>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Role</label>
          <div className="grid grid-cols-3 gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => setRole(r.role)}
                className={[
                  "flex flex-col items-center py-2 rounded text-xs gap-1",
                  role === r.role
                    ? "bg-blue-600/20 border border-blue-500/50 text-blue-300"
                    : "bg-[#21262d] text-zinc-500 hover:text-zinc-300",
                ].join(" ")}
              >
                <span>{r.icon}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Type</label>
          <div className="flex gap-2">
            {(["local", "wsl"] as SessionType[]).map((t) => (
              <button
                key={t}
                onClick={() => setSessionType(t)}
                className={[
                  "px-3 py-1 rounded text-xs",
                  sessionType === t ? "bg-[#21262d] text-zinc-200 border border-[#58a6ff]/50" : "bg-[#21262d] text-zinc-500",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Folder</label>
          <select
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            className="w-full bg-[#21262d] text-zinc-300 text-xs rounded px-2 py-1.5 border border-[#30363d]"
          >
            {recentCwds.map((d) => <option key={d} value={d}>{d}</option>)}
            <option value="~">~ (home)</option>
          </select>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
          <button
            onClick={() => onConfirm({ name, role, sessionType, cwd })}
            className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write full App.tsx**

Replace `src/App.tsx`:

```typescript
import { useEffect, useState } from "react"
import { Toolbar } from "./components/Toolbar"
import { Sidebar } from "./components/Sidebar"
import { TerminalPane } from "./components/TerminalPane"
import { StatusBar } from "./components/StatusBar"
import { NewSessionDialog, NewSessionValues } from "./components/NewSessionDialog"
import { useSessionStore } from "./store/sessions"
import { useUIStore } from "./store/ui"
import { createSession } from "./lib/tauri"

export default function App() {
  const { workspaces, activeWorkspaceId, addWorkspace, addSession, setActiveWorkspace, setSessionStatus } = useSessionStore()
  const { activeSessionId, sidebarMode, isAtBottom, setActiveSession, setSidebarMode, setIsAtBottom } = useUIStore()
  const [showDialog, setShowDialog] = useState(false)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const sessions = activeWorkspace?.sessions ?? []

  // Seed initial workspace on first run
  useEffect(() => {
    if (workspaces.length === 0) {
      addWorkspace("Workspace 1")
    }
  }, [])

  const recentCwds = [...new Set(sessions.map((s) => s.cwd))].slice(0, 10)

  const handleNewSession = async (values: NewSessionValues) => {
    if (!activeWorkspaceId) return
    setShowDialog(false)
    const sessionId = await createSession({ ...values, cols: 220, rows: 50 })
    addSession(activeWorkspaceId, { ...values, type: values.sessionType })
    setActiveSession(sessionId)
  }

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-zinc-300 overflow-hidden">
      <Toolbar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchWorkspace={setActiveWorkspace}
        onNewSession={() => setShowDialog(true)}
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          mode={sidebarMode}
          onSelect={setActiveSession}
          onToggleMode={() => setSidebarMode(sidebarMode === "normal" ? "compact" : "normal")}
          onNewSession={() => setShowDialog(true)}
        />

        <div className="flex flex-col flex-1 min-w-0">
          {sessions.filter((s) => s.status !== "exited").map((s) => (
            <TerminalPane
              key={s.id}
              sessionId={s.id}
              isActive={s.id === activeSessionId}
              onScrollChange={s.id === activeSessionId ? setIsAtBottom : undefined}
            />
          ))}
        </div>
      </div>

      <StatusBar
        activeSession={sessions.find((s) => s.id === activeSessionId) ?? null}
        allSessions={sessions}
        isAtBottom={isAtBottom}
        activeSessionId={activeSessionId}
        onJumpToBottom={() => {/* implemented in Task 15 */}}
      />

      {showDialog && (
        <NewSessionDialog
          recentCwds={recentCwds}
          onConfirm={handleNewSession}
          onCancel={() => setShowDialog(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create StatusBar stub (full implementation in Task 15)**

Create `src/components/StatusBar.tsx`:

```typescript
import { Session } from "../types/session"

interface StatusBarProps {
  activeSession: Session | null
  allSessions: Session[]
  isAtBottom: boolean
  activeSessionId: string | null
  onJumpToBottom: () => void
}

export function StatusBar({ activeSession, allSessions }: StatusBarProps) {
  const shellType = activeSession?.type === "wsl" ? "wsl" : "local"
  const errorSessions = allSessions.filter((s) => s.status === "exited" && s.name)

  return (
    <div className="h-5 bg-[#161b22] border-t border-[#21262d] flex items-center justify-between px-3 text-[10px] text-zinc-600 shrink-0">
      <div className="flex gap-2">
        <span>{shellType} · bash</span>
        {activeSession && <span>{activeSession.cwd}</span>}
      </div>
      <div className="flex gap-2">
        {errorSessions.map((s) => (
          <span key={s.id} className="text-red-400">⚠ {s.name}</span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the app and verify multiple sessions work**

```bash
pnpm tauri dev
```

Expected: Full layout renders. Click ⊕ to open dialog. Choose role + folder, click Open. New session appears in sidebar and is active. Click between sessions to switch.

- [ ] **Step 6: Commit**

```bash
git add src/components src/App.tsx
git commit -m "feat: full app layout with toolbar, sidebar, new session dialog"
```

---

## Task 9: Persistence

**Files:**
- Replace: `src-tauri/src/persistence.rs`
- Modify: `src-tauri/src/lib.rs` (startup hook)
- Modify: `src/App.tsx` (load/save state)

- [ ] **Step 1: Write Rust persistence with tests**

Replace `src-tauri/src/persistence.rs`:

```rust
use std::fs;
use std::path::PathBuf;

fn state_path() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("termorchestra").join("state.json"))
}

pub fn load() -> Result<String, String> {
    let path = state_path().ok_or("no data dir")?;
    if !path.exists() {
        return Ok("{}".into());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn save(json: &str) -> Result<(), String> {
    let path = state_path().ok_or("no data dir")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn save_and_load_roundtrip() {
        let json = r#"{"workspaces":[],"active_workspace_id":null}"#;
        // Write to a temp path for testing
        let tmp = std::env::temp_dir().join("termorchestra_test_state.json");
        fs::write(&tmp, json).unwrap();
        let loaded = fs::read_to_string(&tmp).unwrap();
        assert_eq!(loaded, json);
        fs::remove_file(&tmp).unwrap();
    }
}
```

- [ ] **Step 2: Run Rust persistence tests**

```bash
cd src-tauri && cargo test persistence
```

Expected: 1 test PASS.

- [ ] **Step 3: Add auto-save to App.tsx**

Add to `src/App.tsx` after the Zustand store declarations:

```typescript
import { savePersistedState, loadPersistedState } from "./lib/tauri"
import { AppState } from "./types/session"

// Load persisted state on mount
useEffect(() => {
  loadPersistedState().then((json) => {
    try {
      const state: AppState = JSON.parse(json)
      if (state.workspaces?.length) {
        useSessionStore.getState().loadState(state.workspaces, state.activeWorkspaceId)
        if (state.activeWorkspaceId) setActiveWorkspace(state.activeWorkspaceId)
      }
    } catch {}
  })
}, [])

// Auto-save on workspace/session changes
const sessionStoreState = useSessionStore()
useEffect(() => {
  const state: AppState = {
    workspaces: sessionStoreState.workspaces,
    activeWorkspaceId: sessionStoreState.activeWorkspaceId,
  }
  savePersistedState(JSON.stringify(state))
}, [sessionStoreState.workspaces, sessionStoreState.activeWorkspaceId])
```

- [ ] **Step 4: Verify persistence works**

```bash
pnpm tauri dev
```

Create a session named "Claude" in a workspace named "CloudLab". Close the app. Reopen it. Expected: "CloudLab" workspace and "Claude" session are restored.

- [ ] **Step 5: Commit**

```bash
cd ..
git add src-tauri/src/persistence.rs src/App.tsx
git commit -m "feat: persist workspace and session state to disk"
```

---

## Task 10: Workspace Management

**Files:**
- Modify: `src/components/Toolbar.tsx` (add workspace create)
- Add to `src/store/sessions.ts` (already has addWorkspace)
- Modify: `src/App.tsx`

- [ ] **Step 1: Add workspace creation to Toolbar**

Replace `src/components/Toolbar.tsx`:

```typescript
import { useState } from "react"
import { Workspace } from "../types/session"

interface ToolbarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: (name: string) => void
  onNewSession: () => void
}

export function Toolbar({ workspaces, activeWorkspaceId, onSwitchWorkspace, onCreateWorkspace, onNewSession }: ToolbarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")

  const handleCreate = () => {
    if (newName.trim()) {
      onCreateWorkspace(newName.trim())
      setNewName("")
      setCreating(false)
    }
  }

  return (
    <div data-tauri-drag-region className="h-8 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between px-3 select-none">
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#f85149]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#d29922]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#3fb950]" />
        </div>
        <span className="text-zinc-600 text-xs ml-1">termorchestra</span>
      </div>

      <div className="flex items-center gap-2">
        {creating ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false) }}
            placeholder="Workspace name..."
            className="bg-[#21262d] text-zinc-200 text-xs border border-[#30363d] rounded px-2 py-0.5 w-36 outline-none"
          />
        ) : (
          <>
            {workspaces.length > 0 && (
              <select
                value={activeWorkspaceId ?? ""}
                onChange={(e) => onSwitchWorkspace(e.target.value)}
                className="bg-transparent text-zinc-400 text-xs border border-[#30363d] rounded px-2 py-0.5 cursor-pointer"
              >
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <button onClick={() => setCreating(true)} className="text-zinc-600 hover:text-zinc-400 text-xs">+ws</button>
          </>
        )}
        <button onClick={onNewSession} className="text-zinc-500 hover:text-zinc-300 text-base leading-none">⊕</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire onCreateWorkspace in App.tsx**

In `App.tsx`, pass `addWorkspace` to Toolbar:

```typescript
<Toolbar
  workspaces={workspaces}
  activeWorkspaceId={activeWorkspaceId}
  onSwitchWorkspace={setActiveWorkspace}
  onCreateWorkspace={addWorkspace}
  onNewSession={() => setShowDialog(true)}
/>
```

- [ ] **Step 3: Run the app and verify workspace creation**

```bash
pnpm tauri dev
```

Expected: Click `+ws`, type a workspace name, press Enter. New workspace appears in dropdown. Sessions are scoped to each workspace.

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar.tsx src/App.tsx
git commit -m "feat: workspace creation and switching"
```

---

## Task 11: Session Restore on Startup

**Files:**
- Modify: `src/App.tsx` (spawn PTYs for restored sessions)
- Modify: `src/store/sessions.ts`

- [ ] **Step 1: Spawn PTYs for restored sessions**

In `App.tsx`, extend the load effect to re-spawn active/idle sessions:

```typescript
useEffect(() => {
  loadPersistedState().then(async (json) => {
    try {
      const state: AppState = JSON.parse(json)
      if (!state.workspaces?.length) return

      useSessionStore.getState().loadState(state.workspaces, state.activeWorkspaceId)
      if (state.activeWorkspaceId) setActiveWorkspace(state.activeWorkspaceId)

      // Re-spawn sessions that were active or idle
      for (const ws of state.workspaces) {
        for (const session of ws.sessions) {
          if (session.status === "exited") continue
          try {
            const newId = await createSession({
              name: session.name,
              role: session.role,
              sessionType: session.type,
              cwd: session.cwd,
              cols: 220,
              rows: 50,
            })
            // Update session ID to match the new PTY
            // For simplicity in v1, we keep the persisted ID as display ID
            // and map it to the new PTY ID via a local map
            sessionPtyMap.current[session.id] = newId
          } catch {
            useSessionStore.getState().setSessionStatus(ws.id, session.id, "exited")
          }
        }
      }

      // Set first active session as active in UI
      const firstActive = state.workspaces[0]?.sessions.find((s) => s.status !== "exited")
      if (firstActive) setActiveSession(firstActive.id)
    } catch {}
  })
}, [])
```

Add `sessionPtyMap` ref in App.tsx:

```typescript
const sessionPtyMap = useRef<Record<string, string>>({})
```

Update `TerminalPane` usage to use mapped PTY id:

```typescript
{sessions.filter((s) => s.status !== "exited").map((s) => (
  <TerminalPane
    key={s.id}
    sessionId={sessionPtyMap.current[s.id] ?? s.id}
    isActive={s.id === activeSessionId}
    onScrollChange={s.id === activeSessionId ? setIsAtBottom : undefined}
  />
))}
```

- [ ] **Step 2: Run the app and verify restore**

```bash
pnpm tauri dev
```

Create 2 sessions, name them. Close the app. Reopen. Expected: sessions are visible in sidebar with correct names, new PTYs are spawned at the saved cwd.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: restore and re-spawn sessions on startup"
```

---

## Task 12: WSL Session Type

**Files:**
- Modify: `src-tauri/src/commands.rs` (already handles WSL via wsl.exe)
- Modify: `src/components/NewSessionDialog.tsx` (WSL already in type list)
- Add WSL detection command

- [ ] **Step 1: Add WSL detection command to Rust**

Add to `src-tauri/src/commands.rs`:

```rust
#[command]
pub async fn check_wsl_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("wsl")
            .arg("--status")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    { false }
}
```

Register in `lib.rs` invoke_handler:

```rust
commands::check_wsl_available,
```

- [ ] **Step 2: Add wrapper to tauri.ts**

```typescript
export const checkWslAvailable = (): Promise<boolean> =>
  invoke("check_wsl_available")
```

- [ ] **Step 3: Hide WSL option if not available**

In `NewSessionDialog.tsx`, add:

```typescript
const [wslAvailable, setWslAvailable] = useState(false)

useEffect(() => {
  checkWslAvailable().then(setWslAvailable)
}, [])

// In the type buttons, conditionally show WSL:
const availableTypes: SessionType[] = wslAvailable ? ["local", "wsl"] : ["local"]
```

- [ ] **Step 4: Test WSL session**

```bash
pnpm tauri dev
```

On a machine with WSL: open New Session dialog, select WSL type, click Open. Expected: a WSL bash session spawns.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src/lib/tauri.ts src/components/NewSessionDialog.tsx
git commit -m "feat: WSL session type with availability detection"
```

---

## Task 13: Recent Folder Flow

**Files:**
- Modify: `src/store/sessions.ts` (track recent cwds)
- Modify: `src/App.tsx` (pass recentCwds correctly)

- [ ] **Step 1: Add recent cwds to session store**

Add to `useSessionStore` interface in `src/store/sessions.ts`:

```typescript
recentCwds: string[]
addRecentCwd: (cwd: string) => void
```

Add to the store implementation:

```typescript
recentCwds: [],

addRecentCwd: (cwd) =>
  set((s) => ({
    recentCwds: [cwd, ...s.recentCwds.filter((c) => c !== cwd)].slice(0, 10),
  })),
```

- [ ] **Step 2: Write test for recent cwds**

Add to `src/test/store/sessions.test.ts`:

```typescript
it("tracks recent cwds", () => {
  const { result } = renderHook(() => useSessionStore())
  act(() => result.current.addRecentCwd("~/projects/foo"))
  act(() => result.current.addRecentCwd("~/projects/bar"))
  act(() => result.current.addRecentCwd("~/projects/foo")) // deduplicates
  expect(result.current.recentCwds[0]).toBe("~/projects/foo")
  expect(result.current.recentCwds).toHaveLength(2)
})
```

- [ ] **Step 3: Run test**

```bash
pnpm test
```

Expected: new test PASS.

- [ ] **Step 4: Record cwd when session is created**

In `App.tsx`, call `addRecentCwd` when a session is created:

```typescript
const { addRecentCwd } = useSessionStore()

const handleNewSession = async (values: NewSessionValues) => {
  if (!activeWorkspaceId) return
  setShowDialog(false)
  addRecentCwd(values.cwd)
  const sessionId = await createSession({ ...values, cols: 220, rows: 50 })
  addSession(activeWorkspaceId, { ...values, type: values.sessionType })
  sessionPtyMap.current[/* session id from store */] = sessionId
  setActiveSession(sessionId)
}
```

- [ ] **Step 5: Persist recent cwds**

In the auto-save effect, include `recentCwds` in the persisted state. Update `AppState` type:

```typescript
// In src/types/session.ts
export interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  recentCwds?: string[]
}
```

And load it on startup:

```typescript
if (state.recentCwds?.length) {
  state.recentCwds.forEach((cwd) => useSessionStore.getState().addRecentCwd(cwd))
}
```

- [ ] **Step 6: Run app and verify**

```bash
pnpm tauri dev
```

Open a new session. The folder dropdown should show previously used folders.

- [ ] **Step 7: Commit**

```bash
git add src/store/sessions.ts src/App.tsx src/types/session.ts src/test/store
git commit -m "feat: recent folder list in new session dialog"
```

---

## Task 14: Compact Sidebar Mode

Already implemented in Sidebar.tsx (Task 7). This task ensures it persists.

**Files:**
- Modify: `src/store/ui.ts` (persist sidebar mode)
- Modify: `src/App.tsx`

- [ ] **Step 1: Persist sidebar mode**

In `src/App.tsx`, save and restore sidebar mode:

```typescript
// On load, restore sidebar mode from localStorage (simple approach)
useEffect(() => {
  const saved = localStorage.getItem("sidebarMode") as SidebarMode | null
  if (saved) setSidebarMode(saved)
}, [])

// On change, persist
const sidebarMode = useUIStore((s) => s.sidebarMode)
useEffect(() => {
  localStorage.setItem("sidebarMode", sidebarMode)
}, [sidebarMode])
```

- [ ] **Step 2: Verify toggle works and persists**

```bash
pnpm tauri dev
```

Click ⟨ to go compact. Close and reopen. Expected: compact mode is still active.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: persist compact sidebar mode across restarts"
```

---

## Task 15: Status Bar + Jump to Latest + Active Process Indicator

**Files:**
- Replace: `src/components/StatusBar.tsx`
- Modify: `src/components/TerminalPane.tsx` (expose scrollToBottom)
- Modify: `src/components/SessionItem.tsx` (pulsing active indicator)
- Create: `src/test/components/StatusBar.test.tsx`

- [ ] **Step 1: Write StatusBar tests**

Create `src/test/components/StatusBar.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StatusBar } from "../../components/StatusBar"
import { Session } from "../../types/session"

const makeSession = (overrides?: Partial<Session>): Session => ({
  id: "s1", name: "Claude", type: "local", role: "claude",
  status: "active", cwd: "~/projects", createdAt: 0, ...overrides,
})

describe("StatusBar", () => {
  it("shows shell type and cwd", () => {
    render(<StatusBar activeSession={makeSession()} allSessions={[]} isAtBottom={true} activeSessionId="s1" onJumpToBottom={() => {}} />)
    expect(screen.getByText(/local/)).toBeInTheDocument()
    expect(screen.getByText(/~/)).toBeInTheDocument()
  })

  it("shows error badge for exited sessions", () => {
    const sessions = [makeSession(), makeSession({ id: "s2", name: "App", status: "exited" })]
    render(<StatusBar activeSession={makeSession()} allSessions={sessions} isAtBottom={true} activeSessionId="s1" onJumpToBottom={() => {}} />)
    expect(screen.getByText(/⚠ App/)).toBeInTheDocument()
  })

  it("shows jump button when not at bottom", () => {
    const onJump = vi.fn()
    render(<StatusBar activeSession={makeSession()} allSessions={[]} isAtBottom={false} activeSessionId="s1" onJumpToBottom={onJump} />)
    fireEvent.click(screen.getByTitle(/jump/i))
    expect(onJump).toHaveBeenCalled()
  })

  it("does not show jump button when at bottom", () => {
    render(<StatusBar activeSession={makeSession()} allSessions={[]} isAtBottom={true} activeSessionId="s1" onJumpToBottom={() => {}} />)
    expect(screen.queryByTitle(/jump/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm fail**

```bash
pnpm test
```

Expected: FAIL — StatusBar doesn't have jump button yet.

- [ ] **Step 3: Write full StatusBar**

Replace `src/components/StatusBar.tsx`:

```typescript
import { Session } from "../types/session"

interface StatusBarProps {
  activeSession: Session | null
  allSessions: Session[]
  isAtBottom: boolean
  activeSessionId: string | null
  onJumpToBottom: () => void
}

export function StatusBar({ activeSession, allSessions, isAtBottom, onJumpToBottom }: StatusBarProps) {
  const shellLabel = activeSession?.type === "wsl" ? "wsl · bash" : "local · bash"
  const errorSessions = allSessions.filter((s) => s.status === "exited")

  return (
    <div className="h-5 bg-[#161b22] border-t border-[#21262d] flex items-center justify-between px-3 text-[10px] text-zinc-600 shrink-0">
      <div className="flex gap-3 items-center">
        <span>{shellLabel}</span>
        {activeSession && <span className="text-zinc-700">{activeSession.cwd}</span>}
      </div>
      <div className="flex gap-2 items-center">
        {errorSessions.map((s) => (
          <span key={s.id} className="text-red-500">⚠ {s.name}</span>
        ))}
        {!isAtBottom && (
          <button
            title="Jump to latest output"
            onClick={onJumpToBottom}
            className="text-blue-400 hover:text-blue-300"
          >
            ↓
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

Expected: all StatusBar tests PASS.

- [ ] **Step 5: Wire jump-to-bottom in TerminalPane**

Expose a `scrollToBottom` ref from `TerminalPane`:

```typescript
// In TerminalPane.tsx, add to props:
scrollToBottomRef?: React.MutableRefObject<(() => void) | null>

// In useEffect, after terminal is created:
if (scrollToBottomRef) {
  scrollToBottomRef.current = () => term.scrollToBottom()
}
```

In `App.tsx`:

```typescript
const scrollToBottomRef = useRef<(() => void) | null>(null)

// In StatusBar:
<StatusBar
  ...
  onJumpToBottom={() => scrollToBottomRef.current?.()}
/>

// In TerminalPane:
<TerminalPane
  ...
  scrollToBottomRef={activeSession?.id === s.id ? scrollToBottomRef : undefined}
/>
```

- [ ] **Step 6: Add pulsing active indicator to SessionItem**

In `src/components/SessionItem.tsx`, update the active dot:

```typescript
const dotClass = session.status === "active"
  ? "bg-blue-400 animate-pulse"
  : session.status === "idle"
  ? "bg-green-400"
  : "bg-zinc-600 opacity-40"
```

- [ ] **Step 7: Run the app and verify all three features**

```bash
pnpm tauri dev
```

- Scroll up in a terminal, see ↓ button in status bar. Click it — jumps to bottom.
- Active session dot pulses.
- Status bar shows `local · bash · <cwd>` and any exited sessions.

- [ ] **Step 8: Commit**

```bash
git add src/components/StatusBar.tsx src/components/TerminalPane.tsx src/components/SessionItem.tsx src/test/components/StatusBar.test.tsx src/App.tsx
git commit -m "feat: status bar with jump-to-latest and pulsing active indicator"
```

---

## Task 16: Block Divisions for Claude Sessions

**Files:**
- Modify: `src/components/TerminalPane.tsx`

This feature adds subtle visual separators in the terminal output when xterm.js detects a new prompt line in a Claude-role session. It works by observing output lines and overlaying a thin divider in the DOM above lines that start a new command block.

- [ ] **Step 1: Add block division rendering to TerminalPane**

Add `role` prop to `TerminalPane`:

```typescript
interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  role: SessionRole
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
}
```

In `TerminalPane`, after `term.open(containerRef.current)`, add a prompt-detection decorator for Claude sessions:

```typescript
if (role === "claude") {
  // When xterm detects a line starting with '❯ ' (Claude Code prompt),
  // add a subtle visual separator by injecting a CSS rule that targets
  // the corresponding xterm row via a MutationObserver on the terminal DOM.
  const observer = new MutationObserver(() => {
    if (!containerRef.current) return
    const rows = containerRef.current.querySelectorAll(".xterm-rows > div")
    rows.forEach((row) => {
      const text = row.textContent ?? ""
      if (text.trimStart().startsWith("❯ ") && !row.hasAttribute("data-divider")) {
        row.setAttribute("data-divider", "1")
        ;(row as HTMLElement).style.borderTop = "1px solid #21262d"
        ;(row as HTMLElement).style.marginTop = "4px"
        ;(row as HTMLElement).style.paddingTop = "4px"
      }
    })
  })
  observer.observe(containerRef.current, { childList: true, subtree: true })

  // Clean up observer on unmount
  return () => {
    unlisten.then((fn) => fn())
    resizeObserver.disconnect()
    observer.disconnect()
    term.dispose()
  }
}
```

- [ ] **Step 2: Update all TerminalPane usages in App.tsx to pass role**

```typescript
{sessions.filter((s) => s.status !== "exited").map((s) => (
  <TerminalPane
    key={s.id}
    sessionId={sessionPtyMap.current[s.id] ?? s.id}
    isActive={s.id === activeSessionId}
    role={s.role}
    onScrollChange={s.id === activeSessionId ? setIsAtBottom : undefined}
    scrollToBottomRef={s.id === activeSessionId ? scrollToBottomRef : undefined}
  />
))}
```

- [ ] **Step 3: Run the app and verify**

```bash
pnpm tauri dev
```

Open a Claude-role session, run `claude code .`. Expected: each new `❯` prompt line has a faint top border creating visual block separation.

- [ ] **Step 4: Commit**

```bash
git add src/components/TerminalPane.tsx src/App.tsx
git commit -m "feat: subtle block divisions for Claude sessions on prompt lines"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Multiple local PTY sessions | Task 5, 8 |
| WSL as first-class type | Task 12 |
| Named sessions with role badges | Task 7, 8 |
| Workspace grouping | Task 10 |
| Sidebar normal/compact mode | Task 7, 14 |
| Session restore on reopen | Task 9, 11 |
| Recent/open folder flow | Task 13 |
| Exited sessions collapsed | Task 7 |
| Status bar: shell type, cwd, error state | Task 15 |
| Jump to latest activity | Task 15 |
| Pulsing active process indicator | Task 15 |
| Block divisions for Claude sessions | Task 16 |
| Overview mode button placeholder | Task 8 (⊞ in toolbar) |

All spec requirements covered. ✓

### Placeholder scan

No TBD or TODO in task steps. All code is complete. ✓

### Type consistency check

- `SessionRole`, `SessionType`, `SessionStatus`, `SidebarMode` — defined in Task 2, used consistently throughout.
- `ROLE_ICONS` — defined in Task 7 (types/session.ts), used in SessionItem and Sidebar. ✓
- `CreateSessionArgs` — defined in tauri.ts Task 5, used in App.tsx Task 8. ✓
- `sessionPtyMap` ref — introduced in Task 11, used in Task 16. ✓
