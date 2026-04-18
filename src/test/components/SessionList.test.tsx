import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SessionList } from "../../components/SessionList"
import { Session } from "../../types/session"

const sessions: Session[] = [
  { id: "s1", name: "Claude", type: "cmd", role: "claude", status: "active", cwd: "~/a", createdAt: 0 },
  { id: "s2", name: "App", type: "cmd", role: "server", status: "idle", cwd: "~/b", createdAt: 1 },
  { id: "s3", name: "Old", type: "cmd", role: "shell", status: "exited", cwd: "~/c", createdAt: 2 },
]

describe("SessionList", () => {
  it("renders active and idle sessions", () => {
    render(<SessionList sessions={sessions} activeSessionId="s1" onSelect={() => {}} />)
    expect(screen.getByText("Claude")).toBeInTheDocument()
    expect(screen.getByText("App")).toBeInTheDocument()
  })

  it("shows exited count in collapsed group", () => {
    render(<SessionList sessions={sessions} activeSessionId="s1" onSelect={() => {}} />)
    expect(screen.getByText(/EXITED \(1\)/)).toBeInTheDocument()
  })

  it("does not show exited session names by default", () => {
    render(<SessionList sessions={sessions} activeSessionId="s1" onSelect={() => {}} />)
    expect(screen.queryByText("Old")).not.toBeInTheDocument()
  })
})
