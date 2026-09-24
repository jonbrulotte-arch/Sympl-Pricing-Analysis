# Sympl Design System Reference

This document defines the visual language shared across all Sympl platforms. Every new platform in the Sympl family MUST follow these patterns exactly.

## Color Palette

### Primary
- `blue-600` — Primary action buttons, active nav items, focus rings, links
- `blue-700` — Button hover state
- `blue-500` — User avatar backgrounds
- `blue-400` — Brand accent text (the "PM" / "PA" in the logo)
- `blue-100` / `blue-800` — Default badge background/text

### Neutral (Layout)
- `gray-900` — Sidebar background, primary heading text
- `gray-800` — Sidebar hover background
- `gray-700` — Sidebar border (`border-gray-700`), body text, outline button text
- `gray-500` — Secondary labels, timestamps, admin section header
- `gray-400` — Placeholder text, inactive icons, collapsed sidebar text
- `gray-300` — Inactive sidebar nav text, input borders
- `gray-200` — Card borders, table borders, dividers
- `gray-100` — Tab list background, secondary button bg, dropdown hover
- `gray-50` — Main content area background, table header rows
- `white` — Cards, dialog backgrounds, input backgrounds

### Semantic
- `green-100/800` — Success badges
- `yellow-100/800` — Warning badges
- `red-100/800` — Destructive badges
- `red-600/700` — Destructive buttons
- `red-500` — Notification count badge
- `purple-100/800` — Purple badges
- `red-50` / `red-200` / `red-700` — Error alert box (bg/border/text)

## Typography

- **Font:** Geist (loaded via `next/font/google`, variable `--font-geist`)
- **Fallback:** `font-sans` (Arial, Helvetica, sans-serif)
- **Sizes:**
  - `text-3xl font-bold` — Login page title
  - `text-lg font-semibold` — Card/dialog titles, section headings
  - `text-base font-semibold` — Card titles
  - `text-sm font-medium` — Nav items, form labels, table headers, button text
  - `text-sm` — Body text, table cells, form inputs
  - `text-xs` — Badges, timestamps, secondary info, admin nav header
  - `text-[9px]` — Notification count in badge

## Layout

### App Shell
```
┌──────────────────────────────────────────────┐
│ flex h-screen overflow-hidden bg-gray-50     │
│ ┌──────────┐ ┌─────────────────────────────┐ │
│ │ Sidebar  │ │ main flex-1 overflow-y-auto │ │
│ │ w-56     │ │                             │ │
│ │ (or w-16 │ │   Page content here         │ │
│ │ collapsed│ │                             │ │
│ │          │ │                             │ │
│ └──────────┘ └─────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Sidebar Structure
- Width: `w-56` expanded, `w-16` collapsed
- Background: `bg-gray-900 text-white`
- Transition: `transition-all duration-200`
- Logo bar: `h-14 px-4 border-b border-gray-700`
  - Logo text: `text-lg font-bold text-white tracking-tight`
  - Accent word: `text-blue-400` (e.g., "Sympl **PA**")
  - Collapsed: single letter centered
- Nav section: `flex-1 overflow-y-auto py-4 space-y-1 px-2`
- Nav item: `flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors`
  - Active: `bg-blue-600 text-white`
  - Inactive: `text-gray-300 hover:bg-gray-800 hover:text-white`
  - Icon: `h-5 w-5 shrink-0`
- Admin section divider: `pt-4 pb-1 px-2` with `text-xs font-semibold text-gray-500 uppercase tracking-wider` label
- User section: `border-t border-gray-700 p-3`
  - Avatar: `h-8 w-8 rounded-full bg-blue-500 text-xs font-bold text-white`
  - Name: `text-sm font-medium text-white truncate`
  - Role: `text-xs text-gray-400 truncate`
  - Action buttons: `p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800`
- Collapse toggle: `h-8 border-t border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800`

### Login Page
- Full page: `min-h-screen bg-gray-900 flex items-center justify-center`
- Container: `w-full max-w-sm`
- Logo: centered, `text-3xl font-bold text-white tracking-tight` with accent in `text-blue-400`
- Subtitle: `text-gray-400 mt-1 text-sm`
- Form card: `bg-white rounded-xl shadow-sm border border-gray-200 p-8`
- Card heading: `text-lg font-semibold text-gray-900 mb-6`
- Labels: `text-sm font-medium text-gray-700 mb-1.5`
- Error box: `rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700`

## Component Patterns

### Buttons (class-variance-authority)
| Variant | Classes |
|---------|---------|
| default | `bg-blue-600 text-white hover:bg-blue-700` |
| destructive | `bg-red-600 text-white hover:bg-red-700` |
| outline | `border border-gray-300 bg-white hover:bg-gray-50 text-gray-700` |
| secondary | `bg-gray-100 text-gray-900 hover:bg-gray-200` |
| ghost | `hover:bg-gray-100 text-gray-700` |
| link | `text-blue-600 underline-offset-4 hover:underline` |

Sizes: `default: h-9 px-4`, `sm: h-8 px-3 text-xs`, `lg: h-10 px-8`, `icon: h-9 w-9`

### Inputs
`h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500`

### Cards
- Container: `rounded-lg border border-gray-200 bg-white shadow-sm`
- Header: `flex flex-col space-y-1.5 p-6`
- Title: `text-base font-semibold leading-none tracking-tight text-gray-900`
- Description: `text-sm text-gray-500`
- Content: `p-6 pt-0`

### Dialogs
- Overlay: `fixed inset-0 z-50 bg-black/40 backdrop-blur-sm`
- Content: `fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-white p-6 shadow-lg rounded-xl`
- Close button: `absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100`
- Title: `text-lg font-semibold leading-none tracking-tight`
- Description: `text-sm text-gray-500`

### Badges
| Variant | Classes |
|---------|---------|
| default | `bg-blue-100 text-blue-800` |
| secondary | `bg-gray-100 text-gray-800` |
| destructive | `bg-red-100 text-red-800` |
| outline | `border border-gray-200 text-gray-700` |
| success | `bg-green-100 text-green-800` |
| warning | `bg-yellow-100 text-yellow-800` |
| purple | `bg-purple-100 text-purple-800` |

All badges: `rounded-full px-2.5 py-0.5 text-xs font-semibold`

### Tabs (Radix)
- List: `inline-flex h-9 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-500`
- Active trigger: `bg-white text-gray-900 shadow`
- Content: `mt-2`

### Tables (HTML)
- Container: `border border-gray-200 rounded-lg overflow-hidden`
- Header row: `bg-gray-50`
- Header cell: `px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider`
- Body cell: `px-4 py-3 text-sm text-gray-900`
- Row border: `border-t border-gray-200`
- Hover: `hover:bg-gray-50`

### Select (Radix)
- Trigger: `h-9 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-blue-500`
- Content: `z-50 rounded-md border border-gray-200 bg-white text-gray-900 shadow-md`
- Item: `rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-gray-100`

## Page Patterns

### Standard Page Layout
```tsx
<div className="p-6 max-w-7xl mx-auto space-y-6">
  {/* Page header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Page Title</h1>
      <p className="text-sm text-gray-500 mt-1">Description text</p>
    </div>
    <Button>Primary Action</Button>
  </div>

  {/* Content cards */}
  <Card>
    <CardHeader>
      <CardTitle>Section Title</CardTitle>
    </CardHeader>
    <CardContent>
      {/* ... */}
    </CardContent>
  </Card>
</div>
```

### Dashboard Card with Stat
```tsx
<Card>
  <CardContent className="p-6">
    <div className="flex items-center gap-4">
      <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      <div>
        <p className="text-sm text-gray-500">Label</p>
        <p className="text-2xl font-bold text-gray-900">42</p>
      </div>
    </div>
  </CardContent>
</Card>
```

## Dependencies (npm)

These are the exact packages used across Sympl platforms:

### Core
- `next` 16.x, `react` 19.x, `react-dom` 19.x, `typescript` 5.x
- `prisma` 7.x, `@prisma/client` 7.x, `@prisma/adapter-pg` 7.x, `pg` 8.x

### UI
- `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-tabs`
- `@radix-ui/react-slot`, `@radix-ui/react-checkbox`, `@radix-ui/react-switch`
- `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `@radix-ui/react-tooltip`
- `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-label`
- `@radix-ui/react-avatar`
- `class-variance-authority` 0.7.x
- `clsx` 2.x, `tailwind-merge` 3.x
- `lucide-react` 1.x

### Auth
- `next-auth` 5.x (beta), `bcryptjs` 3.x

### Utilities
- `date-fns` 4.x, `zod` 4.x, `uuid` 14.x

### Styling
- `tailwindcss` 4.x, `@tailwindcss/postcss` 4.x
