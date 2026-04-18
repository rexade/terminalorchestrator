import { useEffect, useRef } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { listen } from "@tauri-apps/api/event"
import { writePty, resizePty } from "../lib/tauri"
import { SessionRole } from "../types/session"
import "@xterm/xterm/css/xterm.css"

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  role: SessionRole
  onScrollChange?: (atBottom: boolean) => void
  scrollToBottomRef?: React.MutableRefObject<(() => void) | null>
}

export function TerminalPane({ sessionId, isActive, role, onScrollChange, scrollToBottomRef }: TerminalPaneProps) {
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
    void resizePty(sessionId, term.cols, term.rows)

    termRef.current = term

    let promptObserver: MutationObserver | null = null
    if (role === "claude") {
      promptObserver = new MutationObserver(() => {
        if (!containerRef.current) return
        const rows = containerRef.current.querySelectorAll(".xterm-rows > div")
        rows.forEach((row) => {
          const text = row.textContent ?? ""
          if (
            text.trimStart().startsWith("❯ ") &&
            !row.hasAttribute("data-divider")
          ) {
            row.setAttribute("data-divider", "1")
            ;(row as HTMLElement).style.borderTop = "1px solid #21262d"
            ;(row as HTMLElement).style.marginTop = "4px"
            ;(row as HTMLElement).style.paddingTop = "2px"
          }
        })
      })
      promptObserver.observe(containerRef.current, {
        childList: true,
        subtree: true,
      })
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
      void resizePty(sessionId, term.cols, term.rows)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unlistenPromise.then((fn) => fn())
      resizeObserver.disconnect()
      promptObserver?.disconnect()
      term.dispose()
    }
  }, [sessionId])

  useEffect(() => {
    if (!scrollToBottomRef || !termRef.current) return
    scrollToBottomRef.current = () => termRef.current!.scrollToBottom()
    return () => {
      if (scrollToBottomRef) scrollToBottomRef.current = null
    }
  }, [scrollToBottomRef])

  return (
    <div
      ref={containerRef}
      style={{ display: isActive ? "flex" : "none" }}
      className="flex-1 overflow-hidden"
    />
  )
}
