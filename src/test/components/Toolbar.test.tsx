import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Toolbar } from "../../components/Toolbar"

const ws1 = { id: "ws1", name: "CloudLab", sessions: [], lastOpenedSessionId: null }
const ws2 = { id: "ws2", name: "Personal", sessions: [], lastOpenedSessionId: null }

const baseProps = {
  workspaces: [ws1],
  activeWorkspaceId: "ws1",
  onSwitchWorkspace: vi.fn(),
  onCreateWorkspace: vi.fn(),
  onRenameWorkspace: vi.fn(),
  onDeleteWorkspace: vi.fn(),
  onNewSession: vi.fn(),
}

describe("Toolbar", () => {
  it("renders workspace select and +ws button", () => {
    render(<Toolbar {...baseProps} />)
    expect(screen.getByRole("combobox")).toBeTruthy()
    expect(screen.getByText("+ws")).toBeTruthy()
  })

  it("clicking ren shows rename input pre-filled with workspace name", () => {
    render(<Toolbar {...baseProps} />)
    fireEvent.click(screen.getByText("ren"))
    const input = screen.getByDisplayValue("CloudLab")
    expect(input).toBeTruthy()
  })

  it("× button hidden with 1 workspace, visible with 2", () => {
    const { rerender } = render(<Toolbar {...baseProps} />)
    expect(screen.queryByText("×")).toBeNull()
    rerender(<Toolbar {...baseProps} workspaces={[ws1, ws2]} />)
    expect(screen.getByText("×")).toBeTruthy()
  })

  it("pressing Enter with a valid name calls onRenameWorkspace and closes input", () => {
    const onRenameWorkspace = vi.fn()
    render(<Toolbar {...baseProps} onRenameWorkspace={onRenameWorkspace} />)
    fireEvent.click(screen.getByText("ren"))
    const input = screen.getByDisplayValue("CloudLab")
    fireEvent.change(input, { target: { value: "  NewName  " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onRenameWorkspace).toHaveBeenCalledWith("ws1", "NewName")
    expect(screen.queryByDisplayValue("NewName")).toBeNull()
  })

  it("pressing Enter with empty input keeps rename input open", () => {
    render(<Toolbar {...baseProps} />)
    fireEvent.click(screen.getByText("ren"))
    const input = screen.getByDisplayValue("CloudLab")
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.keyDown(input, { key: "Enter" })
    // input should still be visible
    expect(screen.getByDisplayValue("")).toBeTruthy()
  })
})
