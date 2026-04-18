import { useEffect, useRef, useState } from "react"
import { Toolbar } from "./components/Toolbar"
import { Sidebar } from "./components/Sidebar"
import { LayoutGrid } from "./components/LayoutGrid"
import { StatusBar } from "./components/StatusBar"
import { NewSessionDialog, NewSessionValues } from "./components/NewSessionDialog"
import { useSessionStore } from "./store/sessions"
import { useUIStore } from "./store/ui"
import { createSession, loadPersistedState, savePersistedState } from "./lib/tauri"
import { AppState, LAYOUT_SLOT_COUNT } from "./types/session"

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
    layout,
    paneMap,
    activePaneIndex,
    setActiveSession,
    setSidebarMode,
    setIsAtBottom,
    setLayout,
    setPaneSession,
    setActivePaneIndex,
  } = useUIStore()

  const [showDialog, setShowDialog] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [ptyMapStamp, setPtyMapStamp] = useState(0)
  const sessionPtyMap = useRef<Record<string, string>>({})
  const scrollToBottomRef = useRef<(() => void) | null>(null)
  const hasLoaded = useRef(false)
  // Track which pane an empty-slot click targets for session assignment
  const pendingPaneIndex = useRef<number | null>(null)

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
                useSessionStore.getState().setSessionStatus(ws.id, session.id, "exited")
              }
            }
          }
          setPtyMapStamp((n) => n + 1)
        } else {
          hasLoaded.current = true
        }
      } catch {
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

  // Seed first workspace on first run
  useEffect(() => {
    const timer = setTimeout(() => {
      if (useSessionStore.getState().workspaces.length === 0) {
        addWorkspace("Workspace 1")
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Listen for session_exited events from Rust backend
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

        // Clear from any pane slot
        const ui = useUIStore.getState()
        ui.paneMap.forEach((sid, i) => {
          if (sid === storeId) ui.setPaneSession(i, null)
        })

        // Auto-select next session in active pane if this was it
        if (ui.activeSessionId === storeId) {
          const next = useSessionStore
            .getState()
            .workspaces.find((w) => w.id === ws.id)
            ?.sessions.find((s) => s.status !== "exited" && s.id !== storeId)
          useUIStore.getState().setActiveSession(next?.id ?? null)
        }
      })
    }
    setup()
    return () => { unlisten?.() }
  }, [])

  // Ctrl+1/2/3/4 to focus panes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return
      const num = parseInt(e.key)
      if (num >= 1 && num <= 4) {
        const slotCount = LAYOUT_SLOT_COUNT[useUIStore.getState().layout]
        if (num <= slotCount) {
          e.preventDefault()
          e.stopPropagation()
          setActivePaneIndex(num - 1)
        }
      }
    }
    window.addEventListener("keydown", handler, { capture: true })
    return () => window.removeEventListener("keydown", handler, { capture: true })
  }, [])

  const handleSelectSession = (sessionId: string) => {
    if (pendingPaneIndex.current !== null) {
      // Assign to a specific pane (from empty pane click)
      setPaneSession(pendingPaneIndex.current, sessionId)
      setActivePaneIndex(pendingPaneIndex.current)
      pendingPaneIndex.current = null
      setShowDialog(false)
      return
    }
    // Normal select: assign to active pane
    setActiveSession(sessionId)
    const wsId = useSessionStore.getState().activeWorkspaceId
    if (wsId) setLastOpenedSession(wsId, sessionId)
  }

  const handleSwitchWorkspace = (workspaceId: string) => {
    setActiveWorkspace(workspaceId)
    const ws = useSessionStore.getState().workspaces.find((w) => w.id === workspaceId)
    if (!ws) return
    const session =
      ws.sessions.find((s) => s.id === ws.lastOpenedSessionId && s.status !== "exited") ??
      ws.sessions.find((s) => s.status !== "exited")
    setActiveSession(session?.id ?? null)
  }

  const handleDeleteWorkspace = (id: string) => {
    removeWorkspace(id)
    const newActiveId = useSessionStore.getState().activeWorkspaceId
    if (newActiveId) handleSwitchWorkspace(newActiveId)
    else setActiveSession(null)
  }

  const handleCloseSession = async (sessionId: string) => {
    const ptyId = sessionPtyMap.current[sessionId]
    if (ptyId) {
      const { killSession } = await import("./lib/tauri")
      await killSession(ptyId).catch(() => {})
    }
  }

  const handleAssignSession = (paneIndex: number, sessionId: string) => {
    setPaneSession(paneIndex, sessionId)
    setActivePaneIndex(paneIndex)
  }

  const handleDetachPane = (paneIndex: number) => {
    setPaneSession(paneIndex, null)
  }

  const handleEmptyPaneNewSession = (paneIndex: number) => {
    pendingPaneIndex.current = paneIndex
    setActivePaneIndex(paneIndex)
    setShowDialog(true)
  }

  const handleNewSession = async (values: NewSessionValues) => {
    if (!activeWorkspaceId) return
    setShowDialog(false)
    addRecentCwd(values.cwd)
    try {
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
      setPtyMapStamp((n) => n + 1)

      if (pendingPaneIndex.current !== null) {
        setPaneSession(pendingPaneIndex.current, storeId)
        setActivePaneIndex(pendingPaneIndex.current)
        pendingPaneIndex.current = null
      } else {
        setActiveSession(storeId)
      }
      setSessionError(null)
    } catch (err) {
      setSessionError(String(err))
      pendingPaneIndex.current = null
    }
  }

  const handleDialogCancel = () => {
    setShowDialog(false)
    pendingPaneIndex.current = null
  }

  // ptyMapStamp is read here so the component re-renders when PTY map changes
  void ptyMapStamp

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
          onClose={handleCloseSession}
          onToggleMode={() =>
            setSidebarMode(sidebarMode === "normal" ? "compact" : "normal")
          }
          onNewSession={() => setShowDialog(true)}
        />

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <LayoutGrid
            layout={layout}
            paneMap={paneMap}
            activePaneIndex={activePaneIndex}
            sessions={sessions}
            sessionPtyMap={sessionPtyMap.current}
            onPaneFocus={setActivePaneIndex}
            onScrollChange={setIsAtBottom}
            scrollToBottomRef={scrollToBottomRef}
            onAssignSession={handleAssignSession}
            onNewSession={handleEmptyPaneNewSession}
            onDetachPane={handleDetachPane}
          />
        </div>
      </div>

      <StatusBar
        activeSession={sessions.find((s) => s.id === activeSessionId) ?? null}
        allSessions={sessions}
        isAtBottom={isAtBottom}
        onJumpToBottom={() => scrollToBottomRef.current?.()}
        sessionError={sessionError}
        layout={layout}
        onSetLayout={setLayout}
      />

      {showDialog && (
        <NewSessionDialog
          recentCwds={recentCwds}
          onConfirm={handleNewSession}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  )
}
