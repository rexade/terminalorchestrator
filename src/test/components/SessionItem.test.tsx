import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SessionItem } from "../../components/SessionItem"
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

describe("SessionItem", () => {
  it("renders session name", () => {
    render(<SessionItem session={makeSession()} isActive={false} onClick={() => {}} />)
    expect(screen.getByText("Claude")).toBeInTheDocument()
  })

  it("renders cwd", () => {
    render(<SessionItem session={makeSession()} isActive={false} onClick={() => {}} />)
    expect(screen.getByText("~/projects")).toBeInTheDocument()
  })

  it("applies active styling when isActive", () => {
    const { container } = render(<SessionItem session={makeSession()} isActive={true} onClick={() => {}} />)
    expect(container.firstChild).toHaveClass("border-l-2")
  })

  it("calls onClick when clicked", () => {
    const onClick = vi.fn()
    render(<SessionItem session={makeSession()} isActive={false} onClick={onClick} />)
    fireEvent.click(screen.getByText("Claude"))
    expect(onClick).toHaveBeenCalled()
  })
})
