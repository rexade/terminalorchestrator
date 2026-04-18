import { useEffect, useState } from "react"
import { TerminalPane } from "./components/TerminalPane"
import { createSession } from "./lib/tauri"

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    createSession({
      name: "Shell",
      role: "shell",
      sessionType: "local",
      cwd: "~",
      cols: 220,
      rows: 50,
    })
      .then(setSessionId)
      .catch((e) => setError(String(e)))
  }, [])

  if (error) {
    return (
      <div className="bg-[#0d1117] text-red-400 h-screen flex items-center justify-center font-mono text-sm">
        Error: {error}
      </div>
    )
  }

  if (!sessionId) {
    return (
      <div className="bg-[#0d1117] text-[#8b949e] h-screen flex items-center justify-center font-mono text-sm">
        Starting...
      </div>
    )
  }

  return (
    <div className="bg-[#0d1117] h-screen flex flex-col">
      <TerminalPane sessionId={sessionId} isActive={true} />
    </div>
  )
}
