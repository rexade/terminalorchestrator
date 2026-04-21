# MVP 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the fragile terminal foundation for a stable one — `TerminalViewport` interface enforced in TypeScript, `wezterm-term` VT state tracking in Rust, workspace root in the data model — with no visible UX changes.

**Architecture:** `portable-pty` (already WezTerm's crate) stays; `wezterm-term` is added alongside it to maintain per-session VT state on the Rust side. xterm.js moves behind a `TerminalViewport` TypeScript interface so no component touches it directly. The DOM-hacking `MutationObserver` in `TerminalPane.tsx` is removed entirely.

**Tech Stack:** Rust (Tauri 2, portable-pty 0.8, wezterm-term), TypeScript (React, Zustand, @xterm/xterm behind interface)

---

## File Map

**Create:**
- `src-tauri/src/vt/mod.rs` — `VtSession` struct: owns a `wezterm_term::Terminal`, exposes `advance(&data)` to feed PTY bytes into it
- `src-tauri/src/vt/null_writer.rs` — `NullWriter` (no-op `std::io::Write` required by wezterm-term constructor)
- `src/lib/terminal-viewport.ts` — `TerminalViewport` interface + `XtermViewport` class (wraps xterm.js, the only place xterm.js is touched)
- `src/test/lib/terminal-viewport.test.ts` — unit tests for `XtermViewport`

**Modify:**
- `src-tauri/Cargo.toml` — add `wezterm-term`
- `src-tauri/src/lib.rs` — declare `mod vt`
- `src-tauri/src/state.rs` — add `vt_sessions: Arc<Mutex<HashMap<String, VtSession>>>`
- `src-tauri/src/commands.rs` — feed PTY output to `VtSession`; create/remove `VtSession` on session lifecycle
- `src/types/session.ts` — add `root: string | null` to `Workspace`
- `src/store/sessions.ts` — `addWorkspace` accepts optional `root`, stores it
- `src-tauri/src/session.rs` — add `root: Option<String>` to `Workspace`
- `src/components/TerminalPane.tsx` — use `XtermViewport` instead of `Terminal`; remove `MutationObserver` DOM hack

---

## Task 1: Add wezterm-term to Cargo.toml

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Check latest wezterm-term version**

```bash
cargo search wezterm-term
```

Note the version number from the output (e.g. `0.22.0`).

- [ ] **Step 2: Add wezterm-term dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:

```toml
wezterm-term = "0.22"
```

(Replace `0.22` with the version from Step 1.)

- [ ] **Step 3: Verify it resolves**

```bash
cd src-tauri && cargo fetch
```

Expected: no errors. If version not found, re-run `cargo search wezterm-term` and use the exact version shown.

---

## Task 2: NullWriter

**Files:**
- Create: `src-tauri/src/vt/null_writer.rs`

`wezterm-term`'s `Terminal::new` requires a `Box<dyn std::io::Write + Send>` for writing terminal response sequences (e.g. cursor position reports) back to the PTY. We don't need those responses in the turn detector, so we discard them.

- [ ] **Step 1: Write the test**

Create `src-tauri/src/vt/null_writer.rs` with this test first:

```rust
pub struct NullWriter;

impl std::io::Write for NullWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn null_writer_accepts_bytes_and_reports_written() {
        let mut w = NullWriter;
        let n = w.write(b"hello").unwrap();
        assert_eq!(n, 5);
    }

    #[test]
    fn null_writer_flush_succeeds() {
        let mut w = NullWriter;
        assert!(w.flush().is_ok());
    }
}
```

- [ ] **Step 2: Run the tests**

```bash
cd src-tauri && cargo test vt::null_writer
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/vt/null_writer.rs
git commit -m "feat: add NullWriter for wezterm-term response sink"
```

---

## Task 3: VtSession

**Files:**
- Create: `src-tauri/src/vt/mod.rs`

`VtSession` wraps a `wezterm_term::Terminal` and exposes `advance(&[u8])` to feed PTY output into it. This is the foundation for turn detection in MVP 1.

- [ ] **Step 1: Write the failing test first**

Create `src-tauri/src/vt/mod.rs`:

```rust
pub mod null_writer;
use null_writer::NullWriter;
use std::sync::Arc;
use wezterm_term::{Terminal, TerminalSize};

pub struct VtSession {
    terminal: Terminal,
}

impl VtSession {
    pub fn new(cols: u16, rows: u16) -> Self {
        let size = TerminalSize {
            rows: rows as usize,
            cols: cols as usize,
            pixel_width: 0,
            pixel_height: 0,
            dpi: 72,
        };
        let terminal = Terminal::new(
            size,
            Arc::new(wezterm_term::config::TermConfig::default()),
            "termorchestra",
            env!("CARGO_PKG_VERSION"),
            Box::new(NullWriter),
        );
        Self { terminal }
    }

    pub fn advance(&mut self, data: &[u8]) {
        self.terminal.advance_bytes(data);
    }

    pub fn resize(&mut self, cols: u16, rows: u16) {
        let size = TerminalSize {
            rows: rows as usize,
            cols: cols as usize,
            pixel_width: 0,
            pixel_height: 0,
            dpi: 72,
        };
        let _ = self.terminal.resize(size);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_creates_session_with_given_dimensions() {
        let vt = VtSession::new(80, 24);
        let screen = vt.terminal.screen();
        assert_eq!(screen.physical_cols, 80);
        assert_eq!(screen.physical_rows, 24);
    }

    #[test]
    fn advance_accepts_plain_text_without_panic() {
        let mut vt = VtSession::new(80, 24);
        vt.advance(b"hello world\r\n");
        // If we get here without panic, the VT parser accepted the bytes.
    }

    #[test]
    fn advance_accepts_ansi_sequences_without_panic() {
        let mut vt = VtSession::new(80, 24);
        vt.advance(b"\x1b[32mgreen text\x1b[0m\r\n");
    }

    #[test]
    fn resize_changes_dimensions() {
        let mut vt = VtSession::new(80, 24);
        vt.resize(120, 40);
        let screen = vt.terminal.screen();
        assert_eq!(screen.physical_cols, 120);
        assert_eq!(screen.physical_rows, 40);
    }
}
```

- [ ] **Step 2: Run tests — expect compile errors first**

```bash
cd src-tauri && cargo test vt 2>&1 | head -40
```

If `wezterm-term` API doesn't match exactly (field names differ, etc.), check the docs:

```bash
cargo doc --open -p wezterm-term
```

Adjust the `TerminalSize` fields and `Terminal::new` signature to match. The four things to verify: struct field names in `TerminalSize`, `Terminal::new` parameter order, `advance_bytes` method name, `screen()` return type field names.

- [ ] **Step 3: Fix until tests pass**

```bash
cd src-tauri && cargo test vt
```

Expected: 4 tests pass.

- [ ] **Step 4: Register the module in lib.rs**

In `src-tauri/src/lib.rs`, add before the other `mod` declarations:

```rust
mod vt;
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vt/mod.rs src-tauri/src/vt/null_writer.rs src-tauri/src/lib.rs
git commit -m "feat: add VtSession backed by wezterm-term"
```

---

## Task 4: Wire VtSession into AppState and PTY lifecycle

**Files:**
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/commands.rs`

Each PTY session gets a `VtSession`. PTY output is fed to it on every chunk. The session is cleaned up when the PTY exits.

- [ ] **Step 1: Add vt_sessions to AppState**

Replace the entire contents of `src-tauri/src/state.rs` with:

```rust
use crate::vt::VtSession;
use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex};

pub struct PtyHandle {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn portable_pty::MasterPty + Send>,
}

#[derive(Default)]
pub struct AppState {
    pub ptys: Arc<Mutex<HashMap<String, PtyHandle>>>,
    pub vt_sessions: Arc<Mutex<HashMap<String, VtSession>>>,
}
```

- [ ] **Step 2: Run cargo check**

```bash
cd src-tauri && cargo check
```

Expected: no errors (VtSession is now in scope via `crate::vt::VtSession`).

- [ ] **Step 3: Wire VtSession creation and output feeding in create_session**

In `src-tauri/src/commands.rs`, replace the `create_session` command with:

```rust
#[command]
pub async fn create_session(
    name: String,
    role: SessionRole,
    session_type: SessionType,
    cwd: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let _ = name;
    let session_id = Uuid::new_v4().to_string();
    let id_clone = session_id.clone();
    let id_clone2 = session_id.clone();
    let app_clone = app.clone();

    let (shell, args, spawn_cwd) = match session_type {
        SessionType::Wsl => (
            "wsl.exe".to_string(),
            vec!["--cd".to_string(), cwd.clone()],
            "~".to_string(),
        ),
        SessionType::PowerShell => ("powershell.exe".to_string(), vec![], cwd.clone()),
        _ => {
            #[cfg(target_os = "windows")]
            { ("cmd.exe".to_string(), vec![], cwd.clone()) }
            #[cfg(not(target_os = "windows"))]
            { (std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()), vec![], cwd.clone()) }
        }
    };

    let config = PtySpawnConfig { cwd: spawn_cwd, shell, args, cols, rows };

    // Create VtSession before spawning so the closure can reference it
    let vt_sessions_for_output = Arc::clone(&state.vt_sessions);
    {
        let mut sessions = state.vt_sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.clone(), crate::vt::VtSession::new(cols, rows));
    }

    let ptys_for_exit = Arc::clone(&state.ptys);
    let vt_sessions_for_exit = Arc::clone(&state.vt_sessions);
    let id_for_exit = session_id.clone();
    let app_for_exit = app.clone();

    let pty = spawn_pty(
        config,
        move |data| {
            let _ = app_clone.emit(&format!("pty_output_{}", id_clone), data.clone());
            if let Ok(mut sessions) = vt_sessions_for_output.lock() {
                if let Some(vt) = sessions.get_mut(&id_clone2) {
                    vt.advance(&data);
                }
            }
        },
        move || {
            if let Ok(mut ptys) = ptys_for_exit.lock() {
                ptys.remove(&id_for_exit);
            }
            if let Ok(mut sessions) = vt_sessions_for_exit.lock() {
                sessions.remove(&id_for_exit);
            }
            let _ = app_for_exit.emit("session_exited", id_for_exit.clone());
        },
    )?;

    let mut writer = pty.writer;
    if role == SessionRole::Claude {
        let _ = writer.write_all(b"claude\r\n");
    }

    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    ptys.insert(session_id.clone(), PtyHandle { writer, master: pty.master });

    Ok(session_id)
}
```

Note: `id_clone2` captures the session ID for the VtSession lookup inside the output closure. Two clones are needed because `id_clone` is already moved into the `emit` call.

- [ ] **Step 4: Update kill_session to remove VtSession**

In `src-tauri/src/commands.rs`, replace the `kill_session` command with:

```rust
#[command]
pub async fn kill_session(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    ptys.remove(&id);
    let mut vt_sessions = state.vt_sessions.lock().map_err(|e| e.to_string())?;
    vt_sessions.remove(&id);
    Ok(())
}
```

- [ ] **Step 5: Update resize_pty to also resize VtSession**

In `src-tauri/src/commands.rs`, replace `resize_pty` with:

```rust
#[command]
pub async fn resize_pty(id: String, cols: u16, rows: u16, state: State<'_, AppState>) -> Result<(), String> {
    let ptys = state.ptys.lock().map_err(|e| e.to_string())?;
    if let Some(pty) = ptys.get(&id) {
        pty.master.resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    drop(ptys);
    let mut vt_sessions = state.vt_sessions.lock().map_err(|e| e.to_string())?;
    if let Some(vt) = vt_sessions.get_mut(&id) {
        vt.resize(cols, rows);
    }
    Ok(())
}
```

- [ ] **Step 6: Build and check for errors**

```bash
cd src-tauri && cargo build 2>&1 | head -60
```

Fix any borrow or unused variable errors. The most common issue: `id_clone2` might conflict — if so, rename to `vt_id`.

- [ ] **Step 7: Run existing Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: all existing tests pass. The `spawned_pty_exposes_master_for_resize` and `on_exit_called_when_shell_exits` tests in `pty/manager.rs` should still pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/state.rs src-tauri/src/commands.rs
git commit -m "feat: wire VtSession into PTY lifecycle and output stream"
```

---

## Task 5: TerminalViewport TypeScript interface

**Files:**
- Create: `src/lib/terminal-viewport.ts`
- Create: `src/test/lib/terminal-viewport.test.ts`

This is the enforced boundary. No component imports from `@xterm/xterm` directly after this task. All xterm.js access goes through `XtermViewport`.

- [ ] **Step 1: Write the interface and implementation**

Create `src/lib/terminal-viewport.ts`:

```typescript
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"

/** The only interface components may use to interact with a terminal renderer. */
export interface TerminalViewport {
  /** Attach the renderer to a DOM container. Call once. */
  mount(container: HTMLElement): void
  /** Feed raw PTY output bytes to the renderer. */
  write(data: Uint8Array | number[]): void
  /** Resize the renderer to match the container. */
  fit(): void
  /** Report current terminal dimensions. */
  dimensions(): { cols: number; rows: number }
  /** Register a callback invoked when the user's text selection changes. */
  onSelectionChange(cb: (text: string) => void): void
  /** Register a callback invoked when the user types or pastes. */
  onData(cb: (data: string) => void): void
  /** Register a callback invoked on each scroll event with whether view is at bottom. */
  onScroll(cb: (atBottom: boolean) => void): void
  /** Scroll the viewport to the most recent output. */
  scrollToBottom(): void
  /** Release all resources. Call when the session is removed. */
  dispose(): void
}

const THEME = {
  background: "#0d1117",
  foreground: "#e6edf3",
  cursor: "#58a6ff",
  selectionBackground: "#1f6feb66",
} as const

/** xterm.js implementation of TerminalViewport. */
export class XtermViewport implements TerminalViewport {
  private term: Terminal
  private fitAddon: FitAddon
  private resizeObserver: ResizeObserver | null = null

  constructor() {
    this.term = new Terminal({
      theme: THEME,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      scrollback: 5000,
      copyOnSelect: true,
    })
    this.fitAddon = new FitAddon()
    this.term.loadAddon(this.fitAddon)
  }

  mount(container: HTMLElement): void {
    this.term.open(container)
    this.fitAddon.fit()
    this.resizeObserver = new ResizeObserver(() => {
      this.fitAddon.fit()
    })
    this.resizeObserver.observe(container)
  }

  write(data: Uint8Array | number[]): void {
    this.term.write(data instanceof Uint8Array ? data : new Uint8Array(data))
  }

  fit(): void {
    this.fitAddon.fit()
  }

  dimensions(): { cols: number; rows: number } {
    return { cols: this.term.cols, rows: this.term.rows }
  }

  onSelectionChange(cb: (text: string) => void): void {
    this.term.onSelectionChange(() => {
      cb(this.term.getSelection())
    })
  }

  onData(cb: (data: string) => void): void {
    this.term.onData(cb)
  }

  onScroll(cb: (atBottom: boolean) => void): void {
    this.term.onScroll(() => {
      const buffer = this.term.buffer.active
      const atBottom = buffer.viewportY >= buffer.length - this.term.rows
      cb(atBottom)
    })
  }

  scrollToBottom(): void {
    this.term.scrollToBottom()
  }

  dispose(): void {
    this.resizeObserver?.disconnect()
    this.term.dispose()
  }
}
```

- [ ] **Step 2: Write tests**

Create `src/test/lib/terminal-viewport.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { XtermViewport } from "../../lib/terminal-viewport"

// xterm.js is mocked globally in src/test/setup.ts — 
// these tests verify the XtermViewport wiring, not xterm internals.
describe("XtermViewport", () => {
  let viewport: XtermViewport

  beforeEach(() => {
    viewport = new XtermViewport()
  })

  it("mount calls term.open and fitAddon.fit", () => {
    const container = document.createElement("div")
    // Should not throw
    expect(() => viewport.mount(container)).not.toThrow()
  })

  it("dimensions returns cols and rows", () => {
    const d = viewport.dimensions()
    expect(typeof d.cols).toBe("number")
    expect(typeof d.rows).toBe("number")
  })

  it("write accepts Uint8Array without throwing", () => {
    expect(() => viewport.write(new Uint8Array([72, 101, 108, 108, 111]))).not.toThrow()
  })

  it("write accepts number[] without throwing", () => {
    expect(() => viewport.write([72, 101, 108, 108, 111])).not.toThrow()
  })

  it("dispose does not throw", () => {
    expect(() => viewport.dispose()).not.toThrow()
  })

  it("onData registers callback", () => {
    const cb = vi.fn()
    viewport.onData(cb)
    // Actual invocation tested via TerminalPane integration
  })
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- terminal-viewport
```

Expected: all pass. If xterm.js mock doesn't cover `FitAddon`, check `src/test/setup.ts` and add a mock:

```typescript
// In src/test/setup.ts — add if missing:
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  })),
}))
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/terminal-viewport.ts src/test/lib/terminal-viewport.test.ts
git commit -m "feat: add TerminalViewport interface and XtermViewport implementation"
```

---

## Task 6: Refactor TerminalPane to use TerminalViewport

**Files:**
- Modify: `src/components/TerminalPane.tsx`

Remove all direct xterm.js imports and the `MutationObserver` DOM hack. `TerminalPane` uses only `TerminalViewport`.

- [ ] **Step 1: Replace TerminalPane.tsx**

```typescript
import { useEffect, useRef } from "react"
import { listen } from "@tauri-apps/api/event"
import { writePty, resizePty } from "../lib/tauri"
import { XtermViewport } from "../lib/terminal-viewport"
import type { TerminalViewport } from "../lib/terminal-viewport"

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
}

export function TerminalPane({
  sessionId,
  isActive,
  onScrollChange,
  scrollToBottomRef,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<TerminalViewport | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const viewport = new XtermViewport()
    viewport.mount(containerRef.current)
    viewportRef.current = viewport

    const { cols, rows } = viewport.dimensions()
    void resizePty(sessionId, cols, rows)

    viewport.onData((data) => {
      writePty(sessionId, data)
    })

    viewport.onScroll((atBottom) => {
      onScrollChange?.(atBottom)
    })

    viewport.onSelectionChange((text) => {
      if (text) navigator.clipboard.writeText(text).catch(() => {})
    })

    const unlistenPromise = listen<number[]>(`pty_output_${sessionId}`, (event) => {
      viewport.write(event.payload)
    })

    return () => {
      unlistenPromise.then((fn) => fn())
      viewport.dispose()
      viewportRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    if (!scrollToBottomRef) return
    scrollToBottomRef.current = () => {
      viewportRef.current?.scrollToBottom()
    }
    return () => {
      if (scrollToBottomRef) scrollToBottomRef.current = null
    }
  }, [scrollToBottomRef])

  return (
    <div
      ref={containerRef}
      style={{ display: isActive ? "flex" : "none" }}
      className="flex-1 overflow-hidden"
    />
  )
}
```

Note: `role` prop is removed — it was only used by the MutationObserver hack. If callers still pass it, TypeScript will warn; remove the prop from call sites.

- [ ] **Step 2: Check for TypeScript errors**

```bash
pnpm typecheck
```

Fix any "Property 'role' does not exist" errors by removing `role` from the prop list at each call site in the codebase. Search:

```bash
grep -r "role=" src/components/ src/App.tsx
```

Remove `role={...}` from any `<TerminalPane` usage.

- [ ] **Step 3: Run all frontend tests**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 4: Verify no @xterm/xterm imports remain outside terminal-viewport.ts**

```bash
grep -r "@xterm" src/ --include="*.ts" --include="*.tsx" | grep -v terminal-viewport.ts
```

Expected: no output. If any files appear, move their xterm.js usage into `XtermViewport`.

- [ ] **Step 5: Commit**

```bash
git add src/components/TerminalPane.tsx
git commit -m "refactor: TerminalPane uses TerminalViewport, removes MutationObserver DOM hack"
```

---

## Task 7: Add workspace root to data model

**Files:**
- Modify: `src/types/session.ts`
- Modify: `src/store/sessions.ts`
- Modify: `src-tauri/src/session.rs`

The workspace `root` is the default cwd for new sessions — separate from each session's individual cwd.

- [ ] **Step 1: Add root to TypeScript Workspace type**

In `src/types/session.ts`, update the `Workspace` interface:

```typescript
export interface Workspace {
  id: string
  name: string
  root: string | null        // ← add this line
  sessions: Session[]
  lastOpenedSessionId: string | null
}
```

- [ ] **Step 2: Update the store to accept and persist root**

In `src/store/sessions.ts`, update `addWorkspace`:

```typescript
addWorkspace: (name, root?: string | null) => {
  const ws: Workspace = {
    id: crypto.randomUUID(),
    name,
    root: root ?? null,        // ← add this
    sessions: [],
    lastOpenedSessionId: null,
  }
  set((s) => ({
    workspaces: [...s.workspaces, ws],
    activeWorkspaceId: s.activeWorkspaceId ?? ws.id,
  }))
},
```

Update the `SessionStore` interface signature:

```typescript
addWorkspace: (name: string, root?: string | null) => void
```

- [ ] **Step 3: Run store tests**

```bash
pnpm test -- sessions
```

Fix any type errors. Existing tests that call `addWorkspace("name")` still work because `root` is optional.

- [ ] **Step 4: Add root to Rust Workspace**

In `src-tauri/src/session.rs`, update the `Workspace` struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub root: Option<String>,   // ← add this line
    pub sessions: Vec<Session>,
    pub last_opened_session_id: Option<String>,
}
```

`#[serde(default)]` means old persisted JSON without `root` deserializes without error.

- [ ] **Step 5: Run Rust tests**

```bash
cd src-tauri && cargo test session
```

Expected: existing `session_serializes_to_json` and `session_type_deserializes` tests still pass.

- [ ] **Step 6: Typecheck everything**

```bash
pnpm typecheck && cd src-tauri && cargo check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/session.ts src/store/sessions.ts src-tauri/src/session.rs
git commit -m "feat: add workspace root to data model"
```

---

## Task 8: End-to-end smoke test

- [ ] **Step 1: Run all tests**

```bash
pnpm test && cd src-tauri && cargo test
```

Expected: all pass.

- [ ] **Step 2: Start the dev server and open the app**

```bash
pnpm tauri dev
```

- [ ] **Step 3: Verify core session lifecycle**

Perform each action and confirm the expected result:

| Action | Expected |
|---|---|
| Open app | No crash, existing workspaces restore |
| Create a new session | Terminal opens, shell prompt appears |
| Type `echo hello` + Enter | Output appears in terminal |
| Resize the window | Terminal reflows correctly, no visual corruption |
| Close the session | Session disappears from list, no zombie process |
| Create a Claude session | `claude` is typed automatically, Claude starts |

- [ ] **Step 4: Verify no xterm.js leaks in DevTools**

Open DevTools → Console. There should be no errors about `Terminal`, `FitAddon`, or `xterm`.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: MVP 0 foundation complete — TerminalViewport enforced, VtSession wired"
```

---

## Done When

- All Rust tests pass (`cargo test`)
- All frontend tests pass (`pnpm test`)
- No TypeScript errors (`pnpm typecheck`)
- No direct `@xterm/xterm` imports outside `terminal-viewport.ts`
- Sessions spawn, display output, resize, and close without issues in `pnpm tauri dev`
- `VtSession` is created and cleaned up with each PTY session
