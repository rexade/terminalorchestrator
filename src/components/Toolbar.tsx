import { useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Workspace } from "../types/session"

const win = () => getCurrentWindow()

interface ToolbarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: (name: string) => void
  onRenameWorkspace: (id: string, name: string) => void
  onDeleteWorkspace: (id: string) => void
  onNewSession: () => void
}

export function Toolbar({
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onNewSession,
}: ToolbarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [renameName, setRenameName] = useState("")

  const handleCreate = () => {
    if (newName.trim()) {
      onCreateWorkspace(newName.trim())
      setNewName("")
      setCreating(false)
    }
  }

  const handleStartRename = () => {
    const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)
    setRenameName(activeWs?.name ?? "")
    setRenaming(true)
  }

  const handleRename = () => {
    if (renameName.trim() && activeWorkspaceId) {
      onRenameWorkspace(activeWorkspaceId, renameName.trim())
      setRenaming(false)  // only close on success
    }
    // empty: stay open, user can Escape to cancel
  }

  const handleCancelRename = () => {
    setRenaming(false)
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase()
    if (!["button", "input", "select", "option"].includes(tag)) {
      void win().startDragging()
    }
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-8 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between px-3 select-none shrink-0"
    >
      <div className="flex items-center gap-2">
        <span className="text-zinc-600 text-xs">termorchestra</span>
      </div>

      <div className="flex items-center gap-2">
        {creating ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
              if (e.key === "Escape") setCreating(false)
            }}
            placeholder="Workspace name..."
            className="bg-[#21262d] text-zinc-200 text-xs border border-[#30363d] rounded px-2 py-0.5 w-36 outline-none"
          />
        ) : renaming ? (
          <input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename()
              if (e.key === "Escape") handleCancelRename()
            }}
            onBlur={handleRename}
            placeholder="Workspace name..."
            className="bg-[#21262d] text-zinc-200 text-xs border border-[#30363d] rounded px-2 py-0.5 w-36 outline-none"
          />
        ) : (
          <>
            {workspaces.length > 0 && (
              <select
                value={activeWorkspaceId ?? ""}
                onChange={(e) => onSwitchWorkspace(e.target.value)}
                className="bg-transparent text-zinc-400 text-xs border border-[#30363d] rounded px-2 py-0.5 cursor-pointer"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setCreating(true)}
              className="text-zinc-600 hover:text-zinc-400 text-xs"
              title="New workspace"
            >
              +ws
            </button>
            {activeWorkspaceId && (
              <button
                onClick={handleStartRename}
                className="text-zinc-600 hover:text-zinc-400 text-xs"
                title="Rename workspace"
              >
                ren
              </button>
            )}
            {workspaces.length > 1 && (
              <button
                onClick={() => activeWorkspaceId && onDeleteWorkspace(activeWorkspaceId)}
                className="text-zinc-600 hover:text-zinc-400 text-xs"
                title="Delete workspace"
              >
                ×
              </button>
            )}
          </>
        )}
        <button
          onClick={onNewSession}
          className="text-zinc-500 hover:text-zinc-300 text-base leading-none"
          title="New session"
        >
          ⊕
        </button>
        <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-[#21262d]">
          <button onClick={() => win().minimize()} className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#21262d] rounded text-xs" title="Minimize">─</button>
          <button onClick={() => win().toggleMaximize()} className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#21262d] rounded text-xs" title="Maximize">□</button>
          <button onClick={() => win().close()} className="w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-[#21262d] rounded text-xs" title="Close">✕</button>
        </div>
      </div>
    </div>
  )
}
