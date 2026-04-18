import { invoke } from "@tauri-apps/api/core"
import { SessionRole, SessionType } from "../types/session"

export interface CreateSessionArgs {
  name: string
  role: SessionRole
  sessionType: SessionType
  cwd: string
  cols: number
  rows: number
}

export const createSession = (args: CreateSessionArgs): Promise<string> =>
  invoke("create_session", {
    name: args.name,
    role: args.role,
    session_type: args.sessionType,
    cwd: args.cwd,
    cols: args.cols,
    rows: args.rows,
  })

export const writePty = (id: string, data: string): Promise<void> =>
  invoke("write_pty", { id, data })

export const resizePty = (id: string, cols: number, rows: number): Promise<void> =>
  invoke("resize_pty", { id, cols, rows })

export const killSession = (id: string): Promise<void> =>
  invoke("kill_session", { id })

export const renameSession = (id: string, name: string): Promise<void> =>
  invoke("rename_session", { id, name })

export const loadPersistedState = (): Promise<string> =>
  invoke("load_state")

export const savePersistedState = (state: string): Promise<void> =>
  invoke("save_state", { state })

export const checkWslAvailable = (): Promise<boolean> =>
  invoke("check_wsl_available")
