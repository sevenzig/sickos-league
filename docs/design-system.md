# Design System Reference

Internal quick-reference for the sickos-league UI layer. Not a public component library — rules are specific to this product.

---

## Type Roles

All font sizes are set via IBM Plex Sans. Use the role class, not an arbitrary `text-[Npx]`.

| Role | Class | Size | Weight | Use for |
|---|---|---|---|---|
| display | `text-display` | 36px | 700 | Hero numbers, large stat callouts |
| title | `text-title` | 24px | 700 | Page titles, PageChrome headings |
| heading | `text-heading` | 18px | 600 | Section headings, card titles |
| body | `text-body` | 16px | 400 | Prose, descriptions, form labels in context |
| label | `text-label` | 14px | 500 | Button text, form labels, table cells |
| caption | `text-caption` | 12px | 500 | Secondary metadata, timestamps, footnotes |

**Minimum text size is `text-caption` (12px).** Sub-12px is only allowed in justified dense data cells (draft pick lists, compact grids) and must be annotated with `// design-token-ok: <reason>`.

---

## Density Recipes

Density slots define the trio of (gap, padding, icon size, control height) for icon+label compositions. **Do not mix gap/pad from different sizes.**

| Size | Part | Gap | Pad | Icon | Control |
|---|---|---|---|---|---|
| sm | 32px | `gap-1.5` | `p-2` | `h-4 w-4` | `h-8` |
| md | 44px | `gap-2` | `p-3` | `h-5 w-5` | `h-11` |
| lg | 64px | `gap-2.5` | `p-5` | `h-8 w-8` | `h-12` |
| xl | 96px | `gap-4` | `p-8` | `h-12 w-12` | `h-16` |

`md` is the default for all interactive controls. Use `sm` only for secondary/inline controls that are not the primary touch target on mobile. Primary navigation buttons (week nav, modals) must be at least `md`.

---

## Color Tokens

### Semantic CSS variables (prefer these)

| Token | CSS var | Tailwind class | Use for |
|---|---|---|---|
| Primary | `--primary` | `bg-primary`, `text-primary` | Brand blue, active states |
| Success | `--success` | `bg-success/10`, `text-success` | Wins, confirmed states |
| Warning | `--warning` | `bg-warning/10`, `text-warning` | Pending, caution states |
| Danger | `--danger` | `bg-danger/10`, `text-danger` | Errors, losses, destructive |
| Destructive | `--destructive` | `bg-destructive` | Destructive action buttons only |

All semantic tokens support Tailwind opacity modifiers (`bg-success/10`, `border-danger/30`).

### When to use raw Tailwind colors

Only for one-off decorative effects not covered by semantic tokens (e.g. team colors, score gradients, draft UI glow effects). Document the reason with an inline comment if used in a shared component.

---

## Shadows

| Token | Tailwind | Use for |
|---|---|---|
| Panel shadow | `shadow-panel` | Default surface elevation |
| Panel hover | `shadow-panel-hover` | Hover state on interactive panels |

Never use arbitrary `shadow-[...]` box shadows for panels or cards. Use `drop-shadow-[...]` (CSS filter) only for decorative text/icon glow effects.

---

## Radius

| Context | Class | Value |
|---|---|---|
| Controls (buttons, inputs, badges) | `rounded-md` | `calc(var(--radius) - 2px)` |
| Panels, cards, dialogs | `rounded-panel` | `1rem` |
| Pills, avatars | `rounded-full` | — |

---

## Focus Rings

All interactive elements must use the `ring` token for focus visibility:

```tsx
// On primitives (built into Button, Input, Select, etc.):
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background

// Inside containers with dark bg (DropdownMenu, etc.) use ring-inset:
focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring
```

Never write `focus:outline-none` alone — it removes the browser default without providing a replacement.

The `.focus-ring` utility class in `index.css` is a legacy alias; prefer adding `focus-visible:` classes directly on new components.

---

## Core Components

### `<Panel>`
Surface container. Replaces raw `bg-gradient-to-br from-slate-800/95 ... rounded-panel shadow-panel` divs.

```tsx
// Default (6px padding)
<Panel>...</Panel>

// Density sizes
<Panel size="sm" />   // p-2
<Panel size="md" />   // p-3
<Panel size="lg" />   // p-5
<Panel padding="none" className="overflow-hidden" />

// Hover lift
<Panel className="hover:shadow-panel-hover transition-all duration-200" />
```

### `<PageChrome>`
Page-level title bar (44px min-height). Replaces `h-[74px]` gradient header divs.

```tsx
<PageChrome
  title="Page Title"          // string or ReactNode
  actions={<Button>...</Button>}
/>
```

### `<Button>`

| Variant | Use |
|---|---|
| `primary` (default) | Main action |
| `secondary` | Alternate / cancel |
| `ghost` | Inline / navigation chip |
| `destructive` | Delete / irreversible action |

| Size | Height | Use |
|---|---|---|
| `sm` | 32px | Secondary/inline controls only — not primary touch targets |
| `md` (default) | 44px | All primary interactive controls |
| `lg` | 48px | Hero CTAs |

### `<Badge>`

Variants: `default` · `primary` · `success` · `warning` · `danger` · `solid`

### `<Alert>`

Variants: `error` (default) · `success` · `warning` · `info`

```tsx
<Alert variant="success" title="Import Successful">
  Records imported: 42
</Alert>
```

### `<EmptyState>`

For "no data yet" blocks — replaces one-off empty state divs.

```tsx
<EmptyState
  title="No leagues yet"
  description="Create your first league to get started."
/>
```

---

## Neutrals

Use `slate-*` for all neutral colors. `gray-*` is banned — flag with `npm run lint:tokens`.

| Role | Class |
|---|---|
| Page background | `bg-slate-950` |
| Surface | `bg-slate-900` |
| Card / panel gradient | `from-slate-800/95 to-slate-900/95` |
| Subtle divider | `border-slate-700/50` |
| Secondary text | `text-slate-400` |
| Tertiary text | `text-slate-500` |

---

## Regression Guard

Run `npm run lint:tokens` to catch design system violations before commit. This checks for:
- `gray-*` neutrals (use `slate-*`)
- Arbitrary `shadow-[...]` box shadows (use `shadow-panel` / `shadow-panel-hover`)
- Sub-12px text sizes (use `text-caption` minimum)

Mark a justified exception with a trailing comment: `// design-token-ok: <reason>`
