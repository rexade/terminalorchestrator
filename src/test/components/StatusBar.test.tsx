import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StatusBar } from "../../components/StatusBar"
import { Session } from "../../types/session"

const makeSession = (overrides?: Partial<Session>): Session => ({
  id: "s1",
  name: "Claude",
  type: "local",
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
      />
    )
    expect(screen.getByText(/local/)).toBeInTheDocument()
    expect(screen.getByText(/~/)).toBeInTheDocument()
  })

  it("shows error badge for exited sessions", () => {
    const sessions = [
      makeSession(),
      makeSession({ id: "s2", name: "App", status: "exited" }),
    ]
    render(
      <StatusBar
        activeSession={makeSession()}
        allSessions={sessions}
        isAtBottom={true}
        onJumpToBottom={() => {}}
      />
    )
    expect(screen.getByText(/⚠ App/)).toBeInTheDocument()
  })

  it("shows jump button when not at bottom", () => {
    const onJump = vi.fn()
    render(
      <StatusBar
        activeSession={makeSession()}
        allSessions={[]}
        isAtBottom={false}
        onJumpToBottom={onJump}
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
      />
    )
    expect(screen.queryByTitle(/jump/i)).not.toBeInTheDocument()
  })
})
