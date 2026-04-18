import { describe, it, expect, beforeEach } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useSessionStore } from "../../store/sessions"

describe("useSessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      recentCwds: [],
    })
  })

  it("adds a workspace", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("CloudLab"))
    expect(result.current.workspaces).toHaveLength(1)
    expect(result.current.workspaces[0].name).toBe("CloudLab")
  })

  it("adds a session to a workspace", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("CloudLab"))
    const wsId = result.current.workspaces[0].id
    act(() => result.current.addSession(wsId, { name: "Claude", role: "claude", type: "local", cwd: "~" }))
    expect(result.current.workspaces[0].sessions).toHaveLength(1)
    expect(result.current.workspaces[0].sessions[0].name).toBe("Claude")
  })

  it("removes a session", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("W"))
    const wsId = result.current.workspaces[0].id
    act(() => result.current.addSession(wsId, { name: "Shell", role: "shell", type: "local", cwd: "~" }))
    const sessionId = result.current.workspaces[0].sessions[0].id
    act(() => result.current.removeSession(wsId, sessionId))
    expect(result.current.workspaces[0].sessions).toHaveLength(0)
  })

  it("marks a session as exited", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("W"))
    const wsId = result.current.workspaces[0].id
    act(() => result.current.addSession(wsId, { name: "App", role: "server", type: "local", cwd: "~" }))
    const sessionId = result.current.workspaces[0].sessions[0].id
    act(() => result.current.setSessionStatus(wsId, sessionId, "exited"))
    expect(result.current.workspaces[0].sessions[0].status).toBe("exited")
  })

  it("tracks recent cwds with deduplication", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addRecentCwd("~/projects/foo"))
    act(() => result.current.addRecentCwd("~/projects/bar"))
    act(() => result.current.addRecentCwd("~/projects/foo")) // deduplicates, moves to front
    expect(result.current.recentCwds[0]).toBe("~/projects/foo")
    expect(result.current.recentCwds).toHaveLength(2)
  })

  it("caps recent cwds at 10", () => {
    const { result } = renderHook(() => useSessionStore())
    for (let i = 0; i < 12; i++) {
      act(() => result.current.addRecentCwd(`~/projects/project-${i}`))
    }
    expect(result.current.recentCwds).toHaveLength(10)
  })

  it("auto-activates first workspace but not subsequent ones", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("First"))
    const firstId = result.current.workspaces[0].id
    expect(result.current.activeWorkspaceId).toBe(firstId)
    act(() => result.current.addWorkspace("Second"))
    expect(result.current.activeWorkspaceId).toBe(firstId)
  })

  it("removeWorkspace clears activeWorkspaceId if active workspace is removed", () => {
    const { result } = renderHook(() => useSessionStore())
    act(() => result.current.addWorkspace("First"))
    act(() => result.current.addWorkspace("Second"))
    const firstId = result.current.workspaces[0].id
    const secondId = result.current.workspaces[1].id
    act(() => result.current.setActiveWorkspace(secondId))
    act(() => result.current.removeWorkspace(secondId))
    // activeWorkspaceId should fall back to first workspace
    expect(result.current.activeWorkspaceId).toBe(firstId)
  })

  it("setLastOpenedSession updates lastOpenedSessionId for the workspace", () => {
    const { addWorkspace, addSession, setLastOpenedSession } = useSessionStore.getState()
    addWorkspace("WS")
    const wsId = useSessionStore.getState().workspaces[0].id
    addSession(wsId, { name: "Shell", role: "shell", type: "local", cwd: "~" })
    addSession(wsId, { name: "Claude", role: "claude", type: "local", cwd: "~" })
    const sessions = useSessionStore.getState().workspaces[0].sessions
    const claudeId = sessions[1].id
    setLastOpenedSession(wsId, claudeId)
    expect(useSessionStore.getState().workspaces[0].lastOpenedSessionId).toBe(claudeId)
  })

  it("loadState restores workspaces, activeWorkspaceId, and recentCwds", () => {
    const { result } = renderHook(() => useSessionStore())
    const ws: import("../../types/session").Workspace = {
      id: "ws1",
      name: "Test",
      sessions: [],
      lastOpenedSessionId: null,
    }
    act(() => result.current.loadState([ws], "ws1", ["~/projects/foo"]))
    expect(result.current.workspaces).toHaveLength(1)
    expect(result.current.activeWorkspaceId).toBe("ws1")
    expect(result.current.recentCwds[0]).toBe("~/projects/foo")
  })
})
