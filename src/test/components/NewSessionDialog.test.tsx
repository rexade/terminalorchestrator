import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { NewSessionDialog } from "../../components/NewSessionDialog"
import { open } from "@tauri-apps/plugin-dialog"

vi.mock("../../lib/tauri", () => ({
  checkWslAvailable: vi.fn().mockResolvedValue(false),
}))

const mockOpen = open as ReturnType<typeof vi.fn>

describe("NewSessionDialog", () => {
  const baseProps = {
    recentCwds: ["~/projects/foo", "~/projects/bar"],
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it("renders Browse button", () => {
    render(<NewSessionDialog {...baseProps} />)
    expect(screen.getByText("Browse")).toBeTruthy()
  })

  it("sets cwd from native picker result", async () => {
    mockOpen.mockResolvedValueOnce("/home/user/picked-folder")
    render(<NewSessionDialog {...baseProps} />)
    fireEvent.click(screen.getByText("Browse"))
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith({ directory: true, multiple: false, defaultPath: "~/projects/foo" })
    })
    // After picking, the select value should reflect the picked path
    await waitFor(() => {
      const select = screen.getByRole("combobox")
      expect((select as HTMLSelectElement).value).toBe("/home/user/picked-folder")
    })
  })

  it("does nothing when picker is cancelled (returns null)", async () => {
    mockOpen.mockResolvedValueOnce(null)
    const onConfirm = vi.fn()
    render(<NewSessionDialog {...baseProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText("Browse"))
    await waitFor(() => expect(mockOpen).toHaveBeenCalled())
    // cwd should remain the first recentCwd
    fireEvent.click(screen.getByText("Open"))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "~/projects/foo" })
    )
  })
})
