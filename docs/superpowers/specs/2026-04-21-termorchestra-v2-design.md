# Termorchestra v2 — Design Spec
_2026-04-21_

## Product statement

A unified desktop terminal workspace built for people who run Claude Code.  
One window. Solid foundation. Sessions and turns are navigable objects, not text soup.

---

## Architecture

### Stack

| Layer | Technology |
|---|---|
| App shell | Tauri 2 |
| Frontend | React + TypeScript + Zustand + Tailwind |
| PTY management | `wezterm-portable-pty` (replaces current `portable-pty`) |
| Terminal state | `wezterm-term` (VT parser + cell model) |
| SSH | `wezterm-ssh` |
| Terminal renderer | xterm.js (behind `TerminalViewport` interface) |

### One window, no companion process

Single Tauri window. WezTerm is not a companion process or external app — its crates run inside the Tauri Rust backend as the PTY and VT state engine.

### `TerminalViewport` interface — enforced, not aspirational

xterm.js sits behind a hard interface boundary. No component in the app touches xterm.js directly. The interface exposes:

- `write(data: Uint8Array)` — feed PTY output to the renderer
- `resize(cols: number, rows: number)` — propagate resize events
- `onSelectionChange(cb)` — selection/copy hook
- `onCursorActivity(cb)` — cursor and focus events
- `setPromptMarker(row: number)` — annotate prompt rows
- `setBlockBoundary(startRow: number, endRow: number, turnId: string)` — decorate turn boundaries

If xterm.js is replaced later, the implementation swaps. Nothing else changes.

---

## Layout

### Structure

```
┌──────────────────────────────────────────────────────┐
│ [top bar 28px]                                        │
├────────┬─────────────────────────────────────────────┤
│ [rail] │ [canvas — terminal panes + turn overlays]   │
│ 44px   │                                             │
│ (icon) │                                             │
│        │                                             │
└────────┴─────────────────────────────────────────────┘
```

### Top bar

Compact (28px). Shows:
- Workspace name
- Active session name + role badge
- Branch / cwd
- Palette shortcut hint

### Left rail

Collapsible. Default state: icon-width (44px). Expanded: 160px.

Shows per session:
- Role icon (`claude` / `shell` / `git` / `logs` / `ssh`)
- Activity dot — real state only (output active, prompt waiting, Claude streaming, error)
- Session name or host alias
- Active session highlighted

Rail is for **ambient awareness and fast switching**, not file trees or configuration.

### Canvas

Terminal panes fill the canvas. Single pane by default. Split (horizontal or vertical) available via palette. Each pane renders one session through `TerminalViewport`. Claude turn blocks overlay the terminal stream inline.

### Command palette (⌘K / Ctrl+K)

Entry point for: switching workspaces, creating sessions, SSH connection, split layout, settings, pin tray. Not the only navigation — the rail handles session switching — but the primary command surface.

---

## Turn / Block Model

### Detection engine (Rust side)

A segmentation engine runs on the Rust side, reading `wezterm-term`'s cell/row model. It uses Claude-aware heuristics (prompt shape, fenced code blocks, assistant/user transitions, tool-use markers) to mark turn boundaries. It is not hardcoded to one exact prompt pattern — heuristics can evolve as Claude output format changes.

**Confidence rule:** when detection confidence is low, the output renders as a plain terminal chunk. No invented structure.

### v1 turn types

- `user` — input submitted to the shell
- `assistant` — Claude response output
- `meta` — tool calls, file reads/edits, status lines

Semantic segmentation of tool sub-types (`tool-call` vs `tool-result`) is deferred until detection is proven reliable.

### Rendering

Turns render as **ambient blocks** — soft filled background, no border, minimal visual weight. They appear inside the terminal stream, not alongside it.

- `meta` lines between turns: near-invisible grey text, icon + one-line summary
- Active/streaming turn: no special chrome, cursor blinks at end of content
- Plain chunk fallback: indistinguishable from normal terminal output

### Turn actions

Exactly three actions per turn, shown as quiet text links:

1. **copy** — copies the full turn. If a code block is focused/selected, smart-copies that instead. Not two separate buttons.
2. **pin** — saves turn to the pin tray
3. **follow up** — opens an input pre-loaded with turn ID + session/workspace context. Not a generic input box.

Inline code blocks within a turn get one additional action: **copy code**.

Nothing else. No rerun, summarize, export, send to pane, compare.

### Pin tray

Lightweight saved reference list. Accessible from palette or rail icon.

Per pin:
- Turn reference (session, workspace, turn ID)
- Optional short label
- Timestamp

Not a note-taking app. Not synced. Local only.

---

## Workspace & Session Model

### Workspace

One workspace = one project center. Project-centered by default; not architecturally hard-bound to exactly one repo root (supports ops workspaces, scratch workspaces, multi-root projects).

**Persisted per workspace:**
- Workspace root (the default cwd for new sessions)
- Session list (kind + role + identity)
- Last active session
- cwd per session (where that pane currently is, separate from workspace root)
- Canvas layout (single / split direction / split ratio)
- Pinned turns

### Session kinds

- `local` — bash / PowerShell / WSL, spawned via `wezterm-portable-pty`
- `ssh` — remote shell via `wezterm-ssh`

### Session roles

- `claude` — detected automatically when turn segmentation engine recognizes Claude Code running in the session. Not a separate kind — still a local shell.
- `shell`
- `git`
- `logs`
- `ssh`

Roles are a badge/label. A session's kind is its connection type. These are independent.

### SSH session identity

SSH sessions persist explicit identity, not just "remote session exists":
- Host alias / display label
- `user@host`
- Connection profile ID (for saved connections)
- Remote cwd (if known, best-effort)

### Activity dots

Grounded in real terminal state, not decorative:
- Output active — bytes flowing from PTY
- Prompt waiting — shell prompt detected, idle
- Claude streaming — assistant turn in progress
- (Error state reserved for later)

---

## Milestones

### MVP 0 — Foundation

Replace the unstable terminal core. No new UX.

- Swap `portable-pty` → `wezterm-portable-pty`
- Integrate `wezterm-term` for VT state
- Define and enforce `TerminalViewport` interface
- PTY lifecycle correct: spawn, resize, kill, no zombies
- Session restore on reopen (cwd, kind, role)
- Workspace root + cwd-per-session persistence

**Done when:** sessions are reliable, resize works, no regressions from Termorchestra v1.

### MVP 1 — Turn / Block Layer

- Turn segmentation engine (Rust side)
- Ambient block rendering
- `meta` line rendering
- Plain chunk fallback when confidence low
- Turn actions: copy, pin, follow up
- Inline copy code on code blocks
- Pin tray (list view, label, palette access)

**Done when:** a Claude Code session produces visually navigable turns with working copy/pin.

### MVP 2 — Workspace + Rail

- Left rail (icon-width default, expand on demand)
- Role badges + real activity dots
- Workspace switcher via palette
- Full workspace state restore (sessions, layout, pins, cwd)
- SSH session identity persistence

**Done when:** switching between two project workspaces restores state correctly.

### MVP 3 — Polish

- Top bar refinement
- Palette completeness (all session/workspace/layout commands)
- Visual polish pass (Ghostty-inspired density, Crush-inspired warmth)
- SSH connection profile management
- Performance pass: startup, PTY latency, turn detection overhead
