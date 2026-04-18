import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor, act } from "@testing-library/react"
import { listen } from "@tauri-apps/api/event"
import { useSessionStore } from "../store/sessions"
import { createSession, loadPersistedState } from "../lib/tauri"

// Mock heavy components that depend on browser APIs (xterm canvas, etc.)
vi.mock("../components/TerminalPane", () => ({
  TerminalPane: () => null,
}))
vi.mock("../components/Toolbar", () => ({
  Toolbar: () => null,
}))
vi.mock("../components/Sidebar", () => ({
  Sidebar: () => null,
}))
vi.mock("../components/StatusBar", () => ({
  StatusBar: () => null,
}))
vi.mock("../components/NewSessionDialog", () => ({
  NewSessionDialog: () => null,
}))

// Mock the tauri lib so load/save don't throw
vi.mock("../lib/tauri", () => ({
  createSession: vi.fn().mockResolvedValue("pty-123"),
  loadPersistedState: vi.fn().mockRejectedValue(new Error("no state")),
  savePersistedState: vi.fn().mockResolvedValue(undefined),
}))

const mockListen = listen as ReturnType<typeof vi.fn>
const mockCreateSession = createSession as ReturnType<typeof vi.fn>
const mockLoadPersistedState = loadPersistedState as ReturnType<typeof vi.fn>

describe("App session_exited listener", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListen.mockResolvedValue(() => {})
    mockCreateSession.mockResolvedValue("pty-123")
    mockLoadPersistedState.mockRejectedValue(new Error("no state"))

    // Reset store to a known state with one active session
    useSessionStore.setState({
      workspaces: [
        {
          id: "ws1",
          name: "Test WS",
          sessions: [
            {
              id: "sess1",
              name: "Shell",
              role: "shell",
              type: "cmd",
              status: "active",
              cwd: "~",
              createdAt: 0,
            },
          ],
          lastOpenedSessionId: "sess1",
        },
      ],
      activeWorkspaceId: "ws1",
      recentCwds: [],
    })
  })

  it("registers a listener for session_exited on mount", async () => {
    const App = (await import("../App")).default
    render(<App />)
    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith(
        "session_exited",
        expect.any(Function)
      )
    })
  })

  it("marks session as exited when session_exited fires with matching ptyId", async () => {
    // Arrange: loadPersistedState returns a state with one active session so
    // App's mount effect will call createSession for it and populate sessionPtyMap.
    const persistedState = JSON.stringify({
      workspaces: [
        {
          id: "ws1",
          name: "Test WS",
          sessions: [
            {
              id: "sess1",
              name: "Shell",
              role: "shell",
              type: "cmd",
              status: "active",
              cwd: "~",
              createdAt: 0,
            },
          ],
          lastOpenedSessionId: "sess1",
        },
      ],
      activeWorkspaceId: "ws1",
      recentCwds: [],
    })
    mockLoadPersistedState.mockResolvedValue(persistedState)
    // createSession will return "test-pty-id" so sessionPtyMap.current["sess1"] = "test-pty-id"
    mockCreateSession.mockResolvedValue("test-pty-id")

    // Capture the session_exited listener callback
    let capturedCallback: ((event: { payload: string }) => void) | undefined
    mockListen.mockImplementation(
      (eventName: string, cb: (event: { payload: string }) => void) => {
        if (eventName === "session_exited") capturedCallback = cb
        return Promise.resolve(() => {})
      }
    )

    const App = (await import("../App")).default
    render(<App />)

    // Wait for the mount effect to call createSession (populating sessionPtyMap)
    // and for the session_exited listener to be registered
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled()
      expect(capturedCallback).toBeDefined()
    })

    // Act: fire the session_exited event with the ptyId that was mapped to sess1
    act(() => {
      capturedCallback!({ payload: "test-pty-id" })
    })

    // Assert: the session in the store should now be marked as exited
    await waitFor(() => {
      const session = useSessionStore
        .getState()
        .workspaces.find((w) => w.id === "ws1")
        ?.sessions.find((s) => s.id === "sess1")
      expect(session?.status).toBe("exited")
    })
  })

  it("calls unlisten cleanup when unmounted", async () => {
    const unlisten = vi.fn()
    mockListen.mockResolvedValue(unlisten)

    const App = (await import("../App")).default
    const { unmount } = render(<App />)

    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith(
        "session_exited",
        expect.any(Function)
      )
    })

    unmount()
    // unlisten should have been called during cleanup
    expect(unlisten).toHaveBeenCalled()
  })
})
