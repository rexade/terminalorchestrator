import { Session } from "../types/session"

interface StatusBarProps {
  activeSession: Session | null
  allSessions: Session[]
  isAtBottom: boolean
  onJumpToBottom: () => void
}

export function StatusBar({
  activeSession,
  allSessions,
  isAtBottom,
  onJumpToBottom,
}: StatusBarProps) {
  const shellLabel = activeSession?.type === "wsl" ? "wsl · bash" : "local · bash"
  const errorSessions = allSessions.filter((s) => s.status === "exited").slice(0, 2)

  return (
    <div className="h-5 bg-[#161b22] border-t border-[#21262d] flex items-center justify-between px-3 text-[10px] text-zinc-600 shrink-0">
      <div className="flex gap-3 items-center">
        <span>{shellLabel}</span>
        {activeSession && (
          <span className="text-zinc-700">{activeSession.cwd}</span>
        )}
      </div>
      <div className="flex gap-2 items-center">
        {errorSessions.map((s) => (
          <span key={s.id} className="text-red-500">
            ⚠ {s.name}
          </span>
        ))}
        {!isAtBottom && (
          <button
            title="Jump to latest output"
            onClick={onJumpToBottom}
            className="text-blue-400 hover:text-blue-300 leading-none"
          >
            ↓
          </button>
        )}
        <button
          disabled
          title="Overview (v1.1)"
          className="text-zinc-700 cursor-not-allowed opacity-40 leading-none"
        >
          ⊞
        </button>
      </div>
    </div>
  )
}
