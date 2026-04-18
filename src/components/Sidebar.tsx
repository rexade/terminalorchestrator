import { Session, SidebarMode, ROLE_ICONS } from "../types/session"
import { SessionList } from "./SessionList"

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
              s.id === activeSessionId
                ? "border-l-2 border-blue-400 bg-[#1f2937]"
                : "border-l-2 border-transparent text-zinc-500 hover:bg-[#161b22]",
            ].join(" ")}
          >
            {ROLE_ICONS[s.role]}
            <span
              className={[
                "absolute top-1 right-1 w-1.5 h-1.5 rounded-full",
                s.status === "active"
                  ? "bg-blue-400 animate-pulse"
                  : s.status === "idle"
                  ? "bg-green-400"
                  : "bg-zinc-600 opacity-40",
              ].join(" ")}
            />
          </button>
        ))}
        <button
          onClick={onToggleMode}
          className="mt-auto text-zinc-600 hover:text-zinc-400 text-xs pb-1"
          title="Expand sidebar"
        >
          ⟩
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-40 bg-[#0d1117] border-r border-[#21262d]">
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-2.5 mb-1.5 text-[9px] tracking-[0.15em] text-zinc-600 uppercase">
          Sessions
        </div>
        <SessionList sessions={sessions} activeSessionId={activeSessionId} onSelect={onSelect} />
      </div>
      <div className="flex gap-1.5 p-2 border-t border-[#21262d]">
        <button
          onClick={onNewSession}
          className="flex-1 bg-[#21262d] text-zinc-500 text-xs py-1 rounded hover:text-zinc-300"
        >
          + New
        </button>
        <button
          onClick={onToggleMode}
          className="bg-[#21262d] text-zinc-500 text-xs px-2 py-1 rounded hover:text-zinc-300"
          title="Compact mode"
        >
          ⟨
        </button>
      </div>
    </div>
  )
}
