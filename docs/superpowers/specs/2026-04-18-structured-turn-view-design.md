# Structured Turn View — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy infinite-scrollback terminal presentation with a structured turn log while keeping the shell execution layer identical.

**Core principle:** Preserve shell execution. Replace legacy presentation.

**Product thesis:** The same command work — bash, pwsh, cmd, WSL, Claude Code, SSH — shown in a viewing model designed for how humans actually work, not inherited from 1980s rendering constraints.

---

## Architecture

`TerminalPane` becomes a stable host boundary with the same external props contract (`sessionId`, `isActive`, `role`, `mode`, `onScrollChange`, `scrollToBottomRef`). It gains one new prop: `mode: "raw" | "structured"`. Internally it routes to one of two cleanly separated renderer implementations.

```
TerminalPane (host — public boundary unchanged)
├── RawTerminalView       — today's xterm.js, untouched
└── StructuredTurnView    — new
    ├── TurnLog           — scrollable committed history (React, ANSI-parsed)
    └── LiveZone          — one xterm.js instance for the current live interaction
```

**Contamination rule:** structured mode must not contaminate raw mode. The two renderer implementations share no state and no rendering logic. `RawTerminalView` is exactly what `TerminalPane` is today.

Per-session mode state (`"raw" | "structured"`) lives in `UIStore`, keyed by session ID, defaulting to `"raw"`. The status bar mode chip reads and writes this state. App.tsx passes the resolved mode down to `TerminalPane` via the existing props path through `LayoutGrid`.

App.tsx, LayoutGrid, and the session store do not change.

---

## Turn Data Model

Turns are local state inside `StructuredTurnView`. They are not persisted, not in Zustand.

```typescript
type SystemTurn = {
  id: string
  type: "system"
  timestamp: number
  message: string
  level?: "info" | "warn" | "error"
}

type CommandTurn = {
  id: string
  type: "command"
  timestamp: number
  command: string          // raw command text (may be multiline)
  rawOutput: Uint8Array    // accumulated bytes from CommandRunning phase only
  exitCode: number
  durationMs?: number
}

type Turn = SystemTurn | CommandTurn

type LiveTurn = {
  startedAt: number
  command: string
  rawOutput: Uint8Array    // accumulates during CommandRunning, resets on commit
}
```

`TurnLog` renders `Turn[]`. `LiveZone` renders `LiveTurn | null`. `"running"` is not a committed turn type — the live interaction lives outside the history array.

ANSI parsing: raw bytes are the source of truth. Each `CommandTurn.rawOutput` is parsed to an intermediate ANSI segment representation **once, at commit time**, and memoized. React spans are derived from the cached parse result, not re-parsed on every render.

---

## PTY Stream Processing and Shell Integration

`TurnParser` sits between the raw PTY byte stream and the two rendering surfaces. It tracks explicit phases:

```
AwaitingPrompt → PromptVisible → CommandRunning → CommandCompleted
```

### Primary path: Shell integration hooks (OSC 133)

At session spawn, Termorchestra writes a shell-specific hook snippet to the PTY. The hook emits OSC 133 sequences (the same protocol VS Code terminal uses):

```
\x1b]133;A\x07   prompt start
\x1b]133;B\x07   prompt end
\x1b]133;C\x07   command executing (Enter pressed)
\x1b]133;D;N\x07  command finished, exit code N
```

Shell-specific injection:
- **bash**: inject via `PROMPT_COMMAND` and `PS1` wrapper at session start
- **pwsh**: inject via `$function:prompt` wrapper written to PTY after startup
- **WSL**: follow the rules of the detected shell *inside* WSL — not WSL as a platform. A WSL session running zsh uses zsh injection rules.
- **cmd**: no hook support — raw mode default, no structured option in Phase 1

`TurnParser` strips OSC 133 sequences from the byte stream before they reach xterm.js (they are control semantics for Termorchestra, not user-visible content).

**Structured mode is confirmed by observed marker emission, not attempted injection.** Success = OSC 133 sequences observed in the byte stream from the shell. If expected markers never appear after the first prompt cycle, the session does not enter structured mode.

### Fallback: Heuristic detection (compatibility mode)

When shell integration is unavailable or unconfirmed, `TurnParser` can fall back to watching for common prompt-ending patterns (`$ `, `> `, `❯ `, `PS C:\>`). This path is less reliable and explicitly labeled. In Phase 1, compatibility mode is internal only — not exposed in the UI — until it proves stable enough to surface.

### Byte routing

Visible PTY bytes (minus stripped OSC markers) always flow to xterm.js in `LiveZone`. `LiveTurn.rawOutput` accumulates **only bytes produced during the `CommandRunning` phase** — not the whole stream. This ensures committed `CommandTurn.rawOutput` contains command output only, not prompt redraws, shell integration side-effects, or pre-command noise.

On `CommandCompleted`: `LiveTurn` commits to `Turn[]` as a `CommandTurn` with the observed exit code and duration. `LiveTurn` resets to null. `LiveZone` xterm.js remains the active shell surface at the new prompt state.

---

## StructuredTurnView UI

`StructuredTurnView` fills the space `TerminalPane` occupies today. Two vertical regions:

### TurnLog (scrollable, top region)

Committed turns, newest at bottom. Monospace throughout. No cards, no bubbles, no rounded corners. Density-first.

**SystemTurn:**
```
─── session started · bash · ~/projects ──────────── 14:03 ───
```
Single muted line. Quiet enough to be skipped while scanning.

**CommandTurn (success):**
```
$ git status                                         14:07  ✓ 43ms
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

**CommandTurn (failure):**
```
$ cargo build                                        14:08  ✗ 101
error[E0308]: mismatched types
  --> src/main.rs:42:5
```

Visual rules:
- **Command line is stronger than output.** Slightly heavier weight or brighter color. The primary scan unit is "what did I run" — that should be findable at a glance.
- **Past turns use a lower-emphasis color palette**, not raw opacity reduction. ANSI colors are preserved at reduced brightness — not faded to grey. Red errors stay red, just calmer. This prevents opacity-induced muddiness on colored output.
- **Failed command turns get a subtle accent on the command line row** — not just the exit badge. Enough to spot failures while scrolling, not enough to become alarming chrome.
- Turn separation comes from **spacing first**, very subtle horizontal rule second. The rhythm is layout-driven, not line-driven.
- Long output: no collapse in v1. The `rawOutput` blob supports it later.

### LiveZone (fixed height, anchored bottom)

The current live interaction. Full xterm.js — raw, exact, keyboard-first. A subtle top border and faint `▶` indicator anchor it visually so the user always knows where "now" is.

LiveZone has fixed height with internal scroll. It does not grow to consume TurnLog space. This keeps the screen balance stable during long-running commands.

When a command completes, TurnLog receives the new `CommandTurn` and LiveZone remains at the new prompt. Switching mode for a running session resets current structured history and re-renders in the new mode. A clear message is shown: *"Switching view mode resets the current session's structured history."*

---

## Mode Chip and Switching

The mode chip lives in the **status bar** (not a session header). It shows environment truth, always visible.

Three states:
```
● structured   — shell integration confirmed, full turn model active
◌ compatible   — heuristic detection active (Phase 2+, when exposed)
○ raw          — plain xterm.js
```

Clicking opens a small picker — not a cycling toggle. Explicit selection only.

In Phase 1, only `structured` and `raw` are user-visible states. `compatible` is internal.

---

## Phased Rollout

### Phase 1 — Build and prove

- `TerminalPane` gains `mode` prop; default is `"raw"` for all sessions
- `StructuredTurnView` is built; accessible via per-session mode picker
- Raw mode is the production path; structured is the development target
- Shell integration injection for **bash and pwsh** only
- **cmd** stays raw, no structured option
- Compatibility mode is internal — not exposed in UI

### Phase 2 — Structured default for supported shells

- When OSC 133 markers are confirmed for a session, mode chip shows `structured` automatically
- Structured becomes the default for new bash/pwsh/WSL sessions
- Raw remains one-click escape at all times
- Compatibility mode may be surfaced if heuristic path proves reliable enough

### Phase 3 — Structured is normal

- Structured default for all sessions where integration is confirmed
- Raw mode permanent escape hatch, always one click away
- Mode chip stays visible permanently — environment truth, always honest

---

## Shell Support Matrix (v1)

| Shell | Integration path | Structured available | Notes |
|-------|-----------------|---------------------|-------|
| bash | OSC 133 hooks | Phase 1 | Primary target |
| pwsh | OSC 133 hooks | Phase 1 | Primary target |
| cmd | None | No | Raw default permanently in Phase 1 |
| WSL | Follows inner shell | Follows inner shell | Not WSL as platform |
| SSH | TBD post-v1 | No | Out of scope |

---

## What This Is Not

- Not a terminal simulator with a React frontend
- Not a chat interface with a shell attached
- Not a replacement for the PTY or shell semantics
- Not a transcript viewer or log prettifier

Raw shell truth is always accessible. If parsing fails, the user still has the terminal.

---

## Out of Scope for v1

- Claude-specific turn semantics (stream-json parsing, tool call display)
- Output collapse / expand
- Turn search
- SSH structured mode
- cmd heuristic compatibility mode (UI-exposed)
- Per-turn cwd snapshot
- Hyperlink detection in ANSI output
- Side inspector panels
