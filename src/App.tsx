import { useEffect, useRef, useState } from "react"
import { Toolbar } from "./components/Toolbar"
import { Sidebar } from "./components/Sidebar"
import { TerminalPane } from "./components/TerminalPane"
import { StatusBar } from "./components/StatusBar"
import { NewSessionDialog, NewSessionValues } from "./components/NewSessionDialog"
import { useSessionStore } from "./store/sessions"
import { useUIStore } from "./store/ui"
import { createSession } from "./lib/tauri"

export default function App() {
  const {
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    addSession,
    setActiveWorkspace,
    recentCwds,
    addRecentCwd,
  } = useSessionStore()
  const {
    activeSessionId,
    sidebarMode,
    isAtBottom,
    setActiveSession,
    setSidebarMode,
    setIsAtBottom,
  } = useUIStore()

  const [showDialog, setShowDialog] = useState(false)
  const sessionPtyMap = useRef<Record<string, string>>({})
  const scrollToBottomRef = useRef<(() => void) | null>(null)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const sessions = activeWorkspace?.sessions ?? []

  // Seed first workspace on first run
  useEffect(() => {
    if (workspaces.length === 0) {
      addWorkspace("Workspace 1")
    }
  }, [])

  const handleNewSession = async (values: NewSessionValues) => {
    if (!activeWorkspaceId) return
    setShowDialog(false)
    addRecentCwd(values.cwd)
    const ptyId = await createSession({
      name: values.name,
      role: values.role,
      sessionType: values.sessionType,
      cwd: values.cwd,
      cols: 220,
      rows: 50,
    })
    const storeId = addSession(activeWorkspaceId, {
      name: values.name,
      role: values.role,
      type: values.sessionType,
      cwd: values.cwd,
    })
    sessionPtyMap.current[storeId] = ptyId
    setActiveSession(storeId)
  }

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-zinc-300 overflow-hidden">
      <Toolbar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchWorkspace={setActiveWorkspace}
        onCreateWorkspace={addWorkspace}
        onNewSession={() => setShowDialog(true)}
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          mode={sidebarMode}
          onSelect={setActiveSession}
          onToggleMode={() =>
            setSidebarMode(sidebarMode === "normal" ? "compact" : "normal")
          }
          onNewSession={() => setShowDialog(true)}
        />

        <div className="flex flex-col flex-1 min-w-0">
          {sessions
            .filter((s) => s.status !== "exited")
            .map((s) => (
              <TerminalPane
                key={s.id}
                sessionId={sessionPtyMap.current[s.id] ?? s.id}
                isActive={s.id === activeSessionId}
                onScrollChange={s.id === activeSessionId ? setIsAtBottom : undefined}
                scrollToBottomRef={s.id === activeSessionId ? scrollToBottomRef : undefined}
              />
            ))}
        </div>
      </div>

      <StatusBar
        activeSession={sessions.find((s) => s.id === activeSessionId) ?? null}
        allSessions={sessions}
        isAtBottom={isAtBottom}
        activeSessionId={activeSessionId}
        onJumpToBottom={() => scrollToBottomRef.current?.()}
      />

      {showDialog && (
        <NewSessionDialog
          recentCwds={recentCwds}
          onConfirm={handleNewSession}
          onCancel={() => setShowDialog(false)}
        />
      )}
    </div>
  )
}
