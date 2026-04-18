// Sidebar: normal (160px) + compact (44px). Mirrors Sidebar.tsx + SessionList.tsx + SessionItem.tsx.
const { useState: useStateSB } = React;

function SessionItem({ session, isActive, onClick }) {
  const T = window.TO_TOKENS;
  const statusBg = session.status === "active" ? T.accent : session.status === "idle" ? T.statusIdle : T.fg5;
  const statusOp = session.status === "exited" ? 0.4 : 1;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 10px", cursor: "pointer", userSelect: "none",
        borderLeft: `2px solid ${isActive ? T.accent : "transparent"}`,
        background: isActive ? T.bgActive : "transparent",
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = T.bgChrome; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
          <span style={{ fontSize: 12, color: T.fg3, flexShrink: 0, fontFamily: session.role === "shell" ? "var(--font-mono, monospace)" : "inherit" }}>
            {window.TO_ROLE_ICONS[session.role]}
          </span>
          <span style={{ fontSize: 12, color: isActive ? T.fg1 : T.fg3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {session.name}
          </span>
        </div>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: statusBg, opacity: statusOp,
          animation: session.status === "active" ? "to-pulse 2s infinite" : "none",
          marginLeft: 4, flexShrink: 0,
        }} />
      </div>
      <div style={{ fontSize: 10, color: T.fg5, marginTop: 2, paddingLeft: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {session.cwd}
      </div>
    </div>
  );
}

function SessionList({ sessions, activeSessionId, onSelect }) {
  const T = window.TO_TOKENS;
  const [expanded, setExpanded] = useStateSB(false);
  const active = sessions.filter((s) => s.status !== "exited");
  const exited = sessions.filter((s) => s.status === "exited");
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {active.map((s) => (
        <SessionItem key={s.id} session={s} isActive={s.id === activeSessionId} onClick={() => onSelect(s.id)} />
      ))}
      {exited.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              padding: "6px 10px", textAlign: "left", fontSize: 10, color: T.fg5,
              letterSpacing: "0.15em", textTransform: "uppercase", background: "transparent",
              border: 0, borderTop: `1px solid ${T.border1}`, marginTop: 4, cursor: "pointer",
              fontFamily: "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.fg3)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.fg5)}
          >
            {expanded ? "▾" : "▸"} EXITED ({exited.length})
          </button>
          {expanded && exited.map((s) => (
            <SessionItem key={s.id} session={s} isActive={s.id === activeSessionId} onClick={() => onSelect(s.id)} />
          ))}
        </>
      )}
    </div>
  );
}

function Sidebar({ sessions, activeSessionId, mode, onSelect, onToggleMode, onNewSession }) {
  const T = window.TO_TOKENS;
  if (mode === "compact") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", width: 44,
        background: T.bgApp, borderRight: `1px solid ${T.border1}`, padding: "8px 0", gap: 4,
      }}>
        {sessions.map((s) => {
          const active = s.id === activeSessionId;
          const statusBg = s.status === "active" ? T.accent : s.status === "idle" ? T.statusIdle : T.fg5;
          const statusOp = s.status === "exited" ? 0.4 : 1;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              title={s.name}
              style={{
                position: "relative", width: "100%", display: "flex", justifyContent: "center",
                padding: "6px 0", fontSize: 14, background: active ? T.bgActive : "transparent",
                borderLeft: `2px solid ${active ? T.accent : "transparent"}`,
                borderTop: 0, borderRight: 0, borderBottom: 0, color: active ? T.fg1 : T.fg4,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {window.TO_ROLE_ICONS[s.role]}
              <span style={{
                position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: "50%",
                background: statusBg, opacity: statusOp,
                animation: s.status === "active" ? "to-pulse 2s infinite" : "none",
              }} />
            </button>
          );
        })}
        <button
          onClick={onToggleMode}
          style={{ marginTop: "auto", color: T.fg5, fontSize: 11, background: "transparent", border: 0, paddingBottom: 4, cursor: "pointer" }}
          title="Expand sidebar"
        >⟩</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 160, background: T.bgApp, borderRight: `1px solid ${T.border1}`, flexShrink: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        <div style={{ padding: "0 10px", marginBottom: 6, fontSize: 9, letterSpacing: "0.15em", color: T.fg5, textTransform: "uppercase" }}>
          Sessions
        </div>
        <SessionList sessions={sessions} activeSessionId={activeSessionId} onSelect={onSelect} />
      </div>
      <div style={{ display: "flex", gap: 6, padding: 8, borderTop: `1px solid ${T.border1}` }}>
        <button
          onClick={onNewSession}
          style={{ flex: 1, background: T.bgElev, color: T.fg4, fontSize: 11, padding: "4px 0", borderRadius: 4, border: 0, cursor: "pointer", fontFamily: "inherit" }}
        >+ New</button>
        <button
          onClick={onToggleMode}
          style={{ background: T.bgElev, color: T.fg4, fontSize: 11, padding: "4px 8px", borderRadius: 4, border: 0, cursor: "pointer", fontFamily: "inherit" }}
          title="Compact mode"
        >⟨</button>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
