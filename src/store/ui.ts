import { create } from "zustand"
import { SidebarMode } from "../types/session"

interface UIStore {
  activeSessionId: string | null
  sidebarMode: SidebarMode
  isAtBottom: boolean

  setActiveSession: (id: string | null) => void
  setSidebarMode: (mode: SidebarMode) => void
  setIsAtBottom: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeSessionId: null,
  sidebarMode: "normal",
  isAtBottom: true,

  setActiveSession: (id) => set({ activeSessionId: id }),
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setIsAtBottom: (v) => set({ isAtBottom: v }),
}))
