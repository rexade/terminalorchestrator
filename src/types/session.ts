export type SessionType = "cmd" | "powershell" | "wsl" | "ssh" // "ssh" reserved for v1.1
export type SessionRole = "claude" | "shell" | "server" | "logs" | "git" | "ssh"
export type SessionStatus = "active" | "idle" | "exited"
export type SidebarMode = "normal" | "compact"
export type Layout = "1" | "h2" | "v2" | "4"

export const LAYOUT_SLOT_COUNT: Record<Layout, number> = {
  "1": 1,
  "h2": 2,
  "v2": 2,
  "4": 4,
}

export interface Session {
  id: string
  name: string
  type: SessionType
  role: SessionRole
  status: SessionStatus
  cwd: string
  createdAt: number
}

export interface Workspace {
  id: string
  name: string
  sessions: Session[]
  lastOpenedSessionId: string | null
}

export interface AppState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  recentCwds?: string[]
  sidebarMode?: SidebarMode
}

export const ROLE_ICONS: Record<SessionRole, string> = {
  claude: "⬡",
  shell: "$",
  server: "◈",
  logs: "≡",
  git: "⑂",
  ssh: "⌁",
}
