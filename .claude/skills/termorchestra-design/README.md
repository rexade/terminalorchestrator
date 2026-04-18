# Termorchestra Design System

A design system for **Termorchestra** — a cross-platform desktop terminal
orchestrator built in Tauri 2 + React + TypeScript + Tailwind.

> "A terminal-first app for the way people actually work in 2026: Claude, SSH,
> WSL, servers, logs and shell sessions — without IDE bloat."
> — product tagline (from `docs/superpowers/specs/…-terminal-orchestrator-design.md`)

## What Termorchestra is

A desktop app that hosts many real PTY sessions inside a single, organized
sidebar-first window. It's a wrapper around real shells, not a replacement for
them. Users pair Claude Code with a dev server, SSH into a box while tailing
local logs, or switch between projects without losing session state.

**It is not:** a new shell language, an IDE, an AI chat, a dashboard with a
terminal bolted on, or a tmux clone with a GUI.

**Distribution:** open-source, cross-platform (Windows-first, then Linux and
macOS).

## Surfaces

There is only one product surface today: the **desktop app** (`ui_kits/app/`).
No marketing site, no docs site, no mobile companion. The entire visible UI is
a fixed Tauri window that defaults to 800×600.

## Sources

All visual and code context was pulled from the attached codebase
`termorchestra/` (read-only mount):

| File | What it gave us |
|---|---|
| `src/App.tsx` | Root layout, dark `#0d1117` shell |
| `src/components/Toolbar.tsx` | Top chrome, traffic-light dots, workspace switcher |
| `src/components/Sidebar.tsx` | Normal (160px) + compact (44px) sidebar |
| `src/components/SessionItem.tsx` | Session row with role icon, status dot, cwd |
| `src/components/SessionList.tsx` | Active + collapsed "EXITED (n)" group |
| `src/components/TerminalPane.tsx` | xterm.js theme (bg `#0d1117`, fg `#e6edf3`, cursor `#58a6ff`) |
| `src/components/StatusBar.tsx` | Bottom 20px status row |
| `src/components/NewSessionDialog.tsx` | Role/type/cwd modal |
| `src/types/session.ts` | `ROLE_ICONS`: ⬡ $ ◈ ≡ ⑂ ⌁ |
| `src/store/sessions.ts`, `src/store/ui.ts` | Zustand state shape |
| `src-tauri/tauri.conf.json` | Product name, window size |
| `src-tauri/icons/` | Placeholder Tauri logo — **no custom brand yet** |
| `docs/superpowers/specs/2026-04-18-terminal-orchestrator-design.md` | Product principles, data model, hard no's |
| `docs/superpowers/plans/2026-04-18-termorchestra-v1.md` | File map, task order |

## Content fundamentals

Termorchestra barely speaks. The UI is almost all glyphs, cwds, and session
names. When copy does appear, it follows these rules.

- **Voice: declarative, imperative, lowercase-adjacent.** The whole brand
  wordmark renders `termorchestra` in lowercase at `text-xs` zinc-600. The
  product follows suit.
- **No marketing voice.** No "Welcome to Termorchestra!", no onboarding copy.
  The first thing you see is chrome + an empty terminal.
- **Eyebrow labels in ALL-CAPS tracking-widest, small size.**
  `SESSIONS`, `ROLE`, `TYPE`, `FOLDER`, `EXITED (n)`. These are 9–10px with
  `letter-spacing: 0.15em`.
- **Action verbs are short and terminal-like.** `+ New`, `+ws`, `Open`,
  `Cancel`. Not "Create new session", not "Add workspace".
- **Role names are one word, Title Case:** Claude, Shell, Server, Logs, Git,
  SSH.
- **cwd is never wrapped or prettified.** Paths display raw:
  `~/projects/spritepose`, `/var/log/syslog`. Truncated with ellipsis when they
  don't fit.
- **Status text is mechanical.** `local · bash · ~/projects/spritepose`,
  `wsl · bash`. Middle-dot separators, no sentence case.
- **Error text is minimal.** `⚠ SSH Pi` — a warning glyph, the session name,
  nothing else. No toast, no modal, no "Oops, something went wrong."
- **No emoji, anywhere.** The product uses Unicode geometric glyphs for
  iconography (see ICONOGRAPHY).
- **Second person is rare.** The product rarely addresses the user. No
  "Your sessions", no "You have 3 active". It is `SESSIONS` and `EXITED (3)`.

**Representative copy** (all lifted verbatim from the codebase):

- `termorchestra` — the wordmark.
- `SESSIONS` — the only sidebar heading.
- `+ New` — the primary sidebar CTA.
- `⟨` / `⟩` — the compact/expand toggle. No label.
- `EXITED (2)` with `▸` / `▾` — the collapsed-group row.
- `New Session` — the modal title.
- `ROLE`, `TYPE`, `FOLDER` — modal section labels.
- `Workspace name...` — the only placeholder text anywhere.
- `~ (home)` — the only folder label that's not a raw path.
- `⚠ SSH Pi` — the canonical error string.

## Visual foundations

This system is **terminal-first**. It competes with a PTY for visual budget and
intentionally loses. The rules:

### Palette
Dark only. Four surface tones (`#0d1117` app, `#161b22` chrome,
`#1f2937` active row, `#21262d` controls). Two border tones (`#21262d`,
`#30363d`). Six zinc text tones. **One accent: blue.** The accent appears in
exactly three places: active session left-rule, active session status dot,
primary button fill. Semantic colors (green idle, red error) are each used in
one or two spots and never decoratively.

### Type
`Cascadia Code` for terminal content (13px / 1.5), system sans for UI (10–14px).
Headings top out at `text-sm` (14px). The largest glyph in the product is the
`⊕` new-session button at `text-base` (16px). There is no display type. There
are no serifs. There is no italic.

### Spacing
Tailwind defaults; unusually tight. Sidebar rows are `py-1.5` (6px). Toolbar
is 32px tall. Status bar is 20px tall. Dialog padding is `p-5`. The app uses
fractional spacing (`gap-1.5`, `py-1.5`, `px-2.5`) more than whole steps.

### Backgrounds
Flat solids only. **No gradients anywhere**, no images, no patterns, no noise,
no glass/blur, no elevation shadows. Every surface is one of the four colors
above. Full-bleed imagery does not exist in this product.

### Animation
One animation exists in the entire codebase: `animate-pulse` on the active
session's status dot. Nothing else fades, slides, springs, or bounces. No
enter/exit transitions on modals. No hover lift. No easing curves to speak of.

### Hover states
Two patterns:
1. **Color shift only.** `text-zinc-500 hover:text-zinc-300` (chrome buttons).
2. **Background nudge.** `hover:bg-[#161b22]` on session rows.
No opacity fades, no transforms, no scale, no glow.

### Press / active states
The Selected/Active pattern is a **2px left border in `blue-400`** plus
`bg-[#1f2937]` on the row. Buttons don't have a visible press state; they flash
briefly via browser default.

### Borders
Used as dividers, not decoration. `border-b`/`border-t`/`border-r` in
`#21262d` between regions (toolbar ↔ content, sidebar ↔ terminal, content ↔
status bar). Input/dialog borders step up to `#30363d`. The **2px left border**
is the only "accent" border in the system and is reserved for the selected
session row.

### Shadows
**There are none.** No drop shadows, no inner shadows, no elevation. The dialog
overlay uses `bg-black/60` as the only "depth" signal.

### Capsules vs. protection gradients
Neither. There are no pill badges, no gradient protectors over content. The UI
is flat rectangles and tiny circles (status dots, traffic lights).

### Layout rules
- **Fixed chrome:** 32px toolbar, 20px status bar, 160/44px sidebar. All `shrink-0`.
- **Single content pane.** Exactly one terminal is visible at a time; inactive
  panes are `display: none`, never hidden with opacity.
- **`select-none` on chrome.** The toolbar and session rows never accept
  selection — mouse selection is reserved for terminal content.
- **`data-tauri-drag-region`** on the toolbar makes the top chrome a drag
  handle for the OS window.

### Transparency and blur
Used sparingly and only for modals:
- `bg-black/60` modal scrim.
- `blue-600/20` + `blue-500/50` for the selected role tile (the only
  semi-transparent surface in the app).
- **No `backdrop-blur`.**

### Imagery color vibe
There is no imagery. The closest the product comes is the xterm terminal,
which renders in true color on `#0d1117`. The mood is **cool, dim, graphite**,
with a single cold blue accent — not warm, not grainy, not tinted.

### Corner radii
Very small. `rounded` (4px) on buttons and inputs. `rounded-lg` (8px) only on
the `NewSessionDialog`. `rounded-full` on the status dots and traffic-light
dots. Cards as a concept don't really exist here.

### Cards
There are no cards. No `shadow-md`, no `rounded-xl`. The closest analogue is
the **session row**, which is a flat rectangle with a left accent bar when
selected. The dialog is the only rounded container in the product.

## Iconography

Termorchestra uses **Unicode geometric characters** as icons — no icon font,
no SVG sprite, no PNG glyphs inside the UI. This is a deliberate aesthetic
choice and it's documented in the spec.

The full set, from `src/types/session.ts`:

| Role   | Glyph | Unicode | Default name |
|--------|:-:|---|---|
| claude | ⬡ | U+2B21 WHITE HEXAGON | Claude |
| shell  | $ | U+0024 DOLLAR SIGN | Shell |
| server | ◈ | U+25C8 WHITE DIAMOND CONTAINING BLACK SMALL DIAMOND | Server |
| logs   | ≡ | U+2261 IDENTICAL TO | Logs |
| git    | ⑂ | U+2442 OCR FORK | Git |
| ssh    | ⌁ | U+2301 ELECTRIC ARROW | SSH |

Other glyphs used as interactive affordances:

- `⊕` U+2295 — new session button (toolbar)
- `⟨` `⟩` U+27E8/U+27E9 — expand/compact sidebar toggle
- `▸` `▾` — collapsed / expanded EXITED group
- `⚠` U+26A0 — error indicator for dead sessions (StatusBar)
- `↓` U+2193 — jump-to-latest scroll button (StatusBar)
- `❯` U+276F — Claude prompt marker (observed in `TerminalPane.tsx` for
  inserting a visual divider before `❯ ` rows)
- `●` — traffic-light chrome dots (red / yellow / green)

**No emoji** appear anywhere. **No lucide / heroicons / phosphor.** If you
need a visual beyond this set, use a plain rectangle with a label — but
first ask whether the product genuinely needs it.

### Logo
The repo currently ships the **default Tauri template logo** (yellow/teal
circles) in `src-tauri/icons/*` and `public/tauri.svg`. There is no custom
Termorchestra wordmark or mark in the codebase. See **caveats** below.

## Index of this system

| Path | Purpose |
|---|---|
| `README.md` | This file. Start here. |
| `SKILL.md` | Agent-skill manifest (use with Claude Code or this app). |
| `colors_and_type.css` | All CSS custom properties: surfaces, borders, fg scale, accent, semantic status, type stack. |
| `assets/` | (intentionally empty — see caveats) |
| `preview/` | Design-system cards rendered in the Design System tab. |
| `ui_kits/app/` | High-fidelity React recreation of the desktop app. `index.html` is a click-through of the real UI. |

## Caveats and open questions

- **No custom brand mark.** The project currently ships the stock Tauri
  template icons. If a logo has been designed elsewhere, please drop the
  SVG + PNGs into `assets/` and re-run the logo card.
- **No marketing site or docs site** was found in the codebase — only the
  desktop app surface. If any of those exist in another project/repo, point
  me to it.
- **xterm output is simulated** in the UI kit. The real app pipes output
  from Rust via `listen('pty_output_<id>')`; the kit just types the same
  characters into a static block so designers can see the visual.
- **Font substitution.** `Cascadia Code` is referenced in `TerminalPane.tsx`
  but no `.ttf` ships in the repo. The CSS falls back to `Fira Code` →
  `Consolas` → system mono. If you want a pixel-exact Cascadia render,
  install it system-wide or drop the font into `fonts/`.
- **Product principles** treat ornament as a bug. Resist the urge to add
  shadows, gradients, or "visual interest" when extending this system.
  If you find yourself reaching for them, the answer is almost always "no".
