import { useState } from "react"
import { Layout, Session, SessionRole, ROLE_ICONS } from "../types/session"
import { TerminalPane } from "./TerminalPane"

interface LayoutGridProps {
  layout: Layout
  paneMap: (string | null)[]
  activePaneIndex: number
  sessions: Session[]
  sessionPtyMap: Record<string, string>
  onPaneFocus: (index: number) => void
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
  onAssignSession: (paneIndex: number, sessionId: string) => void
  onNewSession: (paneIndex: number) => void
  onDetachPane: (paneIndex: number) => void
}

function getRoleForSession(sessions: Session[], sessionId: string): SessionRole {
  return sessions.find((s) => s.id === sessionId)?.role ?? "shell"
}

interface EmptySlotProps {
  paneIndex: number
  runningSessions: Session[]
  onPickSession: (sessionId: string) => void
  onNewSession: () => void
}

function EmptySlot({ runningSessions, onPickSession, onNewSession }: EmptySlotProps) {
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#21262d]">
          <span className="text-zinc-500 text-xs">assign session</span>
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-600 hover:text-zinc-400 text-xs"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col overflow-y-auto flex-1">
          {runningSessions.length === 0 ? (
            <span className="text-zinc-700 text-xs px-3 py-2">no running sessions</span>
          ) : (
            runningSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => onPickSession(s.id)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-[#161b22] hover:text-zinc-200 text-left"
              >
                <span className="text-zinc-600 w-3 shrink-0">{ROLE_ICONS[s.role]}</span>
                <span className="truncate">{s.name}</span>
                <span className="text-zinc-700 ml-auto shrink-0">{s.cwd}</span>
              </button>
            ))
          )}
          <button
            onClick={onNewSession}
            className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-600 hover:bg-[#161b22] hover:text-zinc-400 border-t border-[#21262d] mt-auto"
          >
            <span>+</span>
            <span>new session</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => setOpen(true)}
      className="flex-1 flex items-center justify-center text-zinc-700 text-xs cursor-pointer hover:text-zinc-600 border border-dashed border-[#21262d] hover:border-[#30363d] transition-colors"
    >
      empty pane
    </div>
  )
}

interface PaneSlotProps {
  paneIndex: number
  sessionStoreId: string | null
  ptyId: string | undefined
  isFocused: boolean
  role: SessionRole
  runningSessions: Session[]
  onFocus: () => void
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
  onAssignSession: (sessionId: string) => void
  onNewSession: () => void
  onDetach: () => void
}

function PaneSlot({
  paneIndex,
  sessionStoreId,
  ptyId,
  isFocused,
  role,
  runningSessions,
  onFocus,
  onScrollChange,
  scrollToBottomRef,
  onAssignSession,
  onNewSession,
  onDetach,
}: PaneSlotProps) {
  const [hovered, setHovered] = useState(false)
  const hasPty = sessionStoreId != null && ptyId != null

  return (
    <div
      className={`flex overflow-hidden relative min-w-0 min-h-0 flex-1 h-full ${
        isFocused ? "ring-1 ring-inset ring-blue-900" : ""
      }`}
      onMouseDown={hasPty ? onFocus : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hasPty ? (
        <>
          <TerminalPane
            key={`pane-${paneIndex}-${ptyId}`}
            sessionId={ptyId}
            isActive={true}
            role={role}
            onScrollChange={isFocused ? onScrollChange : undefined}
            scrollToBottomRef={isFocused ? scrollToBottomRef : undefined}
          />
          {hovered && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDetach() }}
              title="Remove from pane"
              className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded bg-[#161b22] text-zinc-600 hover:text-zinc-300 hover:bg-[#21262d] text-[10px] leading-none z-10 opacity-80"
            >
              ×
            </button>
          )}
        </>
      ) : (
        <EmptySlot
          paneIndex={paneIndex}
          runningSessions={runningSessions}
          onPickSession={onAssignSession}
          onNewSession={onNewSession}
        />
      )}
    </div>
  )
}

export function LayoutGrid({
  layout,
  paneMap,
  activePaneIndex,
  sessions,
  sessionPtyMap,
  onPaneFocus,
  onScrollChange,
  scrollToBottomRef,
  onAssignSession,
  onNewSession,
  onDetachPane,
}: LayoutGridProps) {
  // Sessions that are running (have a PTY) and not already in another pane slot
  const runningSessions = sessions.filter(
    (s) => s.status !== "exited" && sessionPtyMap[s.id] != null
  )

  const renderSlot = (paneIndex: number) => {
    const sessionStoreId = paneMap[paneIndex] ?? null
    const ptyId = sessionStoreId ? sessionPtyMap[sessionStoreId] : undefined
    const role = sessionStoreId ? getRoleForSession(sessions, sessionStoreId) : "shell"

    return (
      <PaneSlot
        key={paneIndex}
        paneIndex={paneIndex}
        sessionStoreId={sessionStoreId}
        ptyId={ptyId}
        isFocused={paneIndex === activePaneIndex}
        role={role}
        runningSessions={runningSessions}
        onFocus={() => onPaneFocus(paneIndex)}
        onScrollChange={onScrollChange}
        scrollToBottomRef={scrollToBottomRef}
        onAssignSession={(sid) => onAssignSession(paneIndex, sid)}
        onNewSession={() => onNewSession(paneIndex)}
        onDetach={() => onDetachPane(paneIndex)}
      />
    )
  }

  if (layout === "1") {
    return <div className="flex flex-1 overflow-hidden">{renderSlot(0)}</div>
  }

  if (layout === "h2") {
    return (
      <div className="flex flex-row flex-1 overflow-hidden divide-x divide-[#21262d]">
        {renderSlot(0)}
        {renderSlot(1)}
      </div>
    )
  }

  if (layout === "v2") {
    return (
      <div className="flex flex-col flex-1 overflow-hidden divide-y divide-[#21262d]">
        {renderSlot(0)}
        {renderSlot(1)}
      </div>
    )
  }

  // "4" — 2x2 grid
  return (
    <div className="grid grid-cols-2 grid-rows-2 flex-1 overflow-hidden">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`overflow-hidden border-[#21262d] ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""}`}
        >
          {renderSlot(i)}
        </div>
      ))}
    </div>
  )
}
