import { useState } from "react"
import { Layout, Session } from "../types/session"

interface StatusBarProps {
  activeSession: Session | null
  allSessions: Session[]
  isAtBottom: boolean
  onJumpToBottom: () => void
  sessionError?: string | null
  layout: Layout
  onSetLayout: (layout: Layout) => void
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
}: StatusBarProps) {
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const shellLabel = activeSession ? (SHELL_LABEL[activeSession.type] ?? activeSession.type) : "—"

  return (
    <div className="h-5 bg-[#161b22] border-t border-[#21262d] flex items-center justify-between px-3 text-[10px] text-zinc-600 shrink-0 relative">
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
          title="Layout"
          onClick={() => setShowLayoutPicker((v) => !v)}
          className={`text-[10px] leading-none transition-colors ${
            showLayoutPicker ? "text-zinc-300" : "text-zinc-600 hover:text-zinc-400"
          }`}
        >
          ⊞
        </button>
      </div>

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
              className={`w-7 h-7 flex items-center justify-center rounded text-[10px] leading-none transition-colors ${
                layout === opt.value
                  ? "bg-blue-900 text-blue-300"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-[#21262d]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
