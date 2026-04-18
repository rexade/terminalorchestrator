import { useEffect, useRef, useState } from "react"
import { Toolbar } from "./components/Toolbar"
import { Sidebar } from "./components/Sidebar"
import { TerminalPane } from "./components/TerminalPane"
import { StatusBar } from "./components/StatusBar"
import { NewSessionDialog, NewSessionValues } from "./components/NewSessionDialog"
import { useSessionStore } from "./store/sessions"
import { useUIStore } from "./store/ui"
import { createSession, loadPersistedState, savePersistedState } from "./lib/tauri"
import { AppState } from "./types/session"

export default function App() {
  const {
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    removeWorkspace,
    renameWorkspace,
    addSession,
    setActiveWorkspace,
    recentCwds,
    addRecentCwd,
    setLastOpenedSession,
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
  const hasLoaded = useRef(false)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const sessions = activeWorkspace?.sessions ?? []

  // Load persisted state on mount
  useEffect(() => {
    (async () => {
      try {
        const json = await loadPersistedState()
        const state: AppState = JSON.parse(json)
        if (state.workspaces?.length) {
          useSessionStore.getState().loadState(
            state.workspaces,
            state.activeWorkspaceId ?? null,
            state.recentCwds ?? []
          )
          if (state.activeWorkspaceId) {
            setActiveWorkspace(state.activeWorkspaceId)
          }
          if (state.sidebarMode === "normal" || state.sidebarMode === "compact") {
            setSidebarMode(state.sidebarMode)
          }
          // Restore last opened session, falling back to first non-exited
          const activeWs = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
          const lastSession = activeWs?.sessions.find(
            (s) => s.id === activeWs.lastOpenedSessionId && s.status !== "exited"
          )
          const toActivate = lastSession ?? activeWs?.sessions.find((s) => s.status !== "exited")
          if (toActivate) setActiveSession(toActivate.id)
          hasLoaded.current = true

          // Re-spawn PTYs for restored sessions
          for (const ws of state.workspaces) {
            for (const session of ws.sessions) {
              if (session.status === "exited") continue
              try {
                const ptyId = await createSession({
                  name: session.name,
                  role: session.role,
                  sessionType: session.type,
                  cwd: session.cwd,
                  cols: 80,
                  rows: 24,
                })
                sessionPtyMap.current[session.id] = ptyId
              } catch {
                // If spawn fails, mark session as exited
                useSessionStore.getState().setSessionStatus(
                  ws.id,
                  session.id,
                  "exited"
                )
              }
            }
          }
        } else {
          hasLoaded.current = true
        }
      } catch {
        // Corrupted state — start fresh
        hasLoaded.current = true
      }
    })()
  }, [])

  // Auto-save whenever workspaces, activeWorkspaceId, or sidebarMode changes
  const sessionState = useSessionStore()
  useEffect(() => {
    if (!hasLoaded.current) return
    const toSave: AppState = {
      workspaces: sessionState.workspaces,
      activeWorkspaceId: sessionState.activeWorkspaceId,
      recentCwds: sessionState.recentCwds,
      sidebarMode,
    }
    savePersistedState(JSON.stringify(toSave))
  }, [sessionState.workspaces, sessionState.activeWorkspaceId, sessionState.recentCwds, sidebarMode])

  // Seed first workspace on first run (only if nothing was loaded from persistence)
  useEffect(() => {
    // Small delay to let the load effect run first
    const timer = setTimeout(() => {
      if (useSessionStore.getState().workspaces.length === 0) {
        addWorkspace("Workspace 1")
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Listen for session_exited events from the Rust backend
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setup = async () => {
      const { listen } = await import("@tauri-apps/api/event")
      unlisten = await listen<string>("session_exited", (event) => {
        const ptyId = event.payload
        const entry = Object.entries(sessionPtyMap.current).find(([, v]) => v === ptyId)
        if (!entry) return
        const [storeId] = entry
        const store = useSessionStore.getState()
        const ws = store.workspaces.find((w) => w.sessions.some((s) => s.id === storeId))
        if (!ws) return
        store.setSessionStatus(ws.id, storeId, "exited")
        delete sessionPtyMap.current[storeId]

        // Auto-select next session if the active one just exited
        const { activeSessionId, setActiveSession } = useUIStore.getState()
        if (activeSessionId === storeId) {
          const next = useSessionStore
            .getState()
            .workspaces
            .find((w) => w.id === ws.id)
            ?.sessions
            .find((s) => s.status !== "exited" && s.id !== storeId)
          setActiveSession(next?.id ?? null)
        }
      })
    }
    setup()
    return () => {
      unlisten?.()
    }
  }, [])

  const handleSelectSession = (sessionId: string) => {
    setActiveSession(sessionId)
    const wsId = useSessionStore.getState().activeWorkspaceId
    if (wsId) setLastOpenedSession(wsId, sessionId)
  }

  const handleSwitchWorkspace = (workspaceId: string) => {
    setActiveWorkspace(workspaceId)
    const ws = useSessionStore.getState().workspaces.find((w) => w.id === workspaceId)
    if (!ws) return
    const session = ws.sessions.find(
      (s) => s.id === ws.lastOpenedSessionId && s.status !== "exited"
    ) ?? ws.sessions.find((s) => s.status !== "exited")
    setActiveSession(session?.id ?? null)
  }

  const handleDeleteWorkspace = (id: string) => {
    removeWorkspace(id)
    const newActiveId = useSessionStore.getState().activeWorkspaceId
    if (newActiveId) handleSwitchWorkspace(newActiveId)
    else setActiveSession(null)
  }

  const handleNewSession = async (values: NewSessionValues) => {
    if (!activeWorkspaceId) return
    setShowDialog(false)
    addRecentCwd(values.cwd)
    const ptyId = await createSession({
      name: values.name,
      role: values.role,
      sessionType: values.sessionType,
      cwd: values.cwd,
      cols: 80,
      rows: 24,
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
        onSwitchWorkspace={handleSwitchWorkspace}
        onCreateWorkspace={addWorkspace}
        onRenameWorkspace={renameWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onNewSession={() => setShowDialog(true)}
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          mode={sidebarMode}
          onSelect={handleSelectSession}
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
                role={s.role}
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
