# Termorchestra

A terminal-first desktop app for the way people actually work in 2026: Claude, SSH, WSL, servers, logs and shell sessions — without IDE bloat.

## What it is

A cross-platform desktop app (Tauri 2) that hosts multiple real PTY sessions inside a clean, organized sidebar UI. It is a terminal orchestrator — a wrapper around real shells, not a replacement for them.

**Not:** a new shell, an IDE, an AI chat interface, or a tmux clone with a GUI.

## Features (v1)

- Multiple local PTY sessions (cmd / PowerShell / bash)
- WSL as a first-class session type
- Named sessions with role badges (Claude, Shell, Server, Logs, Git)
- Workspace grouping — create, rename, switch, delete
- Sidebar: normal (160px) and compact (44px) modes
- Session restore on reopen — re-spawns PTYs in saved working directories
- Recent folder history + native folder picker in new-session dialog
- Status bar: shell type, cwd, error state

## Tech stack

| Layer | Technology |
|---|---|
| App shell | Tauri 2 (Rust + WebView) |
| PTY management | portable-pty |
| Terminal rendering | xterm.js + addon-fit |
| Frontend | React + TypeScript + Zustand + Tailwind CSS |

## Build

Prerequisites: Rust, Node.js, pnpm, Tauri CLI prerequisites for your platform.

```bash
pnpm install
pnpm tauri build
```

For development:
```bash
pnpm tauri dev
```

## License

MIT
