import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { listen } from "@tauri-apps/api/event"
import { writePty } from "../lib/tauri"
import "@xterm/xterm/css/xterm.css"

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
}

export function TerminalPane({ sessionId, isActive, onScrollChange, scrollToBottomRef }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "#1f6feb66",
      },
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term

    if (scrollToBottomRef) {
      scrollToBottomRef.current = () => term.scrollToBottom()
    }

    const unlistenPromise = listen<number[]>(`pty_output_${sessionId}`, (event) => {
      term.write(new Uint8Array(event.payload))
    })

    term.onData((data) => {
      writePty(sessionId, data)
    })

    term.onScroll(() => {
      const buffer = term.buffer.active
      const atBottom = buffer.viewportY >= buffer.length - term.rows
      onScrollChange?.(atBottom)
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unlistenPromise.then((fn) => fn())
      resizeObserver.disconnect()
      if (scrollToBottomRef) scrollToBottomRef.current = null
      term.dispose()
    }
  }, [sessionId])

  return (
    <div
      ref={containerRef}
      style={{ display: isActive ? "flex" : "none" }}
      className="flex-1 overflow-hidden"
    />
  )
}
