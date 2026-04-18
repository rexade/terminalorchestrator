import { create } from "zustand"
import { Session, SessionRole, SessionStatus, SessionType, Workspace } from "../types/session"

interface NewSessionParams {
  name: string
  role: SessionRole
  type: SessionType
  cwd: string
}

interface SessionStore {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  recentCwds: string[]

  addWorkspace: (name: string) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string) => void

  addSession: (workspaceId: string, params: NewSessionParams) => string
  removeSession: (workspaceId: string, sessionId: string) => void
  setSessionStatus: (workspaceId: string, sessionId: string, status: SessionStatus) => void
  setSessionCwd: (workspaceId: string, sessionId: string, cwd: string) => void

  addRecentCwd: (cwd: string) => void
  loadState: (workspaces: Workspace[], activeWorkspaceId: string | null, recentCwds?: string[]) => void
  setLastOpenedSession: (workspaceId: string, sessionId: string) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  recentCwds: [],

  addWorkspace: (name) => {
    const ws: Workspace = {
      id: crypto.randomUUID(),
      name,
      sessions: [],
      lastOpenedSessionId: null,
    }
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      // Auto-activates only when no workspace is currently active (first workspace)
      activeWorkspaceId: s.activeWorkspaceId ?? ws.id,
    }))
  },

  removeWorkspace: (id) =>
    set((state) => {
      const remaining = state.workspaces.filter((w) => w.id !== id)
      const activeId =
        state.activeWorkspaceId === id
          ? (remaining[0]?.id ?? null)
          : state.activeWorkspaceId
      return { workspaces: remaining, activeWorkspaceId: activeId }
    }),

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  addSession: (workspaceId, params) => {
    const session: Session = {
      id: crypto.randomUUID(),
      ...params,
      status: "active",
      createdAt: Date.now(),
    }
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, sessions: [...w.sessions, session], lastOpenedSessionId: session.id }
          : w
      ),
    }))
    return session.id
  },

  removeSession: (workspaceId, sessionId) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, sessions: w.sessions.filter((sess) => sess.id !== sessionId) }
          : w
      ),
    })),

  setSessionStatus: (workspaceId, sessionId, status) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              lastOpenedSessionId:
                status === "exited" && w.lastOpenedSessionId === sessionId
                  ? null
                  : w.lastOpenedSessionId,
              sessions: w.sessions.map((sess) =>
                sess.id === sessionId ? { ...sess, status } : sess
              ),
            }
          : w
      ),
    })),

  setSessionCwd: (workspaceId, sessionId, cwd) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId
          ? {
              ...w,
              sessions: w.sessions.map((sess) =>
                sess.id === sessionId ? { ...sess, cwd } : sess
              ),
            }
          : w
      ),
    })),

  addRecentCwd: (cwd) =>
    set((s) => ({
      recentCwds: [cwd, ...s.recentCwds.filter((c) => c !== cwd)].slice(0, 10),
    })),

  loadState: (workspaces, activeWorkspaceId, recentCwds = []) =>
    set({ workspaces, activeWorkspaceId, recentCwds }),

  setLastOpenedSession: (workspaceId, sessionId) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, lastOpenedSessionId: sessionId } : w
      ),
    })),
}))
