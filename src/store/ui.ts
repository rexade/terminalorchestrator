import { create } from "zustand"
import { Layout, LAYOUT_SLOT_COUNT, SidebarMode } from "../types/session"

interface UIStore {
  activeSessionId: string | null
  sidebarMode: SidebarMode
  isAtBottom: boolean
  layout: Layout
  paneMap: (string | null)[]
  activePaneIndex: number

  setActiveSession: (id: string | null) => void
  setSidebarMode: (mode: SidebarMode) => void
  setIsAtBottom: (v: boolean) => void
  setLayout: (layout: Layout) => void
  setPaneSession: (paneIndex: number, sessionId: string | null) => void
  setActivePaneIndex: (index: number) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeSessionId: null,
  sidebarMode: "normal",
  isAtBottom: true,
  layout: "1",
  paneMap: [null],
  activePaneIndex: 0,

  setActiveSession: (id) =>
    set((state) => {
      const newPaneMap = [...state.paneMap]
      newPaneMap[state.activePaneIndex] = id
      return { activeSessionId: id, paneMap: newPaneMap }
    }),

  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  setIsAtBottom: (v) => set({ isAtBottom: v }),

  setLayout: (layout) =>
    set((state) => {
      const slotCount = LAYOUT_SLOT_COUNT[layout]
      const newPaneMap = Array.from({ length: slotCount }, (_, i) => state.paneMap[i] ?? null)
      const newActivePaneIndex = Math.min(state.activePaneIndex, slotCount - 1)
      const activePaneSession = newPaneMap[newActivePaneIndex]
      return {
        layout,
        paneMap: newPaneMap,
        activePaneIndex: newActivePaneIndex,
        activeSessionId: activePaneSession ?? state.activeSessionId,
      }
    }),

  setPaneSession: (paneIndex, sessionId) =>
    set((state) => {
      const newPaneMap = [...state.paneMap]
      newPaneMap[paneIndex] = sessionId
      const newActiveSessionId =
        paneIndex === state.activePaneIndex ? sessionId : state.activeSessionId
      return { paneMap: newPaneMap, activeSessionId: newActiveSessionId }
    }),

  setActivePaneIndex: (index) =>
    set((state) => ({
      activePaneIndex: index,
      activeSessionId: state.paneMap[index] ?? state.activeSessionId,
    })),
}))
