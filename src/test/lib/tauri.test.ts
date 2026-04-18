import { describe, it, expect, vi, beforeEach } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { createSession, writePty, killSession, resizePty, checkWslAvailable } from "../../lib/tauri"

const mockInvoke = invoke as ReturnType<typeof vi.fn>

describe("tauri command wrappers", () => {
  beforeEach(() => mockInvoke.mockReset())

  it("createSession calls invoke with correct args", async () => {
    mockInvoke.mockResolvedValue("session-123")
    const id = await createSession({
      name: "Claude",
      role: "claude",
      sessionType: "local",
      cwd: "~",
      cols: 220,
      rows: 50,
    })
    expect(mockInvoke).toHaveBeenCalledWith("create_session", {
      name: "Claude",
      session_type: "local", // verifies camelCase→snake_case mapping
      role: "claude",
      cwd: "~",
      cols: 220,
      rows: 50,
    })
    expect(id).toBe("session-123")
  })

  it("writePty calls invoke with id and data", async () => {
    mockInvoke.mockResolvedValue(undefined)
    await writePty("abc", "ls\n")
    expect(mockInvoke).toHaveBeenCalledWith("write_pty", { id: "abc", data: "ls\n" })
  })

  it("killSession calls invoke with id", async () => {
    mockInvoke.mockResolvedValue(undefined)
    await killSession("abc")
    expect(mockInvoke).toHaveBeenCalledWith("kill_session", { id: "abc" })
  })

  it("resizePty calls invoke with id, cols, rows", async () => {
    mockInvoke.mockResolvedValue(undefined)
    await resizePty("abc", 120, 40)
    expect(mockInvoke).toHaveBeenCalledWith("resize_pty", { id: "abc", cols: 120, rows: 40 })
  })

  it("checkWslAvailable returns boolean", async () => {
    mockInvoke.mockResolvedValue(true)
    const result = await checkWslAvailable()
    expect(mockInvoke).toHaveBeenCalledWith("check_wsl_available")
    expect(result).toBe(true)
  })
})
