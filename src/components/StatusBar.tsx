import { Session } from "../types/session"

interface StatusBarProps {
  activeSession: Session | null
  allSessions: Session[]
  isAtBottom: boolean
  onJumpToBottom: () => void
  sessionError?: string | null
}

const SHELL_LABEL: Record<string, string> = {
  cmd: "cmd",
  powershell: "powershell",
  wsl: "wsl · bash",
  ssh: "ssh",
}

export function StatusBar({
  activeSession,
  allSessions: _allSessions,
  isAtBottom,
  onJumpToBottom,
  sessionError,
}: StatusBarProps) {
  const shellLabel = activeSession ? (SHELL_LABEL[activeSession.type] ?? activeSession.type) : "—"

  return (
    <div className="h-5 bg-[#161b22] border-t border-[#21262d] flex items-center justify-between px-3 text-[10px] text-zinc-600 shrink-0">
      <div className="flex gap-3 items-center">
        <span>{shellLabel}</span>
        {activeSession && (
          <span className="text-zinc-700">{activeSession.cwd}</span>
        )}
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
