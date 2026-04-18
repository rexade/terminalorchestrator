// Chrome: Toolbar (32px) + StatusBar (20px). Mirrors Toolbar.tsx + StatusBar.tsx.
const { useState } = React;

function Toolbar({ workspaces, activeWs, onSwitchWs, onCreateWs, onNewSession }) {
  const T = window.TO_TOKENS;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    if (name.trim()) { onCreateWs(name.trim()); setName(""); setCreating(false); }
  };

  const chromeBtn = { background: "transparent", border: 0, font: "inherit", cursor: "pointer", padding: 0 };

  return (
    <div style={{
      height: 32, background: T.bgChrome, borderBottom: `1px solid ${T.border1}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 12px", userSelect: "none", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.tlRed }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.tlYel }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.tlGrn }} />
        </div>
        <span style={{ color: T.fg5, fontSize: 11, marginLeft: 4 }}>termorchestra</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {creating ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setCreating(false); }}
            placeholder="Workspace name..."
            style={{
              background: T.bgElev, color: T.fg2, fontSize: 11, border: `1px solid ${T.border2}`,
              borderRadius: 4, padding: "2px 8px", width: 144, outline: "none", fontFamily: "inherit",
            }}
          />
        ) : (
          <>
            <select
              value={activeWs ?? ""}
              onChange={(e) => onSwitchWs(e.target.value)}
              style={{
                background: "transparent", color: T.fg3, fontSize: 11,
                border: `1px solid ${T.border2}`, borderRadius: 4, padding: "1px 8px",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button style={{ ...chromeBtn, color: T.fg5, fontSize: 11 }} onClick={() => setCreating(true)} title="New workspace">+ws</button>
          </>
        )}
        <button style={{ ...chromeBtn, color: T.fg4, fontSize: 16, lineHeight: 1 }} onClick={onNewSession} title="New session">⊕</button>
      </div>
    </div>
  );
}

function StatusBar({ activeSession, allSessions, isAtBottom, onJumpToBottom }) {
  const T = window.TO_TOKENS;
  const shellLabel = activeSession?.type === "wsl" ? "wsl · bash" : "local · bash";
  const errorSessions = allSessions.filter((s) => s.status === "exited").slice(0, 2);

  return (
    <div style={{
      height: 20, background: T.bgChrome, borderTop: `1px solid ${T.border1}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 12px", fontSize: 10, color: T.fg5, flexShrink: 0,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span>{shellLabel}</span>
        {activeSession && <span style={{ color: T.fg6 }}>{activeSession.cwd}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {errorSessions.map((s) => (
          <span key={s.id} style={{ color: T.statusErr }}>⚠ {s.name}</span>
        ))}
        {!isAtBottom && (
          <button
            onClick={onJumpToBottom}
            style={{ background: "transparent", border: 0, color: T.accent, fontSize: 12, cursor: "pointer", lineHeight: 1, padding: 0 }}
            title="Jump to latest"
          >↓</button>
        )}
      </div>
    </div>
  );
}

window.Toolbar = Toolbar;
window.StatusBar = StatusBar;
