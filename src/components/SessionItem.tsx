import { Session } from "../types/session"
import { ROLE_ICONS } from "../types/session"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-400 animate-pulse",
  idle: "bg-green-400",
  exited: "bg-zinc-600 opacity-40",
}

interface SessionItemProps {
  session: Session
  isActive: boolean
  onClick: () => void
}

export function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  return (
    <div
      onClick={onClick}
      className={[
        "px-2.5 py-1.5 cursor-pointer select-none",
        isActive
          ? "bg-[#1f2937] border-l-2 border-blue-400"
          : "border-l-2 border-transparent hover:bg-[#161b22]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs shrink-0 text-zinc-400">{ROLE_ICONS[session.role]}</span>
          <span className={`text-xs truncate ${
            session.role === "claude"
              ? "text-blue-400"
              : isActive
              ? "text-zinc-100"
              : "text-zinc-400"
          }`}>
            {session.name}
          </span>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ml-1 ${STATUS_COLORS[session.status]}`} />
      </div>
      <div className="text-[10px] text-zinc-600 mt-0.5 pl-4 truncate">{session.cwd}</div>
    </div>
  )
}
