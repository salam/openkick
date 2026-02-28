# OpenKick — Corporate Identity & Corporate Design (CI/CD)

> Version 1.0 — February 28, 2026
> A friendly, accessible, mobile-first design system for youth football club management.

---

## 1. Brand Personality

| Trait | Expression |
|---|---|
| **Approachable** | Informal "du", encouraging microcopy, friendly empty states |
| **Trustworthy** | Consistent layout, clear feedback, privacy-first messaging |
| **Sporty** | Jade-green primary, energetic but not aggressive |
| **Simple** | Progressive disclosure, one-click solutions, stepper assistants |
| **Modern** | Flat design, solid shadows, rounded shapes, dark mode |

---

## 2. Color System

### 2.1 Primary — Jade Green

Distinct from Spotify (`#1DB954`) and WhatsApp (`#25D366`) — our jade sits between both, leaning cooler and deeper.

| Token | Hex | Usage |
|---|---|---|
| `primary-50` | `#ECFDF5` | Subtle backgrounds, hover states |
| `primary-100` | `#D1FAE5` | Light fills, badges, tags |
| `primary-200` | `#A7F3D0` | Borders, dividers |
| `primary-300` | `#6EE7B7` | Icons, secondary elements |
| `primary-400` | `#34D399` | Active states, links |
| `primary-500` | `#10B981` | **Primary buttons, key actions, brand color** |
| `primary-600` | `#059669` | Hover on primary |
| `primary-700` | `#047857` | Pressed state, button shadow |
| `primary-800` | `#065F46` | Dark mode primary surface |
| `primary-900` | `#064E3B` | Dark mode hover |

### 2.2 Neutrals — Zinc (warm gray)

| Token | Light Mode | Dark Mode |
|---|---|---|
| `background` | `#FFFFFF` | `#18181B` (zinc-900) |
| `surface` | `#F4F4F5` (zinc-100) | `#27272A` (zinc-800) |
| `surface-elevated` | `#FFFFFF` | `#3F3F46` (zinc-700) |
| `border` | `#E4E4E7` (zinc-200) | `#3F3F46` (zinc-700) |
| `text-primary` | `#18181B` (zinc-900) | `#FAFAFA` (zinc-50) |
| `text-secondary` | `#71717A` (zinc-500) | `#A1A1AA` (zinc-400) |
| `text-muted` | `#A1A1AA` (zinc-400) | `#71717A` (zinc-500) |

### 2.3 Semantic Colors

| Role | Color | Light bg | Usage |
|---|---|---|---|
| Success | `#10B981` (primary) | `#ECFDF5` | Confirmations, attendance confirmed |
| Warning | `#F59E0B` (amber-500) | `#FFFBEB` | Deadlines, weather alerts |
| Error | `#EF4444` (red-500) | `#FEF2F2` | Cancellations, validation errors |
| Info | `#3B82F6` (blue-500) | `#EFF6FF` | Tips, informational banners |

### 2.4 Shadows — Solid / Embossed

Flat, offset shadows instead of blurred gradients for a tactile, material feel:

```css
--shadow-sm:  2px 2px 0 0 rgba(0, 0, 0, 0.08);
--shadow-md:  3px 3px 0 0 rgba(0, 0, 0, 0.10);
--shadow-lg:  5px 5px 0 0 rgba(0, 0, 0, 0.12);
--shadow-btn: 3px 3px 0 0 var(--color-primary-700);  /* colored shadow for primary buttons */
```

Dark mode shadows use `rgba(0, 0, 0, 0.25)` for visibility against dark backgrounds.

**Press state**: Shadow shrinks to `1px 1px 0 0` and element translates `2px` down-right — creates a satisfying "pushed-in" effect.

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Source | Weights |
|---|---|---|---|
| **Headings** | Arsenal | Google Fonts | 400 (regular), 700 (bold) |
| **Body / UI** | Inter | Google Fonts (variable) | 400, 500, 600 |
| **Data / Stats** | DM Sans | Google Fonts | 400, 500 |

Fallback chain: `system-ui, -apple-system, sans-serif`

### 3.2 Type Scale (Mobile → Desktop)

| Token | Mobile | Desktop | Line-height | Font |
|---|---|---|---|---|
| `display` | 28px | 32px | 1.2 | Arsenal 700 |
| `h1` | 24px | 28px | 1.25 | Arsenal 700 |
| `h2` | 20px | 22px | 1.3 | Arsenal 700 |
| `h3` | 16px | 18px | 1.35 | Arsenal 400 |
| `body` | 15px | 15px | 1.5 | Inter 400 |
| `body-medium` | 15px | 15px | 1.5 | Inter 500 |
| `small` | 13px | 13px | 1.4 | Inter 400 |
| `tiny` | 11px | 11px | 1.3 | Inter 500 |

### 3.3 Usage Rules

- Headings are **always** Arsenal — never Inter for headings.
- Body text is **always** Inter — never Arsenal for paragraphs.
- Data tables and numeric displays use DM Sans for its clean, tabular figures.
- Maximum line width: `65ch` for readability.

---

## 4. Tone of Voice — Sympathetic Language

### 4.1 Principles

| Principle | Example |
|---|---|
| Use informal "du" | "Dein Training wurde erstellt" — not "Ihr Training wurde erstellt" |
| Celebrate small wins | "Super, ist notiert!" — not "Erfolgreich gespeichert" |
| Explain, don't blame | "Hmm, das hat nicht geklappt. Versuch es nochmal?" — not "Error 500" |
| Encourage on empty states | "Noch keine Trainings geplant. Erstell dein erstes!" — not just a blank page |
| Be concise | One sentence max for feedback. Details behind a "Mehr erfahren" link. |

### 4.2 Microcopy Examples

| Context | Copy |
|---|---|
| Attendance confirmed | "Alles klar, [Name] ist dabei!" |
| Attendance declined | "Schade! Wir haben es notiert." |
| Event created | "Perfekt, das Training steht!" |
| Event cancelled | "Das Training am [Datum] fällt leider aus." |
| Loading | "Einen Moment..." |
| Empty team list | "Noch kein Kader erstellt. Leg los!" |
| Error (generic) | "Ups, da ist etwas schiefgegangen." |
| Error (network) | "Keine Verbindung. Bist du online?" |

---

## 5. Components

### 5.1 Buttons

| Variant | Background | Text | Border | Shadow | Usage |
|---|---|---|---|---|---|
| **Primary** | primary-500 | white | none | `shadow-btn` | Main CTAs |
| **Secondary** | white / surface | primary-600 | 1px primary-500 | `shadow-sm` | Secondary actions |
| **Ghost** | transparent | primary-600 | none | none | Tertiary, links |
| **Danger** | red-500 | white | none | `shadow-sm` | Destructive actions |

All buttons:
- `border-radius: 12px` (rounded-xl)
- `padding: 12px 24px`
- `font: Inter 500 15px`
- `transition: all 100ms ease`
- Press: shadow shrinks, translate 2px down-right

### 5.2 Cards

```
┌─────────────────────────────┐ ─┬─ border: 1px zinc-200
│                             │  │  bg: white (dark: zinc-800)
│   Card content              │  │  border-radius: 16px (2xl)
│                             │  │  padding: 20px
│                             │  │  shadow: shadow-md
└─────────────────────────────┘ ─┘
   └── solid shadow offset
```

### 5.3 Inputs

- `border-radius: 12px`
- `border: 1px solid zinc-300` (dark: zinc-600)
- `padding: 12px 16px`
- Focus ring: `2px solid primary-400` with `2px offset`
- Label above input, `small` size, `text-secondary` color

### 5.4 Badges / Tags

- `border-radius: 9999px` (full pill)
- `padding: 4px 12px`
- `font: tiny (11px) Inter 500`
- Variants: filled (primary-100 bg + primary-700 text) or outlined

### 5.5 Alerts / Banners

- `border-radius: 12px`
- Left accent border: `4px solid [semantic-color]`
- Background: semantic light color (e.g. `#ECFDF5` for success)
- Icon + text layout
- Optional dismiss button (ghost X)

---

## 6. Layout System

### 6.1 Breakpoints

| Name | Min-width | Max content width | Padding |
|---|---|---|---|
| `mobile` | 0px | 440px | 16px |
| `tablet` | 640px | 640px | 24px |
| `desktop` | 1024px | 960px (content) / 1200px (dashboard) | 32px |

### 6.2 Content Centering

All main content is **horizontally centered** with `margin: 0 auto`. No full-width edge-to-edge layouts except for the header/nav bar.

### 6.3 Spacing Scale

Based on 4px grid:

| Token | Value | Common usage |
|---|---|---|
| `space-1` | 4px | Tight gaps (icon + label) |
| `space-2` | 8px | Between related items |
| `space-3` | 12px | Card internal padding (small) |
| `space-4` | 16px | Default gap, mobile padding |
| `space-5` | 20px | Card padding |
| `space-6` | 24px | Section gaps |
| `space-8` | 32px | Major section separation |
| `space-10` | 40px | Page sections |
| `space-12` | 48px | Page top/bottom padding |

### 6.4 Grid

- **Mobile**: single column, full width
- **Tablet**: 2-column grid where appropriate (e.g. player cards)
- **Desktop**: 3-column grid for cards, sidebar + content for dashboard

---

## 7. Interaction Patterns

### 7.1 Progressive Disclosure (Information Hiding)

| Pattern | Component | Trigger | Example |
|---|---|---|---|
| **Accordion** | Collapsible sections | Tap header | Event details, player info |
| **Bottom sheet** | Slide-up panel | Tap action button | Quick actions, filters |
| **Expandable card** | Card with expand | Tap "Mehr" | Attendance list per event |
| **Tooltip / Popover** | Info bubble | Hover / tap (i) icon | Stats explanations |
| **Tabs** | Content switcher | Tap tab | Coach: Anwesenheit / Kader / Infos |
| **Drawer** | Slide-in panel | Tap menu icon | Mobile sidebar navigation |

### 7.2 Stepper Assistants

For multi-step flows (event creation, tournament setup, onboarding):

```
  ●─────────○─────────○─────────○
Step 1    Step 2    Step 3    Fertig!
"Basics"  "Details" "Bestätigung"
```

Rules:
- Horizontal progress indicator, sticky at top on mobile
- Active step: primary-500 filled circle
- Completed step: primary-500 circle with checkmark
- Future step: zinc-300 outline circle
- Connecting line: zinc-300 (completed segments: primary-500)
- Each step fits in **one viewport** — no scrolling needed per step
- "Zurück" (ghost button) + "Weiter" (primary button) at bottom
- Final step: summary + "Bestätigen" button

### 7.3 Transitions & Motion

- **Duration**: 150ms for micro-interactions, 250ms for panels/sheets
- **Easing**: `ease-out` for enter, `ease-in` for exit
- **Reduced motion**: respect `prefers-reduced-motion` — disable all transitions
- **No bounces, no spring physics** — keep it calm and professional

---

## 8. Dark Mode

### 8.1 Implementation

- Toggle: sun/moon icon in the header
- Default: follows `prefers-color-scheme` system setting
- Override: persisted in `localStorage` as `theme: "light" | "dark" | "system"`
- Tailwind: `dark:` variant classes using `class` strategy (not `media`)
- Transition: `background-color 200ms, color 200ms` on `<body>`

### 8.2 Dark Mode Color Mapping

| Element | Light | Dark |
|---|---|---|
| Page background | `#FFFFFF` | `#18181B` |
| Card / Surface | `#FFFFFF` | `#27272A` |
| Elevated surface | `#F4F4F5` | `#3F3F46` |
| Primary buttons | `#10B981` bg | `#10B981` bg (unchanged) |
| Text | `#18181B` | `#FAFAFA` |
| Secondary text | `#71717A` | `#A1A1AA` |
| Borders | `#E4E4E7` | `#3F3F46` |
| Shadows | `rgba(0,0,0,0.10)` | `rgba(0,0,0,0.25)` |

### 8.3 Rules

- Primary green (`#10B981`) stays the same in both modes — it has sufficient contrast on both.
- Images and illustrations: no inversion. Use opacity or dedicated dark variants if needed.
- Semantic colors keep their hue but backgrounds adapt (e.g. error bg goes from `#FEF2F2` to `rgba(239,68,68,0.1)`).

---

## 9. Navigation

### 9.1 Parent View (Simple)

Bottom navigation bar with 3 items:

```
┌─────────────────────────────────┐
│                                 │
│         [Page Content]          │
│                                 │
├───────────┬───────────┬─────────┤
│  Termine  │ Mein Kind │  Info   │
│    📅     │    👤     │   ℹ️    │
└───────────┴───────────┴─────────┘
```

- No sidebar, no hamburger menu
- Everything reachable in 1–2 taps
- Active tab: primary-500 icon + text, subtle top border

### 9.2 Coach View (Dashboard)

**Desktop**: Sidebar + content area

```
┌──────────┬──────────────────────┐
│ OpenKick │      Page Title      │
├──────────┤                      │
│ Übersicht│   [Content Area]     │
│ Trainings│                      │
│ Kader    │                      │
│ Turniere │                      │
│ Broadcast│                      │
│ Einstell.│                      │
└──────────┴──────────────────────┘
```

**Mobile**: Bottom nav with overflow

```
┌─────────────────────────────────┐
│         [Page Content]          │
├───────┬───────┬───────┬───────┬─┤
│Übersicht│Training│ Kader │ Mehr │
│  🏠  │  ⚽  │  👥  │  ⋯   │
└───────┴───────┴───────┴───────┴─┘
```

"Mehr" opens a bottom sheet with: Turniere, Broadcasts, Einstellungen

---

## 10. Accessibility

| Requirement | Implementation |
|---|---|
| **WCAG 2.1 AA** | Minimum target compliance level |
| **Color contrast** | 4.5:1 for body text, 3:1 for large text (all tokens verified) |
| **Focus indicators** | 2px primary-400 ring with 2px offset — visible in both modes |
| **Touch targets** | Minimum 44×44px for all interactive elements |
| **Screen readers** | Semantic HTML, ARIA labels on icons, live regions for updates |
| **Reduced motion** | `prefers-reduced-motion: reduce` disables all transitions |
| **Keyboard navigation** | Full keyboard support, visible focus states, skip-to-content link |
| **Font scaling** | rem-based sizing, respects browser font size settings |

---

## 11. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui (customized to match this design system) |
| Fonts | Google Fonts: Arsenal, Inter (variable), DM Sans |
| Icons | Lucide React (consistent with shadcn/ui) |
| Dark mode | Tailwind `class` strategy + `next-themes` |
| Animation | CSS transitions only (no JS animation libraries) |

---

## 12. File Structure (Frontend)

```
client/
├── app/                    # Next.js App Router pages
│   ├── (parent)/           # Parent-facing routes
│   ├── (coach)/            # Coach dashboard routes
│   ├── layout.tsx          # Root layout with theme provider
│   └── globals.css         # Tailwind imports + custom properties
├── components/
│   ├── ui/                 # shadcn/ui components (customized)
│   ├── layout/             # Header, sidebar, bottom-nav
│   ├── stepper/            # Multi-step assistant components
│   └── shared/             # Shared components (cards, badges, etc.)
├── lib/
│   ├── api.ts              # API client for backend
│   └── utils.ts            # Utility functions
├── styles/
│   └── tokens.css          # Design token CSS custom properties
├── tailwind.config.ts      # Tailwind config with custom theme
└── next.config.ts          # Next.js configuration
```

---

## 13. Brand Comparison

How OpenKick's jade green sits in the landscape:

| App | Primary Color | Hex | Difference |
|---|---|---|---|
| **Spotify** | Bright lime-green | `#1DB954` | Ours is cooler and deeper |
| **WhatsApp** | Vivid cyan-green | `#25D366` | Ours is warmer and more muted |
| **OpenKick** | Jade green | `#10B981` | Balanced, sits between both — distinct at a glance |
