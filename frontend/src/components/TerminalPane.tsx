import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useAuthStore } from '../store'

export default function TerminalPane({ deviceId, active }: { deviceId: string; active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!active || !containerRef.current || !token) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Cascadia Code", "Fira Code", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    // Wait a tick for layout to stabilize, then fit and focus
    const fitTimer = setTimeout(() => {
      fitAddon.fit()
      term.focus()
    }, 50)

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/devices/${deviceId}/terminal?token=${encodeURIComponent(token)}`,
    )
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }

    ws.onmessage = (e) => {
      term.write(e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data)
    }

    ws.onclose = () => term.writeln('\r\n\x1b[2m[connection closed]\x1b[0m')
    ws.onerror = () => term.writeln('\r\n\x1b[31m[connection error]\x1b[0m')

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data))
      }
    })

    const obs = new ResizeObserver(() => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })
    obs.observe(containerRef.current)

    return () => {
      clearTimeout(fitTimer)
      obs.disconnect()
      ws.close()
      term.dispose()
    }
  }, [deviceId, token, active])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden cursor-text"
      style={{ height: '520px', backgroundColor: '#0d1117' }}
    />
  )
}
