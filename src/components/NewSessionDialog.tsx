import { useState, useEffect } from "react"
import { SessionRole, SessionType } from "../types/session"
import { checkWslAvailable } from "../lib/tauri"
import { open } from "@tauri-apps/plugin-dialog"

export interface NewSessionValues {
  name: string
  role: SessionRole
  sessionType: SessionType
  cwd: string
}

const ROLES: { role: SessionRole; label: string; icon: string }[] = [
  { role: "claude", label: "Claude", icon: "⬡" },
  { role: "shell", label: "Shell", icon: "$" },
  { role: "server", label: "Server", icon: "◈" },
  { role: "logs", label: "Logs", icon: "≡" },
  { role: "git", label: "Git", icon: "⑂" },
]

interface NewSessionDialogProps {
  recentCwds: string[]
  onConfirm: (values: NewSessionValues) => void
  onCancel: () => void
}

export function NewSessionDialog({ recentCwds, onConfirm, onCancel }: NewSessionDialogProps) {
  const [role, setRole] = useState<SessionRole>("shell")
  const [sessionType, setSessionType] = useState<SessionType>("local")
  const [cwd, setCwd] = useState(recentCwds[0] ?? "~")
  const [wslAvailable, setWslAvailable] = useState(false)

  useEffect(() => {
    checkWslAvailable().then(setWslAvailable)
  }, [])

  const label = ROLES.find((r) => r.role === role)?.label ?? "Shell"

  const handleBrowse = async () => {
    try {
      const picked = await open({ directory: true, multiple: false, defaultPath: cwd })
      if (picked && typeof picked === "string") {
        setCwd(picked)
      }
    } catch {
      // dialog dismissed or IPC unavailable
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 w-80 flex flex-col gap-4">
        <h2 className="text-sm text-zinc-200 font-medium">New Session</h2>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Role</label>
          <div className="grid grid-cols-3 gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r.role}
                onClick={() => setRole(r.role)}
                className={[
                  "flex flex-col items-center py-2 rounded text-xs gap-1",
                  role === r.role
                    ? "bg-blue-600/20 border border-blue-500/50 text-blue-300"
                    : "bg-[#21262d] text-zinc-500 hover:text-zinc-300",
                ].join(" ")}
              >
                <span>{r.icon}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Type</label>
          <div className="flex gap-2">
            {(["local", ...(wslAvailable ? ["wsl"] : [])] as SessionType[]).map((t) => (
              <button
                key={t}
                onClick={() => setSessionType(t)}
                className={[
                  "px-3 py-1 rounded text-xs",
                  sessionType === t
                    ? "bg-[#21262d] text-zinc-200 border border-[#58a6ff]/50"
                    : "bg-[#21262d] text-zinc-500",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 block">Folder</label>
          <select
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            className="w-full bg-[#21262d] text-zinc-300 text-xs rounded px-2 py-1.5 border border-[#30363d]"
          >
            {recentCwds.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
            {!recentCwds.includes("~") && <option value="~">~ (home)</option>}
            {cwd && !recentCwds.includes(cwd) && cwd !== "~" && (
              <option key={cwd} value={cwd}>{cwd}</option>
            )}
          </select>
          <button
            type="button"
            onClick={handleBrowse}
            className="mt-1.5 w-full bg-[#21262d] text-zinc-500 text-xs py-1 rounded hover:text-zinc-300 border border-[#30363d]"
          >
            Browse
          </button>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ name: label, role, sessionType, cwd })}
            className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  )
}
