import { useState } from "react"
import { Workspace } from "../types/session"

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
    }
    setRenaming(false)
  }

  const handleCancelRename = () => {
    setRenaming(false)
  }

  return (
    <div
      data-tauri-drag-region
      className="h-8 bg-[#161b22] border-b border-[#21262d] flex items-center justify-between px-3 select-none shrink-0"
    >
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#f85149]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#d29922]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#3fb950]" />
        </div>
        <span className="text-zinc-600 text-xs ml-1">termorchestra</span>
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
            onBlur={handleCancelRename}
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
                onClick={() => onDeleteWorkspace(activeWorkspaceId!)}
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
      </div>
    </div>
  )
}
