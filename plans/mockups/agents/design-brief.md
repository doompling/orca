# Agent experience: design brief

Date: 2026-10-22. Answers [04_agents.md](../../04_agents.md), sets up [07_assistant.md](../../07_assistant.md),
fits the Desk sidebar ([03_sidebar-plan.md](../../03_sidebar-plan.md)). Baseline is upstream
`native-chat/` after the merge. Tokens are from `main.css` (upstream `--chat-*` family plus
`--agent-question`, `--status-warning`, `--destructive`).

## 1. Diagnosis

1. **Severity is inverted.** Permission metadata gets an amber card while the actual work (the
   command, its output, the diff) hides behind a chevron and raw JSON.
2. **One renderer for every tool.** Upstream gives tools a verb ("Ran", "Edited"). Expanding one
   still dumps the input as JSON, and unmapped frames (`code_change_published`) show up as raw rows.
3. **Subagents are labels, not places.** You can see they exist, but you can't go into one, compare
   them side by side, or see what model they run on.
4. **The present tense is invisible.** A long turn reports total elapsed time. It doesn't say which
   step is running, for how long, or how far through the plan it is.
5. **Inputs and claims aren't checked.** The agent's powers (delegation) and knowledge (Linear) can't
   be seen or reviewed before a turn, and its status ("Working") outlives the evidence for it.

## 2. Direction: "Ledger"

**Principle: the work is the record, permission is a margin note, and the present is docked.**
Every tool call is a line item with its own proof (exit code, duration, diff, match count).
Approvals sit in the margin as a 12px glyph. Whatever is happening *now* (current step, plan,
subagent lanes, stop state) lives in one dock above the composer, which never scrolls away.

**Where I land:** chat panel, dock, and a **peek pane** for subagents that sidebar rows deep-link
into. **No permanent inspector**: it would duplicate the dock, cost 300px, and take the right
sidebar that 07 wants for the assistant.

### Chat panel

Legend: `◇` approval glyph, `⟳` working, `✓` done, `○` unverifiable.

```
┌ Claude Chat  opus·high ─────────────────────────────── ⌕  ⋯ ┐
│                      double check the matrix list (you) ▐   │
│ ─ Working 4m 12s · 23 steps ─────────────── Jump to now ↓ ─ │ sticky turn header
│ I'll split this by provider and verify each cell.           │
│ ▸ Read 4 files · Searched "cell" 14 matches        ⌄        │ folded run
│ ⑂ Started 4 subagents   ⟳⟳⟳✓              2m 43s · 209k     │
│ >_ Run Gmail RSpec suite  bundle exec rspec  ◇  exit 1 4.2s │
│ ✎ Edited  matrix.yml                       ◇  +12 −3        │
├─ dock ──────────────────────────────────────────────────────┤
│ ▸ Plan 3/7 · Verify Bifrost cells                           │
│ ⟳ Portkey      sonnet·med  Read providers.ts      58k  2:43 │
│ ⟳ Bifrost      sonnet·med  Grep "price"           53k  2:37 │
│ ⟳ Cloudflare   sonnet·med  No output 1m 40s       51k  2:24 │
│ ✓ TrueFoundry  sonnet·med  Done · 6 cells checked 45k  2:31 │
│ ⟳ Running  bundle exec rspec spec/gmail · 1m 04s    [Stop]  │ now line
├─────────────────────────────────────────────────────────────┤
│ [◫ ETH-40 Matrix audit] [+ Context]                         │
│ Message Claude…                                             │
│ [opus·high ▾] [✋ Ask for approval ▾] [⑂ Ask first ▾]  ◔  ↑  │
└─────────────────────────────────────────────────────────────┘
```

Peek (chat pane at least 900px wide: side by side; narrower: it replaces the transcript with a
breadcrumb):

```
┌ parent transcript (live) ──────┬ ‹ Claude Chat › Portkey   [] ✕ ┐
│ …                              │ ⑂ general-purpose · sonnet·med │
│                                │ ▸ Prompt "Check every Portkey…"│
│                                │ Read providers.ts   L1–220     │
│                                │ Searched "price" 9 matches     │
│                                │ ⟳ Reading pricing.md · 12s     │
│                                │ [Open as tab]  [Stop subagent] │
└────────────────────────────────┴────────────────────────────────┘
```

### Sidebar agent area (Desk)

```
▌ Matrix audit            ETH-40   now      ← open Workspace
    ⟳ Claude Chat  Splitting by provider…   opus·hi
       ⟳ Portkey      Read providers.ts
       ⟳ Bifrost      Grep "price"
       ✓ TrueFoundry  6 cells checked
       +1 more
▌ Gmail RSpec             ⑂3 ⟳     12m      ← not open: children fold into a chip
```

**Alternatives:** *Inspector panel* (plan, lanes, approvals in a right column): always visible,
but costs width and the assistant's slot. *Subagent tabs*: full detail, but nine tabs after one
fan-out, and the link to the parent breaks.

## 3. Per-gap design

### 3.1 Tool line anatomy

**At rest**, a 26px row, 13px Geist (prose stays 14px):
`[16px icon slot][verb, --chat-foreground-faint][target, --chat-foreground, truncate][flex]`
`[meta: 11px mono tabular-nums, faint][◇ glyph slot 12px][chevron 14px]`.
The chevron slot is always reserved so carets line up, but it is visible only on hover, focus or
open. Hovering lifts the target to `--chat-foreground-strong`.

**Expanded**: indent 24px. Blocks use `--chat-code-surface` / `--chat-code-border`, `rounded-md`,
12px mono, max-height 240px, then "Show all (214 lines)". **No JSON anywhere by default.** The
last resort is a key-value table, and raw JSON sits behind `⋯ › Copy raw event`.

**Running**: `Loader2` replaces the icon; own elapsed time after 3s; up to 3 lines of streaming
output tail. **Failed**: icon `text-destructive/70`, `exit 1` in destructive; the fold header says
"1 failed" but doesn't auto-expand. **Folds** keep upstream grouping with a summary meta ("Ran 3
commands, edited 2 files · +40 −12 · 1 failed").

| Tool | At rest | Expanded |
|---|---|---|
| **Bash** (`SquareTerminal`) | Claude's `description` as the sentence ("Commit, push branch, and open PR"), then the command in faint mono if it fits. Meta: `4.2s` (only if over 1s), `exit N` only when non-zero. **`Outside sandbox` chip** (`ShieldOff`, `--status-warning`) when `dangerouslyDisableSandbox` is set. | Command block with heredocs unescaped and highlighted, then the **output tail**: last 6 lines, "Show full output". Copy buttons for each. |
| **Read** (`Eye`) | `Read` + file pill + `L40–120`; runs fold to "Read 6 files". | Pills open at the range. |
| **Edit/Write** (`Pencil`) | `Edited matrix.yml` with `+12 −3` in `--chat-diff-added/removed`; `Created foo.ts +84`. | Inline diff, at most 12 lines, then "Open diff" (diff tab). |
| **Grep/Glob** (`Search`) | `Searched "useNativeChat" in src/` · `14 matches in 6 files`. | Matches by file, each opens. |
| **Skill** (`Wrench`) | `Used skill` + upstream `NativeChatSkillPill`. | Skill description, not "Launching skill: …". |
| **WebFetch / WebSearch** (`Globe`) | `Fetched docs.anthropic.com › hooks` · `34 KB`; `Searched web "…"` · `8 results`. | Prompt + first 6 lines; title + domain list. |
| **MCP** (`Plug`) | `linear` (faint) `get_issue` + the most identifying arg (id, key, query, title). | Args as key-value table; result as markdown. |
| **Task/Agent** (`Bot`) | `Started Portkey` + model·effort chip + state; batches: "Started 4 subagents ⟳⟳⟳✓". | Opens the peek, not inline. |
| **TodoWrite** | No row; updates the docked Plan. | |
| **Unknown frames** | Known ones become notices ("Pushed to origin/srv-109"); `vcs_state_changed` hidden (footer owns git); the rest only under "Show system events". | |

Keys (transcript focused): `↑/↓` between rows, `Enter`/`Space` toggles, `⌘/Ctrl+Enter` on a pill
opens in a split, `⌘/Ctrl+C` copies the command or path.

### 3.2 Approval verdict glyph and hover card

Sits in the approved tool line's meta slot. Upstream routes Codex `guardianWarning` frames to
`error-surface`; reclassify them as an **annotation** of the matching call (item id, else the next
exec in the turn).

| Glyph (size-3) | Meaning | Colour |
|---|---|---|
| `ShieldCheck` | Approved by auto-review, low risk | `--chat-foreground-faint` |
| `ShieldCheck` | Approved by you or a session rule (the hover card says which) | faint |
| `ShieldAlert` | Auto-review approved, but rated risk medium or high | `--status-warning` |
| `ShieldX` | Denied; the row reads "Blocked by auto-review" | `--destructive` |

No approval event: no glyph. **Amber only for a real warning.** Hover card (`HoverCard`, 300px,
`--popover`, `shadow-floating`, 12px; focus + Enter opens it):
```
AUTO-REVIEW · APPROVED                     12:41:03
Risk low · Authorization high
Running Gmail's full RSpec suite in its isolated
test database is a local validation step with no
production or external effects.
Codex auto-review                 Copy raw event
```
Unmatched verdict: one 12px faint truncated row, `◇ Auto-review approved: <reason>`.

### 3.3 Interactive approval prompt

1. **Transcript**: the pending tool line auto-expands (the command or diff *is* what you approve),
   glyph `ShieldQuestion` in `--agent-question`, meta "Waiting for you".
2. **Docked bar** replaces upstream's card: 28px header (`ShieldQuestion`, "Run this command?", cwd
   in faint mono), body clamped to 120px, one row of `xs` buttons: `[Allow 1]` (default) `[Always
   allow "bundle exec rspec" in this chat 2]` (outline; wording from the provider's real rule scope)
   `[Deny… 3]` (ghost, never destructive). Deny reveals "Tell Claude what to do instead".

Keys when focused (it takes focus unless you're typing): `1/2/3` (Claude Code muscle memory),
`Enter` = Allow, `Esc` folds it to a 24px strip. Several pending: "1 of 3", `]` for next.

### 3.4 Subagent drill-in: peek pane

**Picked: peek.** Inline sections interleave nine children into the parent's story; tabs are too
heavy for something ephemeral and subordinate. A peek keeps the parent visible, opens in one
action, closes with Esc.

- **Opens from** a lane, the Task row, the roster entry, or a sidebar child row (which opens the
  parent chat with the peek on that child).
- **Header** (36px): `‹ Claude Chat › Portkey`, `[`/`]` between siblings, Open as tab, `✕`.
  Sub-header: type (hidden for `general-purpose`), model·effort chip, tokens, elapsed. Prompt from
  the Task input, folded to one line.
- **Body**: the child's journal rows (by `agentId`) as Ledger lines with its own now-line.
  Read-only; footer `[Stop subagent]`.
- **Layout**: split at chat pane width 900px or more (44% default, min 360px, resizable), else it
  takes over with a back breadcrumb. Upstream inline sections stay under `⋯ › Show inline`. "Open
  as tab" serves long-lived Codex `spawn_agent` children.

### 3.5 Subagent lanes

Replaces the "4 agents — 4 working" strip, in the dock. 28px rows, 12px: `state · label (13px) ·
model·effort · current activity (child's latest tool sentence, faint) · tokens · elapsed (mono,
right)`. Hover swaps tokens/elapsed for `[Open] [Stop]` in a fixed-width slot (no shift).
Collapsed: `⑂ 4 subagents · 3 working · 1 done ⟳⟳⟳✓`. Max 5 rows then scroll; failed first,
finished dim. **Honest silence**: after 60s without events, "No output 1m 40s". Keys: `⌘/Ctrl+.`
focuses the dock, `↑/↓`, `Enter` peeks, `Esc` back to composer.

### 3.6 Model/effort chips

11px mono, faint, borderless: `sonnet·med`, `opus·high` (`min/low/med/high/max`). Actual model
from the hook snapshot; else the requested one with tooltip "Requested in the Task call"; else
nothing. Also in the chat header. Sidebar: `opus·hi`, only at 280px or wider.

### 3.7 Delegation policy control

A 24px composer chip (`Bot` + value, `DropdownMenu`) beside the permission picker, as **its own
fork-owned component** so upstream's picker stays untouched:

- **Off**: "Don't use subagents"
- **Ask first**: "Ask before starting any"
- **Auto, up to N** (2 / 3 / 5 / 8): "Start up to 3 at once; ask beyond that". Exceeding N asks; it
  never fails silently.

Global default in Settings › Agents with per-agent exceptions. **Copy says how it's enforced**:
Claude via a `PreToolUse` hook on Task ("Enforced"); a provider without a hook gets "Instruction
only for Codex". **Pre-spawn card** (approval bar slot); Task calls within about 300ms batch:
```
⑂ Claude wants to start 9 subagents        Limit for this chat: 3
☑ Matrix cells: Portkey      general-purpose · sonnet·med  "Check every…"
☑ Matrix cells: Bifrost      …
☐ …
[Start 3 selected  ⏎]  [Start all 9]  [Do it without subagents]
```
"Do it without subagents" denies with an instruction to continue inline. `Space` toggles, `Esc` folds.

### 3.8 Linear context chips

A chip row inside the composer above the field: `[◫ ETH-40 Matrix audit ✓]` (22px, 12px,
`secondary`) and `[+ Context]` (issue picker, `Command` in `Popover`).

- Linked issues appear in a new chat, **included by default in the first message**; click to
  exclude (chip dims).
- Hover card lists exactly what goes in, with toggles (description, comments 4, sub-issues 2,
  links) and "about 1.2k tokens".
- On send it's appended as a **visible, collapsible block** on the user message, never a hidden
  system prompt: `◫ Included ETH-40 · description, 4 comments`. If the issue changes later: "Updated
  since sent · [Send update]".
- Setting: "Include linked Linear issues in new chats: Always / Ask / Never".

### 3.9 Live turn view

Upstream's activity line names the step but not its duration, history or progress. Add:

- **Sticky turn header** once the turn top scrolls away: `Working 11m 47s · 23 steps · 3 subagents ·
  Jump to now ↓`.
- **Now line**: the live tool line itself, `⟳ Running bundle exec rspec · 1m 04s` plus 3-line tail.
  **Per-step elapsed** is the real answer to "what is it working on".
- **Plan row**: upstream `NativeChatDockedTaskList` collapsed to `▸ Plan 3/7 · <current item>`.
- **Settled header**: `Worked for 6m 33s · 14 commands · 6 files · +210 −48 · 1 failed ›`.
- Dock order: approval, plan, lanes, queue, now line; max 40% of pane, plan and lanes collapse first.

### 3.10 Stop states

One status line, never two that contradict each other ("Cancellation requested" plus a spinner).

| State | Shown | Visual |
|---|---|---|
| `live` | `Working 11m 47s` | `Loader2` spin |
| Stop requested | `Stopping…` (immediately) | spin, Stop button disabled |
| `exited` (provider confirmed turn end or process exit) | `Stopped after 11m 47s` | `Square` faint; composer ready |
| `unverifiable` after 10s (20s over SSH) | `Couldn't confirm the stop. The agent may still be running.` `[Retry stop] [End session]` | **spinner stops**; hollow `○` |

Sidebar mirrors it (hollow dot, never counted done, last in Needs you). While unverifiable, Send
becomes "Queue" ("Sends when the agent is confirmed idle"). `Esc` twice in an empty composer stops
(chip in the Stop tooltip).

### 3.11 Sidebar agent rows

Extends Desk `.ag` rows (24px, 12px, indent 28px); children are 22px at indent 40px, no tree lines.

- **Open Workspace**: up to 3 children per agent, then `+n more` (expands in place); order: needs
  you, failed, working, done.
- **Other Workspaces**: children fold into a `⑂3` chip (spinner if any works), per the Desk
  visibility rule.
- **Child row**: state, `description` label, activity on hover (replacing time), chip at 280px+.
  Click opens the parent chat with the peek on it; right-click: Open as tab / Stop.
- Questions still appear only in Needs you (Desk rule).

## 4. Above and beyond

- **P1 · Turn receipt at the "New" line.** Returning to unseen turns shows a receipt built only from
  events (no LLM): duration, commands, files changed, failures, open questions.
- **P1 · Capture from the transcript.** Select any text or output, `⌘/Ctrl+⇧K`, and it lands in the
  Desk Inbox with origin chat, step and selection. Task A's context is untouched.
- **P2 · Follow-up harvest.** A settled turn that says "I also noticed…" gets a faint `2 possible
  follow-ups ›` row; one click per item sends it to the Inbox. Nothing is captured automatically.
- **P2 · Aging attention.** Needs you shows "waiting 14m"; optional OS notification after N
  minutes; an agent quiet for 5 minutes promotes to Needs you as "Quiet 5m".
- **P2 · All agents view.** A Cmd+J "Agents" scope lists every live agent and subagent across
  Workspaces with its now-line; Enter peeks. Seed of 07's kanban.
- **P3 · Resume brief.** "Where you left off", generated outside the agent's context and labelled
  "Summary · generated", for the chat top, the Desk resume card and the 07 assistant.

## 5. Mockup spec

**Screens**: (1) settled turn with every tool variant, `Outside sandbox` chip and a failed command;
(2) the same with a **Baseline toggle** showing today's upstream (amber cards, JSON); (3) live turn
with sticky header, now line, plan and 4 lanes; (4) peek split (1100px) and takeover (720px) with
sibling stepping; (5) approval bar for a command, an edit diff, deny-with-note and 3 queued;
(6) pre-spawn card, 9 requested, limit 3; (7) Linear chips, inclusion hover card, sent row with
drift; (8) stopping, stopped, unverifiable, retry; (9) Desk sidebar: open Workspace with children,
closed Workspace with chip, Needs you with an approval and an unverifiable agent; (10) turn
receipt, capture popover, follow-up row.

**Toggles**: theme · grayscale · provider (Claude / Codex: approval kinds, auto-review,
enforcement caption) · permission mode · delegation policy · chat pane width (480 / 720 / 1100) ·
sidebar width (220 / 300 / 380) · Baseline vs Ledger · Show system events · reduced motion.

**Simulated events**: agent asks approval (Bash, then Edit) · auto-review approves low risk /
approves medium risk / denies / unmatched verdict · spawn 4 (lanes update, one fails, one goes
quiet 90s) · spawn 9 over limit · plan update · long silent step · cancel to stopped · cancel,
stuck, unverifiable, retry, exited · SSH contact lost mid-turn · Linear issue edited after send ·
unknown frame arrives · message queued mid-turn · return after away.

## 6. Open questions

1. **Delegation default**: Ask first, or Auto up to 3? (I recommend Auto up to 3, which would have
   turned the 9-subagent case into one card.)
2. **Linear inclusion**: include linked issues in a new chat's first message by default (my
   recommendation), or require a click?
3. **Answer approvals from Needs you?** I suggest yes for single "Allow once" only; anything
   session-wide opens the chat.
4. **Peek or tab** for long-lived Codex children: is "Open as tab" enough, or should children that
   outlive their turn open as tabs automatically?
5. **Silence indicators**: is "No output 1m 40s" reassuring or anxiety-inducing for you? Should it
   promote to Needs you after 5 minutes?
