// NewSessionDialog — mirrors NewSessionDialog.tsx.
const { useState: useStateND } = React;

function NewSessionDialog({ recentCwds, onConfirm, onCancel }) {
  const T = window.TO_TOKENS;
  const [role, setRole] = useStateND("shell");
  const [sessionType, setType] = useStateND("local");
  const [cwd, setCwd] = useStateND(recentCwds[0] ?? "~");
  const label = window.TO_ROLES.find((r) => r.role === role)?.label ?? "Shell";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
    }}>
      <div style={{
        background: T.bgChrome, border: `1px solid ${T.border2}`, borderRadius: 8,
        padding: 20, width: 320, display: "flex", flexDirection: "column", gap: 16,
      }}>
        <h2 style={{ fontSize: 13, color: T.fg2, fontWeight: 500, margin: 0 }}>New Session</h2>

        <div>
          <label style={{ fontSize: 10, color: T.fg4, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6, display: "block" }}>Role</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {window.TO_ROLES.map((r) => {
              const sel = role === r.role;
              return (
                <button
                  key={r.role}
                  onClick={() => setRole(r.role)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    padding: "8px 0", borderRadius: 4, fontSize: 11, cursor: "pointer",
                    fontFamily: "inherit",
                    background: sel ? "rgba(37,99,235,0.2)" : T.bgElev,
                    border: sel ? "1px solid rgba(59,130,246,0.5)" : "1px solid transparent",
                    color: sel ? "#93c5fd" : T.fg4,
                  }}
                >
                  <span style={{ fontFamily: r.role === "shell" ? "var(--font-mono, monospace)" : "inherit" }}>{r.icon}</span>
                  <span>{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 10, color: T.fg4, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6, display: "block" }}>Type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["local", "wsl"].map((t) => {
              const sel = sessionType === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  style={{
                    padding: "4px 12px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                    background: T.bgElev, fontFamily: "inherit",
                    border: sel ? "1px solid rgba(88,166,255,0.5)" : "1px solid transparent",
                    color: sel ? T.fg2 : T.fg4,
                  }}
                >{t}</button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 10, color: T.fg4, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6, display: "block" }}>Folder</label>
          <select
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            style={{
              width: "100%", background: T.bgElev, color: T.fg3, fontSize: 11,
              borderRadius: 4, padding: "6px 8px", border: `1px solid ${T.border2}`,
              fontFamily: "inherit",
            }}
          >
            {recentCwds.map((d) => <option key={d} value={d}>{d}</option>)}
            {!recentCwds.includes("~") && <option value="~">~ (home)</option>}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{ padding: "6px 12px", fontSize: 11, color: T.fg4, background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit" }}
          >Cancel</button>
          <button
            onClick={() => onConfirm({ name: label, role, sessionType, cwd })}
            style={{ padding: "6px 16px", fontSize: 11, background: T.accentFill, color: "#fff", borderRadius: 4, border: 0, cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.accentFillH)}
            onMouseLeave={(e) => (e.currentTarget.style.background = T.accentFill)}
          >Open</button>
        </div>
      </div>
    </div>
  );
}

window.NewSessionDialog = NewSessionDialog;
