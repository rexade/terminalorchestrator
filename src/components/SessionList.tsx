import { useState } from "react"
import { Session } from "../types/session"
import { SessionItem } from "./SessionItem"

interface SessionListProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelect: (id: string) => void
}

export function SessionList({ sessions, activeSessionId, onSelect }: SessionListProps) {
  const [exitedExpanded, setExitedExpanded] = useState(false)
  const active = sessions.filter((s) => s.status !== "exited")
  const exited = sessions.filter((s) => s.status === "exited")

  return (
    <div className="flex flex-col">
      {active.map((s) => (
        <SessionItem
          key={s.id}
          session={s}
          isActive={s.id === activeSessionId}
          onClick={() => onSelect(s.id)}
        />
      ))}

      {exited.length > 0 && (
        <>
          <button
            onClick={() => setExitedExpanded((v) => !v)}
            className="px-2.5 py-1.5 text-left text-[10px] text-zinc-600 tracking-[0.15em] uppercase hover:text-zinc-400 mt-1 border-t border-[#21262d]"
          >
            {exitedExpanded ? "▾" : "▸"} EXITED ({exited.length})
          </button>
          {exitedExpanded &&
            exited.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isActive={s.id === activeSessionId}
                onClick={() => onSelect(s.id)}
              />
            ))}
        </>
      )}
    </div>
  )
}
