# Design System Backlog

Path from v1 (shipped) to near-full coverage. Update checkboxes as slices land.

## V1 shipped (done)

- [x] IBM Plex Sans as sole product typeface
- [x] Semantic CSS variables (slate + blue) + Tailwind theme roles
- [x] Type roles: `display` / `title` / `heading` / `body` / `label` / `caption`
- [x] Layout spacing rules + `src/lib/density.ts` recipes
- [x] shadcn-based: `Button`, `Input`, `Tabs`, `Dialog`
- [x] Hand-built: `Panel`, `PageChrome`, `Badge`
- [x] Pilot migrate: Header, Welcome, LeagueHeader, StandingsTable, MatchupCard
- [x] `prefers-reduced-motion` guards for fade/slide/pulse/spin utilities
- [x] Radius: controls `md`, panels `rounded-panel` (2xl), pills `full`
- [x] Shadows: `shadow-panel` / `shadow-panel-hover` only in new code

## Deprecations to finish

| Pattern | Replacement | Priority |
|---|---|---|
| ~~`.panel` CSS class~~ | ~~`<Panel />`~~ | ~~P0~~ ✅ |
| ~~Arbitrary `shadow-[0_10px_30px…]` / `shadow-[0_20px_60px…]`~~ | ~~`shadow-panel` / `shadow-panel-hover`~~ | ~~P0~~ ✅ |
| ~~`gray-*` neutrals~~ | ~~`slate-*` or semantic tokens~~ | ~~P0~~ ✅ |
| ~~`font-light` / marketing weight split~~ | ~~type roles + `font-bold` for brand~~ | ~~P0~~ ✅ |
| ~~`text-[7px]`–`text-[11px]`~~ | ~~`text-caption` (12px) minimum; table microcopy only if justified~~ | ~~P1~~ ✅ |
| ~~`font-black` on chrome titles~~ | ~~`font-bold` + `text-title` / `text-display`~~ | ~~P1~~ ✅ |
| `font-black` on scores | keep (data exception) | — |
| ~~`rounded-lg` / `rounded-3xl` on controls/panels~~ | ~~`rounded-md` / `rounded-panel`~~ | ~~P1~~ ✅ |
| ~~`hover:scale-[1.02]` on cards~~ | ~~shadow hover only (sharpness)~~ | ~~P2~~ ✅ |
| ~~Backdrop `blur-xl` on every card~~ | ~~restrained `blur-sm` via `<Panel />`~~ | ~~P1~~ ✅ |
| ~~Duplicate page header bars `h-[74px]`~~ | ~~`<PageChrome />`~~ | ~~P0~~ ✅ |

## Screen migration (remaining)

### P0 — high traffic

- [x] `MyLeagues` (+ league cards) → Panel, Badge, Button, type roles
- [x] `CreateLeague` → Input, Button, Panel
- [x] `InviteRedeem` / `JoinWithCode` → Input, Button, Panel
- [x] `SignInModal` → Dialog (or align to Dialog primitives), Input, Button
- [x] `LeagueView` shell / week chrome → PageChrome where applicable
- [x] `LeagueSchedule` → Panel + type roles
- [x] `LeagueLineups` / `SetLineups` → Panel, Button, density recipes
- [x] `LeagueDraft` → Panel, Button, Badge (keep mono for clock)
- [x] `LeagueAdmin` + team/invite managers → Input, Button, Panel, Badge
- [x] `RecordTable` → Panel (match StandingsTable)
- [x] `WeekNavigation` → Button / Badge density recipes

### P1 — secondary product

- [x] `UserProfile` / `EditProfile` / `ProfilePhotoUpload`
- [x] `Rules` → PageChrome + Panel (drop hardcoded header bar)
- [x] `EnterScores` → PageChrome + tokens
- [x] Matchup modals (`MatchupModal` ×2) → Dialog shell where suitable
- [x] `SeasonWLTChart` / legacy `LeagueStandings` table
- [x] `TeamSlots`, `TeamManagement`, `MemberManagement`, `InviteManager`
- [x] `DraftControls`, `DraftSetupFields`, `DraftSettingsEditor`
- [x] `CommissionerLineups`, `WeeklyTeamSelector`, `TeamIdentityEditor`

### P2 — admin / legacy / dev

- [x] `Admin`, `AdminDashboard`, `AdminImport`, `AdminLineups`, `AdminMigration`
- [x] `BQBLTest`, `Home` (legacy single-league), `Rosters`, `AdminRoute`
- [x] `FeatDraftSandbox`, `DevOnly`
- [x] Remove dead `.panel` CSS once grep is clean

## Primitives still needed for ~full coverage

| Primitive | Why | Priority |
|---|---|---|
| ~~`Select`~~ | ~~Native selects everywhere (week pickers, admin)~~ | ~~P0~~ ✅ |
| ~~`Label` + `FormField`~~ | ~~Visible labels; kill placeholder-as-label~~ | ~~P0~~ ✅ |
| ~~`Textarea`~~ | ~~Profile / admin notes if any~~ | ~~P2~~ ✅ |
| ~~`Alert` / inline callout~~ | ~~Error/info banners (draft status already custom)~~ | ~~P1~~ ✅ |
| ~~`EmptyState`~~ | ~~Repeated "no data yet" blocks~~ | ~~P1~~ ✅ |
| ~~`Spinner` / `LoadingBlock`~~ | ~~Auth + page loaders~~ | ~~P1~~ ✅ |
| ~~`DropdownMenu`~~ | ~~Header user menu~~ | ~~P1~~ ✅ |
| ~~`Table` primitives~~ | ~~Standings/records/admin grids~~ | ~~P2~~ ✅ |
| ~~`Checkbox` / `Switch`~~ | ~~Settings toggles~~ | ~~P2~~ ✅ |
| ~~`Toast`~~ | ~~Save confirmations~~ | ~~P2~~ ✅ |
| ~~`Tooltip`~~ | ~~Icon-only controls~~ | ~~P2~~ ✅ |

## Token / system gaps

- [x] Document type role usage in a short `docs/design-system.md` (reference, not Storybook)
- [x] Add ESLint (or CI grep) bans: new `gray-*`, new `shadow-[`, new `text-[Npx]` below 12 (`npm run lint:tokens`)
- [x] Map feedback colors to semantic tokens (`--success`, `--warning`, `--danger`) — Alert, Badge, Toast updated
- [x] Ensure all interactive elements use `focus-visible` ring tokens (DropdownMenuItem fixed)
- [x] Audit touch targets against density `md` (44px) on mobile nav/actions (WeekNavigation + Home week nav)
- [x] `Select` / `Input` size recipes wired to `density.ts`

## Definition of "near-full coverage"

1. No product screen uses `.panel`, arbitrary panel shadows, or `gray-*`
2. All buttons/inputs/dialogs/tabs go through `src/components/ui`
3. All page title bars use `PageChrome`
4. Type roles used for chrome; arbitrary sub-12px text gone except justified data cells
5. Density recipes used for icon+label compositions that scale
6. Backlog P0/P1/P2 primitives and screens checked off
7. Lint/CI guards prevent regression

When the list above is complete, treat the design system as comprehensive for this product (not a generic public UI kit).
