import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StatusBar } from "../../components/StatusBar"
import { Session } from "../../types/session"

const makeSession = (overrides?: Partial<Session>): Session => ({
  id: "s1",
  name: "Claude",
  type: "cmd",
  role: "claude",
  status: "active",
  cwd: "~/projects",
  createdAt: 0,
  ...overrides,
})

describe("StatusBar", () => {
  it("shows shell type and cwd", () => {
    render(
      <StatusBar
        activeSession={makeSession()}
        allSessions={[]}
        isAtBottom={true}
        onJumpToBottom={() => {}}
        layout="1"
        onSetLayout={() => {}}
      />
    )
    expect(screen.getByText("cmd")).toBeInTheDocument()
    expect(screen.getByText(/~/)).toBeInTheDocument()
  })

  it("shows sessionError when provided", () => {
    render(
      <StatusBar
        activeSession={makeSession()}
        allSessions={[]}
        isAtBottom={true}
        onJumpToBottom={() => {}}
        sessionError="spawn failed"
        layout="1"
        onSetLayout={() => {}}
      />
    )
    expect(screen.getByText(/spawn failed/)).toBeInTheDocument()
  })

  it("shows jump button when not at bottom", () => {
    const onJump = vi.fn()
    render(
      <StatusBar
        activeSession={makeSession()}
        allSessions={[]}
        isAtBottom={false}
        onJumpToBottom={onJump}
        layout="1"
        onSetLayout={() => {}}
      />
    )
    fireEvent.click(screen.getByTitle(/jump/i))
    expect(onJump).toHaveBeenCalled()
  })

  it("does not show jump button when at bottom", () => {
    render(
      <StatusBar
        activeSession={makeSession()}
        allSessions={[]}
        isAtBottom={true}
        onJumpToBottom={() => {}}
        layout="1"
        onSetLayout={() => {}}
      />
    )
    expect(screen.queryByTitle(/jump/i)).not.toBeInTheDocument()
  })
})
