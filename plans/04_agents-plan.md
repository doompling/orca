# Agent experience plan

Date: 2026-10-22. Addresses the concerns in [04_agents.md](04_agents.md).
Mockups: open [`mockups/agents/index.html`](mockups/agents/index.html) in a browser. They are
interactive: switch scenes, provider (Claude / Codex), theme and widths, flip **View → Baseline** to
compare against today's rendering, and use the Simulate buttons (agent asks, auto-review verdicts,
spawn 4 / spawn 9, stop confirmed / unconfirmed, SSH loss, return after away, capture). Tick
"Highlight Ether additions" to outline what this fork adds on top of upstream.
Design brief from the design review: [`mockups/agents/design-brief.md`](mockups/agents/design-brief.md).

Status: **design iteration**, after two rounds with the design review (brief, then a critique of the
built mockup; the critique's fixes are applied and override the brief where they differ). Nothing in
the app is implemented yet.

## The big finding: merge upstream first

Upstream Orca is 4,106 commits ahead of our fork point (`ae3d380b23`, 2026-09-23). It already shipped
answers to most of these concerns in `native-chat/`, a folder our fork has never touched (392
upstream commits, about 100k lines). Rebuilding those ourselves would waste weeks and make every later
merge worse. So the plan is: **merge upstream, then add a thin, fork-owned layer ("Ledger") for what
upstream still lacks.**

| # | Concern | Upstream already has | Ether adds (Ledger) | Phase |
|---|---|---|---|---|
| 1 | Cmd+F missing | Find bar in the transcript (`ebb192e3e5`) | Nothing | 0 |
| 2 | Linear ticket not visible to the agent | Nothing | Linked issues as composer chips, sent as a visible block on the first message, plus "Send update" when the issue changes | 2 |
| 3 | Visualizations | Inline image / HTML / mermaid visuals with pan-zoom viewers and "open in tab" (`c785c986c2`, `86e42a37be`, `524fa0039b` …) | Nothing | 0 |
| 4 | Permissions between manual and yolo | Per-chat picker: Ask / Accept edits / Approve for me / Full access (`2233fd3669`), with a global default | Nothing new; the approval UI changes below | 0 |
| 5 | Too many subagents, unasked | Nothing | Subagent policy chip (Off / Ask first / Auto up to N) and a pre-spawn card | 2 |
| 6 | Can't click subagents / see what one is doing | Child rows in collapsible sections under the roster (`21124db4d5`) | **Peek pane** opened from the sidebar, the chat roster, or the dock lanes; subagent **lanes** in the dock | 1 |
| 7 | Tool and approval rendering | Tool runs as sentences, compact lists, diffs inline (`6c693edf40`, `e08ba9f36d`, `8a7d19e330`). Approval cards restyled. **Codex auto-review verdicts are still big amber cards.** | Per-tool renderers (no JSON by default), approval as a 12px shield glyph with a hover card, compact docked approval bar, "Outside sandbox" chip | 1 |
| 8 | No way to go back | Rewind from any user message (`768c1ea967`, `de849c1416`, `e02e8f5bcb`) | Nothing | 0 |
| 9 | "What is it working on?" | Live activity line with current tool (`56e691344f`) | The **dock**: plan row, lanes, and a now line with the running step's own elapsed time and output tail; sticky turn header; settled header as a receipt | 1 |
| 10 | More poor tool UI (raw JSON, `message:system:*`) | Most raw frames became readable rows (`9dea72f0ae`, `a0a7535b63`); a generic fallback remains | Name the remaining Claude system frames (`code_change_published` → "Pushed … · opened PR #848"; `vcs_state_changed` hidden) | 1 |
| 11 | Stuck "Working" after cancel | Working only while the agent holds the message (`216e3e42a6`, `92732bb0f9`), plus a series of stop fixes | Honest stop states: Stopping… → Stopped, or after 10s "Couldn't confirm the stop" with Retry / End session | 0 (fix), 1 (states) |
| 12 | No subagent model / effort | Row data carries an optional `model` but nothing shows it | `sonnet·med` chips on lanes, the peek, the batch row and sidebar rows | 1 |

## Why it feels bad today

1. **Severity is inverted.** Permission metadata gets an amber card; the actual work (command, output,
   diff) hides behind a chevron and raw JSON.
2. **One renderer for every tool.** Expanding any tool dumps its input as JSON.
3. **Subagents are labels, not places.** You can see they exist but can't go into one or tell what
   model it runs.
4. **The present is invisible.** A long turn reports total elapsed time, not which step is running,
   for how long, or how far through the plan it is.
5. **Claims outlive evidence.** "Working" persists after the agent stopped; the agent's knowledge
   (Linear) and powers (delegation) can't be seen or reviewed.

Root cause of the stuck "Working" (traced in our tree): a message sent during or just before a cancel
stays `pending` forever, and any pending message counts as working
(`hasUnansweredStructuredAgentSessionDispatch`, `shared/structured-agent-session-projection.ts`).
Nothing on the cancel path settles it; only a process exit does. Upstream `216e3e42a6` / `92732bb0f9`
change exactly this rule ("Working only while the agent holds the message"), so the merge should fix
it. Verify with a regression test after the merge before adding anything of ours.

## Direction: "Ledger"

**The work is the record, permission is a margin note, and the present is docked.**

```
┌ Claude Chat  opus·high ─────────────────────────────────── ⌕ ⋯ ┐
│                     double check the matrix list (you)   ▐      │
│ ⟳ Working 4m 12s · 23 steps · 4 subagents     Jump to now ↓     │ sticky
│ I'll split this by provider and verify each cell.               │
│ ☰ Read 4 files, searched 1 pattern               14 matches ›   │
│ ⚇ Running 4 subagents ⟳⟳⟳⟳        sonnet·med  2m 43s · 140k     │
│ >_ Run the pricing matrix specs  bundle exec rspec   4.2s exit 1 ◇│
├─ dock ──────────────────────────────────────────────────────────┤
│ › Plan 3/7 · Verify Portkey, Bifrost, TrueFoundry, Cloudflare   │
│ ⌄ 4 subagents · 3 working · 1 done                       140k   │
│   ⟳ Portkey    sonnet·med  Searched "portkey" in lib/  35k 2:43 │
│   ⟳ Cloudflare sonnet·med  Fetching developers.cloudflare… 39k 2:24│
│ ⟳ Run the pricing matrix specs · 1m 04s           ▸ output     │
│   ..............F......                                         │
├─────────────────────────────────────────────────────────────────┤
│ [ETH-40 Matrix audit ✓] [+ Context]                             │
│ Message Claude…                                                 │
│ [+] [Opus 5.5 · High ▾] [✋ Ask for approval ▾] [⚇ Auto ≤3 ▾] ◔ ↑ │
└─────────────────────────────────────────────────────────────────┘
```

Peek: side by side when the chat pane is at least 900px wide, otherwise it replaces the transcript
with a back breadcrumb. No permanent inspector panel. It would repeat the dock, cost about 300px, and
take the right sidebar that [07_assistant](07_assistant.md) wants.

Rules the mockup follows:

- **No JSON by default anywhere.** Raw input and events stay behind "Copy raw event".
- **Show each thing once.** The transcript is the record and has no live clocks. The dock owns the
  present. The approval bar repeats the command only when its transcript row is scrolled out of view.
  Stop exists only on the composer button.
- **Colour only for state.** A plain approval shows a faint shield only on row hover; medium/high-risk
  (warning) and blocked (destructive) shields always show. "Outside sandbox" is the one always-amber
  chip.
- **No interactive content in hover cards.** Linear context options open in a click popover.
- **One status line, never two that disagree.** No "Cancellation requested." under a spinner.
- **Unverifiable is not finished.** When a stop can't be confirmed, the spinner stops, the sidebar
  shows a hollow dot, and Needs you lists it last without counting it (vocabulary: `live` /
  `unverifiable` / `exited`).
- **Questions appear only in Needs you** (Desk rule). Hovering a Needs you approval expands it in
  place (command, Allow, Open, "Claude is paused · 3m"), so an agent in another Workspace is
  unblocked without switching. Only a single plain approval qualifies; anything session-wide opens
  the chat.
- **Copy never claims more than the data supports.** After a stop the sidebar says "Stopped after
  11m 54s", not the last reply. The plan names only subagents that actually started. Rule syntax
  such as `Bash(bin/rails db:*)` reads as "Always allow `bin/rails db:…` in this chat".

## Phases

### Phase 0: merge upstream (prerequisite)

Worked through in [upstream_merge_1/](upstream_merge_1/README.md). It closes concerns 1, 3, 4, 8 and
most of 11, and deletes our OpenCode chat in favour of upstream's. After the merge, reproduce the
cancel bug (a message sent during a cancel, for Claude and Codex) before changing anything: upstream
`216e3e42a6` / `92732bb0f9` target exactly that rule.

### Phase 1: Ledger core (concerns 6, 7, 9, 10, 11, 12)

All new UI lives in fork-owned files (`native-chat/ether-*.tsx`, `shared/ether-*.ts`) with small hooks
into upstream components, per the fork hygiene rule.

1. **Tool renderers.** A per-tool registry consulted by upstream's `NativeChatToolLine` before its
   generic body: Bash (Claude's `description` as the sentence, command in faint mono; expanded:
   highlighted command with heredocs unescaped plus a 6-line output tail), Read, Edit/Write (inline
   diff, at most 12 lines, then Open diff), Grep/Glob (matches grouped by file), Skill, WebFetch /
   WebSearch, MCP (server faint, tool and identifying argument prominent, args as key/value), and a
   key/value fallback. "Outside sandbox" chip when `dangerouslyDisableSandbox` is set.
2. **Approval glyph.** Attach approval provenance to the tool call it approved as a new **optional**
   field (safe for mixed versions, per [remote wire compatibility](../docs/reference/remote-wire-compatibility.md)).
   Sources: Claude/Codex prompt answers (you / session rule / mode), and Codex auto-review. For Codex,
   read the structured `item/autoApprovalReview/completed` frame (currently suppressed as
   `status-chrome` in `provider-frame-disposition.ts`) instead of the `guardianWarning` text. If the
   frame lacks risk / authorization / item id, parse the warning text and match the next exec in the
   turn. Unmatched verdicts become one faint row. Old clients keep today's warning row.
3. **Docked approval bar.** Restyle upstream's `NativeChatApprovalCard` placement into the dock:
   1 / 2 / 3 keys, Esc folds to a strip, "1 of N" with `]`. Only the pending request being answered
   expands in the transcript (the next one reads "Waiting for you · 2 of 2"). The bar is header plus
   buttons (about 64px) and shows the command only while that row is out of view. Deny reveals "Tell
   Claude what to do instead". Needs you rows can answer a single plain approval in place.
4. **Dock.** Order: approval, pre-spawn card, plan (upstream `NativeChatDockedTaskList` collapsed to
   one line), subagent lanes (replace `NativeChatBackgroundTasksStatus`), queued messages (upstream),
   now line. Cap at 40% of the pane. Lanes start collapsed above 4 rows, and the collapsed row names
   a failure if there is one ("Cloudflare failed"). Below 600px the lanes drop the model and token
   columns.
5. **Now line and turn headers.** Running step with its own elapsed time; the last 3 output lines
   show on hover;
   sticky turn header with steps, subagents and "Jump to now"; settled header as a receipt ("Worked
   for 6m 33s · 3 commands · 1 file · +12 −3 · 1 failed").
6. **Peek pane.** Render a subagent's journal rows (by `agentId`; upstream's
   `native-chat-subagent-sections.ts` already selects them) in a side pane instead of inline:
   breadcrumb, `[` / `]` between siblings, prompt from the Task input folded to one line, Stop
   subagent, Open as tab. When it takes over a narrow pane, a 28px parent strip keeps the main
   agent's state and Stop. Open it from lanes, the batch row and sidebar child rows: route sidebar
   activation (`DashboardAgentRow.tsx`, `worktree-card-compact-agent-row.tsx`) with a peek target.
   Upstream's inline sections stay under ⋯ › Show inline.
7. **Model / effort chips.** Prefer the hook snapshot's actual `model`; else the model requested in
   the Task input, shown in italics with the tooltip "Requested in the Task call"; else nothing.
   Effort only when the provider reports it. Never guess.
8. **Stop states.** After 10s without confirmation (20s over SSH; deferred ~200ms for visible
   feedback), "Stopping…" becomes "Couldn't confirm the stop. The agent may still be running." with
   Retry stop and End session. While unverifiable, Send queues. Mirror the state in the sidebar.
9. **System frames.** Add the remaining Claude `message:system:*` subtypes to the `claude` table in
   `provider-frame-disposition.ts`: give `code_change_published` a notice and hide `vcs_state_changed`
   (the footer owns git state).

### Phase 2: inputs the user controls (concerns 2, 5)

1. **Subagent policy.** A fork-owned composer chip next to upstream's permission picker: Off / Ask
   first / Auto up to 2, 3, 5 or 8. Global default in Settings › Agents with per-agent exceptions.
   Claude: enforced in the structured adapter's tool-permission path for the Task/Agent tool. Calls
   that arrive within about 300ms batch into one pre-spawn card ("Start 3 selected", "Start all 9",
   "Do it without subagents"). Shared type and model go in the card header ("9 × general-purpose ·
   sonnet·med"); at most 6 rows show, then "+3 more". Denials carry an instruction to continue inline. Codex: no spawn gate,
   so the policy is appended to `developerInstructions`, and the copy says "Instruction only". Both
   also get a short system-prompt line ("Only use subagents when the user asks or the task clearly
   splits; at most N at once").
2. **Linear context.** In a Workspace with linked issues, a new chat shows them as composer chips,
   included by default. Clicking a chip opens a popover to include or leave it out
   and to toggle description / comments / sub-issues / links, with a token estimate. On send, the
   context is appended to the user message as a
   delimited block that the transcript renders as a collapsible "Included ETH-40 · description,
   4 comments" row, collapsed by default. The agent sees exactly what the user sees; nothing goes in a
   hidden system prompt.
   If the issue changes after sending: "Updated since sent · Send update". Plug in at the renderer
   first-prompt path (`local-workspace-agent-launch.ts`) and the `LocalWorkspace.linearIssues` data.
   Fetch through the existing Linear client, on the execution host for SSH.

### Phase 3: above and beyond (toward 07_assistant)

- **P1 · Turn receipt at the "New" line.** Built only from events (no model): duration, commands,
  subagents, files changed, failures, PR opened, follow-ups.
- **P1 · Capture to Inbox** (⌘/Ctrl+⇧K) from any selection or output, with origin chat and step;
  the chat's context is untouched. Shares the Desk Inbox from [03](03_sidebar-plan.md).
- **P2 · Possible follow-ups.** Things a settled turn mentioned in passing, one click each to the
  Inbox. Nothing is captured automatically.
- **P2 · Aging attention.** Needs you shows "waiting 14m"; optional OS notification after N minutes.
- **P2 · All agents.** A Cmd+J scope listing every live agent and subagent across Workspaces with its
  now line; Enter opens the peek.
- **P3 · Resume brief.** A "where you left off" summary generated outside the agent's context and
  labelled as generated.

## Verification

- Unit tests: tool renderer selection and fallbacks; approval provenance matching (item id, next
  exec, unmatched); model/effort source precedence; stop-state timer (local and SSH); delegation limit
  and batching; Linear block formatting and the drift check.
- Regression test for the stuck-working bug: a message sent during a cancel, for Claude and Codex,
  must settle (`exited` or `unverifiable`), never stay pending.
- Wire compatibility: an old client reading a new host still shows today's auto-review row; a new
  client reading an old host shows no glyph.
- `pnpm tc`, targeted `pnpm test`, `pnpm run check:code-quality:changed`.
- Rendered checks of the real app via the `$electron` skill (CDP screenshots,
  `ORCA_BACKGROUND_LAUNCH=1`), dark and light, at chat widths 480 / 720 / 1100.

## Decisions

Decided 2026-10-22:

- **Merge upstream first**, as a merge (not a rebase or cherry-picks). The end-to-end plan is in
  [upstream_merge_1/](upstream_merge_1/README.md).
- **Delete our OpenCode chat** and use upstream's ACP OpenCode. Multi-root support for it is not
  needed.
- **Subagent default: Auto up to 3.** Over the limit, the request becomes one pre-spawn card.
- **Linear issues are included by default** in a new chat's first message; click a chip to leave
  one out.
- **No silence indicator.** Lanes and the peek show what each subagent is doing, so "No output 1m
  40s" adds nothing. Quiet agents are not promoted to Needs you.

Still open:

1. **Answer approvals from Needs you.** In-place expansion with Allow for a single plain approval
   (recommended, shown in the mockup's Approval scene; toggle "Allow from Needs you"), or never.
2. **Peek vs tab** for long-lived Codex subagents: is "Open as tab" enough?
