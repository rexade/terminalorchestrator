---
name: termorchestra-design
description: Use this skill to generate well-branded interfaces and assets for Termorchestra, a cross-platform Tauri desktop terminal orchestrator. Contains essential design guidelines, colors, type, fonts, iconography, and UI kit components for prototyping or production work.
user-invocable: true
---

Read the `README.md` in this skill first — it covers product principles, visual
foundations, content tone, and iconography. Then explore:

- `colors_and_type.css` — CSS custom properties for all surfaces, borders,
  text scale, accent, semantic status, type stack, and spacing. Import this
  from any HTML artifact you build.
- `preview/` — small HTML specimens for every design-system token
  (colors, type, components). Useful as reference, not as templates.
- `ui_kits/app/` — a React recreation of the desktop app. Copy whole
  components (`Sidebar.jsx`, `Chrome.jsx`, etc.) or just `tokens.js` into
  your artifact.

If you're creating a visual artifact (slide, mock, throwaway prototype),
copy the assets you need into the artifact and produce a static HTML file.
If you're working on production code, lift the token values from
`colors_and_type.css` and follow the rules in `README.md` under **Visual
foundations** — especially "no gradients, no shadows, no cards, one accent".

If the user invokes this skill without other guidance, ask what they want
to build, ask a few focused questions (surface, variations, tweaks), and
then act as an expert designer for this brand.

**Non-negotiable rules** (from the product spec):

1. Dark only. `#0d1117` app surface, `#161b22` chrome.
2. One blue accent. No additional hues.
3. No gradients, no shadows, no cards, no emoji, no rounded-xl.
4. Icons are Unicode geometric glyphs from `ROLE_ICONS` — do not substitute
   an icon font unless the user explicitly asks.
5. Copy is terminal-mechanical: lowercase wordmark, ALL-CAPS eyebrow labels,
   short imperative verbs, raw paths.
