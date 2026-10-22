# Sidebar redesign plan

Date: 2026-10-22. Addresses the concerns in [03_sidebar.md](03_sidebar.md).
Mockups: open [`mockups/sidebar/index.html`](mockups/sidebar/index.html) in a browser. They are
interactive: switch concepts, scope levels, theme and width, and try the shortcuts, drag and drop,
archive with undo, and the right-click menu. Iterate on the mockup until the design is settled; then
implement in the order below.

Status: **P0 implemented, uncommitted, ready to try** (2026-10-22). P1 and later remain design iterations.

### P0 as built: known limits

- Older Ether builds can't read the profile once a mark is set, because the local-projects schema is
  strict. They report "unsupported version" and leave the data unchanged.
- ⌘/Ctrl+1–9 follows mark slots only. With no marks they do nothing; there is no "nth row" fallback.
- The mark, marks-list, and Ctrl+` shortcuts are renderer-side. They don't fire while a browser pane
  has focus, because there is no main-process allowlist entry yet.
- In local mode the Archive chord (⌘/Ctrl+⇧⌫) archives the open Workspace, with Undo. It is ignored
  while a dialog is open, on Settings, or while typing.
- The footer polls git status for the open Workspace's roots, which duplicates the Source Control
  poller while both are visible.
- Row overrides show the checkout folder name, not the branch or a dirty dot. Branch and dirty state
  are in the footer only.
- `ether-linear-onboarding.spec.ts` runs against the packaged app, so it needs `pnpm build:ether`
  before it can pass.

### Chosen settings

Desk concept · P0 first · roots in the footer only (no root line under Projects) · marked rows move
up into Marks · manual Project order with Workspaces sorted by recency inside each Project · type
marker: rail and glyph (P1). The scope footer moved from P1 into P0 because the roots choice depends
on it. These are the mockup's defaults.

## Why the sidebar feels hard to use

1. **Everything has the same visual weight.** Project names, Workspace names, root subtitles, "Link
   Linear issue" and agent rows sit at nearly the same size and indent, so nothing marks where one
   area ends (concern 2).
2. **Repeated chrome on every Workspace.** Each one draws the root list, an empty Linear row and every
   idle agent, so the clutter grows with the number of Workspaces. That is part of why quick tasks
   feel heavy (concerns 1 and 7, and 05).
3. **Ordered by container only.** The tree follows creation order. It has no sense of time or
   attention. `lastActivityAt`, `isUnread` and `isPinned` already exist but the sidebar never reads
   them (concerns 3 and 4).
4. **A Workspace has no identity beyond its name.** It has no type, mark or activity state, so color,
   shortcuts and recency have nothing to attach to (concerns 3, 4 and 5).
5. **No lifecycle.** Every Workspace is permanent, and archiving the open one is blocked (concerns 6
   and 05).

Bug found while reviewing: the Workspace subtitle prints the Project's root labels and ignores
`checkoutOverridesByRootId`. A Workspace with a different checkout for one root shows wrong
information.

## Recommended direction: "Desk" (concept A)

Attention goes on top and Projects go below, in fixed places with no mode switch. **You order the
Marks; the app orders everything else.**

```
Search ⌘J                   [tasks][automations][mobile]
NEEDS YOU · 2        agents waiting on you (only when not empty)
MARKS                your Harpoon slots 1–9 (only when not empty)
INBOX · 3            captured follow-ups (P2)
PROJECTS             sorted by recent activity
  Orca
  orca                         ← roots once, in mono
  ▌ Sidebar redesign  ETH-31  now
  ▌ Review #6012           •   2h
    Parked · 1                 ← idle 7+ days, folded
footer: open Workspace · orca ⎇ ether ●      ← full scope of what's open
```

Alternatives kept in the mockup for comparison: **Stream** (concept B) is one flat list grouped by
attention and time, with Projects as a filter. **Rail** (concept C) is a Slack-style Project column
that shows one Project at a time.

## How each concern is answered

| # | Concern | Answer (Desk) | Phase |
|---|---|---|---|
| 1 | Cleanup; Linear under ⋯ | Remove the "Link Linear issue" row. Show linked keys inline only when they exist (`AI-412 +1`). Linking moves to ⋯, the right-click menu and a Cmd+J quick action. | P0 |
| 2 | Visual distinction | Size ladder: 11px uppercase section labels, 13px semibold Projects, 13px Workspaces, 12px agents. Hairlines only between top-level sections, spacing between Projects. Search plus icon buttons replace three full-width nav rows. Agent rows show only for the open Workspace, or when an agent is working, waiting or has finished unseen; other idle agents collapse into a count chip. | P0 |
| 3 | Switching shortcuts | Marks 1–9 (Harpoon). ⌘/Ctrl+1–9 jumps to a mark, ⌘/Ctrl+⇧H marks or unmarks the open Workspace, ⌘/Ctrl+; opens the marks list (reorder, assign, clear). Ctrl+\` toggles to the previous Workspace; hold it to step back through recent ones. | P0 |
| 4 | Recency and staying organized | Recency sort for Projects and Workspaces, relative timestamps, a Needs you section, and auto-parking of Workspaces idle 7+ days into "Parked · n". | P0 sort, P1 the rest |
| 5 | Color for the kind of work | Work type: Feature, Review, Plan, Fix, Chore. A 2px rail in a small new palette; Fix and Chore stay neutral. Set from ⋯ or inferred from Linear labels or branch prefix. The mockup compares rail, glyph and both. | P1 |
| 6 | Archive while open | Enabled for the open Workspace (⌘/Ctrl+⇧⌫). Ether switches to the previous Workspace and shows an Undo toast. Running agents are named in the toast, not stopped. | P0 |
| 7 | Roots display | Chosen: footer only. The footer shows the open Workspace's roots and branches. A Workspace row only shows what differs: an override branch and a dirty dot. (Alternatives: a root line under each Project, or chips.) | P0 |
| 8 | Drag between Projects | Drag a row onto a Project header. Same roots: accepted. Superset: accepted with "adds X". Otherwise the target dims with "Missing X". "Move to Project…" in ⋯ does the same from the keyboard. | P1 |

Rules from the design review of the first mockup (already applied in it):

- Mark slots never renumber. Removing mark 2 leaves slot 2 empty.
- An agent's question appears only in Needs you. The Workspace's own row shows just the orange dot.
- Needs you shows at most 3 rows, then "+n more". Its header is muted; only the count of waiting
  agents is orange, and `unverifiable` agents are listed last and not counted.
- Inbox starts collapsed. Marked rows show agent rows only when the agent is working or the
  Workspace is open.
- A row always keeps about 8 characters of its name. Extras drop in this order: project suffix,
  Linear key, branch text (the ⎇ glyph stays), mark chip.
- Untyped Workspaces get no type marker.
- Not yet solved: rows reflow when you switch Workspaces, because agent rows appear and disappear.
  Animate the height change, or keep the previous Workspace's agent rows until the pointer leaves the
  sidebar.

## Above and beyond (P2+, shown in the mockup's "P2+ vision" scope)

- **Inbox capture** (answers 07's "task A spawns B and C"). ⌘/Ctrl+⇧K opens a one-line capture that
  records the origin Workspace, active file and selection, and optionally the last agent message. It
  doesn't touch the running chat. Items sit under "Inbox · n" and become a scratch Workspace with one
  click.
- **Scratch Workspaces** (answers 05's "quick tasks feel heavy"). Created instantly, named from the
  first prompt, marked with a dashed rail, and auto-archived after 24h idle unless you click Keep.
- **Resume hover card**: roots and branches, agent states, Linear keys, and a "where you left off"
  summary. The summary is generated outside the agent's context and comes later (P3).
- **Compact 48px rail**: Needs-you badge, mark tiles and Project monograms.
- **Right-side assistant** (07): a digest over the same data the sidebar shows (needs you, finished
  since you left, inbox, parked).

## Implementation plan

Reuse first. The upstream sidebar already has most of the machinery, and local Workspaces are already
projected as `folder:` rows. Two gaps block reuse today:

- `UpdateLocalWorkspaceSchema` (`src/shared/local-projects/schema.ts`) accepts only
  name/archived/unread/pinned/lastActivityAt, so writes such as `workspaceStatus` and `manualOrder`
  are rejected.
- `LocalProjectsSidebar` reads `state.localProjects`. Activity and unread updates land in
  `state.folderWorkspaces`, so the local copy never refreshes. This is why `lastActivityAt` and
  `isUnread` look unused.

### P0: cleanup and switching

1. **One source of truth for rows.** Have the sidebar read activity, unread and pin state from the
   projected folder rows (or patch `localProjects` when folder workspaces update) so producers like
   `markWorktreeUnread` and `FolderWorkspaceActivityPersistence` show up. Confirm which events bump
   `lastActivityAt`: agent turn completed, file saved, terminal input. Activation should not bump it.
2. **Split `LocalProjectsSidebar.tsx`** (162 lines today, will grow) into
   `LocalSidebarProjectSection`, `LocalSidebarWorkspaceRow`, `LocalSidebarSection` (Needs you / Marks)
   and a pure `local-sidebar-order.ts` (recency sort, parking, agent-row visibility) with unit tests.
3. **Row cleanup.** Remove the always-visible Linear row and render keys inline. Move the full root
   list to one line under the Project and render only override branches on rows, which fixes the
   override bug. Fix the trailing slot width so the time swaps to ⋯ on hover without shifting the
   layout.
4. **Agent rows.** Keep `WorktreeCardAgents`, filtered by the visibility rule, plus a count chip for
   hidden idle agents. The data comes from the existing agent-status store.
5. **Context menu.** Wrap the ⋯ items in a Radix `ContextMenu` for right-click. Add "Linear issues…"
   as a `CmdJQuickAction` (`src/renderer/src/components/cmd-j/quick-actions.ts`).
6. **Archive while open.** Remove the guard in `LocalContextActions.tsx`. Write a local successor
   picker (most recently visited via `lastVisitedAtByWorktreeId`, then `project.lastWorkspaceId`).
   Activate the successor before archiving, then show a sonner toast with Undo.
7. **Marks.** Store `marks: (workspaceId | null)[]` on `LocalProjectsState` (schema version bump and
   migration) and derive `isPinned` from it. Add keybinding definitions in
   `src/shared/keybindings/definitions-core-*.ts`, which users can rebind. Repoint
   `workspace.selectByIndex` to marks when Local Projects is on, keeping "nth visible row" as a
   setting. Add mark toggle and the marks list overlay (a `Command` in a `Dialog`, matching the Cmd+J
   palette styling).
8. **Recent switcher.** Add a new `workspace.previousRecent` binding on Ctrl+\` (physical
   `Backquote`), modelled on the existing tab Ctrl+Tab switcher. It needs the main-process allowlist
   entry. The order comes from `lastVisitedAtByWorktreeId`.
9. **Local next/previous.** Mod+⇧↑/↓ currently does nothing in local mode because
   `navigateWorktree` needs `WorktreeList` mounted. Drive it from `worktree-keyboard-cycle.ts`
   helpers.

### P1: all eight concerns

10. **Needs you.** Read the hook server's agent-status store through the existing readers; add no new
    producers. Use the `live` / `unverifiable` / `exited` vocabulary: an `unverifiable` agent shows a
    hollow dot and is never called finished.
11. **Auto-park.** A derived fold for Workspaces idle 7+ days with no live agent, not marked and not
    open, with the threshold as a setting. No data changes.
12. **Work type.** Add `type` and `typeSource` to `LocalWorkspace` and the update schema. Add the NEW
    tokens `--work-type-feature/review/plan/neutral` to `main.css` in both themes and expose them in
    `@theme inline`. Add type inference from Linear labels and branch prefix. Add the Type row to the
    menus.
13. **Drag between Projects.** Use native HTML5 drag with the existing
    `application/x-orca-worktree-id` MIME type. Compute a root-path verdict for each Project and show
    an inline caption. Add `moveLocalWorkspace` in main: re-key `projectId` and keep checkout
    overrides by matching root path. Add a keyboard "Move to Project…" dialog using the same verdict.
14. **Scope footer.** Reuse or extend `LocalWorkspaceRootBar`. Each chip opens that root's checkout
    picker.

### P2+

15. Inbox and capture, scratch Workspaces, resume hover card, compact rail. Each gets its own plan
    once P1 is in use.

### Verification

- Unit tests for ordering, parking, agent-row visibility, root verdicts and the successor picker.
  Update `LocalProjectsSidebar.test.tsx`.
- Keybinding tests for the new ids on Mac and on Windows/Linux. Check digit-chord interplay
  (`useIpcEvents-cmd-j-digit-chord`).
- Schema migration tests for `marks`, `type` and the version bump. Old catalogs must still load.
- `pnpm tc`, targeted `pnpm test`, `pnpm run check:code-quality:changed`.
- Rendered check of the real app via the `$electron` skill (CDP screenshots, `ORCA_BACKGROUND_LAUNCH=1`)
  in dark and light mode, at 220px and 380px sidebar widths.

## Decisions to make while iterating on the mockup

1. **Concept**: Desk (recommended), Stream, or Rail. The mockup includes all three.
2. **Marked rows**: move up into Marks (no duplication, but Projects look incomplete), or also stay in
   their Project.
3. **Project order**: stable manual order (recommended after design review: auto-sorting moved a
   Project from top to bottom when its newest Workspace was archived), or by recency. Workspaces sort
   by recency inside each Project either way, and re-sorting should pause while the pointer or focus
   is in the sidebar.
4. **Type marker**: rail only, glyph only, or both. The grayscale toggle checks the result without
   color.
5. **Type vs status**: upstream already has customizable workspace *statuses* (Todo / In progress /
   In review / Done, with colors and icons) and a kanban drawer. Concern 5 asks for the *kind* of work,
   which is a separate axis. Recommendation: add a type field and keep statuses for the kanban later.
   Alternatively, reuse statuses with custom labels "Feature / Review / Planning" and give up
   lifecycle lanes.
6. **Roots style**: line (recommended), chips, or footer only.
7. **Needs you inline actions**: should a waiting permission be answerable from the sidebar
   (Allow/Deny), or only open the Workspace? The mockup only opens it. 04 says approvals render poorly
   today, so this belongs with that work.
