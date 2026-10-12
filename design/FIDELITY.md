# Homi – Design Fidelity Specification

<!-- prettier-ignore-start -->

**Source:** Penpot (Freegma) file **“Homi UI/UX MockUp”** – pages `00 · Cover & Foundations`, `01 · Components`, `02 · Screens & Prototype`, `03 · Dark Mode`.
**Extracted:** 2026-10-12 by the design-extraction agent. Everything in this document was read programmatically from the file (Penpot plugin API); numbers are design points (= CSS px at 1×).
**Binding companion:** `docs/ARCHITECTURE.md` (routes, component names). Where this document and the reference PNGs disagree, the **extracted JSON** (`design/extracted/**`) is the source of truth.

**Contents:** [0 Files](#0-how-to-use-this-folder) · [1 Tokens](#1-tokens) · [2 Liquid Glass](#2-liquid-glass-recipe) · [3 Icons](#3-icons) · [4 Components](#4-components) · [5 Screens](#5-screens-light--layout-tables--implementation-checklists) · [6 Navigation](#6-navigation-architecture--prototype) · [7 Dark mode](#7-dark-mode-page-03--7-screens) · [8 Notes](#8-notes-system-ui--design-limitations) · [9 Extraction notes](#9-extraction-notes--open-issues) · [10 Appendix](#10-appendix--component-layer-tables-all-71-variants)

## 0. How to use this folder

| Path | Content |
|---|---|
| `design/extracted/tokens.json` | Library colours (24), typographies (14), token sets `core` / `mode/light` / `mode/dark`, themes `Appearance/Light` and `Appearance/Dark`, resolved values per theme |
| `design/extracted/screens/light/*.json` (23) · `dark/*.json` (7) | Full recursive layer tree of every screen board: geometry relative to the screen, fills (solid / gradient / image), strokes, shadows, blur, per-corner radii, clip, flex props, text props (+ style runs), component instance + variant props, prototype interactions, path data (screen-relative) |
| `design/extracted/components/*.json` (71) | Every component main instance (every variant), same tree format, coordinates relative to the component |
| `design/extracted/prototype.json` | 89 prototype interactions (source screen, layer path + box, trigger, action, destination, animation) and the 4 flows |
| `design/extracted/foundations.json` | Foundations board tree, all its texts (motion / glass notes), the Material Demo, cover texts |
| `design/icons/*.svg` (35 + `wifi`) | Icons from “Foundations › Icon Tile / *”, 24×24 viewBox, `stroke="currentColor"` |
| `design/assets/products/*.png` + `manifest.json` | The 9 distinct product photos (400×400 PNG, exported from the raw image fills) and a flat map *product display name → { file, width, height, imageName, usedIn }* (Eier/Butter: `file: null` – no image in the design) |
| `design/reference/{light,dark}/*.png` + `reference/manifest.json` | 1× renders (393×852) of every screen **without** the presentation shadow; manifest = flat map *slug → { boardName, page, mode, file, width, height, scale, method }* (dark slugs end in `-dark`) |
| `design/reference/components/*.png` + `reference/components/manifest.json` | 2× renders of all 71 component variants; manifest = *slug → { component, variantProps, file, width, height, scale, shapeWidth, shapeHeight, includesOwnShadowBounds }* |

**Visual tests:** compare Playwright screenshots taken at a 393 × 852 viewport with `scale: "css"` (or deviceScaleFactor 1) against `reference/{light,dark}/<slug>.png`, with `--safe-top: 54px; --safe-bottom: 34px` and the status-bar (0–54) and home-indicator (818–852) bands masked.

**Frame:** every screen is a 393 × 852 board (iPhone 15/16 logical size). Children of a screen are listed in paint order (first = bottom-most) in the JSON; within a `fills` array the **first fill is the top-most** layer (Penpot order). Omitted node keys mean defaults: `opacity` 1, `rotation` 0, no `fills`/`strokes`/`shadows`/`blur`, `radius` 0, `blendMode` normal, constraints left/top; `visible` is always present. Stroke `align` `center` also covers Penpot’s unset value (imported icon paths). `text.typography` names the library style matched by value; `text.textBounds` is the rendered text size.

**Coordinate conversion for the web app** (status bar and home indicator are *not* drawn, see §8):
- top-anchored element at design `y` → `top: calc(var(--safe-top) + (y − 54)px)` (the design status bar is 54 pt).
- bottom-anchored element whose bottom edge is at design `b` → `bottom: calc(var(--safe-bottom) + (818 − b)px)` (the home-indicator area starts at y = 818). Example: tab bar bottom edge 831 → `bottom: calc(var(--safe-bottom) − 13px)` = 21 px above the screen edge with a 34 px inset.
- Horizontal gutter: **20 px** for content; **16 px** for floating glass controls (back button, tab bar, composer buttons).

---

## 1. Tokens

### 1.1 Colours (library “Homi / Light|Dark” = token sets `mode/light|dark`)

| Role | Library name | Token | Light | Dark | `tokens.css` | Status |
|---|---|---|---|---|---|---|
| Screen background | Background | `color.bg` | `#F7F6F3` | `#0E0E10` | `--color-bg` | ✓ |
| Cards / grouped lists | Surface | `color.surface` | `#FFFFFF` | `#1A1A1D` | `--color-surface` | ✓ |
| Incoming bubble, settings icon tile, pressed row, bottom-sheet options | Surface Muted | `color.surface-muted` | `#EFEEEA` | `#232326` | `--color-surface-muted` | ✓ |
| Primary text | Label Primary | `color.label` | `#111111` | `#F5F5F7` | `--color-label` | ✓ |
| Secondary text | Label Secondary | `color.label-secondary` | `#6E6E73` | `#9A9AA0` | `--color-label-secondary` | ✓ |
| Placeholder / disabled / chevrons | Label Tertiary | `color.label-tertiary` | `#A1A1A6` | `#636366` | `--color-label-tertiary` | ✓ |
| Hairlines (0.5 px) | Separator | `color.separator` | `#E5E4DF` | `#2C2C2F` | `--color-separator` | ✓ |
| Accent (sage) | Accent Sage | `color.accent` | `#5E7D63` | `#8FB094` | `--color-accent` | ✓ |
| Accent tint | Accent Sage Soft | `color.accent-soft` | `#E6ECE5` | `#23302A` | `--color-accent-soft` | ✓ |
| Destructive | Destructive | `color.destructive` | `#C2412D` | `#E0715E` | `--color-destructive` | ✓ |
| Glass material | Glass Material | `color.glass` | `#FFFFFF` @ 72 % | `#2A2A2E` @ 72 % | `--glass-fill` | ✓ |
| Glass inner edge | Glass Edge | – (library only) | `#FFFFFF` @ 90 % | `#FFFFFF` @ 12 % | `--glass-edge` | ✓ |

Colours used in the design that are **not** in the library / token sets:

| Use | Light | Dark | `tokens.css` | Status |
|---|---|---|---|---|
| Search field, quantity-stepper track, category tag, secondary / disabled button, dialog “Abbrechen”, bottom-sheet “Abbrechen”, empty-state “Neuer Chat” | `#EAE9E4` | **`#232326`** (search field, steppers, category tag in dark) | `--color-fill-secondary` light `#eae9e4` ✓ · dark `#2a2a2e` | **✗ dark** (see D2) |
| Destructive button / dialog “Löschen” background | `#F6E3DF` | – (no dark destructive surface in the design) | `--color-destructive-soft` | ✓ light · dark unverifiable |
| Text/icon on accent (outgoing bubble text, plus/check glyphs on accent) | `#FFFFFF` | `#0E0E10` | `--color-on-accent` | ✓ |
| Primary button | bg `#111111`, label `#F7F6F3` | bg `#F5F5F7`, label `#0E0E10` | – (use `--color-label` / `--color-bg`) | ✓ (by value) |
| Selected chip | bg `#111111`, label `#F7F6F3` | bg `#F5F5F7`, label `#0E0E10` | – | ✓ (by value) |
| Avatar “Du” | bg `#E6ECE5`, fg `#5E7D63` | bg `#2A2A2E`, fg `#E5E5EA` | `--avatar-sage-*` | ✓ |
| Avatar “Lisa” | bg `#EFE6DA`, fg `#8A6E4F` | bg `#2A2A2E`, fg `#E5E5EA` | `--avatar-sand-*` | ✓ |
| Avatar “Max” | bg `#E1E7EE`, fg `#52687C` | bg `#2A2A2E`, fg `#E5E5EA` | `--avatar-mist-*` | ✓ |
| Household avatar (house glyph) | bg `#111111`, glyph `#F7F6F3` | bg `#F5F5F7`, glyph `#0E0E10` | – | by value |
| Selected tab lens | `#000000` @ **6 %** | `#FFFFFF` @ 10 % | `--glass-selected` 0.055 / 0.1 | **✗ light** (D1) |
| Glass control pressed (Icon Button) | `#000000` @ 10 % (replaces material + highlight) | – | `--glass-pressed` 0.1 | ✓ |
| Floating Add Button pressed | `#000000` @ 8 % (replaces material + highlight) | – | – | missing (D6) |
| Dim overlay | 22 % (16 Kontextmenü) · 30 % (13 Foto auswählen) · 35 % (15 Löschen bestätigen), all `#000000` | – | `--color-dim` 0.32 / 0.5 | **✗** (D3) |
| Sheet “presenting view” strip | `#F7F6F3` @ 45 % | `#2A2A2E` @ 45 % | – | missing (D8) |
| Bottom-sheet grabber | `#A1A1A6` @ 60 % | – | – | missing |
| Image-upload dashed border | `#A1A1A6` @ 70 %, 1.5 px inner, dashed | – | – | missing |
| Context-menu group separator (9 px band) | `#000000` @ 4 % | – | – | missing |
| “New item” row highlight (14 Artikel hinzugefügt) | `#5E7D63` @ 8 % | – | – | missing |
| System keyboard (08c, system UI) | panel `#E8E8EC` @ 97 %, keys `#FFFFFF`, function keys `#C9CAD0`, key shadow 0/1/0 `#000` 18 % | – | – | not to be implemented |

### 1.2 Type scale (library “Homi / Type”, family **Inter** ≙ SF Pro)

`lineHeight` is a unitless multiplier; Penpot text boxes are `round(size × lh)` tall. Letter-spacing in px.

| Library name | Size | Weight | Line height | ≈ px | Letter-spacing | `tokens.css` | Status |
|---|---:|---:|---:|---:|---:|---|---|
| largeTitle | 34 | 700 | 1.2 | 40.8 | −0.8 | `--type-large-title` / `--ls-large-title` | ✓ |
| title1 | 28 | 700 | 1.2 | 33.6 | −0.6 | `--type-title1` | ✓ |
| title2 | 22 | 600 | 1.25 | 27.5 | −0.4 | `--type-title2` | ✓ |
| title3 | 20 | 600 | 1.25 | 25 | −0.3 | `--type-title3` | ✓ |
| headline | 17 | 600 | 1.3 | 22.1 | −0.3 | `--type-headline` | ✓ |
| body | 17 | 400 | 1.3 | 22.1 | −0.3 | `--type-body` | ✓ |
| callout | 16 | 400 | 1.3 | 20.8 | −0.2 | `--type-callout` | ✓ (not used in any screen) |
| subhead | 15 | 400 | 1.33 | 19.95 | −0.15 | `--type-subhead` | ✓ |
| subheadM | 15 | 500 | 1.33 | 19.95 | −0.15 | `--type-subhead-medium` | ✓ |
| footnote | 13 | 400 | 1.35 | 17.55 | −0.05 | `--type-footnote` | ✓ |
| footnoteM | 13 | 500 | 1.35 | 17.55 | −0.05 | `--type-footnote-medium` | ✓ |
| caption | 12 | 500 | 1.3 | 15.6 | 0 | `--type-caption` | ✓ |
| caption2 | 11 | 500 | 1.2 | 13.2 | 0.05 | `--type-caption2` | ✓ |
| tab | 10 | 600 | 1.2 | 12 | 0.1 | `--type-tab` | ✓ |

Text styles used in the design **outside** the library (all Inter):

| Where | Size / lh / weight / ls | Colour | `tokens.css` |
|---|---|---|---|
| Chat bubble text | 16 / 1.33 / 400 / −0.2 | label · on-accent | `--type-bubble` ✓ |
| Avatar initials (24 px stack · 36 px member/profile · 44 px avatar · 48 px chat header · 54 px chat row · 80 px empty chat) | 10 · 14 · 18 · 19 · 22 · 32 / 1.25 / 600 / −0.2 | avatar fg | missing |
| Trend pill “+ CHF 42.80”, unread-divider label | 12 / 1.3 / 600 / 0 | accent | missing |
| Unread badge count | 12 / 1.3 / 700 / 0 | on-accent | missing |
| Unread time “14:32” | 13 / 1.35 / 600 / −0.05 | accent | missing |
| Selected category chip label | 15 / 1.33 / 600 / −0.15 | bg colour | missing |
| Shared-item card status “Zur Einkaufsliste hinzugefügt” | 12 / 1.3 / 400 / 0 | label-2 | missing |
| Keyboard (system UI) | 22 / 1.25 / 400 · 16 / 1.25 / 400–600 | – | n/a |

### 1.3 Spacing (`core` set)

`space.4 = 4`, `space.8 = 8`, `space.12 = 12`, `space.16 = 16`, `space.20 = 20`, `space.24 = 24`, `space.32 = 32` → `--space-*` ✓. Observed layout constants: content gutter 20, glass-control gutter 16, toolbar row top y = 58 (status bar + 4), large title y = 106 under a toolbar row (y = 82 on Home under the greeting), section label inset 24 (= card 20 + 4), card inner padding 20 (summary/value cards) or 16 (list rows).

### 1.4 Radii

| Token | Value | Used for | `tokens.css` |
|---|---:|---|---|
| radius.xs | 8 | settings icon tile (30 px) | `--radius-xs` ✓ |
| radius.sm | 10 | shared-item card icon (36 px) | `--radius-sm` ✓ |
| radius.md | 14 | text/price/category input fields, category tag, presenting-view strip | `--radius-md` ✓ |
| radius.lg | 20 | Home inventory tile image (108), Product Image M | `--radius-lg` ✓ |
| radius.xl | 26 | 52 px buttons (pill) | `--radius-xl` ✓ |
| radius.sheet | 34 | sheets (top corners), bottom sheet, confirmation dialog | `--radius-sheet` ✓ |
| radius.pill | 999 | – | `--radius-pill` ✓ |
| (not a token) | 12 | inventory-row image 52 px | `--radius-row-image` ✓ |
| (not a token) | 16 | add-item row, details card, bottom-sheet options | `--radius-card-sm` ✓ |
| (not a token) | 22 | grouped cards / lists, search field (h/2), image upload area | `--radius-card` ✓ |
| (not a token) | 18 | category chip (h/2), shared-item card, lifted row | – |
| (not a token) | 24 | context menu | – |
| (not a token) | 38 | hero product image 168 px | – |
| (not a token) | 6 | chat-bubble tail corner (bottom-left incoming / bottom-right outgoing) | – |
| (not a token) | 31 / 27 | tab bar / selected tab lens | – |

### 1.5 Elevation (all shadows in the file)

| Shadow (x / y / blur / spread, colour) | Light | Dark | Where |
|---|---|---|---|
| Glass | `0 8 28 0 #000 10%` + `0 1 3 0 #000 6%` | `0 8 28 0 #000 45%` + `0 1 3 0 #000 30%` | every glass control, context menu |
| Hero product image | `0 14 34 0 #000 12%` | `0 14 34 0 #000 40%` | 05 Artikel-Details |
| Confirmation dialog | `0 20 60 0 #000 22%` | – | 15 |
| Bottom sheet | `0 −6 30 0 #000 10%` | – | 13 |
| Lifted row (context menu source) | `0 12 32 0 #000 18%`, radius 18 | – | 16 |
| Keyboard key (system UI) | `0 1 0 0 #000 18%` | – | 08c |
| **Presentation shadow** | `0 24 60 0 #000 18%` on every screen board | same | **not UI – never implement** |

### 1.6 Motion (Foundations board + prototype)

| Situation | Design | `tokens.css` |
|---|---|---|
| Tab switch | Dissolve **200 ms ease-out** | `--dur-fast` 160 / `--dur-base` 240 → no 200 ms token (D4) |
| Drill-down (details, chat) | Push left **350 ms ease-in-out** (≙ iOS spring); back = push right 350 ms | `--dur-push` 350 ✓ |
| Sheet open / close | Slide ↑ **400 ms ease-out** / ↓ **300 ms ease-in** | `--dur-sheet` 400 ✓ · close 300 ms missing (D4) |
| In-place state change (search focus, add-row focus, dialog, toast, composer focus, context menu) | Dissolve 200 ms ease-out | – |
| Checkbox tick | Scale 0.9 → 1 + fill, spring 0.35 s, damping 0.8 | – |
| Floating button pressed | Scale 0.96, glass gets denser | – |

Penpot easing keywords are the CSS keywords: `ease-out` = `cubic-bezier(0,0,0.58,1)`, `ease-in-out` = `cubic-bezier(0.42,0,0.58,1)`, `ease-in` = `cubic-bezier(0.42,0,1,1)`. `tokens.css` uses custom curves instead (D5).

### 1.7 `apps/web/src/styles/tokens.css` – discrepancies

| # | Token | `tokens.css` | Design | Action |
|---|---|---|---|---|
| D1 | `--glass-selected` (light) | `rgba(0,0,0,0.055)` | `#000000` @ **0.06** (all 4 light tab-bar variants) | change to 0.06 |
| D2 | `--color-fill-secondary` (dark) | `#2a2a2e` | **`#232326`** (search field, compact + large stepper track, category tag in 02/04/05/06 dark). `#2A2A2E` is used only for avatars, the glass material and the sheet presenting-view strip. | change dark value to `#232326`; keep `#2a2a2e` for avatars |
| D3 | `--color-dim` | 0.32 (light) / 0.5 (dark) | three different dims: **0.22** context menu (16), **0.30** photo bottom sheet (13), **0.35** delete dialog (15); no dark overlay screen exists | add `--dim-menu: rgba(0,0,0,.22)`, `--dim-sheet: rgba(0,0,0,.30)`, `--dim-dialog: rgba(0,0,0,.35)` |
| D4 | durations | 160 / 240 / 350 / 400 ms | 200 ms (dissolve), 300 ms (sheet close) missing | add `--dur-dissolve: 200ms`, `--dur-sheet-close: 300ms` |
| D5 | easings | `cubic-bezier(.22,1,.36,1)`, `cubic-bezier(.65,0,.35,1)` | CSS keywords `ease-out`, `ease-in-out`, `ease-in` | keep custom curves only if intentional; otherwise use the keywords |
| D6 | Floating Add Button pressed | – | fill `#000` @ 0.08 (no material/highlight) | add `--glass-pressed-fab` or reuse 0.1 deliberately |
| D7 | `--glass-blur` 22 px / `--glass-saturate` 180 % | defined | **not in the design** (Penpot cannot render backdrop blur) | fine as an implementation choice – keep, but it is not design-derived |
| D8 | sheet presenting-view strip, scroll-edge gradients, context-menu material, hero/dialog/bottom-sheet/lifted-row shadows, grabber, dashed border, new-item highlight | – | see §1.1 / §1.5 / §2 / §8 | add tokens or hard-code in component CSS |
| D9 | `--color-destructive-soft` (dark) `#3a2320` | defined | no dark destructive surface exists in the design | unverifiable – keep |
| D10 | typography | 14 library styles + `--type-bubble` | matches exactly (incl. bubble 16/1.33/400/−0.2) | add the non-library styles of §1.2 (avatar initials, badge, trend, chip-selected, unread time) |

Everything else in `tokens.css` (all library colours light + dark, avatar palette, glass fill/edge/highlight/shadow light + dark, spacing, radii, `--tabbar-height` 62, `--tabbar-inset-x` 16, `--tabbar-gap-bottom` 21, `--toolbar-size` 44, row heights 76/52/84/52/60, `--screen-gutter` 20) matches the design.

---

## 2. Liquid Glass recipe

Penpot has no backdrop blur, so the design *simulates* glass with four layers. The web implementation must reproduce the layers **and add** `backdrop-filter` (the design intent, see Foundations note: “Glas nur für Navigation, Toolbars, schwebende Controls & Overlays. Inhalte bleiben auf ruhigen, opaken Flächen. Aufbau: Material 72 % · vertikaler Specular-Verlauf · 1 px Innenkante · weicher Schatten (0/8/28, 10 %).”).

| Layer (top → bottom) | Light | Dark |
|---|---|---|
| 1. Material fill (Penpot fill #0 – drawn **on top** of the highlight; verified by sampling the dark reference) | `#FFFFFF` @ 0.72 | `#2A2A2E` @ 0.72 |
| 2. Specular highlight: linear gradient, top → bottom (start (0.5, 0) → end (0.5, 1)) | `#FFFFFF` @ 0.55 at 0 % → `#FFFFFF` @ 0 at 55 % | `#FFFFFF` @ 0.10 at 0 % → `#FFFFFF` @ 0 at 55 % |
| 3. Inner edge: 1 px **inner** stroke | `#FFFFFF` @ 0.90 | `#FFFFFF` @ 0.12 |
| 4. Shadows (drop) | `0 8 28 0 rgba(0,0,0,.10)`, `0 1 3 0 rgba(0,0,0,.06)` | `0 8 28 0 rgba(0,0,0,.45)`, `0 1 3 0 rgba(0,0,0,.30)` |
| (web only) backdrop | `backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))` – not in the design | same |

```css
.glass {
  background:
    linear-gradient(var(--glass-fill), var(--glass-fill)),            /* material – top layer */
    linear-gradient(180deg, rgb(255 255 255 / .55) 0%, rgb(255 255 255 / 0) 55%); /* .10 in dark */
  box-shadow: inset 0 0 0 1px var(--glass-edge), var(--glass-shadow);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}
```

Penpot renders the drop shadows *underneath* the translucent material too, so the glass in the reference PNGs is slightly darker towards its centre than a CSS `box-shadow` (which is not painted under the box) will produce. Sampled values on the reference tab bars (over plain background): light top ≈ `rgb(252,252,252)`, middle ≈ `rgb(241,240,240)`; dark top ≈ `rgb(38,38,41)`, middle ≈ `rgb(32,32,35)`. Expect ≤ ~12 levels difference there in visual tests.

### 2.1 Glass elements

| Element | Size | Radius | Content / offsets | Pressed / selected | React |
|---|---|---|---|---|---|
| **Tab Bar (Liquid Glass)** | 361 × 62 at x 16, y 769 (bottom 21 above screen edge) | 31 | 4 tabs, each 88.25 × 54, starting x 4, y 4 (no gaps); icon 24 px at (32.13, 7) in the tab; label `tab` style centred, box y 34 (12 px tall) | **Selected-tab lens**: tab fill `#000` @ 0.06 (light) / `#FFF` @ 0.10 (dark), radius 27, same 88.25 × 54 box. Selected icon + label = accent (`#5E7D63` / `#8FB094`), icon stroke **2.0**; unselected = label colour, icon stroke **1.7** | `HomiTabBar` |
| **Toolbar (Glass)** Items=2 | 96 × 44 at x 277, y 58 | 22 | items 44 × 44 at x 4 and x 48; icons 22 px at (11, 11): `plus` (stroke 2.18), `ellipsis` (filled dots) | – | `GlassToolbar` |
| **Toolbar (Glass)** Items=1 | 52 × 44 at x 321, y 58 | 22 | item 44 × 44 at x 4; `ellipsis` or `compose` (stroke 2.18) | – | `GlassToolbar` |
| **Back Button** | 44 × 44 at x 16, y 58 | 22 | `chevL` 22 px at (11, 11), stroke 2.18, label colour | – | `GlassButton` |
| **Icon Button** (Compose / More) | 44 × 44 | 22 | icon 22 px at (11, 11) | Pressed: fill `#000` @ 0.10 only (no material, no highlight), edge + shadows unchanged | `GlassButton` |
| **Profile Button** | 44 × 44 at x 329, y 62 (Home) | 22 | avatar 36 × 36 at (4, 4), r 18, initial 14/600 | – | `ProfileButton` |
| **Floating Add Button** | 56 × 56 | 28 | `plus` 26 px at (15, 15), stroke 1.85 | Pressed: fill `#000` @ 0.08 only; motion scale 0.96 (not used in any screen) | `GlassButton` |
| **Toast** | 300 × 44, centred (x 46.5) at y 58 – replaces the toolbar row | 22 | check disc 24 accent at (10, 10) with `check` 16 white (stroke 3.9); message `subhead-medium` label at (44, 12); “Rückgängig” `subhead-medium` accent right-aligned, right edge 286 (padding-right 14) | – | `Toast` |
| Sheet **Close** / **Delete** buttons | 44 × 44 at (16, 14) / (333, 14) inside the sheet | 22 | `xmark` / `trash` 20 px at (12, 12), stroke 2.4; trash = destructive | – | `GlassButton` |
| **Change Photo** pill (Image Upload Area · Selected) | 112 × 36 at (229, 152) in the 353 × 200 area (12 px from right/bottom) | 18 | `camera` 18 px at (14, 9) stroke 2.53; “Ändern” `subhead-medium` at (40, 8) | – | part of `ImageUploadArea` |
| **Message composer** | row 393 × 52 at y 762 (bottom 4 px above the home-indicator area) | – | Attachment button 44 × 44 at (16, 4), `plus` 22 stroke 2.18 · Message field **309 × 44** at (68, 4), r 22, placeholder “Nachricht” `body` label-3 at (16, 11), `mic` 24 px at (273, 10) stroke 1.8 label-2. Focused (08c): value `body` label, caret 2 × 24 accent r1 after the text, **Send button** 34 × 34 accent circle at (271, 5) with `arrowUp` 20 white (stroke 2.76) replacing the mic | – | `ChatComposer` |
| **Contact name pill** (chat header) | hugs: 70 × 26 (Lisa) / 63 × 26 (Max), centred, y 102 | 13 | name `footnote-medium` label at (12, 4); `chevR` 13 px box after the name (Lisa: x 46.4, y 6.5), stroke 4.06 (→ 2.2 px), label-2; right padding ≈ 10 | – | part of chat header |
| **Context Menu** | 250 × 201 | 24 | *not translucent*: fill `#FFFFFF` @ 0.97 (component) / `#FFFFFF` (instance in 16) + glass edge + glass shadows | – | `ContextMenu` |

---

## 3. Icons

* 35 icon tiles on the Foundations board (“Icons (SF-Symbols-Stil, 1.7 pt Linie)”): `house stack cart bubbles bubble plus search chevR chevL chevD updown person personCircle personPlus check camera photo minus clip arrowUp trash pencil sliders appearance xmark compose tray checkCircle ellipsis tag grid mic bell arrowR doorOut`, exported to `design/icons/<name>.svg` (24 × 24 viewBox, `fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`; filled sub-shapes use `fill="currentColor"`). Ellipses became `<circle>`, rectangles `<rect rx>`, arcs are cubic Béziers (Penpot normalises arcs).
* `wifi` is **not** on the Foundations board; `design/icons/wifi.svg` was derived from the Status Bar glyph (17 px, scaled ×1.41).
* **Geometry check against `apps/web/src/icons/paths.ts`** (both rasterised at 240 px with identical stroke settings, ink IoU): all 35 Foundations icons match (IoU ≥ 0.999, ≤ 9 differing pixels of 57 600 = anti-aliasing of arc vs. Bézier), `wifi` IoU 0.995 (status-bar source). **No geometry mismatch.** `paths.ts` contains every design icon; it has no icon the design lacks except `wifi` (present in the status bar).

### 3.1 Stroke widths per usage – read this before styling icons

Every icon in the screens is a scaled copy of the 24-unit glyph. The designer set each copy’s stroke to **intended px × 24 / size**, i.e. the stored value is exactly the `stroke-width` to use **inside a 24 × 24 viewBox** scaled to `size`. Penpot, however, renders that value in absolute pixels, so small icons in the reference PNGs look heavier than intended (e.g. the 14 px `chevD` renders 3.77 px thick). **Implement with the viewBox-unit values below** (rendered = intended px); expect icon-weight differences against the reference PNGs and mask/tolerate them in visual tests.

| Usage | Icon | Size | `stroke-width` (viewBox units = Penpot value) | Rendered intended px | Colour |
|---|---|---:|---:|---:|---|
| Tab bar, unselected | house, stack, cart, bubbles | 24 | 1.7 | 1.7 | label |
| Tab bar, selected | same | 24 | 2.0 | 2.0 | accent |
| Back button / toolbar / composer attachment | chevL, plus, compose | 22 | 2.18 | 2.0 | label |
| Toolbar more | ellipsis | 22 | filled | – | label |
| Row disclosure (inventory, member, settings) | chevR | 18 | 2.67 | 2.0 | label-3 |
| Household switcher / “Erledigt” disclosure | chevD | 14 | 3.77 | 2.2 | label-2 |
| Chat header name pill | chevR | 13 | 4.06 | 2.2 | label-2 |
| Search field | search | 20 | 2.28 | 1.9 | label-2 |
| Search clear (on 20 px label-3 disc) | xmark | 14 | 4.11 | 2.4 | white |
| Sheet close / delete | xmark / trash | 20 | 2.4 | 2.0 | label / destructive |
| Context menu | pencil, cart, arrowUp, trash | 21 | 2.06 | 1.8 | label / destructive |
| Form rows (Kategorie / Einheit), Category Selector | updown | 20 | 2.16 | 1.8 | label-2 |
| Settings icon tiles, invite row | house, appearance, personCircle, sliders, personPlus | 20 | 2.16 | 1.8 | label / accent |
| Quantity stepper compact | minus, plus | 18 | 2.67 | 2.0 | label (minus label-3 at minimum) |
| Quantity stepper large | minus, plus | 24 | 2.0 | 2.0 | label / bg on black plus |
| Checkbox completed, add-row plus | check, plus | 18 | 3.2 | 2.4 | white |
| Toast check | check | 16 | 3.9 | 2.6 | white |
| Details “Zur Einkaufsliste hinzufügen”, shared-item card | cart | 20 | 2.28 | 1.9 | accent |
| Category tag | tag | 16 | 2.7 | 1.8 | label-2 |
| Change-photo pill | camera | 18 | 2.53 | 1.9 | label |
| Image upload (empty) | camera | 24 | 1.9 | 1.9 | accent |
| Bottom-sheet options | camera, photo | 24 | 1.8 | 1.8 | label |
| Composer mic | mic | 24 | 1.8 | 1.8 | label-2 |
| Send button | arrowUp | 20 | 2.76 | 2.3 | white |
| Empty-state circles | tray, checkCircle, bubbles | 36 | 1.13 | 1.7 | accent |
| Household avatar 72 px | house | 36 | 1.27 | 1.9 | bg |
| Household chat avatar 54 px / Avatar “Haushalt” 44 px | house | 27 / 22 | 1.69 / 2.07 | 1.9 | bg |
| Floating Add Button | plus | 26 | 1.85 | 2.0 | label |
| Optional-detail pills (18) | stack, tag | 20 | 2.16 | 1.8 | label-2 |
| Status bar (system) | wifi | 17 | 2.05 | 1.45 | label |


---

## 4. Components

All coordinates are relative to the component’s top-left. Colour names refer to §1.1 (light values; dark per §7). Full layer tables for **every variant** are in the appendix (§10) and in `extracted/components/<slug>.json`; 2× renders in `reference/components/<slug>.png`.

### 4.1 System chrome (do **not** implement – safe areas only)

| Component | Variants | Spec |
|---|---|---|
| Status Bar | Mode = Light / Dark | 393 × 54. Time “9:41” `headline` centred in a 133 px box at y 17; Dynamic Island 126 × 37 at (133.5, 11), r 18.5, black; signal bars, wifi glyph (17 px), battery. Light = label colour, Dark = `#F5F5F7`. Defines `--safe-top: 54px` for visual tests. |
| Home Indicator | Mode = Light / Dark | 393 × 34 at y 818. Indicator 134 × 5 at (129.5, 21), r 3, label colour. Defines `--safe-bottom: 34px`. |

### 4.2 Navigation & glass controls

See §2.1 for the glass controls (Tab Bar, Toolbar, Back/Icon/Profile/Floating buttons, Toast).

**Navigation Header** (393 × 60, component only – the screens use the patterns below): Back Button at (16, 8); title `headline` label centred in x 70…323 at y 10; subtitle `caption` label-2 centred at y 32. → `InlineHeader`.

Patterns used in the screens (→ `LargeTitleHeader` / `InlineHeader`):
* **Large-title header** (02, 03, 04, 10–12, 14, 16–18): glass toolbar at y 58 right-aligned to x 373; large title `large-title` at (20, 106) (41 px box); optional subtitle `subhead` label-2 at (20, 148).
* **Home header**: greeting `subhead-medium` label-2 at (20, 62); large title “Dein Zuhause.” at (20, 82); household switcher at (20, 130) (24 px avatar stack, “Unser Zuhause” `footnote-medium` label-2 at x 90, `chevD` 14 px at x 186); Profile Button 44 at (329, 62).
* **Inline header** (03b, 09): centred title `headline` at y 69 (box 0…393); Back Button (09) or Toolbar (03b) at y 58.
* **Chat header** (08*): Contact Avatar 48 × 48 at (172.5, 50), r 24, initial 19/600; Contact name glass pill (§2.1) at y 102, centred; Back Button at (16, 58); a “Top Scroll Edge” gradient 0…150 below the header.

### 4.3 Content components

**Avatar** (44 × 44, r 22) – Person = Du / Lisa / Max / Haushalt. Initial 18/1.25/600/−0.2 centred (box = avatar). Du: `#E6ECE5`/`#5E7D63`; Lisa: `#EFE6DA`/`#8A6E4F`; Max: `#E1E7EE`/`#52687C`; Haushalt: bg `#111111` with `house` 22 px at (11, 10.56), stroke 2.07, `#F7F6F3`. Other avatar sizes in the screens: 24 (stack: 2 px **outer** ring in bg colour, 18 px pitch → 6 px overlap, initial 10 px), 36 (member row/profile, 14 px), 48 (chat header, 19 px), 54 (chat list, 22 px), 72 (household, house 36 px), 80 (empty chat, 32 px). → `Avatar`, `AvatarStack`.

**Inventory Row** (353 × 76, fill surface) – State = Default / Pressed (Pressed: fill `#EFEEEA` surface-muted; nothing else changes).
| Layer | Box | Style |
|---|---|---|
| Product Image | (14, 12) 52 × 52, r 12 | image, cover |
| Name | (80, 16) w 165 | `headline` label (single line, truncate) |
| Subtitle “Küche · 24 Stück” | (80, 41) w 150 | `footnote` label-2 |
| Price “CHF 12.96” | right edge 315, y 17 | `subhead-medium` label, right-aligned |
| Unit price “CHF 0.54 / Stk.” | right edge 315, y 41 | `footnote` label-2, right-aligned |
| Chevron | `chevR` 18 at (321, 29) | label-3, stroke 2.67 |
In lists the separator is 0.5 px `separator` from x 80 to the right edge at y 75.5 (none after the last row). → `InventoryItemRow`.

**Product Image** – Size = S 52 (r 12) / M 108 (r 20) / L 168 (r 38). Image fill, cover. The L hero additionally has the hero shadow `0 14 34 0` 12 % (dark 40 %). → `ProductImage`.

**Category Chip** (h 36, r 18, hug width; flex row, padding 8/16, centred) – Default: fill surface, 1 px inner stroke `separator`, label `subhead-medium` label (“Küche” → 77 px). Selected: fill label `#111111`, **no stroke**, label 15/1.33/**600** in bg colour `#F7F6F3` (→ 78 px). Chip row: flex row, gap 8, horizontally scrollable, starts at x 20, y 244, overflows the screen (content 553 px wide). → `Chip`, `ChipRow`.

**Shopping List Row** (component 353 × 56; **placed at a 52 px pitch** in every list, so the visible row is 52 tall with content 2 px below centre) – State = Default / Completed.
| Layer | Box | Default | Completed |
|---|---|---|---|
| Checkbox | (16, 15) 26 × 26, r 13 | 1.6 px inner stroke label-3, no fill | fill accent + `check` 18 at (4, 4), white, stroke 3.2 |
| Name | (56, 16) w 170 | `body` label | `body` **label-3** (no strike-through) |
| Quantity | right edge 337, y 18 | `subhead` label-2, right-aligned | `subhead` label-3 |
Separator 0.5 px from x 56 to the right edge at y 51.5. → `ShoppingItemRow`, `Checkbox`.

**Checkbox** (26 × 26, r 13) – Default: 1.6 px inner stroke `#A1A1A6`. Completed: fill accent, check 18 px white. Motion: scale 0.9 → 1 + fill, spring 0.35 s / damping 0.8.

**Message Preview Row** (353 × 84, fill bg – rows sit directly on the screen background, no card) – State = Read / Unread.
| Layer | Box | Read | Unread |
|---|---|---|---|
| Avatar | (0, 14) 54 × 54, r 27 | person avatar, initial 22/600 | household avatar: `#111111` + `house` 27 px (stroke 1.69) in bg colour |
| Name | (68, 14) w 190 | `headline` label | `headline` label |
| Time | right edge 353, y 16 | `footnote` label-2 | 13/1.35/**600** **accent** |
| Last message | (68, 37) w 250 | `subhead` label-2, 1 line | `subhead` **label**, up to 2 lines (box 40) |
| Unread badge | (331, 44) 22 × 22, r 11 | – | fill accent, count 12/1.3/700 white centred |
| Separator | x 68 → right edge, y 83.5 | 0.5 px separator | same |
→ `ConversationRow`.

**Chat Bubble** (hug; flex row, padding 10/15, single line height 42) – Direction = Incoming: fill `#EFEEEA`, radii TL 20 / TR 20 / BR 20 / **BL 6**, text label; Outgoing: fill accent `#5E7D63`, radii 20 / 20 / **BR 6** / 20, text white. Text 16/1.33/400/−0.2. Incoming bubbles start at x 16; outgoing bubbles end at x 377. Max width in the screens: single-line bubbles up to 322 (outgoing) / 309 (incoming); the wrapping example (“Perfekt! Dann brauchen wir nur noch Milch.”) is 250 wide (text 220) → use `max-width: min(322px, 82%)`. Vertical gap between consecutive bubbles 11 px. → `ChatBubble`.

**Household Member Row** (353 × 60, fill surface): avatar 36 at (16, 12) r 18 (initial 14/600); name `body` label at (64, 10); role `footnote` label-2 at (64, 33); `chevR` 18 at (321, 21) label-3; separator x 64 → right edge at y 59.5. → `ListRow` (member variant).

**Settings Row** (353 × 52, fill surface): icon tile 30 × 30 at (16, 11), r 8, fill `#EFEEEA`, icon 20 at (5, 5) label (stroke 2.16); title `body` label at (60, 15); optional value `body` label-2 right-aligned, right edge 315; `chevR` 18 at (321, 17) label-3; separator x 60 → right edge at y 51.5. → `ListRow` (settings variant), `GroupedList`.

**Dashboard Statistic** (150 × 52): value `title3` label at (0, 0); label `footnote` label-2 at (0, 30). → `Stat`.

**Text Input** (353 × 76; Error 353 × 100) – State = Default / Focused / Filled / Error.
| Layer | Box | Style |
|---|---|---|
| Label “Artikelname” | (4, 0) | `footnote-medium` label-2 |
| Field | (0, 24) 353 × 52, r 14, fill surface | Default/Filled: 1 px inner stroke separator · Focused: **1.5 px** inner stroke **accent** · Error: **1.5 px** inner stroke **destructive** |
| Placeholder / value | (16, 15) in the field | placeholder `body` label-3 (“z. B. Olivenöl”) · value `body` label |
| Caret (Focused) | 2 × 24 at (54, 14) in the field, r 1 | accent |
| Error message | (4, 82) | `footnote` destructive (“Bitte gib einen Namen ein.”) |
→ `TextField`.

**Price Input** (353 × 76) – State = Empty / Filled. Like Text Input; label “Preis pro Einheit”; field contains prefix “CHF” `body` label-2 at (16, 15) and the amount at (58, 15): Empty “0.00” label-3, Filled “8.50” label. → `PriceField`.

**Search Field** (353 × 44, r 22, fill `#EAE9E4`) – State = Default / Focused. `search` 20 at (14, 12), label-2 (stroke 2.28); placeholder “Artikel suchen” / “Suchen” `body` label-2 at (42, 12). Focused: value `body` label, caret 2 × 22 accent at the end of the text (x 80, y 11), clear button 20 × 20 disc label-3 at (319, 12) with `xmark` 14 white. No focus ring. → `HomiSearchField`.

**Quantity Stepper** – Size × State = Compact/Default, Compact/Minimum, Large/Default.
| | Compact (124 × 40, r 20) | Large (196 × 56, r 28) |
|---|---|---|
| Track | fill `#EAE9E4` | fill `#EAE9E4` |
| Minus | 40 × 40 at (0, 0), transparent, `minus` 18 at (11, 11) stroke 2.67 label (Minimum: **label-3**) | 56 × 56 at (0, 0), `minus` 24 at (16, 16) stroke 2.0 label |
| Value | 44 × 40 at (40, 0), `headline` label centred | 84 × 56 at (56, 0), `title2` label centred |
| Plus | 40 × 40 at (84, 0), transparent, `plus` 18 label | 56 × 56 at (140, 0), **fill label `#111111`, r 28**, `plus` 24 in bg colour |
→ `QuantityStepper`.

**Category Selector** (353 × 52, r 14, fill surface) – State = Default (1 px inner separator stroke) / Open (**1.5 px inner accent stroke**). Label “Kategorie” `body` label at (16, 15); value “Küche” `body` label-2 right-aligned, right edge 305; `updown` 20 at (315, 16) label-2. → `SelectRow`.

**Image Upload Area** (353 × 200, r 22) – State = Empty / Selected. Empty: fill surface, **1.5 px inner dashed** stroke `#A1A1A6` @ 70 %; icon circle 48 × 48 at (152.5, 48) r 24 accent-soft with `camera` 24 accent; title “Foto hinzufügen” `headline` centred at y 108; hint “Aufnehmen oder aus der Mediathek wählen” `footnote` label-2 centred at y 132. Selected: image fill (cover) + glass “Ändern” pill (§2.1). → `ImageUploadArea`.

### 4.4 Actions & overlays

**Button** (353 × 52, r 26; label `headline` centred) – Style × State:
| Variant | Fill | Label | Other |
|---|---|---|---|
| Primary / Default | `#111111` | `#F7F6F3` | – |
| Primary / Pressed | `#111111` | `#F7F6F3` | **layer opacity 0.82** |
| Primary / Disabled | `#EAE9E4` | `#A1A1A6` | – |
| Secondary / Default | `#EAE9E4` | `#111111` | – |
| Destructive / Default | `#F6E3DF` | `#C2412D` | – |
| Primary / Dark | `#F5F5F7` | `#0E0E10` | (dark-mode primary) |
Empty-state buttons are smaller pills: **200 × 48, r 24** (primary “Artikel hinzufügen” in 10, secondary “Neuer Chat” in 12). → `Button`.

**Confirmation Dialog** (300 × 196, r 34, fill surface, shadow `0 20 60 0` 22 %): title `headline` centred at y 26; message `footnote` label-2 centred, box (28, 54) 244 wide (2 lines); buttons 128 × 50, r 25 at (18, 124) “Abbrechen” (fill `#EAE9E4`, label) and (154, 124) “Löschen” (fill `#F6E3DF`, destructive), labels `headline`. Placed centred (x 46.5, y 330) over a 35 % black dim. → `ConfirmDialog`.

**Context Menu** (250 × 201, r 24, near-opaque white – §2.1): 3 items of 48 px (label `body` at (18, 14); icon 21 px right at (214, 13), stroke 2.06) separated by 0.5 px separator from x 18 to the right edge; a 9 px group separator band `#000` @ 4 % at y 144; destructive item “Löschen” at y 153 in destructive colour. Items: Bearbeiten (pencil), Zur Einkaufsliste (cart), Teilen (arrowUp), Löschen (trash). In 16 it sits right-aligned (x 123 → 373) 12 px below the lifted row. → `ContextMenu`.

**Bottom Sheet** (393 × 300, top radii 34, fill surface, shadow `0 −6 30 0` 10 %): grabber 36 × 5 at (178.5, 6) r 3 `#A1A1A6` @ 60 %; title `headline` centred at y 24; option rows 353 × 52 at (20, 70) and (20, 128) – r 16, fill `#EFEEEA`, icon 24 at (16, 14) stroke 1.8, label `body` at (54, 15); cancel 353 × 52 at (20, 200), r 26, fill `#EAE9E4`, `headline` centred. In 13 it is anchored to the screen bottom (y 552) over a 30 % dim. → `HomiBottomSheet`.

**Toast** – see §2.1. → `Toast`.

### 4.5 Recurring non-component patterns

| Pattern | Spec | Where |
|---|---|---|
| Grouped card | fill surface, r 22, x 20, w 353; rows inside separated by 0.5 px separators inset to the text column | 01, 02, 03, 05, 09, … |
| Section header | title `title3` label at x 20 + action link `subhead-medium` accent right-aligned to x 373, 3 px lower | 01 |
| Section label | `footnote-medium` label-2 at x 24, 24 px above its card | 03, 03b, 09 |
| Inventory tile (Home) | 108 × 150: image 108 × 108 r 20; name `subhead-medium` at (2, 116); quantity `footnote` label-2 at (2, 136); 3 tiles at x 20 / 142.5 / 265 (gap 14.5) | 01 |
| Household summary card | 353 × 158, r 22: label `footnote-medium` label-2 (20, 18); value `title1` (20, 38); trend pill 88 × 24 r 12 accent-soft at (245, 20) with 12/600 accent centred; hairline (20, 88) 313 wide; vertical divider 0.5 × 38 at (176, 102); two `Stat`s at (20, 100) and (192, 100) | 01 |
| Progress bar | track 353 × 4 r 2 separator at (20, 218); fill accent, width = done/total (4/12 → 118 px) | 03, 18 |
| Shared list meta | 24 px avatar stack + household name (x 90) + “4 von 12 erledigt” `footnote-medium` label-2 right-aligned to 373, at y 184 | 03, 18 |
| Add item row | 353 × 52, r 16, fill surface; accent disc 26 at (14, 13) with white `plus` 18; placeholder “Artikel hinzufügen” `body` label-3 at (54, 15). Focused (18): **1.5 px inner accent stroke**, value `body` label + 2 × 24 accent caret | 03, 11, 18 |
| Optional detail pills | two 172 × 40 pills r 20, fill surface, 1 px inner separator stroke, gap 9: icon 20 label-2 at (12, 10), label `subhead` label-2 at (38, 11), value `subhead-medium` label right-aligned to 158 | 18 |
| Completed disclosure | “Erledigt · 4” `footnote-medium` label-2 at (4, 2) + `chevD` 14 at (82, 4) | 03, 18 |
| Empty state | icon circle 72 × 72 r 36 accent-soft with 36 px accent icon (centre x 196.5, y 300 or 330); title `title3` centred 20 px below; message `subhead` label-2 centred (box 40…353), 5 px below; optional 200 × 48 button 26 px below | 10, 11, 12 |
| Shared item card (chat) | 244 × 60, r 18, fill surface, 1 px inner separator stroke, right-aligned to 377; icon tile 36 × 36 r 10 accent-soft at (12, 12) with `cart` 20 accent; item `subhead-medium` at (58, 11); status 12/1.3/400 label-2 at (58, 32) | 08* |
| Chat meta | timestamp `caption` label-3 centred; read receipt “Gelesen” `caption` label-3 right-aligned to 377, 6 px below the last bubble; sender meta “Lisa · 13:48” `caption2` label-3 at x 20, 3 px below the bubble | 08* |
| Unread divider | 393 × 20; two 116 px hairlines at x 16 and x 261, y 10; label “1 neue Nachricht” 12/1.3/600 accent centred | 08b |
| Value card | 353 × 124 r 22: row 1 label `body` label-2 (20, 19) / value `body` label right edge 333; hairline (20, 61.5); row 2 “Gesamtwert” `headline` (20, 82) / total `title2` right edge 333 at y 77 | 05 |
| Category tag | 28 high pill r 14, fill `#EAE9E4`, `tag` 16 at (12, 6) label-2, text `footnote-medium` label-2 at (36, 5); 96 wide for “Küche” (dark variant 88 wide, text at 34) | 05 |
| Form “details card” | 353 × 156, r 16, fill surface: 3 form rows × 52 (label `body` label at (16, 15); value `body` right-aligned to x 305 of the row – label-2 when set, label-3 placeholder “Auswählen”/“Stück”; `updown` 20 at (315, 15)); hairlines inset 16; the “Menge” row holds a compact stepper at (213, 6) | 06, 07, 13, 15 |
| Total preview | “Gesamtwert” `footnote` label-2 at (4, 0) + “2 × CHF 8.50 = CHF 17.00” `footnote-medium` label right-aligned to 349 (empty: “CHF 0.00” label-3) | 06, 07 |
| Sheet chrome | screen fill black; Status Bar Dark; “Presenting View” 361 × 60 at (16, 46) r 14 `#F7F6F3` @ 45 % (the receding parent); sheet 393 × 794 at y 58, top radii 34, fill bg; close button (16, 14); title `headline` centred at y 25 | 06, 07, 13, 15 |
| Scroll edge (bottom) | 393 × 110 at y 742 (chat: 393 × 152 at y 700): linear top → bottom, bg @ 0 → bg @ 0.9 at 45 % → bg @ 1 | all tab screens, chat |
| Scroll edge (top) | 393 × 150 at y 0: bg @ 1 → bg @ 0.9 at 60 % → bg @ 0 | chat screens |
| Keyboard | 393 × 336 at y 516, top radii 26 – **system UI** | 08c |

---

## 5. Screens (light) – layout tables & implementation checklists

Tables list every layer of the screen down to three levels (component instances are summarised by their content; full trees in the JSON). Coordinates are **screen-relative design points**; “Style” uses the colour roles of §1.1 (`label-2` = Label Secondary, `label-3` = Label Tertiary, `fill-secondary` = `#EAE9E4`) and the type names of §1.2. Colour roles are assigned **by value**, so e.g. `fill label` means a #111111 fill (primary button, selected chip) and `fill black` the sheet backdrop. Icon stroke widths are viewBox-unit values (§3.1). Rows inside instances/cards that overflow 852 continue under the tab bar (scroll content).

### 01 Home — `light/01-home`

**Route:** `/` (tab “Home”)

- Header without toolbar: greeting + large title, household switcher (avatar stack + name + chevD) and the glass Profile Button (→ 09).
- Summary card “Inventarwert” = `GET …/dashboard` (`inventoryValue`, `weeklyValueDelta` in the trend pill, `itemCount`, `openShoppingCount`). CHF format with Swiss apostrophe: “CHF 2'485.50”.
- “Dein Inventar” shows 3 tiles (most recent items); “Alle ansehen” → 02. “Für den nächsten Einkauf” shows 3 open shopping rows in a card; “Alle 8” → 03.
- Bottom: scroll-edge gradient (y 742–852) under the Tab Bar (Home selected).

Board 393×852, background bg. Reference: `reference/light/01-home.png` · Tree: `extracted/screens/light/01-home.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Greeting | 20 | 62 | 101 | 20 | “Guten Morgen” · type subhead-medium · color label-2 |
| Large Title | 20 | 82 | 230 | 41 | “Dein Zuhause.” · type large-title · color label |
| Household Switcher | 20 | 130 | 200 | 24 |  |
| &nbsp;&nbsp;&nbsp;Member Avatars | 20 | 130 | 60 | 24 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 20 | 130 | 24 | 24 | fill accent-soft · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 20 | 130 | 24 | 24 | “J” · 10/1.25 w600 ls-0.2 · color accent · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 38 | 130 | 24 | 24 | fill avatar-sand-bg · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 38 | 130 | 24 | 24 | “L” · 10/1.25 w600 ls-0.2 · color avatar-sand-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 56 | 130 | 24 | 24 | fill avatar-mist-bg · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 56 | 130 | 24 | 24 | “M” · 10/1.25 w600 ls-0.2 · color avatar-mist-fg · align center |
| &nbsp;&nbsp;&nbsp;Household | 90 | 133 | 94 | 18 | “Unser Zuhause” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;icon / chevD | 186 | 135 | 14 | 14 | icon chevD 14px, stroke-width 3.77 (viewBox units), color label-2 |
| Profile Button | 329 | 62 | 44 | 44 | ⟨Profile Button · Light⟩ · content: “J” · Liquid Glass (light) · r 22 · → 09 Haushalt & Profil |
| Household Summary | 20 | 170 | 353 | 158 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Label | 40 | 188 | 79 | 18 | “Inventarwert” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Value | 40 | 208 | 183 | 34 | “CHF 2'485.50” · type title1 · color label |
| &nbsp;&nbsp;&nbsp;Trend | 265 | 190 | 88 | 24 | fill accent-soft · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Trend Value | 265 | 194 | 88 | 16 | “+ CHF 42.80” · 12/1.3 w600 ls0 · color accent · align center |
| &nbsp;&nbsp;&nbsp;Separator | 40 | 258 | 313 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Divider | 196 | 272 | 0.5 | 38 | fill separator |
| &nbsp;&nbsp;&nbsp;Stat / Artikel | 40 | 270 | 150 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 40 | 270 | 150 | 25 | “128” · type title3 · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 40 | 300 | 150 | 18 | “Artikel im Haushalt” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;Stat / Einkauf | 212 | 270 | 150 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 212 | 270 | 150 | 25 | “8 Artikel” · type title3 · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 212 | 300 | 150 | 18 | “Auf der Einkaufsliste” · type footnote · color label-2 |
| Section Title | 20 | 352 | 125 | 25 | “Dein Inventar” · type title3 · color label |
| See All | 253 | 355 | 120 | 20 | “Alle ansehen” · type subhead-medium · color accent · align right |
| Inventory Tile / Milch | 20 | 386 | 108 | 150 | → 05 Artikel-Details |
| &nbsp;&nbsp;&nbsp;Product Image | 20 | 386 | 108 | 108 | fill image milk · r 20 |
| &nbsp;&nbsp;&nbsp;Name | 22 | 502 | 39 | 20 | “Milch” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Quantity | 22 | 522 | 47 | 18 | “3 Stück” · type footnote · color label-2 |
| Inventory Tile / Kaffee | 142.5 | 386 | 108 | 150 | → 05 Artikel-Details |
| &nbsp;&nbsp;&nbsp;Product Image | 142.5 | 386 | 108 | 108 | fill image coffee · r 20 |
| &nbsp;&nbsp;&nbsp;Name | 144.5 | 502 | 46 | 20 | “Kaffee” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Quantity | 144.5 | 522 | 80 | 18 | “2 Packungen” · type footnote · color label-2 |
| Inventory Tile / Olivenöl | 265 | 386 | 108 | 150 | → 05 Artikel-Details |
| &nbsp;&nbsp;&nbsp;Product Image | 265 | 386 | 108 | 108 | fill image oil · r 20 |
| &nbsp;&nbsp;&nbsp;Name | 267 | 502 | 57 | 20 | “Olivenöl” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Quantity | 267 | 522 | 67 | 18 | “2 Flaschen” · type footnote · color label-2 |
| Section Title | 20 | 560 | 238 | 25 | “Für den nächsten Einkauf” · type title3 · color label |
| Open List | 283 | 563 | 90 | 20 | “Alle 8” · type subhead-medium · color accent · align right |
| Shopping Preview | 20 | 596 | 353 | 156 | fill surface · r 22 · → 03 Einkaufsliste |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 596 | 353 | 52 | ⟨Shopping List Row · Default⟩ · content: “Eier”, “12 Stück” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 647.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 648 | 353 | 52 | ⟨Shopping List Row · Default⟩ · content: “Butter”, “250 g” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 699.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 700 | 353 | 52 | ⟨Shopping List Row · Default⟩ · content: “Spülmittel”, “1 Flasche” · fill surface |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Home/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Greeting `subhead-medium` label-2 at top 8 px below the safe area; large title 20 px below its top
- [ ] Household switcher: 24 px avatars with 2 px outer ring in bg colour, 6 px overlap; name `footnote-medium`; chevD 14 px
- [ ] Profile Button 44 px glass at right 20, top safe+8
- [ ] Summary card 353×158 r22 with trend pill, hairline, vertical divider and two `Stat`s
- [ ] Section header + action link baseline offset (+3 px)
- [ ] Three 108 px tiles (r20, cover images) with name/quantity, gap 14.5
- [ ] Shopping preview card: three 52 px rows, separators inset 56
- [ ] Scroll-edge gradient + Tab Bar (Home active) + 21 px bottom offset

### 02 Inventar — `light/02-inventar`

**Route:** `/inventar` (tab “Inventar”)

- Large-title header with Toolbar (Glass) Items=2: `plus` → 06 (sheet), `ellipsis`.
- Search field (tap → 17), horizontally scrolling category chips (Alle selected · Küche · Bad · Wohnzimmer · Technik · Sonstiges), then the inventory card (8 rows × 76 px = 608 px) which continues under the tab bar.
- Rows: image, name, “Kategorie · Menge Einheit”, total value and unit price (`CHF 8.50 / Fl.`).

Board 393×852, background bg. Reference: `reference/light/02-inventar.png` · Tree: `extracted/screens/light/02-inventar.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 277 | 58 | 96 | 44 | ⟨Toolbar (Glass) · 2⟩ · content: icon plus, icon ellipsis · Liquid Glass (light) · r 22 |
| Large Title | 20 | 106 | 132 | 41 | “Inventar” · type large-title · color label |
| Subtitle | 20 | 148 | 210 | 20 | “128 Artikel in deinem Haushalt” · type subhead · color label-2 |
| Search Field | 20 | 186 | 353 | 44 | ⟨Search Field · Default⟩ · content: icon search, “Artikel suchen” · fill fill-secondary · r 22 · → 17 Suche aktiv |
| Category Filter | 20 | 244 | 553 | 36 |  |
| &nbsp;&nbsp;&nbsp;Category Chip | 20 | 244 | 60 | 36 | fill label · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 252 | 28 | 20 | “Alle” · 15/1.33 w600 ls-0.15 · color bg |
| &nbsp;&nbsp;&nbsp;Category Chip | 88 | 244 | 77 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 104 | 252 | 45 | 20 | “Küche” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 173 | 244 | 60 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 189 | 252 | 28 | 20 | “Bad” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 241 | 244 | 126 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 257 | 252 | 94 | 20 | “Wohnzimmer” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 375 | 244 | 88 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 391 | 252 | 56 | 20 | “Technik” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 471 | 244 | 102 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 487 | 252 | 70 | 20 | “Sonstiges” · type subhead-medium · color label |
| Inventory List | 20 | 298 | 353 | 608 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 298 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img caps, “Nespresso Kapseln”, “Küche · 24 Stück”, “CHF 12.96”, “CHF 0.54 / Stk.”, icon chevR · fill surface · → 05 Artikel-Details |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 373.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 374 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img oil, “Olivenöl”, “Küche · 2 Flaschen”, “CHF 17.00”, “CHF 8.50 / Fl.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 449.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 450 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img batt4, “Batterien AA”, “Technik · 8 Stück”, “CHF 6.00”, “CHF 0.75 / Stk.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 525.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 526 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img milk, “Milch”, “Küche · 3 Stück”, “CHF 4.65”, “CHF 1.55 / Stk.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 601.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 602 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img coffee, “Kaffee”, “Küche · 2 Packungen”, “CHF 15.90”, “CHF 7.95 / Pkg.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 677.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 678 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img soap4, “Spülmittel”, “Küche · 1 Flasche”, “CHF 3.20”, “CHF 3.20 / Fl.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 753.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 754 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img towel, “Küchenpapier”, “Küche · 4 Rollen”, “CHF 5.80”, “CHF 1.45 / Rolle”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 829.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 830 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img rice, “Reis”, “Küche · 1 Packung”, “CHF 2.95”, “CHF 2.95 / Pkg.”, icon chevR · fill surface |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Inventar/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Toolbar (Glass) 96×44 right-aligned (x 277), top safe+4
- [ ] Large title + subtitle “128 Artikel in deinem Haushalt”
- [ ] Search field 353×44 r22 `#EAE9E4`, 18 px below subtitle
- [ ] Chip row: gap 8, padding-left 20, horizontal scroll, selected chip black
- [ ] Inventory card r22 with 76 px rows, 52 px images r12, separators inset 80
- [ ] Unit-price suffixes per unit (Stk., Fl., Pkg., Rolle)
- [ ] List scrolls under scroll-edge gradient and Tab Bar (Inventar active)

### 03 Einkaufsliste — `light/03-einkaufsliste`

**Route:** `/einkauf` (tab “Einkauf”)

- Large title “Einkaufsliste”, subtitle, shared-list meta (avatars, household, “4 von 12 erledigt”), progress bar, add-item row (tap → 18), open items card (8 rows at 52 px pitch), “Erledigt · 4” disclosure (→ 03b).
- Toolbar (Glass) Items=1 (`ellipsis`).

Board 393×852, background bg. Reference: `reference/light/03-einkaufsliste.png` · Tree: `extracted/screens/light/03-einkaufsliste.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 321 | 58 | 52 | 44 | ⟨Toolbar (Glass) · 1⟩ · content: icon ellipsis · Liquid Glass (light) · r 22 |
| Large Title | 20 | 106 | 204 | 41 | “Einkaufsliste” · type large-title · color label |
| Subtitle | 20 | 148 | 148 | 20 | “Alles, was noch fehlt.” · type subhead · color label-2 |
| Shared List Meta | 20 | 184 | 353 | 24 |  |
| &nbsp;&nbsp;&nbsp;Member Avatars | 20 | 184 | 60 | 24 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 20 | 184 | 24 | 24 | fill accent-soft · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 20 | 184 | 24 | 24 | “J” · 10/1.25 w600 ls-0.2 · color accent · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 38 | 184 | 24 | 24 | fill avatar-sand-bg · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 38 | 184 | 24 | 24 | “L” · 10/1.25 w600 ls-0.2 · color avatar-sand-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 56 | 184 | 24 | 24 | fill avatar-mist-bg · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 56 | 184 | 24 | 24 | “M” · 10/1.25 w600 ls-0.2 · color avatar-mist-fg · align center |
| &nbsp;&nbsp;&nbsp;Household | 90 | 187 | 94 | 18 | “Unser Zuhause” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Progress Label | 220 | 187 | 153 | 18 | “4 von 12 erledigt” · type footnote-medium · color label-2 · align right |
| Progress Track | 20 | 218 | 353 | 4 | fill separator · r 2 |
| Progress Fill | 20 | 218 | 118 | 4 | fill accent · r 2 |
| Add Item Row | 20 | 240 | 353 | 52 | fill surface · r 16 · → 18 Einkauf – Artikel hinzufügen |
| &nbsp;&nbsp;&nbsp;Plus | 34 | 253 | 26 | 26 | fill accent · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 38 | 257 | 18 | 18 | icon plus 18px, stroke-width 3.2 (viewBox units), color surface |
| &nbsp;&nbsp;&nbsp;Placeholder | 74 | 255 | 141 | 23 | “Artikel hinzufügen” · type body · color label-3 |
| Open Items | 20 | 304 | 353 | 416 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 304 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Milch”, “2 Liter” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 355.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 356 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Eier”, “12 Stück” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 407.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 408 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Spülmittel”, “1 Flasche” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 459.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 460 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Reis”, “1 Packung” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 511.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 512 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Butter”, “250 g” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 563.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 564 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Küchenpapier”, “1 Packung” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 615.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 616 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Tomaten”, “500 g” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 667.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 668 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Bananen”, “6 Stück” · fill surface |
| Completed Disclosure | 20 | 736 | 353 | 24 | → 03b Einkaufsliste – Erledigt |
| &nbsp;&nbsp;&nbsp;Section Label | 24 | 738 | 67 | 18 | “Erledigt · 4” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;icon / chevD | 102 | 740 | 14 | 14 | icon chevD 14px, stroke-width 3.77 (viewBox units), color label-2 |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Einkauf/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Shared list meta row at y 184 with right-aligned progress label
- [ ] Progress track 4 px r2 separator colour, fill accent proportional to done/total
- [ ] Add item row 353×52 r16 with accent plus disc 26 px
- [ ] Open items card: rows 52 px, checkbox 26 px at x 16, separators inset 56
- [ ] Completed disclosure “Erledigt · N” + chevD
- [ ] Tab Bar (Einkauf active)

### 03b Einkaufsliste – Erledigt — `light/03b-einkaufsliste-erledigt`

**Route:** `/einkauf` with the completed section expanded (design: pushed state, inline title)

- Inline title “Einkaufsliste” (headline, centred, y 69) with the toolbar – no back button in the design.
- Remaining open items card (3 rows), “Erledigt · 4” header with “Leeren” action (accent, → `POST …/shopping/clear-completed`), completed items card (Completed variant: checked, label-3 text), hint “Abgehakte Artikel werden nach 24 Stunden automatisch ausgeblendet.” `footnote` label-3.

Board 393×852, background bg. Reference: `reference/light/03b-einkaufsliste-erledigt.png` · Tree: `extracted/screens/light/03b-einkaufsliste-erledigt.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 321 | 58 | 52 | 44 | ⟨Toolbar (Glass) · 1⟩ · content: icon ellipsis · Liquid Glass (light) · r 22 |
| Inline Title | 0 | 69 | 393 | 23 | “Einkaufsliste” · type headline · color label · align center |
| Open Items | 20 | 120 | 353 | 156 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 120 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Küchenpapier”, “1 Packung” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 171.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 172 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Tomaten”, “500 g” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 223.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 224 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Bananen”, “6 Stück” · fill surface |
| Completed Header | 20 | 298 | 353 | 24 |  |
| &nbsp;&nbsp;&nbsp;Section Label | 24 | 300 | 67 | 18 | “Erledigt · 4” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Clear Action | 273 | 300 | 100 | 18 | “Leeren” · type footnote-medium · color accent · align right |
| Completed Items | 20 | 328 | 353 | 208 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 328 | 353 | 56 | ⟨Shopping List Row · Completed⟩ · content: icon check, “Brot”, “1 Stück” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 379.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 380 | 353 | 56 | ⟨Shopping List Row · Completed⟩ · content: icon check, “Joghurt”, “4 Becher” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 431.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 432 | 353 | 56 | ⟨Shopping List Row · Completed⟩ · content: icon check, “Äpfel”, “1 kg” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 483.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 484 | 353 | 56 | ⟨Shopping List Row · Completed⟩ · content: icon check, “Zahnpasta”, “1 Tube” · fill surface |
| Hint | 24 | 548 | 345 | 36 | “Abgehakte Artikel werden nach 24 Stunden automatisch ausgeblendet.” · type footnote · color label-3 |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Einkauf/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Inline header variant (title centred at safe+15)
- [ ] Completed header row with “Leeren” right-aligned (footnote-medium accent)
- [ ] Completed rows: accent check disc, name + quantity in label-3
- [ ] Hint text 24 px inset, 12 px below the card

### 04 Chats — `light/04-chats`

**Route:** `/chats` (tab “Chats”)

- Large title “Chats” at y 106 with a single-item glass toolbar (`compose` → new chat, prototype → 08d). Search field “Suchen” at y 156 (no subtitle).
- Conversation rows sit directly on the background (no card): household chat (Unread, badge “2”), Lisa (Read), Max (Read).

Board 393×852, background bg. Reference: `reference/light/04-chats.png` · Tree: `extracted/screens/light/04-chats.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar | 321 | 58 | 52 | 44 | Liquid Glass (light) · r 22 · → 08d Chat – leer |
| &nbsp;&nbsp;&nbsp;Toolbar Item / compose | 325 | 58 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / compose | 336 | 69 | 22 | 22 | icon compose 22px, stroke-width 2.18 (viewBox units), color label |
| Large Title | 20 | 106 | 94 | 41 | “Chats” · type large-title · color label |
| Search Field | 20 | 156 | 353 | 44 | ⟨Search Field · Default⟩ · content: icon search, “Suchen” · fill fill-secondary · r 22 |
| Conversation List | 20 | 212 | 353 | 252 |  |
| &nbsp;&nbsp;&nbsp;Message Preview Row | 20 | 212 | 353 | 84 | ⟨Message Preview Row · Unread⟩ · content: icon house, “Unser Zuhause”, “14:32”, “Lisa: Ich habe die Einkaufsliste aktualisiert.”, “2” · fill bg · → 08b Chat – ungelesen |
| &nbsp;&nbsp;&nbsp;Message Preview Row | 20 | 296 | 353 | 84 | ⟨Message Preview Row · Read⟩ · content: “L”, “Lisa”, “13:48”, “Kannst du noch Milch mitbringen?” · fill bg · → 08 Chat – Lisa |
| &nbsp;&nbsp;&nbsp;Message Preview Row | 20 | 380 | 353 | 84 | ⟨Message Preview Row · Read⟩ · content: “M”, “Max”, “Gestern”, “Perfekt, danke!” · fill bg · → 08d Chat – leer |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Chats/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Glass toolbar with compose icon (52×44)
- [ ] Search field directly under the title (y 156)
- [ ] Rows 84 px with 54 px avatars; unread: accent time (600), label message (2 lines), badge 22 px
- [ ] Separators from x 68 (relative to the 20 px gutter) to the right edge
- [ ] Tab Bar (Chats active)

### 05 Artikel-Details — `light/05-artikel-details`

**Route:** `/inventar/:id` (pushed, no tab bar)

- Back Button (→ 02, push right) + Toolbar Items=1 (`ellipsis`). Hero image 168 px r38 with hero shadow, centred title `title1`, category tag pill.
- “Menge” label, large Quantity Stepper (196×56, black plus), unit label “Stück”, value card (unit price / total), primary “Bearbeiten” (→ 07 sheet), text link “Zur Einkaufsliste hinzufügen” (accent, cart icon) → adds to shopping list.

Board 393×852, background bg. Reference: `reference/light/05-artikel-details.png` · Tree: `extracted/screens/light/05-artikel-details.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Back Button | 16 | 58 | 44 | 44 | ⟨Back Button · Light⟩ · content: icon chevL · Liquid Glass (light) · r 22 · → 02 Inventar |
| Toolbar (Glass) | 321 | 58 | 52 | 44 | ⟨Toolbar (Glass) · 1⟩ · content: icon ellipsis · Liquid Glass (light) · r 22 |
| Product Image | 112.5 | 108 | 168 | 168 | fill image caps · r 38 · shadow 0/14/34/0 black@0.12 |
| Title | 0 | 298 | 393 | 34 | “Nespresso Kapseln” · type title1 · color label · align center |
| Category Tag | 148.5 | 340 | 96 | 28 | fill fill-secondary · r 14 |
| &nbsp;&nbsp;&nbsp;icon / tag | 160.5 | 346 | 16 | 16 | icon tag 16px, stroke-width 2.7 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Category | 184.5 | 345 | 40 | 18 | “Küche” · type footnote-medium · color label-2 |
| Quantity Label | 0 | 398 | 393 | 18 | “Menge” · type footnote-medium · color label-2 · align center |
| Quantity Stepper | 98.5 | 422 | 196 | 56 | ⟨Quantity Stepper · Large/Default⟩ · content: icon minus, “24”, icon plus · fill fill-secondary · r 28 |
| Unit | 0 | 486 | 393 | 18 | “Stück” · type footnote · color label-2 · align center |
| Value Card | 20 | 524 | 353 | 124 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Unit Price Label | 40 | 543 | 126 | 23 | “Preis pro Einheit” · type body · color label-2 |
| &nbsp;&nbsp;&nbsp;Unit Price | 233 | 543 | 120 | 23 | “CHF 0.54” · type body · color label · align right |
| &nbsp;&nbsp;&nbsp;Separator | 40 | 585.5 | 313 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Total Label | 40 | 606 | 98 | 23 | “Gesamtwert” · type headline · color label |
| &nbsp;&nbsp;&nbsp;Total Value | 193 | 601 | 160 | 28 | “CHF 12.96” · type title2 · color label · align right |
| Button | 20 | 680 | 353 | 52 | ⟨Button · Primary/Default⟩ · content: “Bearbeiten” · fill label · r 26 · → 07 Artikel bearbeiten |
| Add to Shopping List | 20 | 742 | 353 | 44 | → 03 Einkaufsliste |
| &nbsp;&nbsp;&nbsp;icon / cart | 90 | 753 | 20 | 20 | icon cart 20px, stroke-width 2.28 (viewBox units), color accent |
| &nbsp;&nbsp;&nbsp;Label | 118 | 754 | 200 | 20 | “Zur Einkaufsliste hinzufügen” · type subhead-medium · color accent |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] No tab bar; back button glass 44 px at left 16
- [ ] Hero image 168×168 r38 centred at top safe+54 with 0/14/34 shadow
- [ ] Title `title1` centred 22 px below image; category tag centred 8 px below the title
- [ ] Large stepper centred, value `title2`; unit label below
- [ ] Value card r22 with two rows and hairline
- [ ] Primary button 353×52 + accent text link button 44 px tall

### 06 Neuer Artikel – leer — `light/06-neuer-artikel-leer`

**Route:** `/inventar/neu` (sheet over 02)

- Page sheet: black screen behind, receding parent strip (presenting view), sheet from y 58 with top radius 34. Status bar is dark (light text) in sheet screens.
- Close button (glass xmark, → slide down), title “Neuer Artikel”, Image Upload Area (Empty, dashed; tap → 13), Text Input (Default, placeholder “z. B. Olivenöl”), details card (Kategorie “Auswählen”, Menge stepper at minimum “1”, Einheit “Stück” placeholder), Price Input (Empty), total “CHF 0.00”, primary button **Disabled**.

Board 393×852, background black. Reference: `reference/light/06-neuer-artikel-leer.png` · Tree: `extracted/screens/light/06-neuer-artikel-leer.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Presenting View | 16 | 46 | 361 | 60 | fill bg@0.45 · r 14 |
| Sheet | 0 | 58 | 393 | 794 | fill bg · r 34/34/0/0 |
| &nbsp;&nbsp;&nbsp;Close Button | 16 | 72 | 44 | 44 | Liquid Glass (light) · r 22 · → 02 Inventar |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / xmark | 28 | 84 | 20 | 20 | icon xmark 20px, stroke-width 2.4 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Sheet Title | 0 | 83 | 393 | 23 | “Neuer Artikel” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Image Upload Area | 20 | 134 | 353 | 200 | ⟨Image Upload Area · Empty⟩ · content: icon camera, “Foto hinzufügen”, “Aufnehmen oder aus der Mediathek wählen” · fill surface · stroke 1.5px inner label-3@0.7 dashed · r 22 · → 13 Foto auswählen |
| &nbsp;&nbsp;&nbsp;Text Input | 20 | 354 | 353 | 76 | ⟨Text Input · Default⟩ · content: “Artikelname”, “z. B. Olivenöl” · → 06 Neuer Artikel – ausgefüllt |
| &nbsp;&nbsp;&nbsp;Details Card | 20 | 450 | 353 | 156 | fill surface · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Kategorie | 20 | 450 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 465 | 75 | 23 | “Kategorie” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 465 | 155 | 23 | “Auswählen” · type body · color label-3 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 465 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 501.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Menge | 20 | 502 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 517 | 55 | 23 | “Menge” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity Stepper | 233 | 508 | 124 | 40 | ⟨Quantity Stepper · Compact/Minimum⟩ · content: icon minus, “1”, icon plus · fill fill-secondary · r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 553.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Einheit | 20 | 554 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 569 | 52 | 23 | “Einheit” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 569 | 155 | 23 | “Stück” · type body · color label-3 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 569 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Price Input | 20 | 626 | 353 | 76 | ⟨Price Input · Empty⟩ · content: “Preis pro Einheit”, “CHF”, “0.00” |
| &nbsp;&nbsp;&nbsp;Total Preview | 20 | 714 | 353 | 22 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 24 | 714 | 75 | 18 | “Gesamtwert” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Total | 153 | 714 | 216 | 18 | “CHF 0.00” · type footnote-medium · color label-3 · align right |
| &nbsp;&nbsp;&nbsp;Button | 20 | 758 | 353 | 52 | ⟨Button · Primary/Disabled⟩ · content: “Artikel hinzufügen” · fill fill-secondary · r 26 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Sheet chrome (black backdrop, 45 % presenting strip r14, sheet top radius 34, bg fill)
- [ ] Close glass button at sheet (16, 14); title centred
- [ ] Upload area 353×200 r22 dashed 1.5 px label-3 @70 %
- [ ] Text input label + field 52 px r14, 1 px separator stroke
- [ ] Details card r16 with three 52 px form rows and compact stepper (minus label-3 at minimum)
- [ ] Price input with “CHF” prefix; total preview row
- [ ] Primary button disabled (`#EAE9E4` / label-3) until the form is valid

### 06 Neuer Artikel – ausgefüllt — `light/06-neuer-artikel-ausgefuellt`

**Route:** `/inventar/neu` (filled state)

- Same sheet filled: Image Upload Area Selected (oil photo + glass “Ändern” pill), name “Olivenöl”, Kategorie “Küche”, Menge 2, Einheit “Flaschen”, price 8.50, total “2 × CHF 8.50 = CHF 17.00”, primary button enabled (→ 14, sheet slides down).

Board 393×852, background black. Reference: `reference/light/06-neuer-artikel-ausgefuellt.png` · Tree: `extracted/screens/light/06-neuer-artikel-ausgefuellt.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Presenting View | 16 | 46 | 361 | 60 | fill bg@0.45 · r 14 |
| Sheet | 0 | 58 | 393 | 794 | fill bg · r 34/34/0/0 |
| &nbsp;&nbsp;&nbsp;Close Button | 16 | 72 | 44 | 44 | Liquid Glass (light) · r 22 · → 02 Inventar |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / xmark | 28 | 84 | 20 | 20 | icon xmark 20px, stroke-width 2.4 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Sheet Title | 0 | 83 | 393 | 23 | “Neuer Artikel” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Image Upload Area | 20 | 134 | 353 | 200 | ⟨Image Upload Area · Selected⟩ · content: icon camera, “Ändern” · fill image oil · r 22 |
| &nbsp;&nbsp;&nbsp;Text Input | 20 | 354 | 353 | 76 | ⟨Text Input · Filled⟩ · content: “Artikelname”, “Olivenöl” |
| &nbsp;&nbsp;&nbsp;Details Card | 20 | 450 | 353 | 156 | fill surface · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Kategorie | 20 | 450 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 465 | 75 | 23 | “Kategorie” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 465 | 155 | 23 | “Küche” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 465 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 501.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Menge | 20 | 502 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 517 | 55 | 23 | “Menge” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity Stepper | 233 | 508 | 124 | 40 | ⟨Quantity Stepper · Compact/Default⟩ · content: icon minus, “2”, icon plus · fill fill-secondary · r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 553.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Einheit | 20 | 554 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 569 | 52 | 23 | “Einheit” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 569 | 155 | 23 | “Flaschen” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 569 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Price Input | 20 | 626 | 353 | 76 | ⟨Price Input · Filled⟩ · content: “Preis pro Einheit”, “CHF”, “8.50” |
| &nbsp;&nbsp;&nbsp;Total Preview | 20 | 714 | 353 | 22 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 24 | 714 | 75 | 18 | “Gesamtwert” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Total | 153 | 714 | 216 | 18 | “2 × CHF 8.50 = CHF 17.00” · type footnote-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;Button | 20 | 758 | 353 | 52 | ⟨Button · Primary/Default⟩ · content: “Artikel hinzufügen” · fill label · r 26 · → 14 Artikel hinzugefügt |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Selected image: cover-crop, r22, glass pill bottom-right (12 px inset)
- [ ] Filled values in label colour; unit pluralised (“Flaschen”)
- [ ] Total preview formula “2 × CHF 8.50 = CHF 17.00” in `footnote-medium` label
- [ ] Primary button enabled

### 07 Artikel bearbeiten — `light/07-artikel-bearbeiten`

**Route:** `/inventar/:id/bearbeiten` (sheet over 05)

- Like 06 ausgefüllt with title “Artikel bearbeiten”, an additional glass **Delete** button (trash, destructive) at the right (→ 15) and the primary button “Änderungen sichern” (→ 05).

Board 393×852, background black. Reference: `reference/light/07-artikel-bearbeiten.png` · Tree: `extracted/screens/light/07-artikel-bearbeiten.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Presenting View | 16 | 46 | 361 | 60 | fill bg@0.45 · r 14 |
| Sheet | 0 | 58 | 393 | 794 | fill bg · r 34/34/0/0 |
| &nbsp;&nbsp;&nbsp;Close Button | 16 | 72 | 44 | 44 | Liquid Glass (light) · r 22 · → 05 Artikel-Details |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / xmark | 28 | 84 | 20 | 20 | icon xmark 20px, stroke-width 2.4 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Sheet Title | 0 | 83 | 393 | 23 | “Artikel bearbeiten” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Delete Button | 333 | 72 | 44 | 44 | Liquid Glass (light) · r 22 · → 15 Löschen bestätigen |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / trash | 345 | 84 | 20 | 20 | icon trash 20px, stroke-width 2.4 (viewBox units), color destructive |
| &nbsp;&nbsp;&nbsp;Image Upload Area | 20 | 134 | 353 | 200 | ⟨Image Upload Area · Selected⟩ · content: icon camera, “Ändern” · fill image oil · r 22 |
| &nbsp;&nbsp;&nbsp;Text Input | 20 | 354 | 353 | 76 | ⟨Text Input · Filled⟩ · content: “Artikelname”, “Olivenöl” |
| &nbsp;&nbsp;&nbsp;Details Card | 20 | 450 | 353 | 156 | fill surface · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Kategorie | 20 | 450 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 465 | 75 | 23 | “Kategorie” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 465 | 155 | 23 | “Küche” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 465 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 501.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Menge | 20 | 502 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 517 | 55 | 23 | “Menge” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity Stepper | 233 | 508 | 124 | 40 | ⟨Quantity Stepper · Compact/Default⟩ · content: icon minus, “2”, icon plus · fill fill-secondary · r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 553.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Einheit | 20 | 554 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 569 | 52 | 23 | “Einheit” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 569 | 155 | 23 | “Flaschen” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 569 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Price Input | 20 | 626 | 353 | 76 | ⟨Price Input · Filled⟩ · content: “Preis pro Einheit”, “CHF”, “8.50” |
| &nbsp;&nbsp;&nbsp;Total Preview | 20 | 714 | 353 | 22 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 24 | 714 | 75 | 18 | “Gesamtwert” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Total | 153 | 714 | 216 | 18 | “2 × CHF 8.50 = CHF 17.00” · type footnote-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;Button | 20 | 758 | 353 | 52 | ⟨Button · Primary/Default⟩ · content: “Änderungen sichern” · fill label · r 26 · → 05 Artikel-Details |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Delete glass button at sheet (333, 14) with destructive trash icon
- [ ] Primary label “Änderungen sichern”; close returns to details (slide down)
- [ ] Optimistic-concurrency `version` handled on save (ARCHITECTURE §5)

### 08 Chat – Lisa — `light/08-chat-lisa`

**Route:** `/chats/:cid` (pushed, no tab bar)

- Messages scroll under a top scroll-edge gradient (0–150) and above a bottom gradient (700–852). Header: back button, contact avatar 48, glass name pill “Lisa ›”.
- Timestamp “Heute, 08:12”, alternating bubbles, a Shared Item Card (“Milch · 2 Liter” / “Zur Einkaufsliste hinzugefügt”, `MessageKind.SHOPPING_ITEM`), read receipt “Gelesen”.
- Composer at the bottom: glass attachment button + glass message field with mic; tap → 08c.

Board 393×852, background bg. Reference: `reference/light/08-chat-lisa.png` · Tree: `extracted/screens/light/08-chat-lisa.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Messages | 0 | 0 | 393 | 852 |  |
| &nbsp;&nbsp;&nbsp;Timestamp | 0 | 150 | 393 | 16 | “Heute, 08:12” · type caption · color label-3 · align center |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 16 | 178 | 309 | 42 | ⟨Chat Bubble · Incoming⟩ · content: “Hey, haben wir noch Kaffee zuhause?” · fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 55 | 231 | 322 | 42 | ⟨Chat Bubble · Outgoing⟩ · content: “Ja, wir haben noch zwei Packungen ☕” · fill accent · r 20/20/6/20 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 16 | 284 | 250 | 63 | ⟨Chat Bubble · Incoming⟩ · content: “Perfekt! Dann brauchen wir nur noch Milch.” · fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 99 | 358 | 278 | 42 | ⟨Chat Bubble · Outgoing⟩ · content: “Ich setze sie auf die Einkaufsliste.” · fill accent · r 20/20/6/20 |
| &nbsp;&nbsp;&nbsp;Shared Item Card | 133 | 407 | 244 | 60 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon | 145 | 419 | 36 | 36 | fill accent-soft · r 10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 153 | 427 | 20 | 20 | icon cart 20px, stroke-width 2.28 (viewBox units), color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Item | 191 | 418 | 95 | 20 | “Milch · 2 Liter” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Status | 191 | 439 | 166 | 16 | “Zur Einkaufsliste hinzugefügt” · 12/1.3 w400 ls0 · color label-2 |
| &nbsp;&nbsp;&nbsp;Read Receipt | 16 | 473 | 361 | 16 | “Gelesen” · type caption · color label-3 · align right |
| Top Scroll Edge | 0 | 0 | 393 | 150 | fill gradient bg 0% → bg@0.9 60% → bg@0 100% |
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Back Button | 16 | 58 | 44 | 44 | ⟨Back Button · Light⟩ · content: icon chevL · Liquid Glass (light) · r 22 · → 04 Chats |
| Contact Avatar | 172.5 | 50 | 48 | 48 | fill avatar-sand-bg · r 24 |
| &nbsp;&nbsp;&nbsp;Initial | 172.5 | 50 | 48 | 48 | “L” · 19/1.25 w600 ls-0.2 · color avatar-sand-fg · align center |
| Contact Name | 161.5 | 102 | 70 | 26 | Liquid Glass (light) · r 13 |
| &nbsp;&nbsp;&nbsp;Name | 173.5 | 106 | 25 | 18 | “Lisa” · type footnote-medium · color label |
| &nbsp;&nbsp;&nbsp;icon / chevR | 207.9 | 108.5 | 13 | 13 | icon chevR 13px, stroke-width 4.06 (viewBox units), color label-2 |
| Scroll Edge Effect | 0 | 700 | 393 | 152 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Message Composer | 0 | 762 | 393 | 52 | → 08c Chat – Eingabe aktiv |
| &nbsp;&nbsp;&nbsp;Attachment Button | 16 | 766 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 27 | 777 | 22 | 22 | icon plus 22px, stroke-width 2.18 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Message Field | 68 | 766 | 309 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Placeholder | 84 | 777 | 76 | 23 | “Nachricht” · type body · color label-3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / mic | 341 | 776 | 24 | 24 | icon mic 24px, stroke-width 1.8 (viewBox units), color label-2 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Chat header (avatar 48 at top safe−4, pill at safe+48) over the top scroll edge
- [ ] Incoming bubbles left 16, outgoing right 16, 11 px vertical gap, tail corner 6
- [ ] Shared item card right-aligned, 244×60 r18
- [ ] Read receipt caption right-aligned under the last outgoing message
- [ ] Composer 4 px above the safe-area bottom; bottom scroll edge 152 px

### 08b Chat – ungelesen — `light/08b-chat-ungelesen`

**Route:** `/chats/:cid` with unread messages

- Same as 08 scrolled by 40 px (timestamp hidden behind the header) plus an **unread divider** “1 neue Nachricht” (accent) and a new incoming bubble with sender meta “Lisa · 13:48” (`caption2` label-3).

Board 393×852, background bg. Reference: `reference/light/08b-chat-ungelesen.png` · Tree: `extracted/screens/light/08b-chat-ungelesen.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Messages | 0 | 0 | 393 | 852 |  |
| &nbsp;&nbsp;&nbsp;Timestamp | 0 | 110 | 393 | 16 | **hidden** · “Heute, 08:12” · type caption · color label-3 · align center |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 16 | 138 | 309 | 42 | ⟨Chat Bubble · Incoming⟩ · content: “Hey, haben wir noch Kaffee zuhause?” · fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 55 | 191 | 322 | 42 | ⟨Chat Bubble · Outgoing⟩ · content: “Ja, wir haben noch zwei Packungen ☕” · fill accent · r 20/20/6/20 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 16 | 244 | 250 | 63 | ⟨Chat Bubble · Incoming⟩ · content: “Perfekt! Dann brauchen wir nur noch Milch.” · fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 99 | 318 | 278 | 42 | ⟨Chat Bubble · Outgoing⟩ · content: “Ich setze sie auf die Einkaufsliste.” · fill accent · r 20/20/6/20 |
| &nbsp;&nbsp;&nbsp;Shared Item Card | 133 | 367 | 244 | 60 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon | 145 | 379 | 36 | 36 | fill accent-soft · r 10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 153 | 387 | 20 | 20 | icon cart 20px, stroke-width 2.28 (viewBox units), color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Item | 191 | 378 | 95 | 20 | “Milch · 2 Liter” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Status | 191 | 399 | 166 | 16 | “Zur Einkaufsliste hinzugefügt” · 12/1.3 w400 ls0 · color label-2 |
| &nbsp;&nbsp;&nbsp;Read Receipt | 16 | 433 | 361 | 16 | “Gelesen” · type caption · color label-3 · align right |
| &nbsp;&nbsp;&nbsp;Unread Divider | 0 | 463 | 393 | 20 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Line L | 16 | 473 | 116 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Line R | 261 | 473 | 116 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 132 | 465 | 129 | 16 | “1 neue Nachricht” · 12/1.3 w600 ls0 · color accent · align center |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 16 | 495 | 281 | 42 | ⟨Chat Bubble · Incoming⟩ · content: “Kannst du noch Milch mitbringen?” · fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;Meta | 20 | 540 | 60 | 14 | “Lisa · 13:48” · type caption2 · color label-3 |
| Top Scroll Edge | 0 | 0 | 393 | 150 | fill gradient bg 0% → bg@0.9 60% → bg@0 100% |
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Back Button | 16 | 58 | 44 | 44 | ⟨Back Button · Light⟩ · content: icon chevL · Liquid Glass (light) · r 22 · → 04 Chats |
| Contact Avatar | 172.5 | 50 | 48 | 48 | fill avatar-sand-bg · r 24 |
| &nbsp;&nbsp;&nbsp;Initial | 172.5 | 50 | 48 | 48 | “L” · 19/1.25 w600 ls-0.2 · color avatar-sand-fg · align center |
| Contact Name | 161.5 | 102 | 70 | 26 | Liquid Glass (light) · r 13 |
| &nbsp;&nbsp;&nbsp;Name | 173.5 | 106 | 25 | 18 | “Lisa” · type footnote-medium · color label |
| &nbsp;&nbsp;&nbsp;icon / chevR | 207.9 | 108.5 | 13 | 13 | icon chevR 13px, stroke-width 4.06 (viewBox units), color label-2 |
| Scroll Edge Effect | 0 | 700 | 393 | 152 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Message Composer | 0 | 762 | 393 | 52 | → 08c Chat – Eingabe aktiv |
| &nbsp;&nbsp;&nbsp;Attachment Button | 16 | 766 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 27 | 777 | 22 | 22 | icon plus 22px, stroke-width 2.18 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Message Field | 68 | 766 | 309 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Placeholder | 84 | 777 | 76 | 23 | “Nachricht” · type body · color label-3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / mic | 341 | 776 | 24 | 24 | icon mic 24px, stroke-width 1.8 (viewBox units), color label-2 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Unread divider: two hairlines + centred accent label (12/600)
- [ ] Sender meta under incoming bubble at x 20
- [ ] Scroll position: first unread visible above the composer

### 08c Chat – Eingabe aktiv — `light/08c-chat-eingabe-aktiv`

**Route:** `/chats/:cid` with the keyboard open

- The **keyboard (y 516–852) is system UI** – do not draw it; use `visualViewport` (`useKeyboardInset`) so the composer sits directly above the keyboard (design: composer at y 460, i.e. 4 px above the keyboard top).
- Focused composer: value “Bringe ich mit!”, accent caret, accent **send button** 34 px replacing the mic. Older messages scrolled out (hidden layers in the design).

Board 393×852, background bg. Reference: `reference/light/08c-chat-eingabe-aktiv.png` · Tree: `extracted/screens/light/08c-chat-eingabe-aktiv.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Messages | 0 | 0 | 393 | 852 |  |
| &nbsp;&nbsp;&nbsp;Timestamp | 0 | 0 | 393 | 16 | **hidden** · “Heute, 08:12” · type caption · color label-3 · align center |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 16 | 28 | 309 | 42 | ⟨Chat Bubble · Incoming⟩ · content: “Hey, haben wir noch Kaffee zuhause?” · **hidden** · fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 55 | 81 | 322 | 42 | ⟨Chat Bubble · Outgoing⟩ · content: “Ja, wir haben noch zwei Packungen ☕” · **hidden** · fill accent · r 20/20/6/20 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 16 | 134 | 250 | 63 | ⟨Chat Bubble · Incoming⟩ · content: “Perfekt! Dann brauchen wir nur noch Milch.” · **hidden** · fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 99 | 208 | 278 | 42 | ⟨Chat Bubble · Outgoing⟩ · content: “Ich setze sie auf die Einkaufsliste.” · fill accent · r 20/20/6/20 |
| &nbsp;&nbsp;&nbsp;Shared Item Card | 133 | 257 | 244 | 60 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon | 145 | 269 | 36 | 36 | fill accent-soft · r 10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 153 | 277 | 20 | 20 | icon cart 20px, stroke-width 2.28 (viewBox units), color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Item | 191 | 268 | 95 | 20 | “Milch · 2 Liter” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Status | 191 | 289 | 166 | 16 | “Zur Einkaufsliste hinzugefügt” · 12/1.3 w400 ls0 · color label-2 |
| &nbsp;&nbsp;&nbsp;Read Receipt | 16 | 323 | 361 | 16 | “Gelesen” · type caption · color label-3 · align right |
| &nbsp;&nbsp;&nbsp;Chat Bubble | 16 | 331 | 281 | 42 | ⟨Chat Bubble · Incoming⟩ · content: “Kannst du noch Milch mitbringen?” · fill surface-muted · r 20/20/20/6 |
| Keyboard | 0 | 516 | 393 | 336 | fill #E8E8EC@0.97 · r 26/26/0/0 |
| &nbsp;&nbsp;&nbsp;Suggestion | 0 | 530 | 131 | 23 | “"Bringe"” · type body · color label · align center |
| &nbsp;&nbsp;&nbsp;Divider | 131 | 528 | 0.5 | 26 | fill label-3 |
| &nbsp;&nbsp;&nbsp;Suggestion | 131 | 530 | 131 | 23 | “Bringe” · type body · color label · align center |
| &nbsp;&nbsp;&nbsp;Divider | 262 | 528 | 0.5 | 26 | fill label-3 |
| &nbsp;&nbsp;&nbsp;Suggestion | 262 | 530 | 131 | 23 | “Bringt” · type body · color label · align center |
| &nbsp;&nbsp;&nbsp;Key / q | 3 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / w | 38.5 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / e | 74 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / r | 109.5 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / t | 145 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / z | 180.5 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / u | 216 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / i | 251.5 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / o | 287 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / p | 322.5 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / ü | 358 | 568 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / a | 3 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / s | 38.5 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / d | 74 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / f | 109.5 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / g | 145 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / h | 180.5 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / j | 216 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / k | 251.5 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / l | 287 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / ö | 322.5 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / ä | 358 | 623 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / y | 74 | 678 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / x | 109.5 | 678 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / c | 145 | 678 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / v | 180.5 | 678 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / b | 216 | 678 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / n | 251.5 | 678 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / m | 287 | 678 | 32 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / Shift | 3 | 678 | 44 | 44 | fill #C9CAD0 · r 9 |
| &nbsp;&nbsp;&nbsp;Key / Delete | 346 | 678 | 44 | 44 | fill #C9CAD0 · r 9 |
| &nbsp;&nbsp;&nbsp;Key / 123 | 3 | 733 | 92 | 44 | fill #C9CAD0 · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / Leerzeichen | 99 | 733 | 196 | 44 | fill surface · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Key / Senden | 299 | 733 | 91 | 44 | fill accent · r 9 · shadow 0/1/0/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;icon / mic | 352 | 804 | 26 | 26 | icon mic 26px, stroke-width 1.66 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Emoji | 16 | 804 | 26 | 26 | stroke 1.7px inner label-2 · r 13 |
| Message Composer | 0 | 460 | 393 | 52 |  |
| &nbsp;&nbsp;&nbsp;Attachment Button | 16 | 464 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 27 | 475 | 22 | 22 | icon plus 22px, stroke-width 2.18 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Message Field | 68 | 464 | 309 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 84 | 475 | 111 | 23 | “Bringe ich mit!” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Caret | 196 | 474 | 2 | 24 | fill accent · r 1 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Send Button | 339 | 469 | 34 | 34 | fill accent · r 17 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / arrowUp | 346 | 476 | 20 | 20 | icon arrowUp 20px, stroke-width 2.76 (viewBox units), color surface |
| Top Scroll Edge | 0 | 0 | 393 | 150 | fill gradient bg 0% → bg@0.9 60% → bg@0 100% |
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Back Button | 16 | 58 | 44 | 44 | ⟨Back Button · Light⟩ · content: icon chevL · Liquid Glass (light) · r 22 · → 04 Chats |
| Contact Avatar | 172.5 | 50 | 48 | 48 | fill avatar-sand-bg · r 24 |
| &nbsp;&nbsp;&nbsp;Initial | 172.5 | 50 | 48 | 48 | “L” · 19/1.25 w600 ls-0.2 · color avatar-sand-fg · align center |
| Contact Name | 161.5 | 102 | 70 | 26 | Liquid Glass (light) · r 13 |
| &nbsp;&nbsp;&nbsp;Name | 173.5 | 106 | 25 | 18 | “Lisa” · type footnote-medium · color label |
| &nbsp;&nbsp;&nbsp;icon / chevR | 207.9 | 108.5 | 13 | 13 | icon chevR 13px, stroke-width 4.06 (viewBox units), color label-2 |

**Implementation checklist**

- [ ] Composer follows the keyboard inset (bottom = keyboard height + 4 px)
- [ ] Send button appears when text is non-empty; mic hidden
- [ ] Message list keeps the latest message visible above the composer

### 08d Chat – leer — `light/08d-chat-leer`

**Route:** `/chats/:cid` (new direct chat, no messages)

- Header for “Max”, empty state: avatar 80 (initial 32/600), name `title2`, “Mitglied von Unser Zuhause” `footnote` label-2, hint “Schreib Max die erste Nachricht.” `subhead` label-2; composer at the bottom.

Board 393×852, background bg. Reference: `reference/light/08d-chat-leer.png` · Tree: `extracted/screens/light/08d-chat-leer.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Top Scroll Edge | 0 | 0 | 393 | 150 | fill gradient bg 0% → bg@0.9 60% → bg@0 100% |
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Back Button | 16 | 58 | 44 | 44 | ⟨Back Button · Light⟩ · content: icon chevL · Liquid Glass (light) · r 22 · → 04 Chats |
| Contact Avatar | 172.5 | 50 | 48 | 48 | fill avatar-mist-bg · r 24 |
| &nbsp;&nbsp;&nbsp;Initial | 172.5 | 50 | 48 | 48 | “M” · 19/1.25 w600 ls-0.2 · color avatar-mist-fg · align center |
| Contact Name | 165 | 102 | 63 | 26 | Liquid Glass (light) · r 13 |
| &nbsp;&nbsp;&nbsp;Name | 177 | 106 | 27 | 18 | “Max” · type footnote-medium · color label |
| &nbsp;&nbsp;&nbsp;icon / chevR | 203.8 | 108.5 | 13 | 13 | icon chevR 13px, stroke-width 4.06 (viewBox units), color label-2 |
| Empty Avatar | 156.5 | 300 | 80 | 80 | fill avatar-mist-bg · r 40 |
| &nbsp;&nbsp;&nbsp;Initial | 156.5 | 300 | 80 | 80 | “M” · 32/1.25 w600 ls-0.2 · color avatar-mist-fg · align center |
| Empty Title | 0 | 396 | 393 | 28 | “Max” · type title2 · color label · align center |
| Empty Subtitle | 0 | 428 | 393 | 18 | “Mitglied von Unser Zuhause” · type footnote · color label-2 · align center |
| Empty Hint | 0 | 470 | 393 | 20 | “Schreib Max die erste Nachricht.” · type subhead · color label-2 · align center |
| Message Composer | 0 | 762 | 393 | 52 |  |
| &nbsp;&nbsp;&nbsp;Attachment Button | 16 | 766 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 27 | 777 | 22 | 22 | icon plus 22px, stroke-width 2.18 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Message Field | 68 | 766 | 309 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Placeholder | 84 | 777 | 76 | 23 | “Nachricht” · type body · color label-3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / mic | 341 | 776 | 24 | 24 | icon mic 24px, stroke-width 1.8 (viewBox units), color label-2 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Empty-state avatar 80 px centred at y 300
- [ ] Name 16 px below the avatar, membership line 4 px below, hint 24 px below (all centred)
- [ ] Composer identical to 08

### 09 Haushalt & Profil — `light/09-haushalt-profil`

**Route:** `/haushalt` (pushed from the Profile Button; no tab bar)

- Back Button (→ 01), inline title “Haushalt”, household avatar 72 px (black, house glyph), name `title2`, meta “3 Mitglieder · 128 Artikel”.
- Section “Mitglieder”: card with 3 Household Member Rows (Du = “Verwaltung”, Lisa/Max = “Mitglied”) + invite row “Mitglied einladen” (accent). Section “Einstellungen”: 4 Settings Rows (Haushalt verwalten, Erscheinungsbild “Automatisch”, Profil, Einstellungen).

Board 393×852, background bg. Reference: `reference/light/09-haushalt-profil.png` · Tree: `extracted/screens/light/09-haushalt-profil.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Back Button | 16 | 58 | 44 | 44 | ⟨Back Button · Light⟩ · content: icon chevL · Liquid Glass (light) · r 22 · → 01 Home |
| Inline Title | 0 | 69 | 393 | 23 | “Haushalt” · type headline · color label · align center |
| Household Avatar | 160.5 | 116 | 72 | 72 | fill label · r 36 |
| &nbsp;&nbsp;&nbsp;icon / house | 178.5 | 133.28 | 36 | 36 | icon house 36px, stroke-width 1.27 (viewBox units), color bg |
| Household Name | 0 | 200 | 393 | 28 | “Unser Zuhause” · type title2 · color label · align center |
| Household Meta | 0 | 232 | 393 | 18 | “3 Mitglieder · 128 Artikel” · type footnote · color label-2 · align center |
| Section Label | 24 | 276 | 62 | 18 | “Mitglieder” · type footnote-medium · color label-2 |
| Members Card | 20 | 300 | 353 | 232 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Household Member Row | 20 | 300 | 353 | 60 | ⟨Household Member Row⟩ · content: “J”, “Du”, “Verwaltung”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Household Member Row | 20 | 360 | 353 | 60 | ⟨Household Member Row⟩ · content: “L”, “Lisa”, “Mitglied”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Household Member Row | 20 | 420 | 353 | 60 | ⟨Household Member Row⟩ · content: “M”, “Max”, “Mitglied”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Invite Row | 20 | 480 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon | 38 | 490 | 32 | 32 | fill accent-soft · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / personPlus | 44 | 496 | 20 | 20 | icon personPlus 20px, stroke-width 2.16 (viewBox units), color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 84 | 495 | 132 | 23 | “Mitglied einladen” · type body · color accent |
| Section Label | 24 | 556 | 83 | 18 | “Einstellungen” · type footnote-medium · color label-2 |
| Settings Card | 20 | 580 | 353 | 208 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Settings Row | 20 | 580 | 353 | 52 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon Tile | 36 | 591 | 30 | 30 | fill surface-muted · r 8 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 41 | 596 | 20 | 20 | icon house 20px, stroke-width 2.16 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Title | 80 | 595 | 180 | 23 | “Haushalt verwalten” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 597 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 80 | 631.5 | 293 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Settings Row | 20 | 632 | 353 | 52 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon Tile | 36 | 643 | 30 | 30 | fill surface-muted · r 8 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / appearance | 41 | 648 | 20 | 20 | icon appearance 20px, stroke-width 2.16 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Title | 80 | 647 | 180 | 23 | “Erscheinungsbild” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 200 | 648 | 135 | 23 | “Automatisch” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 649 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 80 | 683.5 | 293 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Settings Row | 20 | 684 | 353 | 52 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon Tile | 36 | 695 | 30 | 30 | fill surface-muted · r 8 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / personCircle | 41 | 700 | 20 | 20 | icon personCircle 20px, stroke-width 2.16 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Title | 80 | 699 | 180 | 23 | “Profil” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 701 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 80 | 735.5 | 293 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Settings Row | 20 | 736 | 353 | 52 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon Tile | 36 | 747 | 30 | 30 | fill surface-muted · r 8 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / sliders | 41 | 752 | 20 | 20 | icon sliders 20px, stroke-width 2.16 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Title | 80 | 751 | 180 | 23 | “Einstellungen” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 753 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Inline header with back button
- [ ] Household avatar 72 px centred (y 116), name and meta centred
- [ ] Section labels at x 24 (`footnote-medium` label-2)
- [ ] Members card: rows 60 px (separators inset 64) + invite row 52 px with accent-soft circle 32
- [ ] Settings card: rows 52 px with 30 px icon tiles r8 (`#EFEEEA`)
- [ ] Role labels: the design shows “Verwaltung” for the current user (household creator) and “Mitglied” for the others – the OWNER/ADMIN wording is not specified by the design (open point)

### 10 Inventar – leer — `light/10-inventar-leer`

**Route:** `/inventar` with 0 items

- Header like 02 (subtitle “0 Artikel in deinem Haushalt”), no search/chips. Empty state: tray icon, “Noch keine Artikel”, “Füge deinen ersten Artikel hinzu.”, black pill button “Artikel hinzufügen” 200×48 (→ 06).

Board 393×852, background bg. Reference: `reference/light/10-inventar-leer.png` · Tree: `extracted/screens/light/10-inventar-leer.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 277 | 58 | 96 | 44 | ⟨Toolbar (Glass) · 2⟩ · content: icon plus, icon ellipsis · Liquid Glass (light) · r 22 |
| Large Title | 20 | 106 | 132 | 41 | “Inventar” · type large-title · color label |
| Subtitle | 20 | 148 | 195 | 20 | “0 Artikel in deinem Haushalt” · type subhead · color label-2 |
| Icon Circle | 160.5 | 300 | 72 | 72 | fill accent-soft · r 36 |
| &nbsp;&nbsp;&nbsp;icon / tray | 178.5 | 318 | 36 | 36 | icon tray 36px, stroke-width 1.13 (viewBox units), color accent |
| Empty Title | 0 | 392 | 393 | 25 | “Noch keine Artikel” · type title3 · color label · align center |
| Empty Message | 40 | 422 | 313 | 20 | “Füge deinen ersten Artikel hinzu.” · type subhead · color label-2 · align center |
| Button / Artikel hinzufügen | 96.5 | 468 | 200 | 48 | fill label · r 24 · → 06 Neuer Artikel – leer |
| &nbsp;&nbsp;&nbsp;Label | 96.5 | 468 | 200 | 48 | “Artikel hinzufügen” · type headline · color bg · align center |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Inventar/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Empty state centred (icon circle at y 300)
- [ ] Primary pill 200×48 r24
- [ ] Tab Bar (Inventar active)

### 11 Einkaufsliste – leer — `light/11-einkaufsliste-leer`

**Route:** `/einkauf` with no open items

- Header like 03 without meta/progress; add-item row at y 192; empty state with checkCircle icon (y 330), “Alles erledigt!”, “Deine Einkaufsliste ist leer.”.

Board 393×852, background bg. Reference: `reference/light/11-einkaufsliste-leer.png` · Tree: `extracted/screens/light/11-einkaufsliste-leer.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 321 | 58 | 52 | 44 | ⟨Toolbar (Glass) · 1⟩ · content: icon ellipsis · Liquid Glass (light) · r 22 |
| Large Title | 20 | 106 | 204 | 41 | “Einkaufsliste” · type large-title · color label |
| Subtitle | 20 | 148 | 148 | 20 | “Alles, was noch fehlt.” · type subhead · color label-2 |
| Add Item Row | 20 | 192 | 353 | 52 | fill surface · r 16 · → 18 Einkauf – Artikel hinzufügen |
| &nbsp;&nbsp;&nbsp;Plus | 34 | 205 | 26 | 26 | fill accent · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 38 | 209 | 18 | 18 | icon plus 18px, stroke-width 3.2 (viewBox units), color surface |
| &nbsp;&nbsp;&nbsp;Placeholder | 74 | 207 | 141 | 23 | “Artikel hinzufügen” · type body · color label-3 |
| Icon Circle | 160.5 | 330 | 72 | 72 | fill accent-soft · r 36 |
| &nbsp;&nbsp;&nbsp;icon / checkCircle | 178.5 | 348 | 36 | 36 | icon checkCircle 36px, stroke-width 1.13 (viewBox units), color accent |
| Empty Title | 0 | 422 | 393 | 25 | “Alles erledigt!” · type title3 · color label · align center |
| Empty Message | 40 | 452 | 313 | 20 | “Deine Einkaufsliste ist leer.” · type subhead · color label-2 · align center |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Einkauf/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Add-item row stays available
- [ ] Empty state centred (icon circle at y 330)
- [ ] Tab Bar (Einkauf active)

### 12 Chats – leer — `light/12-chats-leer`

**Route:** `/chats` with no conversations

- Header like 04 without search; empty state with bubbles icon, “Noch keine Chats”, “Starte eine Unterhaltung mit deinem Haushalt.” (2 lines), secondary pill “Neuer Chat” 200×48 (`#EAE9E4`).

Board 393×852, background bg. Reference: `reference/light/12-chats-leer.png` · Tree: `extracted/screens/light/12-chats-leer.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar | 321 | 58 | 52 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;Toolbar Item / compose | 325 | 58 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / compose | 336 | 69 | 22 | 22 | icon compose 22px, stroke-width 2.18 (viewBox units), color label |
| Large Title | 20 | 106 | 94 | 41 | “Chats” · type large-title · color label |
| Icon Circle | 160.5 | 300 | 72 | 72 | fill accent-soft · r 36 |
| &nbsp;&nbsp;&nbsp;icon / bubbles | 178.5 | 318 | 36 | 36 | icon bubbles 36px, stroke-width 1.13 (viewBox units), color accent |
| Empty Title | 0 | 392 | 393 | 25 | “Noch keine Chats” · type title3 · color label · align center |
| Empty Message | 40 | 422 | 313 | 40 | “Starte eine Unterhaltung mit deinem Haushalt.” · type subhead · color label-2 · align center |
| Button / Neuer Chat | 96.5 | 468 | 200 | 48 | fill fill-secondary · r 24 · → 08d Chat – leer |
| &nbsp;&nbsp;&nbsp;Label | 96.5 | 468 | 200 | 48 | “Neuer Chat” · type headline · color label · align center |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Chats/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Empty state centred (icon circle at y 300)
- [ ] Secondary pill 200×48 r24
- [ ] Tab Bar (Chats active)

### 13 Foto auswählen — `light/13-foto-auswaehlen`

**Route:** photo-source bottom sheet inside `/inventar/neu`

- 06 leer with a 30 % black dim over everything and the Bottom Sheet (“Foto hinzufügen”: “Foto aufnehmen”, “Aus Mediathek wählen”, “Abbrechen”) anchored to the bottom. On the web: `<input type="file" accept="image/*" capture>` for camera, plain file input for library.

Board 393×852, background black. Reference: `reference/light/13-foto-auswaehlen.png` · Tree: `extracted/screens/light/13-foto-auswaehlen.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Presenting View | 16 | 46 | 361 | 60 | fill bg@0.45 · r 14 |
| Sheet | 0 | 58 | 393 | 794 | fill bg · r 34/34/0/0 |
| &nbsp;&nbsp;&nbsp;Close Button | 16 | 72 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / xmark | 28 | 84 | 20 | 20 | icon xmark 20px, stroke-width 2.4 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Sheet Title | 0 | 83 | 393 | 23 | “Neuer Artikel” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Image Upload Area | 20 | 134 | 353 | 200 | ⟨Image Upload Area · Empty⟩ · content: icon camera, “Foto hinzufügen”, “Aufnehmen oder aus der Mediathek wählen” · fill surface · stroke 1.5px inner label-3@0.7 dashed · r 22 |
| &nbsp;&nbsp;&nbsp;Text Input | 20 | 354 | 353 | 76 | ⟨Text Input · Default⟩ · content: “Artikelname”, “z. B. Olivenöl” |
| &nbsp;&nbsp;&nbsp;Details Card | 20 | 450 | 353 | 156 | fill surface · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Kategorie | 20 | 450 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 465 | 75 | 23 | “Kategorie” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 465 | 155 | 23 | “Auswählen” · type body · color label-3 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 465 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 501.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Menge | 20 | 502 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 517 | 55 | 23 | “Menge” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity Stepper | 233 | 508 | 124 | 40 | ⟨Quantity Stepper · Compact/Minimum⟩ · content: icon minus, “1”, icon plus · fill fill-secondary · r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 553.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Einheit | 20 | 554 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 569 | 52 | 23 | “Einheit” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 569 | 155 | 23 | “Stück” · type body · color label-3 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 569 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Price Input | 20 | 626 | 353 | 76 | ⟨Price Input · Empty⟩ · content: “Preis pro Einheit”, “CHF”, “0.00” |
| &nbsp;&nbsp;&nbsp;Total Preview | 20 | 714 | 353 | 22 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 24 | 714 | 75 | 18 | “Gesamtwert” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Total | 153 | 714 | 216 | 18 | “CHF 0.00” · type footnote-medium · color label-3 · align right |
| &nbsp;&nbsp;&nbsp;Button | 20 | 758 | 353 | 52 | ⟨Button · Primary/Disabled⟩ · content: “Artikel hinzufügen” · fill fill-secondary · r 26 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |
| Dim | 0 | 0 | 393 | 852 | fill black@0.3 |
| Bottom Sheet | 0 | 552 | 393 | 300 | ⟨Bottom Sheet⟩ · content: “Foto hinzufügen”, icon camera, “Foto aufnehmen”, icon photo, “Aus Mediathek wählen”, “Abbrechen” · fill surface · r 34/34/0/0 · shadow 0/-6/30/0 black@0.1 · → 06 Neuer Artikel – ausgefüllt |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Dim 30 % over the sheet screen
- [ ] Bottom sheet 393×300 top radius 34, grabber, two option rows r16, cancel pill
- [ ] Slide up 400 ms ease-out / down 300 ms ease-in

### 14 Artikel hinzugefügt — `light/14-artikel-hinzugefuegt`

**Route:** `/inventar` after creating an item

- 02 with the new item (Olivenöl) first, highlighted with accent @ 8 %, subtitle “129 Artikel …”, and the glass **Toast** “Olivenöl hinzugefügt · Rückgängig” at y 58 – the toolbar is hidden while the toast is visible.

Board 393×852, background bg. Reference: `reference/light/14-artikel-hinzugefuegt.png` · Tree: `extracted/screens/light/14-artikel-hinzugefuegt.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 277 | 58 | 96 | 44 | ⟨Toolbar (Glass) · 2⟩ · content: icon plus, icon ellipsis · **hidden** · Liquid Glass (light) · r 22 |
| Large Title | 20 | 106 | 132 | 41 | “Inventar” · type large-title · color label |
| Subtitle | 20 | 148 | 210 | 20 | “129 Artikel in deinem Haushalt” · type subhead · color label-2 |
| Search Field | 20 | 186 | 353 | 44 | ⟨Search Field · Default⟩ · content: icon search, “Artikel suchen” · fill fill-secondary · r 22 |
| Category Filter | 20 | 244 | 553 | 36 |  |
| &nbsp;&nbsp;&nbsp;Category Chip | 20 | 244 | 60 | 36 | fill label · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 252 | 28 | 20 | “Alle” · 15/1.33 w600 ls-0.15 · color bg |
| &nbsp;&nbsp;&nbsp;Category Chip | 88 | 244 | 77 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 104 | 252 | 45 | 20 | “Küche” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 173 | 244 | 60 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 189 | 252 | 28 | 20 | “Bad” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 241 | 244 | 126 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 257 | 252 | 94 | 20 | “Wohnzimmer” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 375 | 244 | 88 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 391 | 252 | 56 | 20 | “Technik” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 471 | 244 | 102 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 487 | 252 | 70 | 20 | “Sonstiges” · type subhead-medium · color label |
| Inventory List | 20 | 298 | 353 | 608 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 298 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img oil, “Olivenöl”, “Küche · 2 Flaschen”, “CHF 17.00”, “CHF 8.50 / Fl.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 373.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 374 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img caps, “Nespresso Kapseln”, “Küche · 24 Stück”, “CHF 12.96”, “CHF 0.54 / Stk.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 449.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 450 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img batt4, “Batterien AA”, “Technik · 8 Stück”, “CHF 6.00”, “CHF 0.75 / Stk.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 525.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 526 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img milk, “Milch”, “Küche · 3 Stück”, “CHF 4.65”, “CHF 1.55 / Stk.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 601.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 602 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img coffee, “Kaffee”, “Küche · 2 Packungen”, “CHF 15.90”, “CHF 7.95 / Pkg.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 677.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 678 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img soap4, “Spülmittel”, “Küche · 1 Flasche”, “CHF 3.20”, “CHF 3.20 / Fl.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 753.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 754 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img towel, “Küchenpapier”, “Küche · 4 Rollen”, “CHF 5.80”, “CHF 1.45 / Rolle”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 829.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 830 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img rice, “Reis”, “Küche · 1 Packung”, “CHF 2.95”, “CHF 2.95 / Pkg.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;New Item Highlight | 20 | 298 | 353 | 76 | fill accent@0.08 |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Inventar/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |
| Toast | 46.5 | 58 | 300 | 44 | ⟨Toast⟩ · content: icon check, “Olivenöl hinzugefügt”, “Rückgängig” · Liquid Glass (light) · r 22 · → 02 Inventar |

**Implementation checklist**

- [ ] Toast 300×44 centred in the toolbar row; toolbar hidden meanwhile
- [ ] “Rückgängig” undoes the creation
- [ ] New row highlight accent @ 0.08 (fade out)
- [ ] Count in subtitle updated

### 15 Löschen bestätigen — `light/15-loeschen-bestaetigen`

**Route:** delete confirmation over `/inventar/:id/bearbeiten`

- 07 with a 35 % dim and the Confirmation Dialog “Artikel löschen?” / “«Olivenöl» wird aus dem Inventar von Unser Zuhause entfernt.” / Abbrechen (→ 07) · Löschen (→ 02, sheet slides down).

Board 393×852, background black. Reference: `reference/light/15-loeschen-bestaetigen.png` · Tree: `extracted/screens/light/15-loeschen-bestaetigen.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Presenting View | 16 | 46 | 361 | 60 | fill bg@0.45 · r 14 |
| Sheet | 0 | 58 | 393 | 794 | fill bg · r 34/34/0/0 |
| &nbsp;&nbsp;&nbsp;Close Button | 16 | 72 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / xmark | 28 | 84 | 20 | 20 | icon xmark 20px, stroke-width 2.4 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Sheet Title | 0 | 83 | 393 | 23 | “Artikel bearbeiten” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Delete Button | 333 | 72 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / trash | 345 | 84 | 20 | 20 | icon trash 20px, stroke-width 2.4 (viewBox units), color destructive |
| &nbsp;&nbsp;&nbsp;Image Upload Area | 20 | 134 | 353 | 200 | ⟨Image Upload Area · Selected⟩ · content: icon camera, “Ändern” · fill image oil · r 22 |
| &nbsp;&nbsp;&nbsp;Text Input | 20 | 354 | 353 | 76 | ⟨Text Input · Filled⟩ · content: “Artikelname”, “Olivenöl” |
| &nbsp;&nbsp;&nbsp;Details Card | 20 | 450 | 353 | 156 | fill surface · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Kategorie | 20 | 450 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 465 | 75 | 23 | “Kategorie” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 465 | 155 | 23 | “Küche” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 465 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 501.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Menge | 20 | 502 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 517 | 55 | 23 | “Menge” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity Stepper | 233 | 508 | 124 | 40 | ⟨Quantity Stepper · Compact/Default⟩ · content: icon minus, “2”, icon plus · fill fill-secondary · r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 553.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Einheit | 20 | 554 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 569 | 52 | 23 | “Einheit” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 569 | 155 | 23 | “Flaschen” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 569 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Price Input | 20 | 626 | 353 | 76 | ⟨Price Input · Filled⟩ · content: “Preis pro Einheit”, “CHF”, “8.50” |
| &nbsp;&nbsp;&nbsp;Total Preview | 20 | 714 | 353 | 22 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 24 | 714 | 75 | 18 | “Gesamtwert” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Total | 153 | 714 | 216 | 18 | “2 × CHF 8.50 = CHF 17.00” · type footnote-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;Button | 20 | 758 | 353 | 52 | ⟨Button · Primary/Default⟩ · content: “Änderungen sichern” · fill label · r 26 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |
| Dim | 0 | 0 | 393 | 852 | fill black@0.35 |
| Confirmation Dialog | 46.5 | 330 | 300 | 196 | ⟨Confirmation Dialog⟩ · content: “Artikel löschen?”, “«Olivenöl» wird aus dem Inventar von Unser Zuhause entfernt.”, “Abbrechen”, “Löschen” · fill surface · r 34 · shadow 0/20/60/0 black@0.22 |

**Implementation checklist**

- [ ] Dim 35 %
- [ ] Dialog 300×196 r34 centred (y 330)
- [ ] Guillemets «…» around the item name
- [ ] Destructive soft button for “Löschen”

### 16 Kontextmenü — `light/16-kontextmenue`

**Route:** long-press on an inventory row in `/inventar`

- 02 with a 22 % dim (tap → dismiss), the pressed row lifted (r18, shadow 0/12/32 18 %) above the dim, and the Context Menu right-aligned below it.

Board 393×852, background bg. Reference: `reference/light/16-kontextmenue.png` · Tree: `extracted/screens/light/16-kontextmenue.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 277 | 58 | 96 | 44 | ⟨Toolbar (Glass) · 2⟩ · content: icon plus, icon ellipsis · Liquid Glass (light) · r 22 |
| Large Title | 20 | 106 | 132 | 41 | “Inventar” · type large-title · color label |
| Subtitle | 20 | 148 | 210 | 20 | “128 Artikel in deinem Haushalt” · type subhead · color label-2 |
| Search Field | 20 | 186 | 353 | 44 | ⟨Search Field · Default⟩ · content: icon search, “Artikel suchen” · fill fill-secondary · r 22 |
| Category Filter | 20 | 244 | 553 | 36 |  |
| &nbsp;&nbsp;&nbsp;Category Chip | 20 | 244 | 60 | 36 | fill label · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 252 | 28 | 20 | “Alle” · 15/1.33 w600 ls-0.15 · color bg |
| &nbsp;&nbsp;&nbsp;Category Chip | 88 | 244 | 77 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 104 | 252 | 45 | 20 | “Küche” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 173 | 244 | 60 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 189 | 252 | 28 | 20 | “Bad” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 241 | 244 | 126 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 257 | 252 | 94 | 20 | “Wohnzimmer” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 375 | 244 | 88 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 391 | 252 | 56 | 20 | “Technik” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 471 | 244 | 102 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 487 | 252 | 70 | 20 | “Sonstiges” · type subhead-medium · color label |
| Inventory List | 20 | 298 | 353 | 608 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 298 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img caps, “Nespresso Kapseln”, “Küche · 24 Stück”, “CHF 12.96”, “CHF 0.54 / Stk.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 373.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 374 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img oil, “Olivenöl”, “Küche · 2 Flaschen”, “CHF 17.00”, “CHF 8.50 / Fl.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 449.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 450 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img batt4, “Batterien AA”, “Technik · 8 Stück”, “CHF 6.00”, “CHF 0.75 / Stk.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 525.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 526 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img milk, “Milch”, “Küche · 3 Stück”, “CHF 4.65”, “CHF 1.55 / Stk.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 601.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 602 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img coffee, “Kaffee”, “Küche · 2 Packungen”, “CHF 15.90”, “CHF 7.95 / Pkg.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 677.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 678 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img soap4, “Spülmittel”, “Küche · 1 Flasche”, “CHF 3.20”, “CHF 3.20 / Fl.”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 753.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 754 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img towel, “Küchenpapier”, “Küche · 4 Rollen”, “CHF 5.80”, “CHF 1.45 / Rolle”, icon chevR · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 829.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 830 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img rice, “Reis”, “Küche · 1 Packung”, “CHF 2.95”, “CHF 2.95 / Pkg.”, icon chevR · fill surface |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Inventar/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |
| Dim | 0 | 0 | 393 | 852 | fill black@0.22 · → 02 Inventar |
| Lifted Row | 20 | 374 | 353 | 76 | r 18 · shadow 0/12/32/0 black@0.18 |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 374 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img oil, “Olivenöl”, “Küche · 2 Flaschen”, “CHF 17.00”, “CHF 8.50 / Fl.”, icon chevR · fill surface |
| Context Menu | 123 | 462 | 250 | 201 | ⟨Context Menu⟩ · content: “Bearbeiten”, icon pencil, “Zur Einkaufsliste”, icon cart, “Teilen”, icon arrowUp, “Löschen”, icon trash · fill surface · stroke 1px inner surface@0.9 · r 24 · shadow 0/8/28/0 black@0.1, 0/1/3/0 black@0.06 |

**Implementation checklist**

- [ ] Opened by long-press on a row (the design only shows the open state; timing/haptics are implementation choices)
- [ ] Lifted row keeps its position, gets r18 + shadow
- [ ] Menu 250 px right-aligned, 12 px below the row; destructive item last after the 9 px group band
- [ ] Dim 22 % closes on tap

### 17 Suche aktiv — `light/17-suche-aktiv`

**Route:** `/inventar?search=Oliv`

- Search field Focused with “Oliv”, clear button; subtitle becomes “1 Treffer für «Oliv»”; list card shows only matching rows; chips stay visible.

Board 393×852, background bg. Reference: `reference/light/17-suche-aktiv.png` · Tree: `extracted/screens/light/17-suche-aktiv.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 277 | 58 | 96 | 44 | ⟨Toolbar (Glass) · 2⟩ · content: icon plus, icon ellipsis · Liquid Glass (light) · r 22 |
| Large Title | 20 | 106 | 132 | 41 | “Inventar” · type large-title · color label |
| Subtitle | 20 | 148 | 128 | 20 | “1 Treffer für «Oliv»” · type subhead · color label-2 |
| Search Field | 20 | 186 | 353 | 44 | ⟨Search Field · Focused⟩ · content: icon search, “Oliv”, icon xmark · fill fill-secondary · r 22 |
| Category Filter | 20 | 244 | 553 | 36 |  |
| &nbsp;&nbsp;&nbsp;Category Chip | 20 | 244 | 60 | 36 | fill label · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 252 | 28 | 20 | “Alle” · 15/1.33 w600 ls-0.15 · color bg |
| &nbsp;&nbsp;&nbsp;Category Chip | 88 | 244 | 77 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 104 | 252 | 45 | 20 | “Küche” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 173 | 244 | 60 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 189 | 252 | 28 | 20 | “Bad” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 241 | 244 | 126 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 257 | 252 | 94 | 20 | “Wohnzimmer” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 375 | 244 | 88 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 391 | 252 | 56 | 20 | “Technik” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 471 | 244 | 102 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 487 | 252 | 70 | 20 | “Sonstiges” · type subhead-medium · color label |
| Inventory List | 20 | 298 | 353 | 76 | fill surface · r 22 · → 05 Artikel-Details |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 298 | 353 | 76 | ⟨Inventory Row · Default⟩ · content: img oil, “Olivenöl”, “Küche · 2 Flaschen”, “CHF 17.00”, “CHF 8.50 / Fl.”, icon chevR · fill surface |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Inventar/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Focused search field (value label colour, accent caret, clear disc)
- [ ] Subtitle hit count with «»
- [ ] Card height hugs results

### 18 Einkauf – Artikel hinzufügen — `light/18-einkauf-artikel-hinzufuegen`

**Route:** `/einkauf` with the add-item row focused

- Add-item row focused (1.5 px accent inner stroke) with “Zwiebeln”, optional detail pills “Menge 1 kg” and “Preis CHF 2.40” underneath, the open-items card pushed down by 52 px.

Board 393×852, background bg. Reference: `reference/light/18-einkauf-artikel-hinzufuegen.png` · Tree: `extracted/screens/light/18-einkauf-artikel-hinzufuegen.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Light⟩ |
| Toolbar (Glass) | 321 | 58 | 52 | 44 | ⟨Toolbar (Glass) · 1⟩ · content: icon ellipsis · Liquid Glass (light) · r 22 |
| Large Title | 20 | 106 | 204 | 41 | “Einkaufsliste” · type large-title · color label |
| Subtitle | 20 | 148 | 148 | 20 | “Alles, was noch fehlt.” · type subhead · color label-2 |
| Shared List Meta | 20 | 184 | 353 | 24 |  |
| &nbsp;&nbsp;&nbsp;Member Avatars | 20 | 184 | 60 | 24 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 20 | 184 | 24 | 24 | fill accent-soft · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 20 | 184 | 24 | 24 | “J” · 10/1.25 w600 ls-0.2 · color accent · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 38 | 184 | 24 | 24 | fill avatar-sand-bg · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 38 | 184 | 24 | 24 | “L” · 10/1.25 w600 ls-0.2 · color avatar-sand-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 56 | 184 | 24 | 24 | fill avatar-mist-bg · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 56 | 184 | 24 | 24 | “M” · 10/1.25 w600 ls-0.2 · color avatar-mist-fg · align center |
| &nbsp;&nbsp;&nbsp;Household | 90 | 187 | 94 | 18 | “Unser Zuhause” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Progress Label | 220 | 187 | 153 | 18 | “4 von 12 erledigt” · type footnote-medium · color label-2 · align right |
| Progress Track | 20 | 218 | 353 | 4 | fill separator · r 2 |
| Progress Fill | 20 | 218 | 118 | 4 | fill accent · r 2 |
| Add Item Row | 20 | 240 | 353 | 52 | fill surface · stroke 1.5px inner accent · r 16 · → 03 Einkaufsliste |
| &nbsp;&nbsp;&nbsp;Plus | 34 | 253 | 26 | 26 | fill accent · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 38 | 257 | 18 | 18 | icon plus 18px, stroke-width 3.2 (viewBox units), color surface |
| &nbsp;&nbsp;&nbsp;Value | 74 | 255 | 71 | 23 | “Zwiebeln” · type body · color label |
| &nbsp;&nbsp;&nbsp;Caret | 146 | 254 | 2 | 24 | fill accent · r 1 |
| Optional Details | 20 | 300 | 353 | 40 |  |
| &nbsp;&nbsp;&nbsp;Option / Menge | 20 | 300 | 172 | 40 | fill surface · stroke 1px inner separator · r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 32 | 310 | 20 | 20 | icon stack 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 58 | 311 | 49 | 20 | “Menge” · type subhead · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 88 | 311 | 90 | 20 | “1 kg” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;Option / Preis | 201 | 300 | 172 | 40 | fill surface · stroke 1px inner separator · r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / tag | 213 | 310 | 20 | 20 | icon tag 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 239 | 311 | 35 | 20 | “Preis” · type subhead · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 269 | 311 | 90 | 20 | “CHF 2.40” · type subhead-medium · color label · align right |
| Open Items | 20 | 356 | 353 | 416 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 356 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Milch”, “2 Liter” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 407.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 408 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Eier”, “12 Stück” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 459.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 460 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Spülmittel”, “1 Flasche” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 511.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 512 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Reis”, “1 Packung” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 563.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 564 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Butter”, “250 g” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 615.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 616 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Küchenpapier”, “1 Packung” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 667.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 668 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Tomaten”, “500 g” · fill surface |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 719.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping List Row | 20 | 720 | 353 | 56 | ⟨Shopping List Row · Default⟩ · content: “Bananen”, “6 Stück” · fill surface |
| Completed Disclosure | 20 | 788 | 353 | 24 |  |
| &nbsp;&nbsp;&nbsp;Section Label | 24 | 790 | 67 | 18 | “Erledigt · 4” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;icon / chevD | 102 | 792 | 14 | 14 | icon chevD 14px, stroke-width 3.77 (viewBox units), color label-2 |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Einkauf/Light⟩ · Liquid Glass (light) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Light⟩ |

**Implementation checklist**

- [ ] Focused add row stroke 1.5 px accent
- [ ] Two 172×40 optional pills (gap 9)
- [ ] Enter/Return adds the item; list shifts back

---

## 6. Navigation architecture & prototype

### 6.1 Structure

| Level | Design screens | Web route (ARCHITECTURE §7) | Chrome |
|---|---|---|---|
| Tab shell | 01 Home · 02 Inventar · 03 Einkaufsliste · 04 Chats (+ empty/overlay states 10, 11, 12, 14, 16, 17, 18, 03b) | `/` · `/inventar` · `/einkauf` · `/chats` | Liquid Glass tab bar, scroll-edge gradient |
| Pushed | 05 Artikel-Details · 08/08b/08c/08d Chat · 09 Haushalt & Profil | `/inventar/:id` · `/chats/:cid` · `/haushalt` (+ `/profil`, `/einstellungen` from 09’s settings rows) | glass Back Button, no tab bar |
| Sheets | 06 Neuer Artikel (leer/ausgefüllt) · 07 Artikel bearbeiten | `/inventar/neu` · `/inventar/:id/bearbeiten` | page sheet (black backdrop, presenting strip, r34 top) |
| Overlays inside a screen | 13 photo bottom sheet · 15 confirmation dialog · 16 context menu · 14 toast | component state, not routes | dims 30 / 35 / 22 % |

### 6.2 Flows (page 02)

| Flow | Starting board |
|---|---|
| 1 · Homi Hauptflow (Home) | 01 Home |
| 2 · Artikel erfassen | 06 Neuer Artikel – leer |
| 3 · Chat | 04 Chats |
| 4 · Leerzustände | 10 Inventar – leer |

The dark page has no interactions and no flows.

### 6.3 Transitions (all 89 interactions are `click → navigate-to`)

| Animation | Count | Used for | Web |
|---|---:|---|---|
| Dissolve 200 ms ease-out | 56 | every tab-bar tap; in-place states: search focus (02→17), add row (03→18, 11→18, 18→03), composer focus (08/08b→08c), delete dialog (07→15, 15 Abbrechen→07), context-menu dismiss (16→02), toast tap (14→02), “Zur Einkaufsliste hinzufügen” (05→03), name input (06 leer→ausgefüllt) | cross-fade 200 ms ease-out (tab switches may additionally support the horizontal swipe from ARCHITECTURE §7) |
| Push → left 350 ms ease-in-out | 13 | drill-down: Home tiles/“Alle ansehen”/“Alle 8”/shopping preview/Profile → 05/02/03/09; inventory rows → 05; chat rows → 08/08b/08d; “Erledigt” → 03b | new page slides in from the right, previous moves left |
| Push → right 350 ms ease-in-out | 6 | Back buttons (05→02, 08/08b/08c/08d→04, 09→01) | reverse push |
| Slide in ↑ 400 ms ease-out | 7 | open sheets: toolbar plus → 06, empty-state button → 06, image area → 13, details “Bearbeiten” → 07, compose / “Neuer Chat” → 08d | sheet enters from bottom |
| Slide out ↓ 300 ms ease-in | 7 | close/submit sheets: Close → 02/05, “Artikel hinzufügen” → 14, “Änderungen sichern” → 05, dialog “Löschen” → 02, bottom sheet → 06 ausgefüllt | sheet exits to bottom |

`offsetEffect` is false everywhere, `preserveScrollPosition` false. The complete list (source layer path + box, destination, animation) is in `extracted/prototype.json`.

---

## 7. Dark mode (page 03 – 7 screens)

Dark screens: `01-home-dark`, `02-inventar-dark`, `03-einkaufsliste-dark`, `04-chats-dark`, `05-artikel-details-dark`, `06-neuer-artikel-dark` (filled state), `08-chat-dark`. Geometry is identical to the light screens; differences are colour-only except where noted. Many dark elements are **detached copies** (not component instances) – use the colour mapping below rather than component variants.

| Element | Light | Dark |
|---|---|---|
| Screen background / sheet | `#F7F6F3` | `#0E0E10` |
| Cards, list rows, input fields, details card, shared card | `#FFFFFF` | `#1A1A1D` |
| Search field, stepper tracks, category tag | `#EAE9E4` | `#232326` |
| Text label / 2 / 3 | `#111111` / `#6E6E73` / `#A1A1A6` | `#F5F5F7` / `#9A9AA0` / `#636366` (placeholders use label-3 `#636366`) |
| Separators, input strokes, chip strokes | `#E5E4DF` | `#2C2C2F` |
| Accent (links, selected tab, progress, add-row disc, unread time/badge) | `#5E7D63` | `#8FB094` |
| Glyph on accent (add-row plus, badge count) | white | `#0E0E10` |
| Accent soft (trend pill, shared-card icon tile) | `#E6ECE5` | `#23302A` |
| Avatars (all people) | individual tints | bg `#2A2A2E`, initial `#E5E5EA`; stack ring = `#0E0E10` |
| Household avatar (chat list) | `#111111` + bg-coloured house | **`#F5F5F7` + `#0E0E10` house** (inverted) |
| Selected chip | `#111111` / `#F7F6F3` text | `#F5F5F7` / `#0E0E10` text |
| Primary button | `#111111` / `#F7F6F3` | `#F5F5F7` / `#0E0E10` (Button · Primary/Dark) |
| Large stepper plus button | `#111111` + bg glyph | `#F5F5F7` + `#0E0E10` glyph |
| Outgoing bubble | accent `#5E7D63`, **white** text | `#8FB094`, **`#0E0E10`** text |
| Incoming bubble | `#EFEEEA` | `#232326` |
| Glass material / highlight / edge / shadows | §2 light | §2 dark (`#2A2A2E` 72 %, highlight 10 %, edge 12 %, shadows 45 % / 30 %) |
| Selected tab lens | `#000` 6 % | `#FFF` 10 % |
| Hero product-image shadow | 12 % | **40 %** |
| Sheet presenting strip | `#F7F6F3` @ 45 % | `#2A2A2E` @ 45 % |
| Scroll-edge gradients | `#F7F6F3` stops | `#0E0E10` stops (same offsets) |
| Status bar / home indicator | Light variants | Dark variants (system) |
| Category tag (05) | 96 wide, text at x 36 | 88 wide, text at x 34 (minor inconsistency – use the light geometry) |

No dark variants exist for: 03b, 06 leer, 07, 08b–08d, 09–18 (incl. dialog, context menu, bottom sheet, toast). Derive them with the mapping above; destructive colour in dark is `#E0715E`.

### 7.1 Dark screen layout tables

#### 01 Home – Dark — `dark/01-home-dark`

Board 393×852, background bg. Reference: `reference/dark/01-home-dark.png` · Tree: `extracted/screens/dark/01-home-dark.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Greeting | 20 | 62 | 101 | 20 | “Guten Morgen” · type subhead-medium · color label-2 |
| Large Title | 20 | 82 | 230 | 41 | “Dein Zuhause.” · type large-title · color label |
| Household Switcher | 20 | 130 | 200 | 24 |  |
| &nbsp;&nbsp;&nbsp;Member Avatars | 20 | 130 | 60 | 24 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 20 | 130 | 24 | 24 | fill fill-raised(#2A2A2E) · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 20 | 130 | 24 | 24 | “J” · 10/1.25 w600 ls-0.2 · color avatar-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 38 | 130 | 24 | 24 | fill fill-raised(#2A2A2E) · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 38 | 130 | 24 | 24 | “L” · 10/1.25 w600 ls-0.2 · color avatar-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 56 | 130 | 24 | 24 | fill fill-raised(#2A2A2E) · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 56 | 130 | 24 | 24 | “M” · 10/1.25 w600 ls-0.2 · color avatar-fg · align center |
| &nbsp;&nbsp;&nbsp;Household | 90 | 133 | 94 | 18 | “Unser Zuhause” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;icon / chevD | 186 | 135 | 14 | 14 | icon chevD 14px, stroke-width 3.77 (viewBox units), color label-2 |
| Profile Button | 329 | 62 | 44 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;Avatar | 333 | 66 | 36 | 36 | fill fill-raised(#2A2A2E) · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 333 | 66 | 36 | 36 | “J” · 14/1.25 w600 ls-0.2 · color avatar-fg · align center |
| Household Summary | 20 | 170 | 353 | 158 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Label | 40 | 188 | 79 | 18 | “Inventarwert” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Value | 40 | 208 | 183 | 34 | “CHF 2'485.50” · type title1 · color label |
| &nbsp;&nbsp;&nbsp;Trend | 265 | 190 | 88 | 24 | fill accent-soft · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Trend Value | 265 | 194 | 88 | 16 | “+ CHF 42.80” · 12/1.3 w600 ls0 · color accent · align center |
| &nbsp;&nbsp;&nbsp;Separator | 40 | 258 | 313 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Divider | 196 | 272 | 0.5 | 38 | fill separator |
| &nbsp;&nbsp;&nbsp;Stat / Artikel | 40 | 270 | 150 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 40 | 270 | 150 | 25 | “128” · type title3 · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 40 | 300 | 150 | 18 | “Artikel im Haushalt” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;Stat / Einkauf | 212 | 270 | 150 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 212 | 270 | 150 | 25 | “8 Artikel” · type title3 · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 212 | 300 | 150 | 18 | “Auf der Einkaufsliste” · type footnote · color label-2 |
| Section Title | 20 | 352 | 125 | 25 | “Dein Inventar” · type title3 · color label |
| See All | 253 | 355 | 120 | 20 | “Alle ansehen” · type subhead-medium · color accent · align right |
| Inventory Tile / Milch | 20 | 386 | 108 | 150 |  |
| &nbsp;&nbsp;&nbsp;Product Image | 20 | 386 | 108 | 108 | fill image milk · r 20 |
| &nbsp;&nbsp;&nbsp;Name | 22 | 502 | 39 | 20 | “Milch” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Quantity | 22 | 522 | 47 | 18 | “3 Stück” · type footnote · color label-2 |
| Inventory Tile / Kaffee | 142.5 | 386 | 108 | 150 |  |
| &nbsp;&nbsp;&nbsp;Product Image | 142.5 | 386 | 108 | 108 | fill image coffee · r 20 |
| &nbsp;&nbsp;&nbsp;Name | 144.5 | 502 | 46 | 20 | “Kaffee” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Quantity | 144.5 | 522 | 80 | 18 | “2 Packungen” · type footnote · color label-2 |
| Inventory Tile / Olivenöl | 265 | 386 | 108 | 150 |  |
| &nbsp;&nbsp;&nbsp;Product Image | 265 | 386 | 108 | 108 | fill image oil · r 20 |
| &nbsp;&nbsp;&nbsp;Name | 267 | 502 | 57 | 20 | “Olivenöl” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Quantity | 267 | 522 | 67 | 18 | “2 Flaschen” · type footnote · color label-2 |
| Section Title | 20 | 560 | 238 | 25 | “Für den nächsten Einkauf” · type title3 · color label |
| Open List | 283 | 563 | 90 | 20 | “Alle 8” · type subhead-medium · color accent · align right |
| Shopping Preview | 20 | 596 | 353 | 156 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 596 | 353 | 52 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 611 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 612 | 170 | 23 | “Eier” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 614 | 137 | 20 | “12 Stück” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 647.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 648 | 353 | 52 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 663 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 664 | 170 | 23 | “Butter” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 666 | 137 | 20 | “250 g” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 699.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 700 | 353 | 52 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 715 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 716 | 170 | 23 | “Spülmittel” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 718 | 137 | 20 | “1 Flasche” · type subhead · color label-2 · align right |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Home/Dark⟩ · Liquid Glass (dark) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Dark⟩ |

**Implementation checklist**

- [ ] Same geometry as the light screen; colours per the mapping above
- [ ] Compare against `reference/dark/01-home-dark.png`

#### 02 Inventar – Dark — `dark/02-inventar-dark`

Board 393×852, background bg. Reference: `reference/dark/02-inventar-dark.png` · Tree: `extracted/screens/dark/02-inventar-dark.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Toolbar | 277 | 58 | 96 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;Toolbar Item / plus | 281 | 58 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 292 | 69 | 22 | 22 | icon plus 22px, stroke-width 2.18 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Toolbar Item / ellipsis | 325 | 58 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / ellipsis | 336 | 69 | 22 | 22 | icon ellipsis 22px, stroke-width – (viewBox units), color label |
| Large Title | 20 | 106 | 132 | 41 | “Inventar” · type large-title · color label |
| Subtitle | 20 | 148 | 210 | 20 | “128 Artikel in deinem Haushalt” · type subhead · color label-2 |
| Search Field | 20 | 186 | 353 | 44 | fill surface-muted · r 22 |
| &nbsp;&nbsp;&nbsp;icon / search | 34 | 198 | 20 | 20 | icon search 20px, stroke-width 2.28 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Placeholder | 62 | 198 | 111 | 23 | “Artikel suchen” · type body · color label-2 |
| Category Filter | 20 | 244 | 553 | 36 |  |
| &nbsp;&nbsp;&nbsp;Category Chip | 20 | 244 | 60 | 36 | fill label · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 252 | 28 | 20 | “Alle” · 15/1.33 w600 ls-0.15 · color bg |
| &nbsp;&nbsp;&nbsp;Category Chip | 88 | 244 | 77 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 104 | 252 | 45 | 20 | “Küche” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 173 | 244 | 60 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 189 | 252 | 28 | 20 | “Bad” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 241 | 244 | 126 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 257 | 252 | 94 | 20 | “Wohnzimmer” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 375 | 244 | 88 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 391 | 252 | 56 | 20 | “Technik” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Category Chip | 471 | 244 | 102 | 36 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 487 | 252 | 70 | 20 | “Sonstiges” · type subhead-medium · color label |
| Inventory List | 20 | 298 | 353 | 608 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 298 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Product Image | 34 | 310 | 52 | 52 | fill image caps · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 100 | 314 | 165 | 23 | “Nespresso Kapseln” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Subtitle | 100 | 339 | 150 | 18 | “Küche · 24 Stück” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price | 260 | 315 | 75 | 20 | “CHF 12.96” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unit Price | 225 | 339 | 110 | 18 | “CHF 0.54 / Stk.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 327 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 373.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 374 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Product Image | 34 | 386 | 52 | 52 | fill image oil · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 100 | 390 | 165 | 23 | “Olivenöl” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Subtitle | 100 | 415 | 150 | 18 | “Küche · 2 Flaschen” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price | 260 | 391 | 75 | 20 | “CHF 17.00” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unit Price | 225 | 415 | 110 | 18 | “CHF 8.50 / Fl.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 403 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 449.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 450 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Product Image | 34 | 462 | 52 | 52 | fill image batt4 · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 100 | 466 | 165 | 23 | “Batterien AA” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Subtitle | 100 | 491 | 150 | 18 | “Technik · 8 Stück” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price | 260 | 467 | 75 | 20 | “CHF 6.00” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unit Price | 225 | 491 | 110 | 18 | “CHF 0.75 / Stk.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 479 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 525.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 526 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Product Image | 34 | 538 | 52 | 52 | fill image milk · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 100 | 542 | 165 | 23 | “Milch” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Subtitle | 100 | 567 | 150 | 18 | “Küche · 3 Stück” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price | 260 | 543 | 75 | 20 | “CHF 4.65” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unit Price | 225 | 567 | 110 | 18 | “CHF 1.55 / Stk.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 555 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 601.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 602 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Product Image | 34 | 614 | 52 | 52 | fill image coffee · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 100 | 618 | 165 | 23 | “Kaffee” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Subtitle | 100 | 643 | 150 | 18 | “Küche · 2 Packungen” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price | 260 | 619 | 75 | 20 | “CHF 15.90” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unit Price | 225 | 643 | 110 | 18 | “CHF 7.95 / Pkg.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 631 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 677.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 678 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Product Image | 34 | 690 | 52 | 52 | fill image soap4 · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 100 | 694 | 165 | 23 | “Spülmittel” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Subtitle | 100 | 719 | 150 | 18 | “Küche · 1 Flasche” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price | 260 | 695 | 75 | 20 | “CHF 3.20” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unit Price | 225 | 719 | 110 | 18 | “CHF 3.20 / Fl.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 707 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 753.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 754 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Product Image | 34 | 766 | 52 | 52 | fill image towel · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 100 | 770 | 165 | 23 | “Küchenpapier” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Subtitle | 100 | 795 | 150 | 18 | “Küche · 4 Rollen” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price | 260 | 771 | 75 | 20 | “CHF 5.80” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unit Price | 225 | 795 | 110 | 18 | “CHF 1.45 / Rolle” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 783 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 100 | 829.5 | 273 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Inventory Row | 20 | 830 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Product Image | 34 | 842 | 52 | 52 | fill image rice · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 100 | 846 | 165 | 23 | “Reis” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Subtitle | 100 | 871 | 150 | 18 | “Küche · 1 Packung” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price | 260 | 847 | 75 | 20 | “CHF 2.95” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unit Price | 225 | 871 | 110 | 18 | “CHF 2.95 / Pkg.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevR | 341 | 859 | 18 | 18 | icon chevR 18px, stroke-width 2.67 (viewBox units), color label-3 |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Inventar/Dark⟩ · Liquid Glass (dark) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Dark⟩ |

**Implementation checklist**

- [ ] Same geometry as the light screen; colours per the mapping above
- [ ] Compare against `reference/dark/02-inventar-dark.png`

#### 03 Einkaufsliste – Dark — `dark/03-einkaufsliste-dark`

Board 393×852, background bg. Reference: `reference/dark/03-einkaufsliste-dark.png` · Tree: `extracted/screens/dark/03-einkaufsliste-dark.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Toolbar | 321 | 58 | 52 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;Toolbar Item / ellipsis | 325 | 58 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / ellipsis | 336 | 69 | 22 | 22 | icon ellipsis 22px, stroke-width – (viewBox units), color label |
| Large Title | 20 | 106 | 204 | 41 | “Einkaufsliste” · type large-title · color label |
| Subtitle | 20 | 148 | 148 | 20 | “Alles, was noch fehlt.” · type subhead · color label-2 |
| Shared List Meta | 20 | 184 | 353 | 24 |  |
| &nbsp;&nbsp;&nbsp;Member Avatars | 20 | 184 | 60 | 24 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 20 | 184 | 24 | 24 | fill fill-raised(#2A2A2E) · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 20 | 184 | 24 | 24 | “J” · 10/1.25 w600 ls-0.2 · color avatar-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 38 | 184 | 24 | 24 | fill fill-raised(#2A2A2E) · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 38 | 184 | 24 | 24 | “L” · 10/1.25 w600 ls-0.2 · color avatar-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 56 | 184 | 24 | 24 | fill fill-raised(#2A2A2E) · stroke 2px outer bg · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 56 | 184 | 24 | 24 | “M” · 10/1.25 w600 ls-0.2 · color avatar-fg · align center |
| &nbsp;&nbsp;&nbsp;Household | 90 | 187 | 94 | 18 | “Unser Zuhause” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Progress Label | 220 | 187 | 153 | 18 | “4 von 12 erledigt” · type footnote-medium · color label-2 · align right |
| Progress Track | 20 | 218 | 353 | 4 | fill separator · r 2 |
| Progress Fill | 20 | 218 | 118 | 4 | fill accent · r 2 |
| Add Item Row | 20 | 240 | 353 | 52 | fill surface · r 16 |
| &nbsp;&nbsp;&nbsp;Plus | 34 | 253 | 26 | 26 | fill accent · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 38 | 257 | 18 | 18 | icon plus 18px, stroke-width 3.2 (viewBox units), color bg |
| &nbsp;&nbsp;&nbsp;Placeholder | 74 | 255 | 141 | 23 | “Artikel hinzufügen” · type body · color label-3 |
| Open Items | 20 | 304 | 353 | 416 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 304 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 319 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 320 | 170 | 23 | “Milch” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 322 | 137 | 20 | “2 Liter” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 355.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 356 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 371 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 372 | 170 | 23 | “Eier” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 374 | 137 | 20 | “12 Stück” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 407.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 408 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 423 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 424 | 170 | 23 | “Spülmittel” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 426 | 137 | 20 | “1 Flasche” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 459.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 460 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 475 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 476 | 170 | 23 | “Reis” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 478 | 137 | 20 | “1 Packung” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 511.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 512 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 527 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 528 | 170 | 23 | “Butter” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 530 | 137 | 20 | “250 g” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 563.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 564 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 579 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 580 | 170 | 23 | “Küchenpapier” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 582 | 137 | 20 | “1 Packung” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 615.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 616 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 631 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 632 | 170 | 23 | “Tomaten” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 634 | 137 | 20 | “500 g” · type subhead · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Separator | 76 | 667.5 | 297 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Shopping Row | 20 | 668 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Checkbox | 36 | 683 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 76 | 684 | 170 | 23 | “Bananen” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity | 220 | 686 | 137 | 20 | “6 Stück” · type subhead · color label-2 · align right |
| Completed Disclosure | 20 | 736 | 353 | 24 |  |
| &nbsp;&nbsp;&nbsp;Section Label | 24 | 738 | 67 | 18 | “Erledigt · 4” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;icon / chevD | 102 | 740 | 14 | 14 | icon chevD 14px, stroke-width 3.77 (viewBox units), color label-2 |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Einkauf/Dark⟩ · Liquid Glass (dark) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Dark⟩ |

**Implementation checklist**

- [ ] Same geometry as the light screen; colours per the mapping above
- [ ] Compare against `reference/dark/03-einkaufsliste-dark.png`

#### 04 Chats – Dark — `dark/04-chats-dark`

Board 393×852, background bg. Reference: `reference/dark/04-chats-dark.png` · Tree: `extracted/screens/dark/04-chats-dark.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Toolbar | 321 | 58 | 52 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;Toolbar Item / compose | 325 | 58 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / compose | 336 | 69 | 22 | 22 | icon compose 22px, stroke-width 2.18 (viewBox units), color label |
| Large Title | 20 | 106 | 94 | 41 | “Chats” · type large-title · color label |
| Search Field | 20 | 156 | 353 | 44 | fill surface-muted · r 22 |
| &nbsp;&nbsp;&nbsp;icon / search | 34 | 168 | 20 | 20 | icon search 20px, stroke-width 2.28 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Placeholder | 62 | 168 | 59 | 23 | “Suchen” · type body · color label-2 |
| Conversation List | 20 | 212 | 353 | 252 |  |
| &nbsp;&nbsp;&nbsp;Message Preview Row | 20 | 212 | 353 | 84 | fill bg |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 20 | 226 | 54 | 54 | fill label · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 33.5 | 238.96 | 27 | 27 | icon house 27px, stroke-width 1.69 (viewBox units), color bg |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 88 | 226 | 190 | 23 | “Unser Zuhause” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Time | 273 | 228 | 100 | 18 | “14:32” · 13/1.35 w600 ls-0.05 · color accent · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Last Message | 88 | 249 | 250 | 40 | “Lisa: Ich habe die Einkaufsliste aktualisiert.” · type subhead · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Unread Badge | 351 | 256 | 22 | 22 | fill accent · r 11 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Count | 351 | 256 | 22 | 22 | “2” · 12/1.3 w700 ls0 · color bg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 88 | 295.5 | 285 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Message Preview Row | 20 | 296 | 353 | 84 | fill bg |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 20 | 310 | 54 | 54 | fill fill-raised(#2A2A2E) · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 20 | 310 | 54 | 54 | “L” · 22/1.25 w600 ls-0.2 · color avatar-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 88 | 310 | 190 | 23 | “Lisa” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Time | 273 | 312 | 100 | 18 | “13:48” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Last Message | 88 | 333 | 250 | 20 | “Kannst du noch Milch mitbringen?” · type subhead · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 88 | 379.5 | 285 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Message Preview Row | 20 | 380 | 353 | 84 | fill bg |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Avatar | 20 | 394 | 54 | 54 | fill fill-raised(#2A2A2E) · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 20 | 394 | 54 | 54 | “M” · 22/1.25 w600 ls-0.2 · color avatar-fg · align center |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Name | 88 | 394 | 190 | 23 | “Max” · type headline · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Time | 273 | 396 | 100 | 18 | “Gestern” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Last Message | 88 | 417 | 250 | 20 | “Perfekt, danke!” · type subhead · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 88 | 463.5 | 285 | 0.5 | fill separator |
| Scroll Edge Effect | 0 | 742 | 393 | 110 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Tab Bar (Liquid Glass) | 16 | 769 | 361 | 62 | ⟨Tab Bar (Liquid Glass) · Chats/Dark⟩ · Liquid Glass (dark) · r 31 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Dark⟩ |

**Implementation checklist**

- [ ] Same geometry as the light screen; colours per the mapping above
- [ ] Compare against `reference/dark/04-chats-dark.png`

#### 05 Artikel-Details – Dark — `dark/05-artikel-details-dark`

Board 393×852, background bg. Reference: `reference/dark/05-artikel-details-dark.png` · Tree: `extracted/screens/dark/05-artikel-details-dark.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Back Button | 16 | 58 | 44 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;icon / chevL | 27 | 69 | 22 | 22 | icon chevL 22px, stroke-width 2.18 (viewBox units), color label |
| Toolbar | 321 | 58 | 52 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;Toolbar Item / ellipsis | 325 | 58 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / ellipsis | 336 | 69 | 22 | 22 | icon ellipsis 22px, stroke-width – (viewBox units), color label |
| Product Image | 112.5 | 108 | 168 | 168 | fill image caps · r 38 · shadow 0/14/34/0 black@0.4 |
| Title | 0 | 298 | 393 | 34 | “Nespresso Kapseln” · type title1 · color label · align center |
| Category Tag | 152.5 | 340 | 88 | 28 | fill surface-muted · r 14 |
| &nbsp;&nbsp;&nbsp;icon / tag | 164.5 | 346 | 16 | 16 | icon tag 16px, stroke-width 2.7 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Category | 186.5 | 345 | 40 | 18 | “Küche” · type footnote-medium · color label-2 |
| Quantity Label | 0 | 398 | 393 | 18 | “Menge” · type footnote-medium · color label-2 · align center |
| Quantity Stepper | 98.5 | 422 | 196 | 56 | fill surface-muted · r 28 |
| &nbsp;&nbsp;&nbsp;Minus | 98.5 | 422 | 56 | 56 | r 28 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / minus | 114.5 | 438 | 24 | 24 | icon minus 24px, stroke-width 2 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Value | 154.5 | 422 | 84 | 56 | “24” · type title2 · color label · align center |
| &nbsp;&nbsp;&nbsp;Plus | 238.5 | 422 | 56 | 56 | fill label · r 28 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 254.5 | 438 | 24 | 24 | icon plus 24px, stroke-width 2 (viewBox units), color bg |
| Unit | 0 | 486 | 393 | 18 | “Stück” · type footnote · color label-2 · align center |
| Value Card | 20 | 524 | 353 | 124 | fill surface · r 22 |
| &nbsp;&nbsp;&nbsp;Unit Price Label | 40 | 543 | 126 | 23 | “Preis pro Einheit” · type body · color label-2 |
| &nbsp;&nbsp;&nbsp;Unit Price | 233 | 543 | 120 | 23 | “CHF 0.54” · type body · color label · align right |
| &nbsp;&nbsp;&nbsp;Separator | 40 | 585.5 | 313 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Total Label | 40 | 606 | 98 | 23 | “Gesamtwert” · type headline · color label |
| &nbsp;&nbsp;&nbsp;Total Value | 193 | 601 | 160 | 28 | “CHF 12.96” · type title2 · color label · align right |
| Button / primary | 20 | 680 | 353 | 52 | fill label · r 26 |
| &nbsp;&nbsp;&nbsp;Label | 20 | 680 | 353 | 52 | “Bearbeiten” · type headline · color bg · align center |
| Add to Shopping List | 20 | 742 | 353 | 44 |  |
| &nbsp;&nbsp;&nbsp;icon / cart | 90 | 753 | 20 | 20 | icon cart 20px, stroke-width 2.28 (viewBox units), color accent |
| &nbsp;&nbsp;&nbsp;Label | 118 | 754 | 200 | 20 | “Zur Einkaufsliste hinzufügen” · type subhead-medium · color accent |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Dark⟩ |

**Implementation checklist**

- [ ] Same geometry as the light screen; colours per the mapping above
- [ ] Compare against `reference/dark/05-artikel-details-dark.png`

#### 06 Neuer Artikel – Dark — `dark/06-neuer-artikel-dark`

Board 393×852, background black. Reference: `reference/dark/06-neuer-artikel-dark.png` · Tree: `extracted/screens/dark/06-neuer-artikel-dark.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Presenting View | 16 | 46 | 361 | 60 | fill fill-raised(#2A2A2E)@0.45 · r 14 |
| Sheet | 0 | 58 | 393 | 794 | fill bg · r 34/34/0/0 |
| &nbsp;&nbsp;&nbsp;Close Button | 16 | 72 | 44 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / xmark | 28 | 84 | 20 | 20 | icon xmark 20px, stroke-width 2.4 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Sheet Title | 0 | 83 | 393 | 23 | “Neuer Artikel” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Image Upload Area | 20 | 134 | 353 | 200 | fill image oil · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Change Photo | 249 | 286 | 112 | 36 | Liquid Glass (dark) · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / camera | 263 | 295 | 18 | 18 | icon camera 18px, stroke-width 2.53 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 289 | 294 | 52 | 20 | “Ändern” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Text Input | 20 | 354 | 353 | 76 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 24 | 354 | 74 | 18 | “Artikelname” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Field | 20 | 378 | 353 | 52 | fill surface · stroke 1px inner separator · r 14 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 36 | 393 | 63 | 23 | “Olivenöl” · type body · color label |
| &nbsp;&nbsp;&nbsp;Details Card | 20 | 450 | 353 | 156 | fill surface · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Kategorie | 20 | 450 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 465 | 75 | 23 | “Kategorie” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 465 | 155 | 23 | “Küche” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 465 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 501.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Menge | 20 | 502 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 517 | 55 | 23 | “Menge” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Quantity Stepper | 233 | 508 | 124 | 40 | fill surface-muted · r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 36 | 553.5 | 337 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Form Row / Einheit | 20 | 554 | 353 | 52 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 36 | 569 | 52 | 23 | “Einheit” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 170 | 569 | 155 | 23 | “Flaschen” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / updown | 335 | 569 | 20 | 20 | icon updown 20px, stroke-width 2.16 (viewBox units), color label-2 |
| &nbsp;&nbsp;&nbsp;Text Input | 20 | 626 | 353 | 76 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 24 | 626 | 100 | 18 | “Preis pro Einheit” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Field | 20 | 650 | 353 | 52 | fill surface · stroke 1px inner separator · r 14 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Prefix | 36 | 665 | 35 | 23 | “CHF” · type body · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 78 | 665 | 35 | 23 | “8.50” · type body · color label |
| &nbsp;&nbsp;&nbsp;Total Preview | 20 | 714 | 353 | 22 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 24 | 714 | 75 | 18 | “Gesamtwert” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Total | 153 | 714 | 216 | 18 | “2 × CHF 8.50 = CHF 17.00” · type footnote-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;Button / primary | 20 | 758 | 353 | 52 | fill label · r 26 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 20 | 758 | 353 | 52 | “Artikel hinzufügen” · type headline · color bg · align center |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Dark⟩ |

**Implementation checklist**

- [ ] Same geometry as the light screen; colours per the mapping above
- [ ] Compare against `reference/dark/06-neuer-artikel-dark.png`

#### 08 Chat – Dark — `dark/08-chat-dark`

Board 393×852, background bg. Reference: `reference/dark/08-chat-dark.png` · Tree: `extracted/screens/dark/08-chat-dark.json`

| Element | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| Messages | 0 | 0 | 393 | 852 |  |
| &nbsp;&nbsp;&nbsp;Timestamp | 0 | 150 | 393 | 16 | “Heute, 08:12” · type caption · color label-3 · align center |
| &nbsp;&nbsp;&nbsp;Chat Bubble / Incoming | 16 | 178 | 309 | 42 | fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Message | 31 | 188 | 279 | 22 | “Hey, haben wir noch Kaffee zuhause?” · 16/1.33 w400 ls-0.2 · color label |
| &nbsp;&nbsp;&nbsp;Chat Bubble / Outgoing | 55 | 231 | 322 | 42 | fill accent · r 20/20/6/20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Message | 70 | 241 | 292 | 22 | “Ja, wir haben noch zwei Packungen ☕” · 16/1.33 w400 ls-0.2 · color bg |
| &nbsp;&nbsp;&nbsp;Chat Bubble / Incoming | 16 | 284 | 250 | 63 | fill surface-muted · r 20/20/20/6 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Message | 31 | 294 | 220 | 43 | “Perfekt! Dann brauchen wir nur noch Milch.” · 16/1.33 w400 ls-0.2 · color label |
| &nbsp;&nbsp;&nbsp;Chat Bubble / Outgoing | 99 | 358 | 278 | 42 | fill accent · r 20/20/6/20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Message | 114 | 368 | 248 | 22 | “Ich setze sie auf die Einkaufsliste.” · 16/1.33 w400 ls-0.2 · color bg |
| &nbsp;&nbsp;&nbsp;Shared Item Card | 133 | 407 | 244 | 60 | fill surface · stroke 1px inner separator · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Icon | 145 | 419 | 36 | 36 | fill accent-soft · r 10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 153 | 427 | 20 | 20 | icon cart 20px, stroke-width 2.28 (viewBox units), color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Item | 191 | 418 | 95 | 20 | “Milch · 2 Liter” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Status | 191 | 439 | 166 | 16 | “Zur Einkaufsliste hinzugefügt” · 12/1.3 w400 ls0 · color label-2 |
| &nbsp;&nbsp;&nbsp;Read Receipt | 16 | 473 | 361 | 16 | “Gelesen” · type caption · color label-3 · align right |
| Top Scroll Edge | 0 | 0 | 393 | 150 | fill gradient bg 0% → bg@0.9 60% → bg@0 100% |
| Status Bar | 0 | 0 | 393 | 54 | ⟨Status Bar · Dark⟩ |
| Back Button | 16 | 58 | 44 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;icon / chevL | 27 | 69 | 22 | 22 | icon chevL 22px, stroke-width 2.18 (viewBox units), color label |
| Contact Avatar | 172.5 | 50 | 48 | 48 | fill fill-raised(#2A2A2E) · r 24 |
| &nbsp;&nbsp;&nbsp;Initial | 172.5 | 50 | 48 | 48 | “L” · 19/1.25 w600 ls-0.2 · color avatar-fg · align center |
| Contact Name | 161.5 | 102 | 70 | 26 | Liquid Glass (dark) · r 13 |
| &nbsp;&nbsp;&nbsp;Name | 173.5 | 106 | 25 | 18 | “Lisa” · type footnote-medium · color label |
| &nbsp;&nbsp;&nbsp;icon / chevR | 207.9 | 108.5 | 13 | 13 | icon chevR 13px, stroke-width 4.06 (viewBox units), color label-2 |
| Scroll Edge Effect | 0 | 700 | 393 | 152 | fill gradient bg@0 0% → bg@0.9 45% → bg 100% |
| Message Composer | 0 | 762 | 393 | 52 |  |
| &nbsp;&nbsp;&nbsp;Attachment Button | 16 | 766 | 44 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 27 | 777 | 22 | 22 | icon plus 22px, stroke-width 2.18 (viewBox units), color label |
| &nbsp;&nbsp;&nbsp;Message Field | 68 | 766 | 309 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Placeholder | 84 | 777 | 76 | 23 | “Nachricht” · type body · color label-3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / mic | 341 | 776 | 24 | 24 | icon mic 24px, stroke-width 1.8 (viewBox units), color label-2 |
| Home Indicator | 0 | 818 | 393 | 34 | ⟨Home Indicator · Dark⟩ |

**Implementation checklist**

- [ ] Same geometry as the light screen; colours per the mapping above
- [ ] Compare against `reference/dark/08-chat-dark.png`

---

## 8. Notes, system UI & design limitations

1. **Status Bar (54 pt) and Home Indicator (34 pt)** in every screen are iOS system UI. The web app must **not** draw them; they define the safe areas (`--safe-top`, `--safe-bottom`; visual tests set 54 px / 34 px and should mask both bands when diffing against `reference/`).
2. **Sheet screens** (06, 07, 13, 15) use a **dark** status bar on a black backdrop – on iOS set `theme-color`/status-bar style accordingly while a sheet is open, or simply let the black backdrop show behind the safe area.
3. **Scroll Edge Effect / Top Scroll Edge** are gradient rectangles that imitate iOS 26 scroll-edge fading behind floating chrome: bottom 110 px (chat 152 px) at the screen bottom, top 150 px in the chat. Implement as `pointer-events: none` fixed overlays (bg-colour gradients per §4.5) above the scroll content and below the glass chrome.
4. **Keyboard in 08c** is the system keyboard. Only the composer position (directly above the keyboard, 4 px gap) is design-relevant.
5. **No backdrop blur in Penpot.** Glass is simulated (72 % fill + highlight + edge + shadows). The web adds `backdrop-filter: blur() saturate()` (tokens.css `--glass-blur` 22 px, `--glass-saturate` 180 % – implementation choice). Provide the `prefers-reduced-transparency` fallback.
6. **Inter is a stand-in for SF Pro** (cover note: “Schrift: Inter als Ersatz für SF Pro (in Penpot nicht verfügbar)”). Reference PNGs are rendered with Inter; use Inter in visual tests for comparability.
7. **Icon strokes** – see §3.1 (Penpot renders the viewBox-unit stroke values as absolute pixels; small icons look heavier in the references).
8. **Shopping rows** are 56 px components stacked at a 52 px pitch → implement 52 px rows with content 2 px below centre (checkbox top 15, name top 16, quantity top 18).
9. **Long content**: inventory names/prices have overlapping text boxes in the design (name 165 px wide, price box starts at x 240) – truncate the name with an ellipsis before the price column.
10. **Product photos** are 400 × 400 squares, always `object-fit: cover` (52 r12, 108 r20, 168 r38, 353×200 r22).
11. **Hidden layers**: 14 hides the toolbar while the toast is shown; 08b hides the timestamp; 08c hides the first three bubbles (scrolled away). They are kept in the JSON with `"visible": false`.
12. **Context menu material** is near-opaque white (97 % / 100 %), not the 72 % glass – menus must stay legible.
13. **Numbers & text**: CHF formatting uses a Swiss apostrophe for thousands (“CHF 2'485.50”), two decimals, “CHF 8.50 / Fl.” unit prices, guillemets «…» in quotes, “·” (middle dot) as separator in subtitles.
14. **Dims** differ per overlay (22 / 30 / 35 %) – see D3.
15. **Presentation drop shadow** (0/24/60, 18 %) on every screen board is not UI.

---

## 9. Extraction notes / open issues

* **Reference export method.** The Penpot exporter in this instance is unstable (headless Chromium “Target crashed” on most 2×/3× screen exports), so screen references are **1×**. The exporter renders the *persisted* file state, and temporary shadow removals made through the plugin were not visible to it, so 29 of the 30 screens were exported **with** the presentation shadow and cropped to the opaque 393 × 852 board rectangle (offset 260/236) – pixel-identical for these opaque, unrounded, clipping boards. `01-home` was exported with the shadow removed (see `method` per slug in `reference/manifest.json`).
* **Penpot file state (action needed by the orchestrator/user).** During export, the board shadow of **“01 Home”** was temporarily removed; that change reached the Penpot backend, but the subsequent restore (and all later temporary toggles) was **not persisted** by the open Penpot editor (its save queue appears stalled – later exports still show the backend state). In the open editor every board, including 01 Home, has its original shadow (`drop-shadow 0/24/60/0 #000000 18 %`, id `…c7970a133a99`). If the editor tab is reloaded before it manages to save, **re-add that drop shadow to “01 Home”** (page `02 · Screens & Prototype`). No other property of the design was modified.
* Component reference PNGs (2×) include the shadow bleed of components that have their own UI shadow (glass, dialog, menu, bottom sheet); see `includesOwnShadowBounds` in `reference/components/manifest.json`.
* The library typographies/colours are not linked to the shapes (no `fillColorRefId`); token/typography names in the JSON (`text.typography`) were assigned by exact value match.

---

## 10. Appendix – component layer tables (all 71 variants)

Coordinates relative to the component; colour roles per §1.1, assigned by value (dark variants use the dark roles; `fill label` = a #111111 fill).

<details><summary><b>Avatar</b> — Person=Du (44×44) · <code>extracted/components/avatar--du.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Avatar | 0 | 0 | 44 | 44 | fill accent-soft · r 22 |
| &nbsp;&nbsp;&nbsp;Initial | 0 | 0 | 44 | 44 | “J” · 18/1.25 w600 ls-0.2 · color accent · align center · v-align center |

</details>

<details><summary><b>Avatar</b> — Person=Haushalt (44×44) · <code>extracted/components/avatar--haushalt.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Avatar | 0 | 0 | 44 | 44 | fill label · r 22 |
| &nbsp;&nbsp;&nbsp;icon / house | 11 | 10.56 | 22 | 22 | icon house 22px, stroke-width 2.07, color bg |

</details>

<details><summary><b>Avatar</b> — Person=Lisa (44×44) · <code>extracted/components/avatar--lisa.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Avatar | 0 | 0 | 44 | 44 | fill avatar-sand-bg · r 22 |
| &nbsp;&nbsp;&nbsp;Initial | 0 | 0 | 44 | 44 | “L” · 18/1.25 w600 ls-0.2 · color avatar-sand-fg · align center · v-align center |

</details>

<details><summary><b>Avatar</b> — Person=Max (44×44) · <code>extracted/components/avatar--max.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Avatar | 0 | 0 | 44 | 44 | fill avatar-mist-bg · r 22 |
| &nbsp;&nbsp;&nbsp;Initial | 0 | 0 | 44 | 44 | “M” · 18/1.25 w600 ls-0.2 · color avatar-mist-fg · align center · v-align center |

</details>

<details><summary><b>Back Button</b> — Mode=Dark (44×44) · <code>extracted/components/back-button--dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Back Button | 0 | 0 | 44 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;icon / chevL | 11 | 11 | 22 | 22 | icon chevL 22px, stroke-width 2.18, color label |

</details>

<details><summary><b>Back Button</b> — Mode=Light (44×44) · <code>extracted/components/back-button--light.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Back Button | 0 | 0 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;icon / chevL | 11 | 11 | 22 | 22 | icon chevL 22px, stroke-width 2.18, color label |

</details>

<details><summary><b>Bottom Sheet</b> (393×300) · <code>extracted/components/bottom-sheet.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Bottom Sheet | 0 | 0 | 393 | 300 | fill surface · r 34/34/0/0 · shadow 0/-6/30/0 black@0.1 |
| &nbsp;&nbsp;&nbsp;Grabber | 178.5 | 6 | 36 | 5 | fill label-3@0.6 · r 3 |
| &nbsp;&nbsp;&nbsp;Title | 0 | 24 | 393 | 23 | “Foto hinzufügen” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Option / Foto aufnehmen | 20 | 70 | 353 | 52 | fill surface-muted · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / camera | 36 | 84 | 24 | 24 | icon camera 24px, stroke-width 1.8, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 74 | 85 | 127 | 23 | “Foto aufnehmen” · type body · color label |
| &nbsp;&nbsp;&nbsp;Option / Aus Mediathek wählen | 20 | 128 | 353 | 52 | fill surface-muted · r 16 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / photo | 36 | 142 | 24 | 24 | icon photo 24px, stroke-width 1.8, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 74 | 143 | 177 | 23 | “Aus Mediathek wählen” · type body · color label |
| &nbsp;&nbsp;&nbsp;Cancel | 20 | 200 | 353 | 52 | fill fill-secondary · r 26 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 20 | 200 | 353 | 52 | “Abbrechen” · type headline · color label · align center · v-align center |

</details>

<details><summary><b>Button</b> — Style=Destructive, State=Default (353×52) · <code>extracted/components/button--destructive-default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Button | 0 | 0 | 353 | 52 | fill destructive-soft · r 26 |
| &nbsp;&nbsp;&nbsp;Label | 0 | 0 | 353 | 52 | “Artikel löschen” · type headline · color destructive · align center · v-align center |

</details>

<details><summary><b>Button</b> — Style=Primary, State=Dark (353×52) · <code>extracted/components/button--primary-dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Button | 0 | 0 | 353 | 52 | fill label · r 26 |
| &nbsp;&nbsp;&nbsp;Label | 0 | 0 | 353 | 52 | “Artikel hinzufügen” · type headline · color bg · align center · v-align center |

</details>

<details><summary><b>Button</b> — Style=Primary, State=Default (353×52) · <code>extracted/components/button--primary-default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Button | 0 | 0 | 353 | 52 | fill label · r 26 |
| &nbsp;&nbsp;&nbsp;Label | 0 | 0 | 353 | 52 | “Artikel hinzufügen” · type headline · color bg · align center · v-align center |

</details>

<details><summary><b>Button</b> — Style=Primary, State=Disabled (353×52) · <code>extracted/components/button--primary-disabled.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Button | 0 | 0 | 353 | 52 | fill fill-secondary · r 26 |
| &nbsp;&nbsp;&nbsp;Label | 0 | 0 | 353 | 52 | “Artikel hinzufügen” · type headline · color label-3 · align center · v-align center |

</details>

<details><summary><b>Button</b> — Style=Primary, State=Pressed (353×52) · <code>extracted/components/button--primary-pressed.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Button | 0 | 0 | 353 | 52 | fill label · r 26 · opacity 0.82 |
| &nbsp;&nbsp;&nbsp;Label | 0 | 0 | 353 | 52 | “Artikel hinzufügen” · type headline · color bg · align center · v-align center |

</details>

<details><summary><b>Button</b> — Style=Secondary, State=Default (353×52) · <code>extracted/components/button--secondary-default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Button | 0 | 0 | 353 | 52 | fill fill-secondary · r 26 |
| &nbsp;&nbsp;&nbsp;Label | 0 | 0 | 353 | 52 | “Zur Einkaufsliste hinzufügen” · type headline · color label · align center · v-align center |

</details>

<details><summary><b>Category Chip</b> — State=Default (77×36) · <code>extracted/components/category-chip--default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Category Chip | 0 | 0 | 77 | 36 | fill surface · stroke 1px inner separator · r 18 · flex row, gap 8, padding 8/16/8/16, align center, justify center, sizing auto/auto |
| &nbsp;&nbsp;&nbsp;Label | 16 | 8 | 45 | 20 | “Küche” · type subhead-medium · color label |

</details>

<details><summary><b>Category Chip</b> — State=Selected (78×36) · <code>extracted/components/category-chip--selected.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Category Chip | 0 | 0 | 78 | 36 | fill label · r 18 · flex row, gap 8, padding 8/16/8/16, align center, justify center, sizing auto/auto |
| &nbsp;&nbsp;&nbsp;Label | 16 | 8 | 46 | 20 | “Küche” · 15/1.33 w600 ls-0.15 · color bg |

</details>

<details><summary><b>Category Selector</b> — State=Default (353×52) · <code>extracted/components/category-selector--default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Category Selector | 0 | 0 | 353 | 52 | fill surface · stroke 1px inner separator · r 14 |
| &nbsp;&nbsp;&nbsp;Label | 16 | 15 | 75 | 23 | “Kategorie” · type body · color label |
| &nbsp;&nbsp;&nbsp;Value | 160 | 15 | 145 | 23 | “Küche” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;icon / updown | 315 | 16 | 20 | 20 | icon updown 20px, stroke-width 2.16, color label-2 |

</details>

<details><summary><b>Category Selector</b> — State=Open (353×52) · <code>extracted/components/category-selector--open.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Category Selector | 0 | 0 | 353 | 52 | fill surface · stroke 1.5px inner accent · r 14 |
| &nbsp;&nbsp;&nbsp;Label | 16 | 15 | 75 | 23 | “Kategorie” · type body · color label |
| &nbsp;&nbsp;&nbsp;Value | 160 | 15 | 145 | 23 | “Küche” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;icon / updown | 315 | 16 | 20 | 20 | icon updown 20px, stroke-width 2.16, color label-2 |

</details>

<details><summary><b>Chat Bubble</b> — Direction=Incoming (309×42) · <code>extracted/components/chat-bubble--incoming.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Chat Bubble | 0 | 0 | 309 | 42 | fill surface-muted · r 20/20/20/6 · flex row, gap 8, padding 10/15/10/15, align center, justify center, sizing auto/auto |
| &nbsp;&nbsp;&nbsp;Message | 15 | 10 | 279 | 22 | “Hey, haben wir noch Kaffee zuhause?” · 16/1.33 w400 ls-0.2 · color label |

</details>

<details><summary><b>Chat Bubble</b> — Direction=Outgoing (322×42) · <code>extracted/components/chat-bubble--outgoing.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Chat Bubble | 0 | 0 | 322 | 42 | fill accent · r 20/20/6/20 · flex row, gap 8, padding 10/15/10/15, align center, justify center, sizing auto/auto |
| &nbsp;&nbsp;&nbsp;Message | 15 | 10 | 292 | 22 | “Ja, wir haben noch zwei Packungen ☕” · 16/1.33 w400 ls-0.2 · color surface |

</details>

<details><summary><b>Checkbox</b> — State=Completed (26×26) · <code>extracted/components/checkbox--completed.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Checkbox | 0 | 0 | 26 | 26 | fill accent · r 13 |
| &nbsp;&nbsp;&nbsp;icon / check | 4 | 4 | 18 | 18 | icon check 18px, stroke-width 3.2, color surface |

</details>

<details><summary><b>Checkbox</b> — State=Default (26×26) · <code>extracted/components/checkbox--default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Checkbox | 0 | 0 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |

</details>

<details><summary><b>Confirmation Dialog</b> (300×196) · <code>extracted/components/confirmation-dialog.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Confirmation Dialog | 0 | 0 | 300 | 196 | fill surface · r 34 · shadow 0/20/60/0 black@0.22 |
| &nbsp;&nbsp;&nbsp;Title | 0 | 26 | 300 | 23 | “Artikel löschen?” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Message | 28 | 54 | 244 | 36 | “«Olivenöl» wird aus dem Inventar von Unser Zuhause entfernt.” · type footnote · color label-2 · align center |
| &nbsp;&nbsp;&nbsp;Cancel | 18 | 124 | 128 | 50 | fill fill-secondary · r 25 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 18 | 124 | 128 | 50 | “Abbrechen” · type headline · color label · align center · v-align center |
| &nbsp;&nbsp;&nbsp;Delete | 154 | 124 | 128 | 50 | fill destructive-soft · r 25 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 154 | 124 | 128 | 50 | “Löschen” · type headline · color destructive · align center · v-align center |

</details>

<details><summary><b>Context Menu</b> (250×201) · <code>extracted/components/context-menu.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Context Menu | 0 | 0 | 250 | 201 | fill surface@0.97 · stroke 1px inner surface@0.9 · r 24 · shadow 0/8/28/0 black@0.1, 0/1/3/0 black@0.06 |
| &nbsp;&nbsp;&nbsp;Menu Item / Bearbeiten | 0 | 0 | 250 | 48 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 18 | 14 | 85 | 23 | “Bearbeiten” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / pencil | 214 | 13 | 21 | 21 | icon pencil 21px, stroke-width 2.06, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 18 | 47.5 | 232 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Menu Item / Zur Einkaufsliste | 0 | 48 | 250 | 48 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 18 | 62 | 128 | 23 | “Zur Einkaufsliste” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 214 | 61 | 21 | 21 | icon cart 21px, stroke-width 2.06, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Separator | 18 | 95.5 | 232 | 0.5 | fill separator |
| &nbsp;&nbsp;&nbsp;Menu Item / Teilen | 0 | 96 | 250 | 48 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 18 | 110 | 46 | 23 | “Teilen” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / arrowUp | 214 | 109 | 21 | 21 | icon arrowUp 21px, stroke-width 2.06, color label |
| &nbsp;&nbsp;&nbsp;Group Separator | 0 | 144 | 250 | 9 | fill black@0.04 |
| &nbsp;&nbsp;&nbsp;Menu Item / Löschen | 0 | 153 | 250 | 48 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 18 | 167 | 67 | 23 | “Löschen” · type body · color destructive |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / trash | 214 | 166 | 21 | 21 | icon trash 21px, stroke-width 2.06, color destructive |

</details>

<details><summary><b>Dashboard Statistic</b> (150×52) · <code>extracted/components/dashboard-statistic.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Dashboard Statistic | 0 | 0 | 150 | 52 |  |
| &nbsp;&nbsp;&nbsp;Value | 0 | 0 | 150 | 25 | “128” · type title3 · color label |
| &nbsp;&nbsp;&nbsp;Label | 0 | 30 | 150 | 18 | “Artikel im Haushalt” · type footnote · color label-2 |

</details>

<details><summary><b>Floating Add Button</b> — State=Default (56×56) · <code>extracted/components/floating-add-button--default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Floating Add Button | 0 | 0 | 56 | 56 | Liquid Glass (light) · r 28 |
| &nbsp;&nbsp;&nbsp;icon / plus | 15 | 15 | 26 | 26 | icon plus 26px, stroke-width 1.85, color label |

</details>

<details><summary><b>Floating Add Button</b> — State=Pressed (56×56) · <code>extracted/components/floating-add-button--pressed.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Floating Add Button | 0 | 0 | 56 | 56 | fill black@0.08 · stroke 1px inner surface@0.9 · r 28 · shadow 0/8/28/0 black@0.1, 0/1/3/0 black@0.06 |
| &nbsp;&nbsp;&nbsp;icon / plus | 15 | 15 | 26 | 26 | icon plus 26px, stroke-width 1.85, color label |

</details>

<details><summary><b>Home Indicator</b> — Mode=Dark (393×34) · <code>extracted/components/home-indicator--dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Home Indicator | 0 | 0 | 393 | 34 |  |
| &nbsp;&nbsp;&nbsp;Indicator | 129.5 | 21 | 134 | 5 | fill label · r 3 |

</details>

<details><summary><b>Home Indicator</b> — Mode=Light (393×34) · <code>extracted/components/home-indicator--light.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Home Indicator | 0 | 0 | 393 | 34 |  |
| &nbsp;&nbsp;&nbsp;Indicator | 129.5 | 21 | 134 | 5 | fill label · r 3 |

</details>

<details><summary><b>Household Member Row</b> (353×60) · <code>extracted/components/household-member-row.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Household Member Row | 0 | 0 | 353 | 60 | fill surface |
| &nbsp;&nbsp;&nbsp;Avatar | 16 | 12 | 36 | 36 | fill avatar-sand-bg · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 16 | 12 | 36 | 36 | “L” · 14/1.25 w600 ls-0.2 · color avatar-sand-fg · align center · v-align center |
| &nbsp;&nbsp;&nbsp;Name | 64 | 10 | 200 | 23 | “Lisa” · type body · color label |
| &nbsp;&nbsp;&nbsp;Role | 64 | 33 | 200 | 18 | “Mitglied” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;icon / chevR | 321 | 21 | 18 | 18 | icon chevR 18px, stroke-width 2.67, color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 64 | 59.5 | 289 | 0.5 | fill separator |

</details>

<details><summary><b>Icon Button</b> — Icon=Compose, State=Default (44×44) · <code>extracted/components/icon-button--compose-default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Icon Button | 0 | 0 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;icon / compose | 11 | 11 | 22 | 22 | icon compose 22px, stroke-width 2.18, color label |

</details>

<details><summary><b>Icon Button</b> — Icon=Compose, State=Pressed (44×44) · <code>extracted/components/icon-button--compose-pressed.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Icon Button | 0 | 0 | 44 | 44 | fill black@0.1 · stroke 1px inner surface@0.9 · r 22 · shadow 0/8/28/0 black@0.1, 0/1/3/0 black@0.06 |
| &nbsp;&nbsp;&nbsp;icon / compose | 11 | 11 | 22 | 22 | icon compose 22px, stroke-width 2.18, color label |

</details>

<details><summary><b>Icon Button</b> — Icon=More, State=Default (44×44) · <code>extracted/components/icon-button--more-default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Icon Button | 0 | 0 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;icon / ellipsis | 11 | 11 | 22 | 22 | icon ellipsis 22px, stroke-width – (filled), color label |

</details>

<details><summary><b>Image Upload Area</b> — State=Empty (353×200) · <code>extracted/components/image-upload-area--empty.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Image Upload Area | 0 | 0 | 353 | 200 | fill surface · stroke 1.5px inner label-3@0.7 dashed · r 22 |
| &nbsp;&nbsp;&nbsp;Icon Circle | 152.5 | 48 | 48 | 48 | fill accent-soft · r 24 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / camera | 164.5 | 60 | 24 | 24 | icon camera 24px, stroke-width 1.9, color accent |
| &nbsp;&nbsp;&nbsp;Title | 0 | 108 | 353 | 23 | “Foto hinzufügen” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Hint | 0 | 132 | 353 | 18 | “Aufnehmen oder aus der Mediathek wählen” · type footnote · color label-2 · align center |

</details>

<details><summary><b>Image Upload Area</b> — State=Selected (353×200) · <code>extracted/components/image-upload-area--selected.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Image Upload Area | 0 | 0 | 353 | 200 | fill image oil · r 22 |
| &nbsp;&nbsp;&nbsp;Change Photo | 229 | 152 | 112 | 36 | Liquid Glass (light) · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / camera | 243 | 161 | 18 | 18 | icon camera 18px, stroke-width 2.53, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 269 | 160 | 52 | 20 | “Ändern” · type subhead-medium · color label |

</details>

<details><summary><b>Inventory Row</b> — State=Default (353×76) · <code>extracted/components/inventory-row--default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Inventory Row | 0 | 0 | 353 | 76 | fill surface |
| &nbsp;&nbsp;&nbsp;Product Image | 14 | 12 | 52 | 52 | fill image caps · r 12 |
| &nbsp;&nbsp;&nbsp;Name | 80 | 16 | 165 | 23 | “Nespresso Kapseln” · type headline · color label |
| &nbsp;&nbsp;&nbsp;Subtitle | 80 | 41 | 150 | 18 | “Küche · 24 Stück” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;Price | 240 | 17 | 75 | 20 | “CHF 12.96” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;Unit Price | 205 | 41 | 110 | 18 | “CHF 0.54 / Stk.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;icon / chevR | 321 | 29 | 18 | 18 | icon chevR 18px, stroke-width 2.67, color label-3 |

</details>

<details><summary><b>Inventory Row</b> — State=Pressed (353×76) · <code>extracted/components/inventory-row--pressed.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Inventory Row | 0 | 0 | 353 | 76 | fill surface-muted |
| &nbsp;&nbsp;&nbsp;Product Image | 14 | 12 | 52 | 52 | fill image caps · r 12 |
| &nbsp;&nbsp;&nbsp;Name | 80 | 16 | 165 | 23 | “Nespresso Kapseln” · type headline · color label |
| &nbsp;&nbsp;&nbsp;Subtitle | 80 | 41 | 150 | 18 | “Küche · 24 Stück” · type footnote · color label-2 |
| &nbsp;&nbsp;&nbsp;Price | 240 | 17 | 75 | 20 | “CHF 12.96” · type subhead-medium · color label · align right |
| &nbsp;&nbsp;&nbsp;Unit Price | 205 | 41 | 110 | 18 | “CHF 0.54 / Stk.” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;icon / chevR | 321 | 29 | 18 | 18 | icon chevR 18px, stroke-width 2.67, color label-3 |

</details>

<details><summary><b>Message Preview Row</b> — State=Read (353×84) · <code>extracted/components/message-preview-row--read.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Message Preview Row | 0 | 0 | 353 | 84 | fill bg |
| &nbsp;&nbsp;&nbsp;Avatar | 0 | 14 | 54 | 54 | fill avatar-sand-bg · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 0 | 14 | 54 | 54 | “L” · 22/1.25 w600 ls-0.2 · color avatar-sand-fg · align center · v-align center |
| &nbsp;&nbsp;&nbsp;Name | 68 | 14 | 190 | 23 | “Lisa” · type headline · color label |
| &nbsp;&nbsp;&nbsp;Time | 253 | 16 | 100 | 18 | “13:48” · type footnote · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;Last Message | 68 | 37 | 250 | 20 | “Kannst du noch Milch mitbringen?” · type subhead · color label-2 |
| &nbsp;&nbsp;&nbsp;Separator | 68 | 83.5 | 285 | 0.5 | fill separator |

</details>

<details><summary><b>Message Preview Row</b> — State=Unread (353×84) · <code>extracted/components/message-preview-row--unread.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Message Preview Row | 0 | 0 | 353 | 84 | fill bg |
| &nbsp;&nbsp;&nbsp;Avatar | 0 | 14 | 54 | 54 | fill label · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 13.5 | 26.96 | 27 | 27 | icon house 27px, stroke-width 1.69, color bg |
| &nbsp;&nbsp;&nbsp;Name | 68 | 14 | 190 | 23 | “Unser Zuhause” · type headline · color label |
| &nbsp;&nbsp;&nbsp;Time | 253 | 16 | 100 | 18 | “14:32” · 13/1.35 w600 ls-0.05 · color accent · align right |
| &nbsp;&nbsp;&nbsp;Last Message | 68 | 37 | 250 | 40 | “Lisa: Ich habe die Einkaufsliste aktualisiert.” · type subhead · color label |
| &nbsp;&nbsp;&nbsp;Unread Badge | 331 | 44 | 22 | 22 | fill accent · r 11 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Count | 331 | 44 | 22 | 22 | “2” · 12/1.3 w700 ls0 · color surface · align center · v-align center |
| &nbsp;&nbsp;&nbsp;Separator | 68 | 83.5 | 285 | 0.5 | fill separator |

</details>

<details><summary><b>Navigation Header</b> (393×60) · <code>extracted/components/navigation-header.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Navigation Header | 0 | 0 | 393 | 60 |  |
| &nbsp;&nbsp;&nbsp;Back Button | 16 | 8 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / chevL | 27 | 19 | 22 | 22 | icon chevL 22px, stroke-width 2.18, color label |
| &nbsp;&nbsp;&nbsp;Title | 70 | 10 | 253 | 23 | “Lisa” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Subtitle | 70 | 32 | 253 | 16 | “Unser Zuhause” · type caption · color label-2 · align center |

</details>

<details><summary><b>Price Input</b> — State=Empty (353×76) · <code>extracted/components/price-input--empty.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Price Input | 0 | 0 | 353 | 76 |  |
| &nbsp;&nbsp;&nbsp;Label | 4 | 0 | 100 | 18 | “Preis pro Einheit” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Field | 0 | 24 | 353 | 52 | fill surface · stroke 1px inner separator · r 14 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Prefix | 16 | 39 | 35 | 23 | “CHF” · type body · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Placeholder | 58 | 39 | 35 | 23 | “0.00” · type body · color label-3 |

</details>

<details><summary><b>Price Input</b> — State=Filled (353×76) · <code>extracted/components/price-input--filled.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Price Input | 0 | 0 | 353 | 76 |  |
| &nbsp;&nbsp;&nbsp;Label | 4 | 0 | 100 | 18 | “Preis pro Einheit” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Field | 0 | 24 | 353 | 52 | fill surface · stroke 1px inner separator · r 14 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Prefix | 16 | 39 | 35 | 23 | “CHF” · type body · color label-2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 58 | 39 | 35 | 23 | “8.50” · type body · color label |

</details>

<details><summary><b>Product Image</b> — Size=L 168 (168×168) · <code>extracted/components/product-image--l-168.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Product Image | 0 | 0 | 168 | 168 |  |
| &nbsp;&nbsp;&nbsp;Image | 0 | 0 | 168 | 168 | fill image oil · r 38 |

</details>

<details><summary><b>Product Image</b> — Size=M 108 (108×108) · <code>extracted/components/product-image--m-108.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Product Image | 0 | 0 | 108 | 108 |  |
| &nbsp;&nbsp;&nbsp;Image | 0 | 0 | 108 | 108 | fill image oil · r 20 |

</details>

<details><summary><b>Product Image</b> — Size=S 52 (52×52) · <code>extracted/components/product-image--s-52.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Product Image | 0 | 0 | 52 | 52 |  |
| &nbsp;&nbsp;&nbsp;Image | 0 | 0 | 52 | 52 | fill image oil · r 12 |

</details>

<details><summary><b>Profile Button</b> — Mode=Dark (44×44) · <code>extracted/components/profile-button--dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Profile Button | 0 | 0 | 44 | 44 | Liquid Glass (dark) · r 22 |
| &nbsp;&nbsp;&nbsp;Avatar | 4 | 4 | 36 | 36 | fill fill-raised(#2A2A2E) · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 4 | 4 | 36 | 36 | “J” · 14/1.25 w600 ls-0.2 · color avatar-fg · align center · v-align center |

</details>

<details><summary><b>Profile Button</b> — Mode=Light (44×44) · <code>extracted/components/profile-button--light.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Profile Button | 0 | 0 | 44 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;Avatar | 4 | 4 | 36 | 36 | fill accent-soft · r 18 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Initial | 4 | 4 | 36 | 36 | “J” · 14/1.25 w600 ls-0.2 · color accent · align center · v-align center |

</details>

<details><summary><b>Quantity Stepper</b> — Size=Compact, State=Default (124×40) · <code>extracted/components/quantity-stepper--compact-default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Quantity Stepper | 0 | 0 | 124 | 40 | fill fill-secondary · r 20 |
| &nbsp;&nbsp;&nbsp;Minus | 0 | 0 | 40 | 40 | r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / minus | 11 | 11 | 18 | 18 | icon minus 18px, stroke-width 2.67, color label |
| &nbsp;&nbsp;&nbsp;Value | 40 | 0 | 44 | 40 | “2” · type headline · color label · align center · v-align center |
| &nbsp;&nbsp;&nbsp;Plus | 84 | 0 | 40 | 40 | r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 95 | 11 | 18 | 18 | icon plus 18px, stroke-width 2.67, color label |

</details>

<details><summary><b>Quantity Stepper</b> — Size=Compact, State=Minimum (124×40) · <code>extracted/components/quantity-stepper--compact-minimum.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Quantity Stepper | 0 | 0 | 124 | 40 | fill fill-secondary · r 20 |
| &nbsp;&nbsp;&nbsp;Minus | 0 | 0 | 40 | 40 | r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / minus | 11 | 11 | 18 | 18 | icon minus 18px, stroke-width 2.67, color label-3 |
| &nbsp;&nbsp;&nbsp;Value | 40 | 0 | 44 | 40 | “1” · type headline · color label · align center · v-align center |
| &nbsp;&nbsp;&nbsp;Plus | 84 | 0 | 40 | 40 | r 20 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 95 | 11 | 18 | 18 | icon plus 18px, stroke-width 2.67, color label |

</details>

<details><summary><b>Quantity Stepper</b> — Size=Large, State=Default (196×56) · <code>extracted/components/quantity-stepper--large-default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Quantity Stepper | 0 | 0 | 196 | 56 | fill fill-secondary · r 28 |
| &nbsp;&nbsp;&nbsp;Minus | 0 | 0 | 56 | 56 | r 28 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / minus | 16 | 16 | 24 | 24 | icon minus 24px, stroke-width 2, color label |
| &nbsp;&nbsp;&nbsp;Value | 56 | 0 | 84 | 56 | “24” · type title2 · color label · align center · v-align center |
| &nbsp;&nbsp;&nbsp;Plus | 140 | 0 | 56 | 56 | fill label · r 28 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 156 | 16 | 24 | 24 | icon plus 24px, stroke-width 2, color bg |

</details>

<details><summary><b>Search Field</b> — State=Default (353×44) · <code>extracted/components/search-field--default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Search Field | 0 | 0 | 353 | 44 | fill fill-secondary · r 22 |
| &nbsp;&nbsp;&nbsp;icon / search | 14 | 12 | 20 | 20 | icon search 20px, stroke-width 2.28, color label-2 |
| &nbsp;&nbsp;&nbsp;Placeholder | 42 | 12 | 111 | 23 | “Artikel suchen” · type body · color label-2 |

</details>

<details><summary><b>Search Field</b> — State=Focused (353×44) · <code>extracted/components/search-field--focused.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Search Field | 0 | 0 | 353 | 44 | fill fill-secondary · r 22 |
| &nbsp;&nbsp;&nbsp;icon / search | 14 | 12 | 20 | 20 | icon search 20px, stroke-width 2.28, color label-2 |
| &nbsp;&nbsp;&nbsp;Value | 42 | 12 | 30 | 23 | “Oliv” · type body · color label |
| &nbsp;&nbsp;&nbsp;Caret | 80 | 11 | 2 | 22 | fill accent · r 1 |
| &nbsp;&nbsp;&nbsp;Clear | 319 | 12 | 20 | 20 | fill label-3 · r 10 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / xmark | 322 | 15 | 14 | 14 | icon xmark 14px, stroke-width 4.11, color surface |

</details>

<details><summary><b>Settings Row</b> (353×52) · <code>extracted/components/settings-row.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Settings Row | 0 | 0 | 353 | 52 | fill surface |
| &nbsp;&nbsp;&nbsp;Icon Tile | 16 | 11 | 30 | 30 | fill surface-muted · r 8 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / appearance | 21 | 16 | 20 | 20 | icon appearance 20px, stroke-width 2.16, color label |
| &nbsp;&nbsp;&nbsp;Title | 60 | 15 | 180 | 23 | “Erscheinungsbild” · type body · color label |
| &nbsp;&nbsp;&nbsp;Value | 180 | 16 | 135 | 23 | “Automatisch” · type body · color label-2 · align right |
| &nbsp;&nbsp;&nbsp;icon / chevR | 321 | 17 | 18 | 18 | icon chevR 18px, stroke-width 2.67, color label-3 |
| &nbsp;&nbsp;&nbsp;Separator | 60 | 51.5 | 293 | 0.5 | fill separator |

</details>

<details><summary><b>Shopping List Row</b> — State=Completed (353×56) · <code>extracted/components/shopping-list-row--completed.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Shopping List Row | 0 | 0 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;Checkbox | 16 | 15 | 26 | 26 | fill accent · r 13 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / check | 20 | 19 | 18 | 18 | icon check 18px, stroke-width 3.2, color surface |
| &nbsp;&nbsp;&nbsp;Name | 56 | 16 | 170 | 23 | “Milch” · type body · color label-3 |
| &nbsp;&nbsp;&nbsp;Quantity | 200 | 18 | 137 | 20 | “2 Liter” · type subhead · color label-3 · align right |

</details>

<details><summary><b>Shopping List Row</b> — State=Default (353×56) · <code>extracted/components/shopping-list-row--default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Shopping List Row | 0 | 0 | 353 | 56 | fill surface |
| &nbsp;&nbsp;&nbsp;Checkbox | 16 | 15 | 26 | 26 | stroke 1.6px inner label-3 · r 13 |
| &nbsp;&nbsp;&nbsp;Name | 56 | 16 | 170 | 23 | “Milch” · type body · color label |
| &nbsp;&nbsp;&nbsp;Quantity | 200 | 18 | 137 | 20 | “2 Liter” · type subhead · color label-2 · align right |

</details>

<details><summary><b>Status Bar</b> — Mode=Dark (393×54) · <code>extracted/components/status-bar--dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Status Bar | 0 | 0 | 393 | 54 |  |
| &nbsp;&nbsp;&nbsp;Time | 0 | 17 | 133 | 23 | “9:41” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Dynamic Island | 133.5 | 11 | 126 | 37 | fill black · r 18.5 |
| &nbsp;&nbsp;&nbsp;signal | 293 | 24 | 3 | 4 | fill label · r 1 |
| &nbsp;&nbsp;&nbsp;signal | 297.5 | 21.5 | 3 | 6.5 | fill label · r 1 |
| &nbsp;&nbsp;&nbsp;signal | 302 | 19 | 3 | 9 | fill label · r 1 |
| &nbsp;&nbsp;&nbsp;signal | 306.5 | 16.5 | 3 | 11.5 | fill label · r 1 |
| &nbsp;&nbsp;&nbsp;Battery | 337 | 17.5 | 25 | 12 | stroke 1px inner label@0.4 · r 3.5 |
| &nbsp;&nbsp;&nbsp;Battery Level | 339 | 19.5 | 18 | 8 | fill label · r 2 |
| &nbsp;&nbsp;&nbsp;Battery Cap | 363 | 21.5 | 1.5 | 4 | fill label@0.4 · r 1 |
| &nbsp;&nbsp;&nbsp;icon / wifi | 314 | 16 | 17 | 17 | icon wifi 17px, stroke-width 2.05, color label |

</details>

<details><summary><b>Status Bar</b> — Mode=Light (393×54) · <code>extracted/components/status-bar--light.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Status Bar | 0 | 0 | 393 | 54 |  |
| &nbsp;&nbsp;&nbsp;Time | 0 | 17 | 133 | 23 | “9:41” · type headline · color label · align center |
| &nbsp;&nbsp;&nbsp;Dynamic Island | 133.5 | 11 | 126 | 37 | fill black · r 18.5 |
| &nbsp;&nbsp;&nbsp;signal | 293 | 24 | 3 | 4 | fill label · r 1 |
| &nbsp;&nbsp;&nbsp;signal | 297.5 | 21.5 | 3 | 6.5 | fill label · r 1 |
| &nbsp;&nbsp;&nbsp;signal | 302 | 19 | 3 | 9 | fill label · r 1 |
| &nbsp;&nbsp;&nbsp;signal | 306.5 | 16.5 | 3 | 11.5 | fill label · r 1 |
| &nbsp;&nbsp;&nbsp;Battery | 337 | 17.5 | 25 | 12 | stroke 1px inner label@0.4 · r 3.5 |
| &nbsp;&nbsp;&nbsp;Battery Level | 339 | 19.5 | 18 | 8 | fill label · r 2 |
| &nbsp;&nbsp;&nbsp;Battery Cap | 363 | 21.5 | 1.5 | 4 | fill label@0.4 · r 1 |
| &nbsp;&nbsp;&nbsp;icon / wifi | 314 | 16 | 17 | 17 | icon wifi 17px, stroke-width 2.05, color label |

</details>

<details><summary><b>Tab Bar (Liquid Glass)</b> — Active=Chats, Mode=Dark (361×62) · <code>extracted/components/tab-bar-liquid-glass--chats-dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Tab Bar (Liquid Glass) | 0 | 0 | 361 | 62 | Liquid Glass (dark) · r 31 |
| &nbsp;&nbsp;&nbsp;Tab / Home | 4 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 36.13 | 11 | 24 | 24 | icon house 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 4 | 38 | 88.25 | 12 | “Home” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Inventar | 92.25 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 124.38 | 11 | 24 | 24 | icon stack 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 92.25 | 38 | 88.25 | 12 | “Inventar” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Einkauf | 180.5 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 212.63 | 11 | 24 | 24 | icon cart 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 180.5 | 38 | 88.25 | 12 | “Einkauf” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Chats | 268.75 | 4 | 88.25 | 54 | fill white@0.1 · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / bubbles | 300.88 | 11 | 24 | 24 | icon bubbles 24px, stroke-width 2, color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 268.75 | 38 | 88.25 | 12 | “Chats” · type tab · color accent · align center |

</details>

<details><summary><b>Tab Bar (Liquid Glass)</b> — Active=Chats, Mode=Light (361×62) · <code>extracted/components/tab-bar-liquid-glass--chats-light.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Tab Bar (Liquid Glass) | 0 | 0 | 361 | 62 | Liquid Glass (light) · r 31 |
| &nbsp;&nbsp;&nbsp;Tab / Home | 4 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 36.13 | 11 | 24 | 24 | icon house 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 4 | 38 | 88.25 | 12 | “Home” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Inventar | 92.25 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 124.38 | 11 | 24 | 24 | icon stack 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 92.25 | 38 | 88.25 | 12 | “Inventar” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Einkauf | 180.5 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 212.63 | 11 | 24 | 24 | icon cart 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 180.5 | 38 | 88.25 | 12 | “Einkauf” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Chats | 268.75 | 4 | 88.25 | 54 | fill black@0.06 · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / bubbles | 300.88 | 11 | 24 | 24 | icon bubbles 24px, stroke-width 2, color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 268.75 | 38 | 88.25 | 12 | “Chats” · type tab · color accent · align center |

</details>

<details><summary><b>Tab Bar (Liquid Glass)</b> — Active=Einkauf, Mode=Dark (361×62) · <code>extracted/components/tab-bar-liquid-glass--einkauf-dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Tab Bar (Liquid Glass) | 0 | 0 | 361 | 62 | Liquid Glass (dark) · r 31 |
| &nbsp;&nbsp;&nbsp;Tab / Home | 4 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 36.13 | 11 | 24 | 24 | icon house 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 4 | 38 | 88.25 | 12 | “Home” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Inventar | 92.25 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 124.38 | 11 | 24 | 24 | icon stack 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 92.25 | 38 | 88.25 | 12 | “Inventar” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Einkauf | 180.5 | 4 | 88.25 | 54 | fill white@0.1 · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 212.63 | 11 | 24 | 24 | icon cart 24px, stroke-width 2, color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 180.5 | 38 | 88.25 | 12 | “Einkauf” · type tab · color accent · align center |
| &nbsp;&nbsp;&nbsp;Tab / Chats | 268.75 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / bubbles | 300.88 | 11 | 24 | 24 | icon bubbles 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 268.75 | 38 | 88.25 | 12 | “Chats” · type tab · color label · align center |

</details>

<details><summary><b>Tab Bar (Liquid Glass)</b> — Active=Einkauf, Mode=Light (361×62) · <code>extracted/components/tab-bar-liquid-glass--einkauf-light.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Tab Bar (Liquid Glass) | 0 | 0 | 361 | 62 | Liquid Glass (light) · r 31 |
| &nbsp;&nbsp;&nbsp;Tab / Home | 4 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 36.13 | 11 | 24 | 24 | icon house 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 4 | 38 | 88.25 | 12 | “Home” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Inventar | 92.25 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 124.38 | 11 | 24 | 24 | icon stack 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 92.25 | 38 | 88.25 | 12 | “Inventar” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Einkauf | 180.5 | 4 | 88.25 | 54 | fill black@0.06 · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 212.63 | 11 | 24 | 24 | icon cart 24px, stroke-width 2, color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 180.5 | 38 | 88.25 | 12 | “Einkauf” · type tab · color accent · align center |
| &nbsp;&nbsp;&nbsp;Tab / Chats | 268.75 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / bubbles | 300.88 | 11 | 24 | 24 | icon bubbles 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 268.75 | 38 | 88.25 | 12 | “Chats” · type tab · color label · align center |

</details>

<details><summary><b>Tab Bar (Liquid Glass)</b> — Active=Home, Mode=Dark (361×62) · <code>extracted/components/tab-bar-liquid-glass--home-dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Tab Bar (Liquid Glass) | 0 | 0 | 361 | 62 | Liquid Glass (dark) · r 31 |
| &nbsp;&nbsp;&nbsp;Tab / Home | 4 | 4 | 88.25 | 54 | fill white@0.1 · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 36.13 | 11 | 24 | 24 | icon house 24px, stroke-width 2, color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 4 | 38 | 88.25 | 12 | “Home” · type tab · color accent · align center |
| &nbsp;&nbsp;&nbsp;Tab / Inventar | 92.25 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 124.38 | 11 | 24 | 24 | icon stack 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 92.25 | 38 | 88.25 | 12 | “Inventar” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Einkauf | 180.5 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 212.63 | 11 | 24 | 24 | icon cart 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 180.5 | 38 | 88.25 | 12 | “Einkauf” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Chats | 268.75 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / bubbles | 300.88 | 11 | 24 | 24 | icon bubbles 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 268.75 | 38 | 88.25 | 12 | “Chats” · type tab · color label · align center |

</details>

<details><summary><b>Tab Bar (Liquid Glass)</b> — Active=Home, Mode=Light (361×62) · <code>extracted/components/tab-bar-liquid-glass--home-light.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Tab Bar (Liquid Glass) | 0 | 0 | 361 | 62 | Liquid Glass (light) · r 31 |
| &nbsp;&nbsp;&nbsp;Tab / Home | 4 | 4 | 88.25 | 54 | fill black@0.06 · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 36.13 | 11 | 24 | 24 | icon house 24px, stroke-width 2, color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 4 | 38 | 88.25 | 12 | “Home” · type tab · color accent · align center |
| &nbsp;&nbsp;&nbsp;Tab / Inventar | 92.25 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 124.38 | 11 | 24 | 24 | icon stack 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 92.25 | 38 | 88.25 | 12 | “Inventar” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Einkauf | 180.5 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 212.63 | 11 | 24 | 24 | icon cart 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 180.5 | 38 | 88.25 | 12 | “Einkauf” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Chats | 268.75 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / bubbles | 300.88 | 11 | 24 | 24 | icon bubbles 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 268.75 | 38 | 88.25 | 12 | “Chats” · type tab · color label · align center |

</details>

<details><summary><b>Tab Bar (Liquid Glass)</b> — Active=Inventar, Mode=Dark (361×62) · <code>extracted/components/tab-bar-liquid-glass--inventar-dark.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Tab Bar (Liquid Glass) | 0 | 0 | 361 | 62 | Liquid Glass (dark) · r 31 |
| &nbsp;&nbsp;&nbsp;Tab / Home | 4 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 36.13 | 11 | 24 | 24 | icon house 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 4 | 38 | 88.25 | 12 | “Home” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Inventar | 92.25 | 4 | 88.25 | 54 | fill white@0.1 · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 124.38 | 11 | 24 | 24 | icon stack 24px, stroke-width 2, color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 92.25 | 38 | 88.25 | 12 | “Inventar” · type tab · color accent · align center |
| &nbsp;&nbsp;&nbsp;Tab / Einkauf | 180.5 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 212.63 | 11 | 24 | 24 | icon cart 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 180.5 | 38 | 88.25 | 12 | “Einkauf” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Chats | 268.75 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / bubbles | 300.88 | 11 | 24 | 24 | icon bubbles 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 268.75 | 38 | 88.25 | 12 | “Chats” · type tab · color label · align center |

</details>

<details><summary><b>Tab Bar (Liquid Glass)</b> — Active=Inventar, Mode=Light (361×62) · <code>extracted/components/tab-bar-liquid-glass--inventar-light.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Tab Bar (Liquid Glass) | 0 | 0 | 361 | 62 | Liquid Glass (light) · r 31 |
| &nbsp;&nbsp;&nbsp;Tab / Home | 4 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / house | 36.13 | 11 | 24 | 24 | icon house 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 4 | 38 | 88.25 | 12 | “Home” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Inventar | 92.25 | 4 | 88.25 | 54 | fill black@0.06 · r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / stack | 124.38 | 11 | 24 | 24 | icon stack 24px, stroke-width 2, color accent |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 92.25 | 38 | 88.25 | 12 | “Inventar” · type tab · color accent · align center |
| &nbsp;&nbsp;&nbsp;Tab / Einkauf | 180.5 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / cart | 212.63 | 11 | 24 | 24 | icon cart 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 180.5 | 38 | 88.25 | 12 | “Einkauf” · type tab · color label · align center |
| &nbsp;&nbsp;&nbsp;Tab / Chats | 268.75 | 4 | 88.25 | 54 | r 27 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / bubbles | 300.88 | 11 | 24 | 24 | icon bubbles 24px, stroke-width 1.7, color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Label | 268.75 | 38 | 88.25 | 12 | “Chats” · type tab · color label · align center |

</details>

<details><summary><b>Text Input</b> — State=Default (353×76) · <code>extracted/components/text-input--default.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Text Input | 0 | 0 | 353 | 76 |  |
| &nbsp;&nbsp;&nbsp;Label | 4 | 0 | 74 | 18 | “Artikelname” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Field | 0 | 24 | 353 | 52 | fill surface · stroke 1px inner separator · r 14 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Placeholder | 16 | 39 | 101 | 23 | “z. B. Olivenöl” · type body · color label-3 |

</details>

<details><summary><b>Text Input</b> — State=Error (353×100) · <code>extracted/components/text-input--error.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Text Input | 0 | 0 | 353 | 100 |  |
| &nbsp;&nbsp;&nbsp;Label | 4 | 0 | 74 | 18 | “Artikelname” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Field | 0 | 24 | 353 | 52 | fill surface · stroke 1.5px inner destructive · r 14 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Placeholder | 16 | 39 | 101 | 23 | “z. B. Olivenöl” · type body · color label-3 |
| &nbsp;&nbsp;&nbsp;Error Message | 4 | 82 | 160 | 18 | “Bitte gib einen Namen ein.” · type footnote · color destructive |

</details>

<details><summary><b>Text Input</b> — State=Filled (353×76) · <code>extracted/components/text-input--filled.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Text Input | 0 | 0 | 353 | 76 |  |
| &nbsp;&nbsp;&nbsp;Label | 4 | 0 | 74 | 18 | “Artikelname” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Field | 0 | 24 | 353 | 52 | fill surface · stroke 1px inner separator · r 14 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 16 | 39 | 63 | 23 | “Olivenöl” · type body · color label |

</details>

<details><summary><b>Text Input</b> — State=Focused (353×76) · <code>extracted/components/text-input--focused.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Text Input | 0 | 0 | 353 | 76 |  |
| &nbsp;&nbsp;&nbsp;Label | 4 | 0 | 74 | 18 | “Artikelname” · type footnote-medium · color label-2 |
| &nbsp;&nbsp;&nbsp;Field | 0 | 24 | 353 | 52 | fill surface · stroke 1.5px inner accent · r 14 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Value | 16 | 39 | 30 | 23 | “Oliv” · type body · color label |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Caret | 54 | 38 | 2 | 24 | fill accent · r 1 |

</details>

<details><summary><b>Toast</b> (300×44) · <code>extracted/components/toast.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Toast | 0 | 0 | 300 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;Check | 10 | 10 | 24 | 24 | fill accent · r 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / check | 14 | 14 | 16 | 16 | icon check 16px, stroke-width 3.9, color surface |
| &nbsp;&nbsp;&nbsp;Message | 44 | 12 | 146 | 20 | “Olivenöl hinzugefügt” · type subhead-medium · color label |
| &nbsp;&nbsp;&nbsp;Undo | 200 | 12 | 86 | 20 | “Rückgängig” · type subhead-medium · color accent · align right |

</details>

<details><summary><b>Toolbar (Glass)</b> — Items=1 (52×44) · <code>extracted/components/toolbar-glass--1.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Toolbar (Glass) | 0 | 0 | 52 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;Toolbar Item / ellipsis | 4 | 0 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / ellipsis | 15 | 11 | 22 | 22 | icon ellipsis 22px, stroke-width – (filled), color label |

</details>

<details><summary><b>Toolbar (Glass)</b> — Items=2 (96×44) · <code>extracted/components/toolbar-glass--2.json</code></summary>

| Layer | x | y | w | h | Style |
|---|---:|---:|---:|---:|---|
| (root) Toolbar (Glass) | 0 | 0 | 96 | 44 | Liquid Glass (light) · r 22 |
| &nbsp;&nbsp;&nbsp;Toolbar Item / plus | 4 | 0 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / plus | 15 | 11 | 22 | 22 | icon plus 22px, stroke-width 2.18, color label |
| &nbsp;&nbsp;&nbsp;Toolbar Item / ellipsis | 48 | 0 | 44 | 44 |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;icon / ellipsis | 59 | 11 | 22 | 22 | icon ellipsis 22px, stroke-width – (filled), color label |

</details>

<!-- prettier-ignore-end -->
