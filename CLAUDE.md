# Sympl Pricing Analysis Platform

## Design System — "Sympl UI"

This platform MUST match the look, feel, and UX patterns of the existing **SymplPM Product Development Platform**. The complete design system reference is in `docs/design-system.md`. The UI components in `src/components/ui/` and layout components in `src/components/layout/` are the canonical implementations — use them as-is.

## Architecture

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Database:** PostgreSQL via Prisma 7 with `@prisma/adapter-pg`
- **Auth:** NextAuth v5 (credentials provider, bcrypt, JWT)
- **Styling:** Tailwind CSS v4 (no tailwind.config — uses `@import "tailwindcss"` in globals.css)
- **UI Primitives:** Radix UI + class-variance-authority + tailwind-merge
- **Icons:** Lucide React (consistent 5x5 sizing, `shrink-0`)
- **Fonts:** Geist (via `next/font/google`)

## Key Conventions

- All pages under `src/app/(app)/` are authenticated (wrapped by AppShell with sidebar)
- Login page at `src/app/login/page.tsx` — dark background (gray-900), centered white card
- Use `cn()` from `@/lib/utils` for all className merging
- No Tailwind config file — Tailwind v4 uses CSS-first config via `globals.css`
- Primary color: **blue-600** (buttons, active nav, focus rings)
- Sidebar: **gray-900** background, **blue-600** active state, **gray-300** inactive text
- Content area: **gray-50** background, **white** cards with gray-200 borders
- Text hierarchy: gray-900 (headings), gray-700 (body), gray-500 (secondary), gray-400 (placeholder)
- All forms use the Input/Select/Textarea components, not raw HTML elements
- Dialogs use Radix Dialog with the provided DialogContent component
- Badges use the Badge component with semantic variants (default/success/warning/destructive)
- Tables: white bg, gray-200 borders, gray-50 header row, text-sm, left-aligned

## Important: Next.js 16

@AGENTS.md

## File Structure

```
src/
  app/
    (app)/          # Authenticated routes (wrapped by AppShell)
      admin/        # Admin pages
      dashboard/    # Landing dashboard
    api/            # API route handlers
    login/          # Public login page
    layout.tsx      # Root layout
    globals.css     # Tailwind + CSS variables
  components/
    layout/         # AppShell, Sidebar
    ui/             # Shared UI primitives (Button, Input, Card, Dialog, etc.)
  lib/              # Auth, Prisma client, utilities
prisma/
  schema.prisma
```
