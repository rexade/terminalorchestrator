# Structured Turn View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `StructuredTurnView` behind `TerminalPane` as an opt-in rendering path, keeping raw xterm as the default and production-safe fallback.

**Architecture:** `TerminalPane` becomes a thin router that chooses between `RawTerminalView` (today's xterm.js, extracted unchanged) and `StructuredTurnView` (new). `StructuredTurnView` owns a `TurnParser` state machine that consumes PTY bytes, strips OSC 133 shell integration markers, and splits the stream into a live xterm zone at the bottom and committed turns rendered as ANSI-parsed React above.

**Tech Stack:** React 19, TypeScript, Zustand, xterm.js, `anser` (ANSI → JSON), Tauri 2.

**Spec reference:** `docs/superpowers/specs/2026-04-18-structured-turn-view-design.md`

---

## File Structure

### Create

- `src/types/turn.ts` — `Turn`, `SystemTurn`, `CommandTurn`, `LiveTurn`
- `src/lib/ansi.ts` — `parseAnsi(bytes)` returning `AnsiSegment[]`
- `src/lib/turn-parser.ts` — `TurnParser` class, state machine + OSC 133 stripping
- `src/lib/shell-integration.ts` — `getShellIntegrationSnippet(sessionType)`
- `src/components/RawTerminalView.tsx` — extracted from `TerminalPane`
- `src/components/StructuredTurnView.tsx` — root of structured mode
- `src/components/TurnLog.tsx` — scrollable turn list
- `src/components/TurnLogItem.tsx` — one turn row
- `src/components/LiveZone.tsx` — xterm.js wrapper with imperative `write`
- `src/test/lib/ansi.test.ts`
- `src/test/lib/turn-parser.test.ts`
- `src/test/lib/shell-integration.test.ts`
- `src/test/components/TurnLog.test.tsx`

### Modify

- `src/components/TerminalPane.tsx` — becomes a router (mode prop, default `"raw"`)
- `src/store/ui.ts` — add `sessionModes`, `setSessionMode`
- `src/components/StatusBar.tsx` — add mode chip
- `src/components/LayoutGrid.tsx` — pass `sessionModes` and `sessionTypes` through
- `src/App.tsx` — resolve per-session mode, pass to `LayoutGrid`

---

## Task 1: Turn Data Types

**Files:**
- Create: `src/types/turn.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// src/types/turn.ts
export type SystemTurnLevel = "info" | "warn" | "error"

export interface SystemTurn {
  id: string
  type: "system"
  timestamp: number
  message: string
  level?: SystemTurnLevel
}

export interface CommandTurn {
  id: string
  type: "command"
  timestamp: number
  command: string
  rawOutput: Uint8Array
  exitCode: number
  durationMs?: number
}

export type Turn = SystemTurn | CommandTurn

export interface LiveTurn {
  startedAt: number
  command: string
  rawOutput: Uint8Array
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors (only pre-existing `copyOnSelect` on TerminalPane).

- [ ] **Step 3: Commit**

```bash
git add src/types/turn.ts
git commit -m "feat(turn-view): add Turn data types"
```

---

## Task 2: ANSI Parser (bytes → styled segments)

**Files:**
- Create: `src/lib/ansi.ts`
- Test: `src/test/lib/ansi.test.ts`

- [ ] **Step 1: Install anser**

Run: `npm install anser`
Expected: `anser@^2.x` added to `package.json` dependencies.

- [ ] **Step 2: Write failing tests**

```typescript
// src/test/lib/ansi.test.ts
import { describe, it, expect } from "vitest"
import { parseAnsi } from "../../lib/ansi"

const encode = (s: string) => new TextEncoder().encode(s)

describe("parseAnsi", () => {
  it("parses plain text as a single unstyled segment", () => {
    const segments = parseAnsi(encode("hello"))
    expect(segments).toEqual([
      { text: "hello", fgColor: null, bgColor: null, bold: false, dim: false, italic: false, underline: false },
    ])
  })

  it("parses red foreground (SGR 31) with a non-null fgColor", () => {
    const segments = parseAnsi(encode("\x1b[31mred\x1b[0m"))
    expect(segments.length).toBeGreaterThanOrEqual(1)
    const red = segments.find((s) => s.text === "red")
    expect(red).toBeDefined()
    expect(red!.fgColor).not.toBeNull()
  })

  it("parses bold (SGR 1) with bold=true", () => {
    const segments = parseAnsi(encode("\x1b[1mbold\x1b[0m"))
    const bold = segments.find((s) => s.text === "bold")
    expect(bold).toBeDefined()
    expect(bold!.bold).toBe(true)
  })

  it("returns empty array for empty input", () => {
    expect(parseAnsi(encode(""))).toEqual([])
  })

  it("drops OSC 133 markers from segment text", () => {
    const segments = parseAnsi(encode("\x1b]133;A\x07$ "))
    const joined = segments.map((s) => s.text).join("")
    expect(joined).not.toContain("\x1b]133")
    expect(joined).not.toContain("\x07")
  })
})
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npx vitest run src/test/lib/ansi.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement parseAnsi**

```typescript
// src/lib/ansi.ts
import Anser from "anser"

export interface AnsiSegment {
  text: string
  fgColor: string | null
  bgColor: string | null
  bold: boolean
  dim: boolean
  italic: boolean
  underline: boolean
}

function stripControl(s: string): string {
  // Remove OSC sequences (\x1b] ... (\x07 | \x1b\\)) that Anser does not consume.
  return s
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    .replace(/\x07/g, "")
}

export function parseAnsi(bytes: Uint8Array): AnsiSegment[] {
  if (bytes.length === 0) return []
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  const cleaned = stripControl(raw)
  const parts = Anser.ansiToJson(cleaned, { use_classes: false, remove_empty: true, json: true })
  return parts
    .filter((p) => p.content && p.content.length > 0)
    .map((p) => ({
      text: p.content,
      fgColor: p.fg ? `rgb(${p.fg})` : null,
      bgColor: p.bg ? `rgb(${p.bg})` : null,
      bold: p.decorations.includes("bold"),
      dim: p.decorations.includes("dim"),
      italic: p.decorations.includes("italic"),
      underline: p.decorations.includes("underline"),
    }))
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/test/lib/ansi.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/ansi.ts src/test/lib/ansi.test.ts
git commit -m "feat(turn-view): add ANSI → styled segment parser"
```

---

## Task 3: Turn Parser State Machine

**Files:**
- Create: `src/lib/turn-parser.ts`
- Test: `src/test/lib/turn-parser.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/test/lib/turn-parser.test.ts
import { describe, it, expect } from "vitest"
import { TurnParser, ParseEvent } from "../../lib/turn-parser"

const encode = (s: string) => new TextEncoder().encode(s)

function feedAll(p: TurnParser, chunks: Uint8Array[]): { display: string; events: ParseEvent[] } {
  const display: number[] = []
  const events: ParseEvent[] = []
  for (const c of chunks) {
    const r = p.feed(c)
    display.push(...r.displayBytes)
    events.push(...r.events)
  }
  return { display: new TextDecoder().decode(new Uint8Array(display)), events }
}

describe("TurnParser", () => {
  it("passes plain bytes straight to display with no events", () => {
    const p = new TurnParser()
    const r = feedAll(p, [encode("hello")])
    expect(r.display).toBe("hello")
    expect(r.events).toEqual([])
  })

  it("strips OSC 133;A from display and emits prompt_start", () => {
    const p = new TurnParser()
    const r = feedAll(p, [encode("\x1b]133;A\x07$ ")])
    expect(r.display).toBe("$ ")
    expect(r.events.find((e) => e.type === "prompt_start")).toBeDefined()
  })

  it("emits prompt_end on OSC 133;B and strips the marker", () => {
    const p = new TurnParser()
    const r = feedAll(p, [encode("\x1b]133;A\x07$ \x1b]133;B\x07")])
    expect(r.display).toBe("$ ")
    expect(r.events.filter((e) => e.type === "prompt_end").length).toBe(1)
  })

  it("emits command_start on \\r after prompt_end, with the typed command", () => {
    const p = new TurnParser()
    feedAll(p, [encode("\x1b]133;A\x07$ \x1b]133;B\x07")])
    const r = feedAll(p, [encode("ls -la\r\n")])
    const start = r.events.find((e) => e.type === "command_start")
    expect(start).toBeDefined()
    expect(start!.type === "command_start" && start.command).toBe("ls -la")
  })

  it("accumulates output during CommandRunning and emits command_completed on D;0", () => {
    const p = new TurnParser()
    p.feed(encode("\x1b]133;A\x07$ \x1b]133;B\x07"))
    p.feed(encode("ls\r\n"))
    p.feed(encode("file1\nfile2\n"))
    const r = p.feed(encode("\x1b]133;D;0\x07"))
    const done = r.events.find((e) => e.type === "command_completed")
    expect(done).toBeDefined()
    if (done && done.type === "command_completed") {
      expect(done.exitCode).toBe(0)
      expect(new TextDecoder().decode(done.rawOutput)).toBe("file1\nfile2\n")
      expect(done.command).toBe("ls")
    }
  })

  it("ignores 133;D when not in CommandRunning state", () => {
    const p = new TurnParser()
    const r = feedAll(p, [encode("\x1b]133;D;0\x07")])
    expect(r.events.filter((e) => e.type === "command_completed")).toEqual([])
  })

  it("reassembles an OSC sequence split across two feeds", () => {
    const p = new TurnParser()
    const r1 = p.feed(encode("\x1b]133;"))
    const r2 = p.feed(encode("A\x07$ "))
    expect(new TextDecoder().decode(r1.displayBytes)).toBe("")
    expect(new TextDecoder().decode(r2.displayBytes)).toBe("$ ")
    expect(r2.events.find((e) => e.type === "prompt_start")).toBeDefined()
  })

  it("emits command_completed with accumulated raw output and exit code", () => {
    const p = new TurnParser()
    p.feed(encode("\x1b]133;A\x07$ \x1b]133;B\x07"))
    p.feed(encode("ls\r\n"))
    p.feed(encode("hello"))
    const r = p.feed(encode("\x1b]133;D;3\x07"))
    const done = r.events.find((e) => e.type === "command_completed")
    expect(done).toBeDefined()
    if (done && done.type === "command_completed") {
      expect(done.exitCode).toBe(3)
      expect(new TextDecoder().decode(done.rawOutput)).toBe("hello")
    }
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/test/lib/turn-parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TurnParser**

```typescript
// src/lib/turn-parser.ts
export type ParseEvent =
  | { type: "prompt_start" }
  | { type: "prompt_end" }
  | { type: "command_start"; command: string }
  | { type: "command_completed"; command: string; exitCode: number; rawOutput: Uint8Array; durationMs: number }

export interface ParseResult {
  displayBytes: Uint8Array
  events: ParseEvent[]
}

type State = "AwaitingPrompt" | "PromptVisible" | "CommandRunning"

const ESC = 0x1b
const BEL = 0x07
const CR = 0x0d
const BACKSLASH = 0x5c

const OSC_133_PREFIX = new Uint8Array([ESC, 0x5d, 0x31, 0x33, 0x33, 0x3b]) // "\x1b]133;"

function startsWith(buf: Uint8Array, prefix: Uint8Array, offset: number): boolean {
  if (buf.length - offset < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (buf[offset + i] !== prefix[i]) return false
  }
  return true
}

/** Could a tail starting at `offset` be the beginning of an OSC 133 sequence we haven't finished reading? */
function couldBeOscStart(buf: Uint8Array, offset: number): boolean {
  const tail = buf.length - offset
  if (tail === 0) return false
  if (buf[offset] !== ESC) return false
  // Prefix bytes we accept while still potentially OSC 133: \x1b ] 1 3 3 ;
  const full = [ESC, 0x5d, 0x31, 0x33, 0x33, 0x3b]
  for (let i = 0; i < tail && i < full.length; i++) {
    if (buf[offset + i] !== full[i]) return false
  }
  return true
}

export class TurnParser {
  private state: State = "AwaitingPrompt"
  private carry = new Uint8Array(0) // partial escape buffered between feeds
  private commandBuffer: number[] = []
  private outputBuffer: number[] = []
  private commandStartedAt = 0
  private currentCommand = ""

  feed(chunk: Uint8Array): ParseResult {
    const buf = concat(this.carry, chunk)
    this.carry = new Uint8Array(0)

    const display: number[] = []
    const events: ParseEvent[] = []
    let i = 0

    while (i < buf.length) {
      // Try to match an OSC 133 sequence at position i.
      if (startsWith(buf, OSC_133_PREFIX, i)) {
        // Find terminator (BEL or ESC \).
        let end = -1
        let termLen = 0
        for (let j = i + OSC_133_PREFIX.length; j < buf.length; j++) {
          if (buf[j] === BEL) { end = j; termLen = 1; break }
          if (buf[j] === ESC && j + 1 < buf.length && buf[j + 1] === BACKSLASH) {
            end = j
            termLen = 2
            break
          }
        }
        if (end === -1) {
          // Incomplete; carry the rest to next feed.
          this.carry = buf.slice(i)
          break
        }
        const payload = new TextDecoder().decode(buf.slice(i + OSC_133_PREFIX.length, end))
        this.handleMarker(payload, events)
        i = end + termLen
        continue
      }

      // If at i we *might* be starting an OSC sequence that we can't fully confirm yet, carry it.
      if (couldBeOscStart(buf, i) && i + 6 > buf.length) {
        this.carry = buf.slice(i)
        break
      }

      const byte = buf[i]

      // In PromptVisible, accumulate typed command until \r.
      if (this.state === "PromptVisible") {
        if (byte === CR) {
          const command = new TextDecoder().decode(new Uint8Array(this.commandBuffer))
          this.commandBuffer = []
          this.currentCommand = command
          this.state = "CommandRunning"
          this.commandStartedAt = Date.now()
          events.push({ type: "command_start", command })
          // \r itself is passed through as display
        } else {
          this.commandBuffer.push(byte)
        }
      } else if (this.state === "CommandRunning") {
        this.outputBuffer.push(byte)
      }

      display.push(byte)
      i++
    }

    return { displayBytes: new Uint8Array(display), events }
  }

  private handleMarker(payload: string, events: ParseEvent[]): void {
    // payload examples: "A", "B", "C", "D;0", "D;137"
    if (payload === "A") {
      this.state = "AwaitingPrompt"
      this.commandBuffer = []
      events.push({ type: "prompt_start" })
      return
    }
    if (payload === "B") {
      this.state = "PromptVisible"
      this.commandBuffer = []
      events.push({ type: "prompt_end" })
      return
    }
    if (payload === "C") {
      // Optional: some shells emit C explicitly.
      if (this.state === "PromptVisible") {
        const command = new TextDecoder().decode(new Uint8Array(this.commandBuffer))
        this.commandBuffer = []
        this.currentCommand = command
        this.state = "CommandRunning"
        this.commandStartedAt = Date.now()
        events.push({ type: "command_start", command })
      }
      return
    }
    if (payload.startsWith("D")) {
      if (this.state !== "CommandRunning") {
        // Ignore spurious D (e.g., first PROMPT_COMMAND after injection).
        return
      }
      const parts = payload.split(";")
      const exitCode = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0
      const rawOutput = new Uint8Array(this.outputBuffer)
      const durationMs = Date.now() - this.commandStartedAt
      const command = this.currentCommand
      this.outputBuffer = []
      this.currentCommand = ""
      this.state = "AwaitingPrompt"
      events.push({ type: "command_completed", command, exitCode, rawOutput, durationMs })
    }
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/test/lib/turn-parser.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/turn-parser.ts src/test/lib/turn-parser.test.ts
git commit -m "feat(turn-view): add OSC 133 turn parser state machine"
```

---

## Task 4: Shell Integration Snippets

**Files:**
- Create: `src/lib/shell-integration.ts`
- Test: `src/test/lib/shell-integration.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/test/lib/shell-integration.test.ts
import { describe, it, expect } from "vitest"
import { getShellIntegrationSnippet } from "../../lib/shell-integration"

describe("getShellIntegrationSnippet", () => {
  it("returns null for cmd", () => {
    expect(getShellIntegrationSnippet("cmd")).toBeNull()
  })

  it("returns null for ssh", () => {
    expect(getShellIntegrationSnippet("ssh")).toBeNull()
  })

  it("returns a non-empty string for powershell containing 133;A", () => {
    const snippet = getShellIntegrationSnippet("powershell")
    expect(snippet).not.toBeNull()
    expect(snippet!).toContain("133;A")
    expect(snippet!).toContain("133;B")
    expect(snippet!).toContain("133;D")
  })

  it("returns a bash-compatible snippet for wsl containing 133;A", () => {
    const snippet = getShellIntegrationSnippet("wsl")
    expect(snippet).not.toBeNull()
    expect(snippet!).toContain("133;A")
    expect(snippet!).toContain("PROMPT_COMMAND")
  })

  it("ends every returned snippet with a carriage return", () => {
    expect(getShellIntegrationSnippet("powershell")!.endsWith("\r")).toBe(true)
    expect(getShellIntegrationSnippet("wsl")!.endsWith("\r")).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/test/lib/shell-integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement snippets**

```typescript
// src/lib/shell-integration.ts
import { SessionType } from "../types/session"

const BASH_SNIPPET =
  `__osc_A() { printf '\\e]133;A\\a'; }; ` +
  `__osc_B() { printf '\\e]133;B\\a'; }; ` +
  `__osc_D() { printf '\\e]133;D;%s\\a' "$?"; }; ` +
  `PS1='\\[\\e]133;A\\a\\]'"$PS1"'\\[\\e]133;B\\a\\]'; ` +
  `PROMPT_COMMAND='__osc_D'"\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; ` +
  `clear\r`

const POWERSHELL_SNIPPET =
  `function global:prompt { ` +
  `$c = if ($?) { 0 } else { $LASTEXITCODE }; ` +
  `"$([char]27)]133;D;$c$([char]7)$([char]27)]133;A$([char]7)PS $($executionContext.SessionState.Path.CurrentLocation.Path)> $([char]27)]133;B$([char]7)" ` +
  `}; Clear-Host\r`

export function getShellIntegrationSnippet(sessionType: SessionType): string | null {
  if (sessionType === "wsl") return BASH_SNIPPET
  if (sessionType === "powershell") return POWERSHELL_SNIPPET
  return null
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/test/lib/shell-integration.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell-integration.ts src/test/lib/shell-integration.test.ts
git commit -m "feat(turn-view): add shell integration snippets for bash and pwsh"
```

---

## Task 5: UIStore Session Modes

**Files:**
- Modify: `src/store/ui.ts`

- [ ] **Step 1: Write failing test**

Append to an existing store test file, or create a new one. Create:

```typescript
// src/test/store/ui.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { useUIStore } from "../../store/ui"

describe("UIStore session modes", () => {
  beforeEach(() => {
    useUIStore.setState({ sessionModes: {} })
  })

  it("defaults to 'raw' when no mode is set", () => {
    expect(useUIStore.getState().getSessionMode("unknown")).toBe("raw")
  })

  it("stores and retrieves a mode per session id", () => {
    useUIStore.getState().setSessionMode("s1", "structured")
    expect(useUIStore.getState().getSessionMode("s1")).toBe("structured")
    expect(useUIStore.getState().getSessionMode("s2")).toBe("raw")
  })

  it("removes a session's mode entry", () => {
    useUIStore.getState().setSessionMode("s1", "structured")
    useUIStore.getState().clearSessionMode("s1")
    expect(useUIStore.getState().getSessionMode("s1")).toBe("raw")
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/store/ui.test.ts`
Expected: FAIL — `getSessionMode` is not a function.

- [ ] **Step 3: Extend UIStore**

Edit `src/store/ui.ts`:

```typescript
import { create } from "zustand"
import { Layout, LAYOUT_SLOT_COUNT, SidebarMode } from "../types/session"

export type TerminalMode = "raw" | "structured"

interface UIStore {
  activeSessionId: string | null
  sidebarMode: SidebarMode
  isAtBottom: boolean
  layout: Layout
  paneMap: (string | null)[]
  activePaneIndex: number
  sessionModes: Record<string, TerminalMode>

  setActiveSession: (id: string | null) => void
  setSidebarMode: (mode: SidebarMode) => void
  setIsAtBottom: (v: boolean) => void
  setLayout: (layout: Layout) => void
  setPaneSession: (paneIndex: number, sessionId: string | null) => void
  setActivePaneIndex: (index: number) => void

  getSessionMode: (sessionId: string) => TerminalMode
  setSessionMode: (sessionId: string, mode: TerminalMode) => void
  clearSessionMode: (sessionId: string) => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  activeSessionId: null,
  sidebarMode: "normal",
  isAtBottom: true,
  layout: "1",
  paneMap: [null],
  activePaneIndex: 0,
  sessionModes: {},

  setActiveSession: (id) =>
    set((state) => {
      const newPaneMap = [...state.paneMap]
      newPaneMap[state.activePaneIndex] = id
      return { activeSessionId: id, paneMap: newPaneMap }
    }),

  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setIsAtBottom: (v) => set({ isAtBottom: v }),

  setLayout: (layout) =>
    set((state) => {
      const slotCount = LAYOUT_SLOT_COUNT[layout]
      const newPaneMap = Array.from({ length: slotCount }, (_, i) => state.paneMap[i] ?? null)
      const newActivePaneIndex = Math.min(state.activePaneIndex, slotCount - 1)
      const activePaneSession = newPaneMap[newActivePaneIndex]
      return {
        layout,
        paneMap: newPaneMap,
        activePaneIndex: newActivePaneIndex,
        activeSessionId: activePaneSession ?? state.activeSessionId,
      }
    }),

  setPaneSession: (paneIndex, sessionId) =>
    set((state) => {
      const newPaneMap = [...state.paneMap]
      newPaneMap[paneIndex] = sessionId
      const newActiveSessionId =
        paneIndex === state.activePaneIndex ? sessionId : state.activeSessionId
      return { paneMap: newPaneMap, activeSessionId: newActiveSessionId }
    }),

  setActivePaneIndex: (index) =>
    set((state) => ({
      activePaneIndex: index,
      activeSessionId: state.paneMap[index] ?? state.activeSessionId,
    })),

  getSessionMode: (sessionId) => get().sessionModes[sessionId] ?? "raw",

  setSessionMode: (sessionId, mode) =>
    set((state) => ({ sessionModes: { ...state.sessionModes, [sessionId]: mode } })),

  clearSessionMode: (sessionId) =>
    set((state) => {
      const next = { ...state.sessionModes }
      delete next[sessionId]
      return { sessionModes: next }
    }),
}))
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/test/store/ui.test.ts`
Expected: PASS, 3 tests.

Also run the full suite to ensure no regressions: `npm test`
Expected: all prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/ui.ts src/test/store/ui.test.ts
git commit -m "feat(turn-view): add per-session terminal mode state"
```

---

## Task 6: Extract RawTerminalView and Make TerminalPane a Router

**Files:**
- Create: `src/components/RawTerminalView.tsx`
- Modify: `src/components/TerminalPane.tsx`

- [ ] **Step 1: Create RawTerminalView with the current xterm logic**

```tsx
// src/components/RawTerminalView.tsx
import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { listen } from "@tauri-apps/api/event"
import { writePty, resizePty } from "../lib/tauri"
import { SessionRole } from "../types/session"
import "@xterm/xterm/css/xterm.css"

interface RawTerminalViewProps {
  sessionId: string
  isActive: boolean
  role: SessionRole
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
}

export function RawTerminalView({ sessionId, isActive, role, onScrollChange, scrollToBottomRef }: RawTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

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
      // copyOnSelect: true, // xterm.js type issue pre-existing
    } as ConstructorParameters<typeof Terminal>[0])

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    void resizePty(sessionId, term.cols, term.rows)

    termRef.current = term

    let promptObserver: MutationObserver | null = null
    if (role === "claude") {
      promptObserver = new MutationObserver(() => {
        if (!containerRef.current) return
        const rows = containerRef.current.querySelectorAll(".xterm-rows > div")
        rows.forEach((row) => {
          const text = row.textContent ?? ""
          if (text.trimStart().startsWith("❯ ") && !row.hasAttribute("data-divider")) {
            row.setAttribute("data-divider", "1")
            ;(row as HTMLElement).style.borderTop = "1px solid #21262d"
            ;(row as HTMLElement).style.marginTop = "4px"
            ;(row as HTMLElement).style.paddingTop = "2px"
          }
        })
      })
      promptObserver.observe(containerRef.current, { childList: true, subtree: true })
    }

    const unlistenPromise = listen<number[]>(`pty_output_${sessionId}`, (event) => {
      term.write(new Uint8Array(event.payload))
    })

    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.ctrlKey && !e.shiftKey && e.key === "C") {
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
          term.clearSelection()
          return false
        }
      }
      if (e.type === "keydown" && e.ctrlKey && e.shiftKey && e.key === "C") {
        const sel = term.getSelection()
        if (sel) navigator.clipboard.writeText(sel)
        return false
      }
      return true
    })

    term.onData((data) => {
      writePty(sessionId, data)
    })

    term.onScroll(() => {
      const buffer = term.buffer.active
      const atBottom = buffer.viewportY >= buffer.length - term.rows
      onScrollChange?.(atBottom)
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      void resizePty(sessionId, term.cols, term.rows)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unlistenPromise.then((fn) => fn())
      resizeObserver.disconnect()
      promptObserver?.disconnect()
      term.dispose()
    }
  }, [sessionId])

  useEffect(() => {
    if (!scrollToBottomRef || !termRef.current) return
    scrollToBottomRef.current = () => termRef.current!.scrollToBottom()
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

- [ ] **Step 2: Rewrite TerminalPane as a thin router**

```tsx
// src/components/TerminalPane.tsx
import { RawTerminalView } from "./RawTerminalView"
import { SessionRole, SessionType } from "../types/session"
import { TerminalMode } from "../store/ui"

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  role: SessionRole
  sessionType: SessionType
  mode?: TerminalMode
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
}

export function TerminalPane({
  sessionId,
  isActive,
  role,
  sessionType: _sessionType,
  mode = "raw",
  onScrollChange,
  scrollToBottomRef,
}: TerminalPaneProps) {
  // Structured mode is added in Task 10; for now, only raw is wired.
  if (mode === "structured") {
    // Placeholder until Task 10 — fall back to raw so Task 6 is shippable alone.
    return (
      <RawTerminalView
        sessionId={sessionId}
        isActive={isActive}
        role={role}
        onScrollChange={onScrollChange}
        scrollToBottomRef={scrollToBottomRef}
      />
    )
  }

  return (
    <RawTerminalView
      sessionId={sessionId}
      isActive={isActive}
      role={role}
      onScrollChange={onScrollChange}
      scrollToBottomRef={scrollToBottomRef}
    />
  )
}
```

- [ ] **Step 3: Update LayoutGrid to pass sessionType to TerminalPane**

Edit `src/components/LayoutGrid.tsx`. In `PaneSlot`, replace the `TerminalPane` block and extend its props:

```tsx
// inside PaneSlot — only the JSX for TerminalPane
<TerminalPane
  key={`pane-${paneIndex}-${ptyId}`}
  sessionId={ptyId}
  isActive={true}
  role={role}
  sessionType={sessionType}
  onScrollChange={isFocused ? onScrollChange : undefined}
  scrollToBottomRef={isFocused ? scrollToBottomRef : undefined}
/>
```

…and extend `PaneSlotProps` to include `sessionType: SessionType`, and in the top-level `renderSlot`, derive it:

```tsx
// inside LayoutGrid renderSlot
const sessionType =
  sessionStoreId ? (sessions.find((s) => s.id === sessionStoreId)?.type ?? "cmd") : "cmd"
```

Pass `sessionType={sessionType}` into `<PaneSlot ... />`. Import `SessionType` at the top:

```tsx
import { Layout, Session, SessionRole, ROLE_ICONS, SessionType } from "../types/session"
```

Rename the existing `import { Session } ...` line accordingly; ensure no duplicate imports.

Add `import { TerminalPane } from "./TerminalPane"` if missing (the current file imports `TerminalPane`).

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run full tests**

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 6: Manual smoke check**

Run: `npm run tauri dev`
Open a session. Verify the terminal works exactly as before (raw xterm, no behavior change).

- [ ] **Step 7: Commit**

```bash
git add src/components/RawTerminalView.tsx src/components/TerminalPane.tsx src/components/LayoutGrid.tsx
git commit -m "refactor(turn-view): extract RawTerminalView; make TerminalPane a router"
```

---

## Task 7: TurnLogItem Component

**Files:**
- Create: `src/components/TurnLogItem.tsx`
- Test: `src/test/components/TurnLog.test.tsx` (covers item + log; split added in Task 8)

- [ ] **Step 1: Write failing tests for item rendering**

```tsx
// src/test/components/TurnLog.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TurnLogItem } from "../../components/TurnLogItem"
import { SystemTurn, CommandTurn } from "../../types/turn"

const encode = (s: string) => new TextEncoder().encode(s)

describe("TurnLogItem - SystemTurn", () => {
  it("renders the system message", () => {
    const turn: SystemTurn = {
      id: "s1",
      type: "system",
      timestamp: Date.now(),
      message: "session started",
    }
    render(<TurnLogItem turn={turn} />)
    expect(screen.getByText(/session started/)).toBeInTheDocument()
  })
})

describe("TurnLogItem - CommandTurn", () => {
  it("renders the command line", () => {
    const turn: CommandTurn = {
      id: "c1",
      type: "command",
      timestamp: Date.now(),
      command: "git status",
      rawOutput: encode("On branch main\n"),
      exitCode: 0,
    }
    render(<TurnLogItem turn={turn} />)
    expect(screen.getByText(/git status/)).toBeInTheDocument()
  })

  it("renders the output text", () => {
    const turn: CommandTurn = {
      id: "c1",
      type: "command",
      timestamp: Date.now(),
      command: "echo hi",
      rawOutput: encode("hi\n"),
      exitCode: 0,
    }
    render(<TurnLogItem turn={turn} />)
    expect(screen.getByText(/hi/)).toBeInTheDocument()
  })

  it("renders success badge for exit code 0", () => {
    const turn: CommandTurn = {
      id: "c1",
      type: "command",
      timestamp: Date.now(),
      command: "ls",
      rawOutput: encode(""),
      exitCode: 0,
    }
    render(<TurnLogItem turn={turn} />)
    expect(screen.getByTitle(/exit 0/i)).toBeInTheDocument()
  })

  it("renders failure badge for non-zero exit", () => {
    const turn: CommandTurn = {
      id: "c1",
      type: "command",
      timestamp: Date.now(),
      command: "false",
      rawOutput: encode(""),
      exitCode: 1,
    }
    render(<TurnLogItem turn={turn} />)
    expect(screen.getByTitle(/exit 1/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/components/TurnLog.test.tsx`
Expected: FAIL — `TurnLogItem` not found.

- [ ] **Step 3: Implement TurnLogItem**

```tsx
// src/components/TurnLogItem.tsx
import { useMemo } from "react"
import { Turn, CommandTurn, SystemTurn } from "../types/turn"
import { parseAnsi, AnsiSegment } from "../lib/ansi"

interface TurnLogItemProps {
  turn: Turn
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function RenderedOutput({ segments }: { segments: AnsiSegment[] }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-[1.5] text-zinc-400 m-0">
      {segments.map((seg, i) => {
        const style: React.CSSProperties = {}
        if (seg.fgColor) style.color = seg.fgColor
        if (seg.bgColor) style.background = seg.bgColor
        if (seg.bold) style.fontWeight = "bold"
        if (seg.italic) style.fontStyle = "italic"
        if (seg.underline) style.textDecoration = "underline"
        if (seg.dim) style.opacity = 0.7
        return (
          <span key={i} style={style}>
            {seg.text}
          </span>
        )
      })}
    </pre>
  )
}

function SystemRow({ turn }: { turn: SystemTurn }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-zinc-600 font-mono py-1">
      <span className="text-zinc-800">───</span>
      <span>{turn.message}</span>
      <span className="text-zinc-800 ml-auto">{formatTime(turn.timestamp)}</span>
      <span className="text-zinc-800">───</span>
    </div>
  )
}

function CommandRow({ turn }: { turn: CommandTurn }) {
  const segments = useMemo(() => parseAnsi(turn.rawOutput), [turn.rawOutput])
  const failed = turn.exitCode !== 0
  return (
    <div className="font-mono text-[13px] leading-[1.5] py-2">
      <div
        className={
          "flex items-center gap-2 mb-1 " +
          (failed ? "text-red-300" : "text-zinc-200")
        }
      >
        <span className="text-zinc-600 shrink-0">$</span>
        <span className="flex-1 whitespace-pre-wrap break-words">{turn.command}</span>
        <span className="text-zinc-700 text-[11px]">{formatTime(turn.timestamp)}</span>
        <span
          title={`exit ${turn.exitCode}`}
          className={
            "text-[11px] px-1 rounded " +
            (failed ? "text-red-400 bg-red-950/40" : "text-green-500/80")
          }
        >
          {failed ? `✗ ${turn.exitCode}` : "✓"}
        </span>
      </div>
      {segments.length > 0 && <RenderedOutput segments={segments} />}
    </div>
  )
}

export function TurnLogItem({ turn }: TurnLogItemProps) {
  if (turn.type === "system") return <SystemRow turn={turn} />
  return <CommandRow turn={turn} />
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/test/components/TurnLog.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/TurnLogItem.tsx src/test/components/TurnLog.test.tsx
git commit -m "feat(turn-view): add TurnLogItem renderer"
```

---

## Task 8: TurnLog Component

**Files:**
- Create: `src/components/TurnLog.tsx`
- Test: append to `src/test/components/TurnLog.test.tsx`

- [ ] **Step 1: Append failing test**

Add to `src/test/components/TurnLog.test.tsx`:

```tsx
import { TurnLog } from "../../components/TurnLog"

describe("TurnLog", () => {
  it("renders each turn in order", () => {
    const turns = [
      { id: "s1", type: "system" as const, timestamp: 0, message: "session started" },
      {
        id: "c1",
        type: "command" as const,
        timestamp: 1,
        command: "ls",
        rawOutput: new Uint8Array(0),
        exitCode: 0,
      },
    ]
    render(<TurnLog turns={turns} />)
    expect(screen.getByText(/session started/)).toBeInTheDocument()
    expect(screen.getByText(/ls/)).toBeInTheDocument()
  })

  it("renders an empty-state hint when no turns exist", () => {
    render(<TurnLog turns={[]} />)
    expect(screen.getByText(/no commands yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/test/components/TurnLog.test.tsx`
Expected: FAIL — `TurnLog` not found.

- [ ] **Step 3: Implement TurnLog**

```tsx
// src/components/TurnLog.tsx
import { useEffect, useRef } from "react"
import { Turn } from "../types/turn"
import { TurnLogItem } from "./TurnLogItem"

interface TurnLogProps {
  turns: Turn[]
}

export function TurnLog({ turns }: TurnLogProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom) el.scrollTop = el.scrollHeight
  }, [turns.length])

  return (
    <div ref={ref} className="flex-1 overflow-y-auto px-4 py-2 bg-[#0d1117]">
      {turns.length === 0 ? (
        <div className="text-zinc-700 text-[12px] font-mono py-4">no commands yet</div>
      ) : (
        turns.map((t) => <TurnLogItem key={t.id} turn={t} />)
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/test/components/TurnLog.test.tsx`
Expected: PASS, 7 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/components/TurnLog.tsx src/test/components/TurnLog.test.tsx
git commit -m "feat(turn-view): add TurnLog scroll container"
```

---

## Task 9: LiveZone Component

**Files:**
- Create: `src/components/LiveZone.tsx`

No unit tests — xterm.js requires real DOM. Smoke-test manually in Task 10.

- [ ] **Step 1: Implement LiveZone**

```tsx
// src/components/LiveZone.tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { writePty, resizePty } from "../lib/tauri"
import "@xterm/xterm/css/xterm.css"

export interface LiveZoneHandle {
  write: (bytes: Uint8Array) => void
  scrollToBottom: () => void
}

interface LiveZoneProps {
  sessionId: string
  onScrollChange?: (atBottom: boolean) => void
}

export const LiveZone = forwardRef<LiveZoneHandle, LiveZoneProps>(function LiveZone(
  { sessionId, onScrollChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useImperativeHandle(ref, () => ({
    write: (bytes: Uint8Array) => {
      termRef.current?.write(bytes)
    },
    scrollToBottom: () => {
      termRef.current?.scrollToBottom()
    },
  }))

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
      scrollback: 1000,
    } as ConstructorParameters<typeof Terminal>[0])

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    void resizePty(sessionId, term.cols, term.rows)
    termRef.current = term

    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.ctrlKey && !e.shiftKey && e.key === "C") {
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
          term.clearSelection()
          return false
        }
      }
      if (e.type === "keydown" && e.ctrlKey && e.shiftKey && e.key === "C") {
        const sel = term.getSelection()
        if (sel) navigator.clipboard.writeText(sel)
        return false
      }
      return true
    })

    term.onData((data) => writePty(sessionId, data))
    term.onScroll(() => {
      const b = term.buffer.active
      onScrollChange?.(b.viewportY >= b.length - term.rows)
    })

    const ro = new ResizeObserver(() => {
      fitAddon.fit()
      void resizePty(sessionId, term.cols, term.rows)
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
    }
  }, [sessionId])

  return (
    <div className="h-[260px] border-t border-[#21262d] bg-[#0d1117] flex flex-col">
      <div className="text-[10px] text-zinc-700 px-3 pt-1 shrink-0 font-mono">▶ live</div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
})
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LiveZone.tsx
git commit -m "feat(turn-view): add LiveZone xterm wrapper with imperative write"
```

---

## Task 10: StructuredTurnView Integration

**Files:**
- Create: `src/components/StructuredTurnView.tsx`
- Modify: `src/components/TerminalPane.tsx` (route structured mode to real component)

- [ ] **Step 1: Implement StructuredTurnView**

```tsx
// src/components/StructuredTurnView.tsx
import { useEffect, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { writePty } from "../lib/tauri"
import { Turn, SystemTurn, CommandTurn } from "../types/turn"
import { TurnParser } from "../lib/turn-parser"
import { getShellIntegrationSnippet } from "../lib/shell-integration"
import { SessionRole, SessionType } from "../types/session"
import { TurnLog } from "./TurnLog"
import { LiveZone, LiveZoneHandle } from "./LiveZone"

interface StructuredTurnViewProps {
  sessionId: string
  isActive: boolean
  role: SessionRole
  sessionType: SessionType
  onScrollChange?: (atBottom: boolean) => void
}

export function StructuredTurnView({
  sessionId,
  isActive,
  role: _role,
  sessionType,
  onScrollChange,
}: StructuredTurnViewProps) {
  const [turns, setTurns] = useState<Turn[]>(() => [
    {
      id: crypto.randomUUID(),
      type: "system",
      timestamp: Date.now(),
      message: `structured mode active · ${sessionType}`,
    } satisfies SystemTurn,
  ])
  const liveRef = useRef<LiveZoneHandle | null>(null)
  const parserRef = useRef<TurnParser | null>(null)

  useEffect(() => {
    parserRef.current = new TurnParser()

    const snippet = getShellIntegrationSnippet(sessionType)
    if (snippet) {
      void writePty(sessionId, snippet)
    }

    let unlisten: (() => void) | undefined
    let cancelled = false

    ;(async () => {
      const fn = await listen<number[]>(`pty_output_${sessionId}`, (event) => {
        if (cancelled) return
        const chunk = new Uint8Array(event.payload)
        const parser = parserRef.current
        if (!parser) return
        const result = parser.feed(chunk)
        if (result.displayBytes.length > 0) {
          liveRef.current?.write(result.displayBytes)
        }
        if (result.events.length > 0) {
          setTurns((prev) => {
            let next = prev
            for (const ev of result.events) {
              if (ev.type === "command_completed") {
                const commandTurn: CommandTurn = {
                  id: crypto.randomUUID(),
                  type: "command",
                  timestamp: Date.now(),
                  command: ev.command,
                  rawOutput: ev.rawOutput,
                  exitCode: ev.exitCode,
                  durationMs: ev.durationMs,
                }
                next = [...next, commandTurn]
              }
            }
            return next
          })
        }
      })
      if (cancelled) fn()
      else unlisten = fn
    })()

    return () => {
      cancelled = true
      unlisten?.()
      parserRef.current = null
    }
  }, [sessionId, sessionType])

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ display: isActive ? "flex" : "none" }}>
      <TurnLog turns={turns} />
      <LiveZone sessionId={sessionId} onScrollChange={onScrollChange} ref={liveRef} />
    </div>
  )
}
```

- [ ] **Step 2: Update TerminalPane to route structured mode to real component**

```tsx
// src/components/TerminalPane.tsx
import { RawTerminalView } from "./RawTerminalView"
import { StructuredTurnView } from "./StructuredTurnView"
import { SessionRole, SessionType } from "../types/session"
import { TerminalMode } from "../store/ui"

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  role: SessionRole
  sessionType: SessionType
  mode?: TerminalMode
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
}

export function TerminalPane({
  sessionId,
  isActive,
  role,
  sessionType,
  mode = "raw",
  onScrollChange,
  scrollToBottomRef,
}: TerminalPaneProps) {
  if (mode === "structured") {
    return (
      <StructuredTurnView
        sessionId={sessionId}
        isActive={isActive}
        role={role}
        sessionType={sessionType}
        onScrollChange={onScrollChange}
      />
    )
  }
  return (
    <RawTerminalView
      sessionId={sessionId}
      isActive={isActive}
      role={role}
      onScrollChange={onScrollChange}
      scrollToBottomRef={scrollToBottomRef}
    />
  )
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/StructuredTurnView.tsx src/components/TerminalPane.tsx
git commit -m "feat(turn-view): integrate StructuredTurnView behind TerminalPane"
```

---

## Task 11: StatusBar Mode Chip

**Files:**
- Modify: `src/components/StatusBar.tsx`
- Modify: `src/test/components/StatusBar.test.tsx`

- [ ] **Step 1: Extend StatusBar props and add mode chip**

```tsx
// src/components/StatusBar.tsx — full rewrite
import { useState } from "react"
import { Layout, Session } from "../types/session"
import { TerminalMode } from "../store/ui"

interface StatusBarProps {
  activeSession: Session | null
  allSessions: Session[]
  isAtBottom: boolean
  onJumpToBottom: () => void
  sessionError?: string | null
  layout: Layout
  onSetLayout: (layout: Layout) => void
  mode: TerminalMode
  canUseStructured: boolean
  onSetMode: (mode: TerminalMode) => void
}

const SHELL_LABEL: Record<string, string> = {
  cmd: "cmd",
  powershell: "powershell",
  wsl: "wsl · bash",
  ssh: "ssh",
}

const LAYOUT_OPTIONS: { value: Layout; label: string; title: string }[] = [
  { value: "1", label: "▣", title: "Single pane" },
  { value: "h2", label: "▫▫", title: "Side by side" },
  { value: "v2", label: "▭\n▭", title: "Stacked" },
  { value: "4", label: "⊞", title: "2×2 grid" },
]

export function StatusBar({
  activeSession,
  allSessions: _allSessions,
  isAtBottom,
  onJumpToBottom,
  sessionError,
  layout,
  onSetLayout,
  mode,
  canUseStructured,
  onSetMode,
}: StatusBarProps) {
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const [showModePicker, setShowModePicker] = useState(false)
  const shellLabel = activeSession ? (SHELL_LABEL[activeSession.type] ?? activeSession.type) : "—"

  const modeGlyph = mode === "structured" ? "●" : "○"
  const modeLabel = mode === "structured" ? "structured" : "raw"

  return (
    <div className="h-5 bg-[#161b22] border-t border-[#21262d] flex items-center justify-between px-3 text-[10px] text-zinc-600 shrink-0 relative">
      <div className="flex gap-3 items-center">
        <span>{shellLabel}</span>
        {activeSession && <span className="text-zinc-700">{activeSession.cwd}</span>}
      </div>
      <div className="flex gap-2 items-center">
        {sessionError && (
          <span className="text-red-400 max-w-xs truncate" title={sessionError}>
            ⚠ {sessionError}
          </span>
        )}
        {!isAtBottom && (
          <button
            title="Jump to latest output"
            onClick={onJumpToBottom}
            className="w-4 h-4 flex items-center justify-center rounded bg-[#21262d] text-zinc-400 hover:text-zinc-200 hover:bg-[#30363d] leading-none text-[10px]"
          >
            ↓
          </button>
        )}
        <button
          title={`View mode: ${modeLabel}`}
          disabled={!activeSession}
          onClick={() => setShowModePicker((v) => !v)}
          className={
            "flex items-center gap-1 text-[10px] leading-none transition-colors " +
            (activeSession
              ? showModePicker
                ? "text-zinc-300"
                : "text-zinc-600 hover:text-zinc-400"
              : "text-zinc-800 cursor-not-allowed")
          }
        >
          <span>{modeGlyph}</span>
          <span>{modeLabel}</span>
        </button>
        <button
          title="Layout"
          onClick={() => setShowLayoutPicker((v) => !v)}
          className={
            "text-[10px] leading-none transition-colors " +
            (showLayoutPicker ? "text-zinc-300" : "text-zinc-600 hover:text-zinc-400")
          }
        >
          ⊞
        </button>
      </div>

      {showModePicker && activeSession && (
        <div className="absolute bottom-6 right-10 bg-[#161b22] border border-[#30363d] rounded shadow-lg flex flex-col min-w-[160px] z-50">
          <button
            onClick={() => {
              onSetMode("raw")
              setShowModePicker(false)
            }}
            className={
              "px-3 py-2 text-left text-[11px] hover:bg-[#21262d] " +
              (mode === "raw" ? "text-zinc-200" : "text-zinc-500")
            }
          >
            ○ raw — plain xterm
          </button>
          <button
            onClick={() => {
              if (!canUseStructured) return
              onSetMode("structured")
              setShowModePicker(false)
            }}
            disabled={!canUseStructured}
            title={canUseStructured ? "" : "Structured mode not available for this shell"}
            className={
              "px-3 py-2 text-left text-[11px] hover:bg-[#21262d] disabled:hover:bg-transparent " +
              (mode === "structured" ? "text-zinc-200" : "text-zinc-500") +
              (!canUseStructured ? " opacity-40 cursor-not-allowed" : "")
            }
          >
            ● structured — turn log
          </button>
          <div className="px-3 py-1 text-[10px] text-zinc-700 border-t border-[#21262d]">
            switching mode resets history
          </div>
        </div>
      )}

      {showLayoutPicker && (
        <div className="absolute bottom-6 right-2 bg-[#161b22] border border-[#30363d] rounded shadow-lg flex gap-1 p-1 z-50">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              title={opt.title}
              onClick={() => {
                onSetLayout(opt.value)
                setShowLayoutPicker(false)
              }}
              className={
                "w-7 h-7 flex items-center justify-center rounded text-[10px] leading-none transition-colors " +
                (layout === opt.value
                  ? "bg-blue-900 text-blue-300"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#21262d]")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update existing StatusBar tests**

Edit `src/test/components/StatusBar.test.tsx` to pass the new props in every render call. For each `<StatusBar ... />` add:

```tsx
mode="raw"
canUseStructured={true}
onSetMode={() => {}}
```

Append a new test group:

```tsx
describe("StatusBar - mode chip", () => {
  it("shows 'raw' when mode is raw", () => {
    render(
      <StatusBar
        activeSession={makeSession()}
        allSessions={[]}
        isAtBottom={true}
        onJumpToBottom={() => {}}
        layout="1"
        onSetLayout={() => {}}
        mode="raw"
        canUseStructured={true}
        onSetMode={() => {}}
      />
    )
    expect(screen.getByText("raw")).toBeInTheDocument()
  })

  it("shows 'structured' when mode is structured", () => {
    render(
      <StatusBar
        activeSession={makeSession()}
        allSessions={[]}
        isAtBottom={true}
        onJumpToBottom={() => {}}
        layout="1"
        onSetLayout={() => {}}
        mode="structured"
        canUseStructured={true}
        onSetMode={() => {}}
      />
    )
    expect(screen.getByText("structured")).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/test/components/StatusBar.test.tsx`
Expected: PASS (existing 4 + new 2 = 6 tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/StatusBar.tsx src/test/components/StatusBar.test.tsx
git commit -m "feat(turn-view): add mode chip picker in StatusBar"
```

---

## Task 12: Wire Mode Through App → LayoutGrid → TerminalPane

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/LayoutGrid.tsx`

- [ ] **Step 1: Extend LayoutGrid to pass sessionModes**

Edit `src/components/LayoutGrid.tsx`. Update `LayoutGridProps` and `PaneSlotProps`:

```tsx
// add to LayoutGridProps
sessionModes: Record<string, TerminalMode>
```

Import at top:
```tsx
import { TerminalMode } from "../store/ui"
```

In `renderSlot`, derive the mode and pass it down:
```tsx
const mode: TerminalMode = sessionStoreId ? (sessionModes[sessionStoreId] ?? "raw") : "raw"
```

Extend `PaneSlotProps`:
```tsx
mode: TerminalMode
```

Pass into `<PaneSlot mode={mode} ... />` and forward to `TerminalPane`:

```tsx
<TerminalPane
  key={`pane-${paneIndex}-${ptyId}-${mode}`}
  sessionId={ptyId}
  isActive={true}
  role={role}
  sessionType={sessionType}
  mode={mode}
  onScrollChange={isFocused ? onScrollChange : undefined}
  scrollToBottomRef={isFocused ? scrollToBottomRef : undefined}
/>
```

*The `mode` is included in `key` so switching mode remounts the pane (structured ↔ raw state reset per spec).*

- [ ] **Step 2: Resolve mode in App.tsx and pass to LayoutGrid**

Edit `src/App.tsx`:

```tsx
// In the destructure near the top of App():
const {
  activeSessionId,
  sidebarMode,
  isAtBottom,
  layout,
  paneMap,
  activePaneIndex,
  sessionModes,
  setActiveSession,
  setSidebarMode,
  setIsAtBottom,
  setLayout,
  setPaneSession,
  setActivePaneIndex,
  setSessionMode,
} = useUIStore()
```

Pass `sessionModes` to `LayoutGrid`:

```tsx
<LayoutGrid
  layout={layout}
  paneMap={paneMap}
  activePaneIndex={activePaneIndex}
  sessions={sessions}
  sessionPtyMap={sessionPtyMap.current}
  sessionModes={sessionModes}
  onPaneFocus={setActivePaneIndex}
  onScrollChange={setIsAtBottom}
  scrollToBottomRef={scrollToBottomRef}
  onAssignSession={handleAssignSession}
  onNewSession={handleEmptyPaneNewSession}
  onDetachPane={handleDetachPane}
/>
```

Pass mode props to `StatusBar`:

```tsx
const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
const activeMode: TerminalMode = activeSession ? (sessionModes[activeSession.id] ?? "raw") : "raw"
const canUseStructured = activeSession
  ? activeSession.type === "wsl" || activeSession.type === "powershell"
  : false

const handleSetMode = (mode: TerminalMode) => {
  if (!activeSession) return
  setSessionMode(activeSession.id, mode)
}
```

Then:

```tsx
<StatusBar
  activeSession={activeSession}
  allSessions={sessions}
  isAtBottom={isAtBottom}
  onJumpToBottom={() => scrollToBottomRef.current?.()}
  sessionError={sessionError}
  layout={layout}
  onSetLayout={setLayout}
  mode={activeMode}
  canUseStructured={canUseStructured}
  onSetMode={handleSetMode}
/>
```

Import at the top:
```tsx
import { TerminalMode } from "./store/ui"
```

Also clean up a session's mode entry when it exits. Inside the `session_exited` listener handler (after `delete sessionPtyMap.current[storeId]`), add:
```tsx
useUIStore.getState().clearSessionMode(storeId)
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Manual smoke test**

Run: `npm run tauri dev`

Verify:
1. New PowerShell session opens in raw mode (no change from before).
2. Status bar shows `○ raw`.
3. Click mode chip → picker appears.
4. Click "● structured" → pane remounts, TurnLog + LiveZone appear.
5. Run a command in LiveZone (e.g., `Get-ChildItem`) → on completion, a CommandTurn appears in TurnLog with exit code badge.
6. Switch back to raw → xterm-only view returns.
7. Open a `cmd` session → "structured" picker option is disabled.

Record any deviations. If structured turn does not commit on the first command, check that OSC markers are reaching the parser (log `result.events` length in the useEffect listener temporarily).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/LayoutGrid.tsx
git commit -m "feat(turn-view): wire per-session mode through App, LayoutGrid, StatusBar"
```

---

## Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors (the pre-existing `copyOnSelect` error on TerminalPane is gone; the new RawTerminalView uses a type cast to avoid it).

- [ ] **Step 3: Full manual regression**

Run: `npm run tauri dev`

Regression checklist:
- [ ] New session (cmd, powershell, wsl) opens and accepts input in raw mode.
- [ ] Layouts 1 / h2 / v2 / 4 still work.
- [ ] Session close button still works.
- [ ] Claude auto-launch still runs on sessions with `role: "claude"`.
- [ ] Copy-on-select works in raw mode.
- [ ] Ctrl+C sends interrupt if no selection, copies if selection.
- [ ] Status bar mode chip shows `raw` by default.
- [ ] Switching to structured mode in powershell/wsl shows TurnLog + LiveZone.
- [ ] Running a command while in structured mode commits a CommandTurn.
- [ ] Switching back to raw resets view to plain xterm.
- [ ] cmd session has structured option disabled in the picker.
