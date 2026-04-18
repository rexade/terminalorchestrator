# Termorchestra — Desktop App UI Kit

High-fidelity recreation of the Termorchestra desktop app as click-through
React components. This is a *visual* recreation — it fakes PTY output with
typed strings and `setInterval`; no real shells are spawned.

## What's here

- `index.html` — the full app window, click-through.
- `Chrome.jsx` — `Toolbar` (32px top) + `StatusBar` (20px bottom).
- `Sidebar.jsx` — normal (160px) and compact (44px) sidebar + session rows.
- `NewSessionDialog.jsx` — the modal with Role / Type / Folder.
- `TerminalPane.jsx` — fake xterm output with blinking cursor.
- `tokens.js` — color + glyph constants mirrored from the codebase.

## Source of truth

Components mirror the real ones in
`/projects/.../termorchestra/src/components/` file-for-file. Look there
when in doubt — especially `SessionItem.tsx` and `NewSessionDialog.tsx` for
the exact hex values and role-icon map.
