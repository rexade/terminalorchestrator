// TerminalPane — fake xterm output with blinking cursor + scripted demo.
const { useEffect, useRef, useState: useStateTP } = React;

// Scripted demo content per role. Each entry: [delay_ms, line]
const SCRIPTS = {
  claude: [
    [0,   { c: "#a1a1aa", t: "$ claude code ." }],
    [300, { c: "#71717a", t: "╭──────────────────────╮" }],
    [50,  { c: "#71717a", t: "│  Claude Code v1.2.0  │" }],
    [50,  { c: "#71717a", t: "╰──────────────────────╯" }],
    [200, { c: "#e6edf3", t: "" }],
    [100, { c: "#e6edf3", t: "❯ refactor the session store to use immer", divider: true }],
    [400, { c: "#a1a1aa", t: "Looking at src/store/sessions.ts..." }],
    [300, { c: "#a1a1aa", t: "Found 4 reducers that deep-clone workspaces." }],
    [400, { c: "#e6edf3", t: "❯ ", cursor: true, divider: true }],
  ],
  shell: [
    [0,   { c: "#e6edf3", prompt: true, t: "ls -la" }],
    [200, { c: "#a1a1aa", t: "total 24" }],
    [30,  { c: "#a1a1aa", t: "drwxr-xr-x   7 henri  staff   224 Apr 18 09:12 ." }],
    [30,  { c: "#a1a1aa", t: "drwxr-xr-x  42 henri  staff  1344 Apr 17 22:03 .." }],
    [30,  { c: "#58a6ff", t: "drwxr-xr-x  14 henri  staff   448 Apr 18 09:12 src" }],
    [30,  { c: "#58a6ff", t: "drwxr-xr-x   6 henri  staff   192 Apr 17 22:03 src-tauri" }],
    [30,  { c: "#a1a1aa", t: "-rw-r--r--   1 henri  staff   377 Apr 17 22:03 index.html" }],
    [30,  { c: "#a1a1aa", t: "-rw-r--r--   1 henri  staff  1015 Apr 18 08:45 package.json" }],
    [300, { c: "#e6edf3", prompt: true, t: "", cursor: true }],
  ],
  server: [
    [0,   { c: "#a1a1aa", t: "$ pnpm dev" }],
    [200, { c: "#a1a1aa", t: "> vite dev --host" }],
    [300, { c: "#e6edf3", t: "" }],
    [100, { c: "#e6edf3", t: "  VITE v7.0.4  ready in 412 ms" }],
    [50,  { c: "#e6edf3", t: "" }],
    [50,  { c: "#e6edf3", t: "  ➜  Local:   http://localhost:5173/" }],
    [50,  { c: "#71717a", t: "  ➜  press h + enter to show help" }],
    [400, { c: "#e6edf3", t: "", cursor: true }],
  ],
  logs: [
    [0,   { c: "#71717a", t: "[2026-04-18 09:14:22] GET /api/sessions 200 14ms" }],
    [80,  { c: "#71717a", t: "[2026-04-18 09:14:23] GET /api/workspaces 200 6ms" }],
    [80,  { c: "#d29922", t: "[2026-04-18 09:14:23] WARN retry queue depth = 3" }],
    [80,  { c: "#71717a", t: "[2026-04-18 09:14:24] POST /api/sessions 201 42ms" }],
    [80,  { c: "#71717a", t: "[2026-04-18 09:14:25] GET /api/sessions 200 9ms" }],
    [400, { c: "#e6edf3", t: "", cursor: true }],
  ],
  git: [
    [0,   { c: "#a1a1aa", t: "$ git status" }],
    [200, { c: "#e6edf3", t: "On branch main" }],
    [50,  { c: "#e6edf3", t: "Changes not staged for commit:" }],
    [50,  { c: "#ef4444", t: "  modified:   src/components/Sidebar.tsx" }],
    [50,  { c: "#ef4444", t: "  modified:   src/store/sessions.ts" }],
    [50,  { c: "#e6edf3", t: "" }],
    [50,  { c: "#e6edf3", t: "Untracked files:" }],
    [50,  { c: "#ef4444", t: "  src/components/CommandPalette.tsx" }],
    [300, { c: "#e6edf3", prompt: true, t: "", cursor: true }],
  ],
};

function TerminalPane({ sessionId, role, isActive }) {
  const T = window.TO_TOKENS;
  const ref = useRef(null);
  const [lines, setLines] = useStateTP([]);

  useEffect(() => {
    setLines([]);
    const script = SCRIPTS[role] || SCRIPTS.shell;
    const timers = [];
    let total = 0;
    script.forEach((entry, i) => {
      total += entry[0];
      timers.push(setTimeout(() => setLines((L) => [...L, { ...entry[1], key: `${sessionId}-${i}` }]), total));
    });
    return () => timers.forEach(clearTimeout);
  }, [sessionId, role]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={ref}
      style={{
        display: isActive ? "block" : "none", flex: 1, overflowY: "auto",
        background: T.bgApp, padding: "10px 14px",
        fontFamily: "var(--font-mono, 'Cascadia Code', 'Fira Code', Consolas, monospace)",
        fontSize: 13, lineHeight: 1.5, color: T.termFg,
      }}
    >
      {lines.map((ln) => (
        <div
          key={ln.key}
          style={{
            color: ln.c,
            borderTop: ln.divider ? `1px solid ${T.border1}` : "none",
            marginTop: ln.divider ? 4 : 0,
            paddingTop: ln.divider ? 2 : 0,
            whiteSpace: "pre",
          }}
        >
          {ln.prompt && <PromptSegment />}
          {ln.t}
          {ln.cursor && <BlinkCursor />}
        </div>
      ))}
    </div>
  );
}

function PromptSegment() {
  return (
    <>
      <span style={{ color: "#4ade80" }}>henri@cloudlab</span>
      <span style={{ color: "#a1a1aa" }}>:</span>
      <span style={{ color: "#58a6ff" }}>~/projects/spritepose</span>
      <span style={{ color: "#a1a1aa" }}>$ </span>
    </>
  );
}

function BlinkCursor() {
  return <span style={{ display: "inline-block", width: "0.6em", height: "1.1em", verticalAlign: "text-bottom", background: "#58a6ff", animation: "to-blink 1s steps(2, start) infinite" }} />;
}

window.TerminalPane = TerminalPane;
