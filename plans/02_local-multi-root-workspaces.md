# Local multi-root Projects and Workspaces

Date: 2026-09-25.
Current follow-up: [agent chat fixes, OpenCode, and Linear Workspace links](ether-agent-and-linear-follow-up.md)
were approved on 2026-09-26; that checklist tracks the new work in delivery order.

Status: local first-use acceptance complete. Ready to start using this fork for
the demonstrated local macOS workflows: files, independent saved contexts,
Codex/Claude terminals, and built-in Claude chat. All three agent paths passed real
multi-root work, separate-context checks, and normal Quit/reopen with continued
work. Further changes should follow actual usage, not the superseded plan.

The approved follow-on batch is also complete: standalone **Ether**, cold-runtime
recovery checks and maintenance notes, per-root worktree creation, and optional
file-layout copying. See [the maintained checklist](#8-approved-follow-on-work-and-deferred-options)
and [maintenance guide](../docs/ether-maintenance.md). Remaining ideas are deferred
options, not prerequisites for starting local work.

This is the active plan for the proposed restart. It supersedes the earlier
Project/Workspace/Task implementation scope and delivery order. Any retained
earlier code or plans are reference material, not dependencies or requirements to
preserve. Writing this plan does not reset the checkout, remove an implementation,
migrate profiles, or authorize deleting user data. Source references below were
checked against the current Orca checkout at `7a864a42f4`.

## 1. The outcome

Keep Orca's useful editor, terminals, agents, Git tools, and saved working state.
Change its organization so that:

- A Project contains multiple existing local directories, including Git checkouts
  and ordinary folders.
- A directory can belong to several Projects without being copied or moved.
- Each Project has named Workspaces: the independently saved items in the sidebar.
- Several Workspaces, within or across Projects, can use the same directories and
  branches while keeping separate tabs, drafts, layouts, and sessions.
- Every agent launched in a Workspace receives all of that Workspace's roots
  automatically and can actually work across them.
- Creating a Workspace does not create a branch, worktree, clone, or setup job by
  default. Separate checkouts remain an explicit option when isolation is wanted.

**A Workspace is an independently saved, multi-root working context, not
necessarily an isolated copy of the code.** Multi-root agent support is a first-use
requirement. A single-folder agent workflow is not an acceptable substitute.

### The example this implementation must support

Create a Project named **Full application** with `app_a` and `app_b`. Its initial
Workspace uses both existing directories. An agent opened there knows about both
and can read and edit both without the user adding directories manually.

Create another Project named **App A maintenance** containing only `app_a`. Its
agents receive that directory as their working context, not `app_b`.

Create another Workspace within Full application. It may reuse exactly the same
two directories. All three sidebar items have distinct working state even where
they reference the same physical checkout. Saving a file in shared `app_a` changes
the file available to all three; switching items restores each item's own tabs.

An existing separate worktree can replace `app_a` in one Workspace while its
`app_b` remains shared. This does not require isolating every root together.

## 2. Why default Orca is not enough, and what we learned

The normal Git workflow associates a working context closely with a checkout.
Repository organization also uses a single project-group membership. That makes
isolated branch work convenient, but does not directly express overlapping
Projects with independent views of shared directories.

Orca already saves tabs, drafts, layouts, and runtime associations. We are not
inventing that behavior. Upstream folder workspaces already have independent IDs
and directory paths, which is a useful starting point to investigate and reuse.
The missing product is first-class multi-root scope plus a distinction between
the identity of a sidebar item and the identity of its physical files.

Git's branch/worktree rules need not change: showing a checkout several times is
not checking out its branch into several new worktrees. A branch is a property of
one Git root, not the identity of a Project or Workspace. Uncommitted file changes
belong to the working directory; sidebar entries do not isolate those changes.

The previous attempt taught us to change the delivery approach:

- **Start from the visible workflow.** The old welcome buttons remained unchanged
  while the new model lived in a separate management surface. The replacement
  must be the normal create/open/switch experience, not a second system to learn.
- **Prove reuse before building a large model.** A stored Workspace is not useful
  if its terminal and agent panes are unavailable. Connect real tools early.
- **Test the actual launcher.** Bundled E2E tests missed a development-renderer
  Node-only import and the user received a white screen. A build or test count
  cannot stand in for an actual rendered launch through the handoff command.
- **Keep the scope local.** Cross-host ownership, historical migration, broad
  compatibility machinery, Tasks/Attempts, and advanced review are not needed to
  establish whether this workflow is useful.
- **Reuse the proven owners.** Do not duplicate Orca's session store, editor,
  terminal daemon, agent lifecycle, or Git implementation to get cleaner names.

New, concentrated fork-owned code is a means to reduce coupling, not a requirement
to rewrite code that already does the job.

## 3. Product model and behavior

### Project: the directories that belong together

A Project has a stable ID, a name, an ordered set of roots, and an explicit default
root for commands that need one working directory. A root has a stable ID, a label,
and a reference to an existing local directory. Roots need not share a parent.

Membership is many-to-many: adding `app_a` to another Project references the same
directory. It must not duplicate its Git registration, relocate files, copy
credentials, or transfer exclusive ownership from the first Project.

Root labels and ordering are presentation. Renaming or reordering a root must not
change the target of an existing tab or process. Duplicate resolved directories
inside one Project should be identified and explained rather than accidentally
presented as two independent copies.

### Workspace: the sidebar item and saved working context

A Workspace has its own stable ID, name, and owning Project. It includes every
root of that Project. By default it uses the Project's existing directories; an
explicit per-root checkout choice can select another existing worktree.

Its saved state includes open files and unsaved drafts, active tab, cursor/view
positions supported by Orca, splits, terminal tabs, agent sessions, and browser
tabs. Two Workspaces using identical directories must not share that state key.

Use **Workspace**, not **branch**, for this item. One Workspace might contain
`app_a` on `main`, `app_b` on `feature/search`, and a non-Git notes folder. Display
branch/status information per Git root rather than inventing one Workspace branch.

Creating another Workspace starts a separate working context over the same root
set. It does not clone the first Workspace's live processes or silently start an
agent. Copying a tab layout can be added later; it is not required for first use.

### Shared files, independent views

- Workspace switching changes the view, not Git branches, directories, or process
  ownership. Moving away from a Workspace must not terminate its running work.
- A branch switch performed explicitly in a shared checkout affects every
  Workspace using it. Their branch displays must reflect the actual checkout.
- Saving in one Workspace updates shared disk state. Clean views should refresh
  through existing file-change behavior. Dirty buffers must be preserved and a
  conflicting save must use existing conflict handling, not silently overwrite.
- Unsaved drafts are per Workspace. Opening the same file elsewhere must not
  collapse the two editor models or replace one draft with the other.
- Each Workspace has its own terminal/agent associations. They may operate in
  the same directory, but a shared directory alone must not make them share a
  conversation, PTY, or status badge. Reuse Orca's process/session IDs for this.
- Shared directories are not an isolation or concurrency guarantee. Concurrent
  agents can affect each other's files; show shared-checkout information without
  inventing locking, merging, or automatic worktree creation.

Removing a Project membership or a Workspace is an organizational action, never
an implicit filesystem or branch deletion. Archive/hide is the first-use removal
path and retains recoverable state. Any explicit close/stop/discard action keeps
Orca's existing prompts. Physical cleanup is a separate operation.

### Scope changes while work exists

Root membership and checkout choices must not silently retarget open files or
running agents. For the first version, use a simple restriction: changing the
root set or an existing checkout binding requires affected Workspaces to have no
live terminal/agent processes and no dirty buffers. Explain what must be closed;
do not stop or discard it automatically. Name/order changes remain available.

Retain the original root/directory reference on saved tabs. After a root removal,
an old tab can be closed or shown as unavailable; it must not open a same-named
file in another root. A missing folder is reported as missing, not replaced with
another checkout or an arbitrary current directory. More convenient live scope
editing is optional later work.

## 4. The normal user experience

### Create Project

**New Project** means choosing which directories belong together. **New
Workspace**, within a Project, means starting another independently saved working
context over those directories. The empty welcome screen emphasizes New Project;
New Workspace requires a selected Project rather than competing as an unrelated
top-level setup choice.

One flow asks for a name and one or more existing local directories. It shows
root labels and the default command directory. The first chosen directory can be
the initial visible default; reordering later does not change that choice.

Saving creates the Project and its **Main** Workspace, then opens it. Directory
registration required by Orca happens behind this flow. There is no separate
register-resource, attach-membership, or attach-source procedure for the user.

### Create and switch Workspaces

The sidebar groups Workspaces under Projects. **New Workspace** operates within
a Project, asks for a name, and reuses all its roots by default. The same checkout
may appear in several rows within one Project or across Projects without deduping
those rows. Each row is keyed by Workspace ID, never path or branch name.

Selecting a Project returns to its last-used Workspace. Selecting a Workspace
restores its saved state. Name, root labels, and per-root Git information make
overlapping contexts understandable without presenting them as isolated copies.

Existing alternate worktrees are selectable per Git root. Creating new worktrees
in this UI is optional follow-on work; using an existing one is part of the model.

### Work across roots

- File navigation and Quick Open include all roots, with root-qualified labels
  so two `src/index.ts` files remain distinguishable.
- Workspace file search covers all roots; reuse Orca's search per root and combine
  labelled results. Cross-root bulk replace is not a first-use requirement.
- A terminal uses an explicit root/default cwd. A terminal having one cwd does
  not narrow the Workspace or the roots supplied to its agent launch.
- Git status and actions identify their root. Reuse per-repository tools; do not
  imply one combined Git index, branch, commit, or cross-repository transaction.
- Agent launch includes all resolved roots automatically, as specified below.

Welcome actions, sidebar controls, shortcuts, and the normal agent entry point
must all use this model. Do not leave the old creation flow as the prominent path
with a hidden management workaround. Reuse [Orca's style guide](../docs/STYLEGUIDE.md),
tokens, and existing UI primitives; this is not an editor-wide visual redesign.

## 5. Implementation boundary: own the feature, reuse the tools

### New fork-owned code

Keep the small Project/Workspace model, local persistence, root resolution,
creation forms, and sidebar presentation together in clearly named feature
modules. Suggested locations are `src/shared/local-projects/`,
`src/main/local-projects/`, and `src/renderer/src/features/local-projects/`.
These are proposed locations, not files already implemented by this plan.

An illustrative minimum record shape is:

```text
Project
  id, name
  roots[]: id, label, existingDirectoryReference
  defaultRootId

Workspace
  id, projectId, name
  checkoutOverridesByRootId   // absent means use that Project root's directory
  optional defaultRootId

Resolved workspace context
  workspaceId
  roots[]: rootId, label, actualDirectory, optional existing Git handle
  defaultRootId
```

Keep branch/status observations derived from Git. Reuse existing directory and
checkout resolution rather than introducing a distributed WorkingCopy registry.
Resolve filesystem aliases consistently using existing path facilities; branch
names or string-prefix path matching are not physical identity checks.

Use the existing profile persistence mechanism for a small versioned local
namespace. Main-process code owns writes; renderer state is its UI cache. Reuse
existing serialization, validation, write ordering, and single-instance behavior.
Project plus initial Workspace creation must not publish a half-created state
after a failed write. Do not add a generic transaction/replay framework for this.

The existing session store remains the sole owner of saved views and runtime
associations. Project records must not contain a second copy of tabs or drafts.

### Orca integration points

There are two different identifiers at each boundary:

- **Workspace/context ID:** which saved view and session owns this operation.
- **Root and physical target:** which real file, checkout, or cwd it operates on.

Carry both where necessary. Do not substitute the default root's path for a
multi-root context, manufacture a Git checkout, or route everything through the
first root. A read-only adapter into an existing Orca view type is acceptable;
a second writable mirror of the model is not.

Investigate/generalize existing folder-workspace support first. It already has
independent IDs, activation, terminal integration, and persistence. The narrow
adapter must prove that those facilities can address a multi-root Workspace and
its selected physical target separately. If a service only accepts a worktree
identity, add the smallest explicit context/root seam there. Do not promise that
changing the sidebar alone is enough, or rename every `worktreeId` in the repo.

Relevant integration areas to inspect against the chosen baseline:

- [Folder records and creation](../src/main/persistence/restoring-sessions/folder-workspace-operations.ts)
  and [folder activation](../src/renderer/src/store/slices/worktrees/session/set-active-folder-workspace.ts).
- [Saved session types](../src/shared/workspace-session-state-types.ts) and
  [renderer session persistence](../src/renderer/src/lib/workspace-session.ts).
- [Editor file identity](../src/renderer/src/store/slices/editor/file-ids/editor-file-ids.ts),
  editor-model identity, file watching, save/conflict handling, and restored drafts.
- [Workspace activation](../src/renderer/src/store/slices/worktrees/session/set-active-worktree.ts)
  and the existing workbench/tab/terminal/browser controllers.
- [Agent launch execution](../src/main/agent-launch/agent-launch-executor.ts),
  [TUI command construction](../src/shared/tui-agent-launch-command.ts), and the
  actual desktop provider path used by the selected agent. Not every existing
  launch surface currently goes through the same executor; trace the real one.
- [Welcome screen](../src/renderer/src/components/Landing.tsx), sidebar creation
  actions, workspace selection, and existing file/Git/search surfaces.

These links describe reuse candidates in the current checkout, not proof that
the previous attempt's modifications should be carried forward unchanged.

Keep Node-only filesystem/crypto/process code out of renderer-reachable modules.
Reuse the existing [renderer boundary test](../src/renderer/src/renderer-node-builtin-boundary.test.ts).
Where a runtime method is reused or extended, verify the actual desktop preload,
registration, and capability route too—not just a direct backend test.

### Future upstream updates

Aim for concentrated fork-owned modules and a short integration-change list:
which Orca entry point changed, why, and which focused test protects it. This is a
way to reduce merge friction, not a guarantee of conflict-free updates. Do not
build a general plugin platform or copy whole upstream subsystems to avoid a
small patch. Do not broaden shared remote behavior to make this local feature
work; retain runtime checks and existing execution boundaries.

## 6. Agent scope is a first-class contract

At launch, resolve all Project roots through the Workspace's checkout choices.
Pass that complete set, labels, and one explicit cwd to the existing provider
integration. Capture the concrete launch roots with that session so restoring or
resuming it cannot accidentally bind it to the currently selected Workspace.

A successful integration provides both:

1. **Context:** the agent is told the root names and real locations and that the
   work may span them, without the user repeating this in every prompt.
2. **Tool access:** the provider's actual tools can read and edit all those roots
   using supported directory/permission mechanisms and normal user approvals.

A prompt listing directories is not sufficient by itself. Nor is choosing a
common parent: sibling Projects might contain unrelated directories that should
not be added to context. Do not copy roots, create symlink forests, auto-approve
trust prompts, or turn off sandbox protections as a shortcut.

The required launch paths are **Codex in a terminal, Claude Code in a terminal,
and Orca's built-in chat**, as confirmed by the user on 2026-09-25. Start with
Codex, then deliver and verify the other two before handoff. Other agents/modes may
be unavailable with a clear reason until adapted; they must not silently run on
only one root or silently fall back to a narrower scope. A provider without a
supported implementation does not pass the agent requirement.

Read provider options from the installed integration/current official interface
during implementation rather than baking guessed flags into this plan. Reuse
Orca's account selection, process launch, permissions, session identity, and
status ownership. No second agent launcher or status store is introduced.

Project scope describes the context supplied to the agent, not a claim of an
airtight filesystem sandbox. An App A-only Project must not inherit App B from
another Project or a previously selected Workspace.

## 7. Delivery order and maintained checklist

Previous test counts and stored records do not complete a step in this replacement
implementation. Update these statuses with
actual evidence and remaining limits; this is the single live delivery checklist
for the restart, rather than the earlier plan's checklist.

- [x] **P0 — Establish a safe baseline and a working launcher.** Preserve any
      remaining prior-attempt or user changes in a recoverable form; agree on the clean
      Orca baseline and dedicated data directory before any reset/removal. Do not
      copy the entire previous model into it. Confirm the primary agent/provider,
      its launch mode, and supported multi-directory mechanism. Launch the exact
      documented dev command and inspect its rendered UI. Keep a baseline file,
      terminal, and normal Quit/reopen check before changing context ownership.
- [x] **P1 — Prove one real two-root Workspace through the normal UI.** Implement
      only the records/adapters and creation/sidebar UI needed to create a Project
      with two sibling directories and open its initial Workspace. Open/edit/save
      files from both, use the existing terminal, and launch the chosen real agent
      with both roots. Verify it reads and edits both without manual directory
      additions. Reuse existing owners throughout. If this boundary does not work,
      resolve it before adding management features; a metadata-only screen is not
      progress past this gate.
- [x] **P2 — Prove shared directories with independent saved contexts.** Add a
      second Workspace in the same Project and an App A-only Project using the same
      checkout. Ensure unique view/model/session IDs, separate drafts and layouts,
      correct session/status association, and no implicit process/branch changes on
      switching. Exercise a save/conflict across two views of the same file. Pass
      normal Quit/reopen for files, drafts, layouts and supported session recovery.
- [x] **P3 — Complete the everyday local interface.** Finish root-labelled file
      navigation/search, per-root Git targeting, existing-worktree selection,
      remembered Workspace selection, rename/archive, and clear missing/shared-root
      states. Connect welcome, sidebar, shortcuts and agent creation consistently;
      remove old-model entry paths from this fork's normal workflow. Preserve useful
      browser tabs and existing workbench behavior. No hidden management detours or
      placeholders for required editor/terminal/agent panes remain.
- [x] **P4 — Run the complete local acceptance journey and hand off.** Use the
      exact launcher and persistent isolated profile, complete the checklist below,
      and provide a short launch/use guide with actual limitations. Verify one
      profile writer and ordinary Quit/reopen. Call it ready only for the scope
      demonstrated. Subsequent work is driven by real usage, not completion of the
      superseded architecture.

P1 is deliberately a thin end-to-end slice, not a single-root release. P2–P4
remain necessary for the user's saved-context daily-work requirement. UI wiring
starts in P1; it is not postponed until an entire backend framework is complete.

### Launch and first-use guide

From this checkout in a macOS/Linux shell, use Orca's existing runner with a
dedicated, git-ignored profile:

```sh
ORCA_DEV_USER_DATA_PATH="$PWD/.orca-local-profile" ORCA_E2E_ENFORCE_SINGLE_INSTANCE_LOCK=1 pnpm dev
```

Keep the same profile path between launches. The second variable opts development
builds into Orca's existing single-writer lock; no new launcher is introduced.
The matching status command is:

```sh
ORCA_DEV_USER_DATA_PATH="$PWD/.orca-local-profile" node config/scripts/orca-dev.mjs status --json
```

Agent-run checks add `ORCA_BACKGROUND_LAUNCH=1` and use disposable roots and a
separate profile. Scripted E2E checks also isolate HOME; approved real-agent checks
instead reuse the existing CLI sign-ins. No personal repository was used. The
interactive command above deliberately does not hide the user's window and uses
the same verified runner/profile/lock options.

1. Choose **New Project**, add both directories, and select the default command
   directory. This creates **Main**; it does not create a worktree.
2. Use the Project's **+** for another Workspace. Add another Project with just
   `app_a` when the other application's context is not wanted.
3. Use the directory picker in the right sidebar for files, terminal cwd, and
   per-root Git. Saved files are shared; tabs and drafts belong to each Workspace.
4. Launch Codex or Claude Code through **New tab**. For built-in chat, enable
   **Chat UI** in Settings → Experimental, choose **Chat UI** as the default chat
   view, and enable **Use updated structured native chat**. Codex terminal, Claude
   terminal, and built-in Claude chat were verified with existing CLI sign-ins.
5. Project/Workspace action menus provide rename, archive/restore, and guarded
   directory/checkout editing. Close live work and save/discard drafts yourself
   before changing scope. Archiving does not delete the directories.

Windows uses the equivalent environment-variable syntax for its shell. No new
Windows/remote validation is claimed by the local macOS evidence.

To repeat the low-cost checks, use Settings → Agents → Manual before setting
per-agent Arguments. Codex used `--model gpt-5.6-luna -c model_reasoning_effort=low
-c service_tier=default --sandbox workspace-write --ask-for-approval on-request`;
Claude used `--model haiku --permission-mode manual --settings
'{"alwaysThinkingEnabled":false}'`. These are profile/session overrides, not edits
to global CLI preferences. Native chat has its own Model picker: explicitly choose
Haiku before Send and keep Fast off. Haiku has no effort selector. Later native
checks launched the app with `MAX_THINKING_TOKENS=0`; the first native task inherited
Claude's thinking default. This follows the existing
[Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference)
and [Claude environment controls](https://code.claude.com/docs/en/env-vars).
Do not press Reset on Arguments when repeating the checks: upstream defaults
include permission-bypass flags. The aggregate permission indicator can read Yolo
for custom safe arguments; the explicit arguments above retain normal permissions.

### Current implementation evidence — 2026-09-25

- Baseline `7a864a42f4`: the hidden, isolated Electron
  `golden-quit-relaunch-session.spec.ts` passed after an E2E rebuild. It restored
  the same file and live extra terminal after normal Quit/reopen. This proves
  the reused baseline, not restoration of the new multi-root model.
- New-model UI evidence: `tests/e2e/local-multi-root-workspaces.spec.ts` passed
  (20.2 seconds, working changes on `7a864a42f4`). Launched with
  `ORCA_BACKGROUND_LAUNCH=1 SKIP_BUILD=1 pnpm exec playwright test tests/e2e/local-multi-root-workspaces.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1`
  after `electron-vite build --mode e2e`. Used normal controls and isolated plain
  folders/profile: two-root creation, both physical saves, terminals with verified
  cwd in each directory, a second Workspace and App A-only Project, independent
  unsaved drafts, a blocked conflicting save, explicit reload, and clean-view
  refresh. Inspected `two-root-file-editing.png`, `overlapping-project-drafts.png`,
  and `shared-file-conflict.png` in that spec's `test-results/` directory.
- This initial result was partial evidence for WF1–WF5. Follow-up checks below
  cover Git, search, layouts, and recovery. A first test expectation was corrected
  for Markdown escaping; application code did not need changing for that save check.
- Required provider checks remain open for Codex terminal, Claude Code terminal,
  and built-in chat. No real-agent cross-root read/edit task has passed yet.
- Follow-up file/draft journey passed again (11.0 seconds) with normal
  rename/archive/restore controls: an inactive Workspace's draft and tabs return,
  and disk contents remain unchanged. Inspected `restored-archived-workspace.png`.
- New-model normal Quit/reopen passed (14.7 seconds) in
  `tests/e2e/local-multi-root-restart.spec.ts`: three independent contexts/drafts,
  saved tab order, last selection, the same two live split PTYs, and a working
  restored local browser tab. It explicitly requires normal exit rather than the
  helper's forced-close fallback. The rich-editor debounce race found during
  this check is fixed by flushing pending editor changes before the close guard.
  Inspected `test-results/local-quit-check/` screenshots. This earlier check did
  not exercise real agents; signed-in recovery and the dev runner are recorded below.
- Cross-root Quick Open/contents search, per-root staging/unstaging/commit, and
  existing-worktree selection passed (10.6 seconds) in
  `tests/e2e/local-multi-root-git-search.spec.ts`. Actual Git/disk checks confirm
  only the selected repository is committed, alternate App A stays isolated,
  App B remains shared, and no new worktree is created. Inspected screenshots in
  `test-results/local-full-check/`. Hidden CDP keystrokes do not
  invoke Electron's native Quick Open shortcut, so its UI test uses the existing
  shortcut IPC event; native-focus validation stays paused on this desktop.
- Initial TUI stub checks selected installed CLIs through the login shell, which
  rejected the fixture flag before a task ran. The tests now pin absolute fixture
  executables. Both Codex and Claude terminal checks passed (6.5 and 6.4 seconds):
  full roots/context, separate sessions, and an App A-only launch without App B.
  No permission-bypass flags were used. These prove launch wiring, not real
  provider tool access. Signed-in fixture results are recorded separately below.
- Guarded Project-directory and Workspace-checkout editing is implemented using
  the existing terminal mutation lock, with focused persistence/runtime tests.
  Rendered cancellation, dirty-buffer/live-process refusal, explicit discard,
  normal last-terminal close, and successful idle edits now pass their steps.
  The full recovery journey found that an obsolete cached tab still looked editable
  after removing its root, although the filesystem correctly refused its save.
  The focused fix closes obsolete clean tabs through Orca's existing close action,
  preserving files and any unexpectedly dirty draft. The full recovery rerun now
  passes, including removal, unchanged physical files, and re-add/reopen.
- Missing-directory launch refusal passed (4.3 seconds): the error identifies the
  exact missing App B directory and no replacement PTY starts in App A.
- Built-in Claude chat passed `local-multi-root-native-chat.spec.ts` (6.2 seconds)
  using the existing scripted SDK child. Normal New tab/Send controls produced a
  rendered response; captured SDK traffic includes both roots and Workspace
  context. Inspected `multi-root-scripted-chat.png`. This does not claim live
  authentication, real model/tool work, or Codex chat verification.
- Unsupported managed launch surfaces (background/automation and AI Vault resume)
  must explicitly refuse local multi-root launches until adapted, directing users
  to Workspace New tab or built-in chat. Arbitrary user-entered shell commands
  remain ordinary shell commands; Orca does not infer their agent scope.
- Coherent bundled acceptance run: **all nine tests passed together** (1.3 minutes)
  after rebuilding `electron-vite build --mode e2e`. Specs: `local-multi-root-`
  `workspaces`, `restart`, `git-search`, `agent-tui` (two cases), `recovery` (two
  cases), `native-chat`, and `navigation`. Output: `test-results/local-acceptance/`.
  Navigation uses the existing shortcut IPC to verify Project/Workspace search
  and numbered sidebar order; native OS focus/key dispatch remains untested here.
- Actual `pnpm dev` cold launch and normal Quit/relaunch passed with disposable
  profile `/private/tmp/orca-local-dev-check.DeMMwO/profile`: created all three
  contexts using ordinary controls, left distinct drafts, then restored them and
  the Project's last-used Workspace. No renderer errors during those actions.
  The second simultaneous launch exited **3** while the first runtime stayed
  healthy; both successful launches exited normally. Windows remained hidden and
  unfocused. Screenshots include `dev-cold-start.png`, `dev-before-quit.png`, and
  `dev-restored-drafts.png` in the fixture directory. Dismissed the standard CLI
  onboarding notice normally; no store seeding was used for these workflows.
- The expanded Git journey also passed (25.1 seconds): switching the shared App B
  checkout's branch is reflected in both Workspaces, without manual refresh.
  Returning between sidebar items leaves its branch, HEAD, and dirty file intact;
  both App A checkouts retain their own branches. Screenshot:
  `test-results/local-final-acceptance/` → `shared-checkout-branch.png`.
- WF7's alternate-checkout Git action is now directly verified too: the extended
  `local-multi-root-git-search.spec.ts` passed (26.1 seconds). Staging and committing
  through normal Source Control advances only the selected alternate App A HEAD;
  the original App A and shared App B retain their exact HEADs and index entries.
  Screenshot: `test-results/local-alternate-git-check/` →
  `alternate-checkout-commit.png`. This closes the remaining non-agent WF7 gap;
  it does not by itself provide real-agent proof.
- Editor selection/view switching passed separately (6.1 seconds) in
  `local-multi-root-editor-view.spec.ts`: three Workspaces sharing one file retain
  their distinct highlighted text/line and keep it in the visible viewport;
  physical file content is unchanged. Inspected
  `test-results/local-editor-view-final/` → `independent-workspace-editor-view.png`.
  The first test drafts incorrectly read a hidden editor's global probe and then
  sampled a smooth-scroll animation mid-frame. The final check uses the visible
  editor's DOM, with no production change or pixel-perfect scrolling promise.
  Together with the nine-case run, this covers all ten local acceptance cases.
  Cursor/view caches remain in-memory as in Orca; quit/restart does not add a new
  durable cursor-position guarantee.
- Final `pnpm tc`, changed-code quality gate, scoped formatting, and
  `git diff --check` passed. Three expert subagents reviewed session ownership,
  Workspace/Git/navigation, and agent integration; no additional local first-use
  code blocker was identified. Signed-in behavior was still unverified at that point.
- Signed-in CLI acceptance now passed through hidden `pnpm dev` and ordinary
  controls, using `/private/tmp/orca-live-cli.vaXJu4/profile` with the real login
  HOME. Both Codex and Claude read distinct seed markers and wrote the expected
  files in shared A+B, alternate A+B, and A-only contexts. No path was added in the
  task prompt, and no output appeared in an unintended root. Codex used the
  account-supported `gpt-5.6-luna`, low effort, Standard speed, workspace-write
  sandbox and on-request approvals. `gpt-6-luna` was rejected by the ChatGPT
  account; this was an account/model restriction, not an Orca startup failure.
  Claude used Haiku 4.5, Manual permissions, and thinking disabled for its TUI.
  Automatic AI workspace naming and Source Control AI actions were disabled in
  this disposable profile. Existing CLI/global model preferences were not edited.
- CLI recovery also passed: normal Quit exited 0, relaunch restored all six
  unique provider conversations with identical Workspace/tab/leaf/PTY ownership,
  and both providers completed a new two-root file task. The exact original root
  snapshots persist in the existing sleeping-session records; the transient
  launch registry is intentionally empty after reattachment. Ended setup agents
  stayed ended and no duplicate PTYs appeared. Inspected `reopened.png` and
  `claude-resumed.png`; before/after allowlisted evidence and per-context
  screenshots are in `/private/tmp/orca-live-cli.vaXJu4/`. Inactive PTYs attach
  lazily on Workspace selection; process inspection is unverifiable until then,
  not evidence of exit. No cold-machine/reboot guarantee is added.
- Built-in Claude chat also passed all three real root configurations with Haiku,
  Fast confirmed off, existing authentication and per-write approval. Its original
  two-root conversation completed a new file task after normal Quit/reopen with
  the same provider identity. A further normal Quit/reopen restored all three
  native conversations through ordinary sidebar/tab selection. The allowlisted
  `before-native-quit.json` and `after-native-reopen.json` reports are deeply equal:
  native/tab/provider IDs, Workspace ownership, model and exact frozen roots.
  Inspected `native-contexts-restored.png`; an expert independently compared the
  reports. Native recovery can reacquire a provider process for the same saved
  conversation; this is not a promise that its child process survives Quit.
- No production changes were needed during these real-account checks. All nine
  provider/context tasks and the three resumed two-root tasks produced the expected
  on-disk markers. Test windows remained hidden and unfocused; normal app exits
  returned 0. No forced termination was used as recovery evidence.
- After verification, the ten disposable terminal sessions were stopped with
  history retained and the hidden app quit normally (exit 0). The fixture files,
  profile, screenshots and reports remain available; no personal files were removed.
- No known must-have blocker remains for this demonstrated scope. Start using the
  fork on local work and report concrete friction. Keep the ordered optional work
  below deferred. These checks do not establish reboot/crash recovery, native OS
  focus behavior, remote/Windows workflows, or built-in Codex chat; none is added
  as a new prerequisite for this local trial.

The user approved existing Codex/Claude CLI sign-ins for small disposable-root
tasks and requested the cheapest models with low effort. Keep normal trust and
permission prompts enabled. Do not copy credentials or run model tasks against
personal repositories. The completed routes are Codex terminal, Claude Code
terminal, and built-in Claude chat: both-root disk edits and the same conversations
after normal Quit. Authentication was reused through normal provider integration.

### Definition of ready: supported user workflows

These seven workflows are required first-release acceptance criteria. Each must
be reachable through the ordinary UI and demonstrated in the running app. Keep
criteria unchecked until verified; implementation, a startup smoke test, or a
backend test alone does not complete a workflow. Record the tested revision,
launcher, test/scenario reference, result, and relevant screenshot or runtime/disk
evidence alongside completed criteria. Record failures and remaining limits too.

Use disposable local `app_a` and `app_b` checkouts with distinct marker content
and a same-named file in each, plus a plain non-Git folder and an existing alternate
worktree for `app_a`. Use one isolated persistent profile across the journey, not
real user repositories or a normal app profile. Fixture preparation may use test
setup; Project/Workspace creation and switching must use the normal controls.

Delivery mapping: P1 proves WF1 and the core file/terminal/agent path in WF2; P2
proves WF3–WF6; P3 completes WF2's everyday navigation/Git surfaces, WF7, and the
recovery checks below. P4 reruns the complete journey through the handoff launcher.

#### WF1 — Bring two applications into one Project

**Entry and actions:** From the welcome screen, choose **New Project**, name it
**Full application**, add the existing `app_a` and `app_b` directories, and confirm.

- [x] The sidebar shows Full application with its initial **Main** Workspace
      selected, and the file explorer shows both roots.
- [x] The chosen default command directory is visible. Setup references the
      existing directories without copying files, cloning, creating a branch or
      worktree, running setup jobs, or changing source files.
- [x] The same Project creation flow remains available after onboarding. New
      Workspace is contextual to a Project, with no hidden registration or
      management step needed to reach ordinary work.

#### WF2 — Work across both directories

**Entry and actions:** In Full application / Main, open and edit files from both
roots, search across them, open terminals in each root, use per-root Git controls,
and launch each required agent path through its normal control (Codex terminal
first, then Claude Code terminal and built-in chat).

- [x] Both files save to the correct physical targets. Same-named files and search
      results have root-qualified labels; file navigation, Quick Open, and search
      cover both roots. Repeat the basic file workflow with a plain non-Git root.
- [x] Each terminal's working directory is identifiable and selectable at launch.
      Git status identifies its root, and a Git action affects only the chosen
      repository; the Workspace does not imply one combined branch or index.
- [x] The agent automatically receives both roots as context and usable tool
      locations, subject to normal permissions. A fixture task requires information
      from both markers and edits in both roots. Verify launch configuration/tool
      activity and actual disk results, not just the agent's claim. No manual
      directory addition, extra-root prompt, or second agent is required.

The real-agent criterion applies to all three required launch paths and requires available auth,
and permission to run it against the fixtures. Without that evidence it stays
unchecked. Mocked launch tests cannot replace it.

#### WF3 — Switch tasks without creating a worktree

**Entry and actions:** In Main, open several files, leave an unsaved edit, arrange
panes, and start terminal/agent work. Under Full application, choose **New
Workspace**, name it **Investigate login**, and open different files. Switch
repeatedly between those two sidebar items.

- [x] Investigate login starts an independent working context over the same roots,
      without copying files, creating a checkout, cloning live processes, or
      automatically starting an agent.
- [x] Each item restores its own tabs and their order, active selection, drafts,
      supported cursor/view positions, splits, and terminal panes.
- [x] Switching does not save/discard edits, change branches, terminate running
      terminals, or duplicate terminal sessions.
- [x] Real agent sessions, running work, and status remain associated with their
      originating Workspace even when both use the same directory; switching does
      not terminate or duplicate them.

This is the central daily-use requirement, not optional polish.

#### WF4 — Use the same application in another Project

**Entry and actions:** Choose New Project, create **App A maintenance** using the
same existing `app_a` directory, and launch an agent in its Main Workspace. Give
it distinct tabs, drafts, and sessions; switch among all three Workspaces.

- [x] Both Projects coexist without copying or transferring the directory. The
      sidebar preserves distinct Workspace items even for the same checkout and
      branch, and their working state remains independent across Projects.
- [x] The new agent's supplied context and root configuration contain only
      `app_a`; they do not inherit `app_b` from Full application or its sessions.
      This verifies supplied scope, not airtight filesystem isolation.
- [x] Selecting a Project returns to its last-used Workspace. Selecting any of
      the three Workspaces restores that item's own tabs and drafts.
- [x] Real agent session associations remain attached to their originating
      Workspace across those selections.

#### WF5 — Share files without losing independent drafts

**Entry and actions:** Open the same `app_a` file in two Workspaces. Save a change
in one and return to the other. Repeat with an unsaved draft in the second view,
then attempt to save that draft against the changed disk content.

- [x] Clean views reflect shared disk changes. Dirty views keep their own drafts;
      a conflicting save requires resolution and cannot silently overwrite newer
      disk content. Switching itself neither saves nor discards either draft.
- [x] The UI identifies shared checkouts without implying that independent tabs
      provide code isolation. Explicitly switching a shared checkout's branch is
      reflected in all its views; selecting a sidebar item never switches it.

#### WF6 — Quit and return to work

**Entry and actions:** Leave distinct files, drafts, layouts, browser tabs, and
terminal/agent panes in the three Workspaces. Quit through Orca's normal quit path,
then relaunch the documented command with the same isolated profile.

- [x] The last-selected Workspace returns. Both active and inactive Workspaces
      retain their own tabs, order, active selection, unsaved drafts, supported
      splits, browser tabs, and terminal associations.
- [x] Verify real-agent associations/recovery. Cursor/view preservation during
      switching is covered by WF3; Orca's in-memory cache is not a new promise of
      durable cursor restoration after quitting.
- [x] Sessions reattach where supported; ended or unavailable sessions are
      reported honestly, never presented as live or silently relaunched.
- [x] Switching among the restored Workspaces still satisfies WF3–WF5. Recovery
      does not collapse contexts that share a directory or overwrite their drafts.

#### WF7 — Choose isolation when wanted

**Entry and actions:** Create a fresh Workspace in Full application and select an
existing alternate worktree for `app_a`, leaving `app_b` on its shared directory.
Open/edit files, use terminal/Git tools, and launch the chosen agent there.

- [x] Editors, terminals, and Git actions use those exact resolved directories.
- [x] The real agent receives both roots automatically and reads/edits the exact
      alternate App A and shared App B directories.
- [x] Other Workspaces keep their existing bindings. Changes in the alternate
      `app_a` worktree do not affect the original checkout; `app_b` remains shared.
- [x] The UI shows checkout/branch information per root and does not require every
      root to be isolated. Selecting an existing worktree creates no new one.

Creating worktrees automatically is optional follow-on work, not part of WF7.

#### Launch and recovery checks

These are small safeguards around the workflows, not a separate expansion of scope.

- [x] Cold-start the handoff runner with the same profile/lock options: the app
      renders and ordinary controls
      work without test-only store calls. After a full runner stop/start, the same
      command still works. Keep that check distinct from WF6's graceful Quit;
      runner teardown is not evidence that live processes survive normal Quit.
- [x] A second launch cannot become another writer to the same profile.
- [x] Cancelling Project/Workspace creation leaves no partially created records,
      directories, branches, or processes.
- [x] A missing selected folder is clearly identified when launching work, with
      no fallback process in another root or checkout.
- [x] Obsolete saved tabs after a directory removal or checkout change close
      safely or show unavailability; they never target another root's same-named file.
- [x] Rename/archive an inactive Workspace through its normal controls. Files and
      branches remain untouched, and saved state is retained and recoverable.
- [x] Attempt a root-set or checkout-binding change with a dirty buffer or live
      terminal/agent in an affected Workspace. Explain what must be closed and
      leave the binding unchanged; do not silently stop, discard, or retarget work.

Ready for first daily use means all seven workflows and these checks pass.
Remote workflows, automatic worktree creation, providers beyond the three required paths, and
broader editor changes remain in the optional queue below.

### Proportionate verification

Keep focused tests for Project membership, context/root separation, duplicate
directory views, persistence, correct per-root I/O, conflicts, and complete agent
launch arguments/permissions. Reuse existing lifecycle and restoration tests.
Run typecheck and changed-code lint for implementation changes. Add the existing
renderer Node-builtin boundary test to the startup check set.

Use the repository-required Electron skill when available and Playwright CDP for
rendered checks. If that skill is unavailable, explicitly state the existing
repository-harness fallback and its limits. All agent-launched apps/tests use
`ORCA_BACKGROUND_LAUNCH=1`, hidden windows, and isolated profiles; no native focus,
OS activation, or computer-use validation. Rebuild modified launch-policy code
before launching. Native-focus checks require an isolated display or CI.

The development launcher and bundled test harness are different paths: verify
both when both are changed. Inspect actual UI, renderer exceptions, and startup
requests. Do not substitute backend/component tests for a functioning app, and
do not build an exhaustive remote/platform test program before this local loop.

## 8. Approved follow-on work and deferred options

The user has begun testing the working local model and approved this bounded next
batch on 2026-09-25, with the desktop fork named **Ether**. Keep internal Orca
module, IPC and storage names unless an identity boundary requires a change.
The original first-use criteria above remain complete; the following items are
new work, not retroactive requirements for that milestone.

- [x] **D1 — Standalone Ether for this Mac.** Produce and inspect an arm64 app
      that launches without the repository or a development server. Use a separate
      app identity and persistent Ether profile, preserve upstream attribution,
      and refuse upstream updater operations. Do not silently import the existing
      development profile or credentials. Verify the actual packaged renderer,
      local file/terminal workflow, profile separation and ordinary Quit/reopen.
- [x] **D2 — Cold-runtime recovery and maintenance handoff.** Verify saved files,
      drafts and Workspace ownership after the fixture's previous runtime is gone;
      report unavailable sessions honestly. Document existing backups, safe
      restore, build/test commands and the narrow fork integration points in
      `docs/ether-maintenance.md`. A fresh runtime is not proof that a live process
      survives reboot, and state backups are not backups of repository files.
- [x] **D3 — Create a per-root worktree through the Workspace UI.** Reuse existing
      Git creation machinery, keep other roots shared, and keep ordinary new
      Workspaces worktree-free. Verify a real new branch/worktree, exact file and
      terminal targeting, unchanged other roots, and clear cancellation/failure
      behavior. Never delete a newly created checkout implicitly on a later error.
- [x] **D4 — Copy file-tab layout (stretch only).** Start a fresh Workspace from
      another's file tabs/arrangement without copying live agents, terminals or
      provider conversations. Only begin if D1–D3 leave enough time for validation.

Before this batch, the verified staged implementation was preserved at Git ref
`refs/ether/checkpoints/local-first-use-20260925` (`da41a0ef35`). This is a source
checkpoint, not a user-data backup; the working branch and index were unchanged.
Do not reset to it over later user changes. Keep the last portion of the work for
integration checks and handoff rather than starting more features.

### Using the standalone app and new worktrees

The local build is `dist/ether/mac-arm64/Ether.app`. Open it in Finder, or copy
it to Applications after checking that no existing Ether app would be replaced.
It does not need `pnpm dev` or a running development server. This is a locally
signed Apple Silicon build, not a notarized distribution release. It starts
with a fresh `~/Library/Application Support/Ether` profile; recreate Projects
pointing at existing directories without moving the code. The development
profile remains untouched and separate. See the
[maintenance guide](../docs/ether-maintenance.md) for rebuilding and backups.

Ordinary new Workspaces still share the Project's directories without creating
branches or worktrees. For isolation, choose **New Workspace → Choose worktrees**,
then **Create new worktree for [directory]**. Supply a new branch name and an
unused absolute directory inside an existing parent. This starts from that
Project directory's committed HEAD, not an alternate Workspace's checkout or
its uncommitted edits. Other roots remain shared unless explicitly changed.
Save the Workspace to use it. Cancelling afterwards leaves the new checkout on
disk; select its path as an existing worktree when ready to use it.

For a familiar starting layout, **New Workspace → Copy saved file tabs from**
can select another Workspace in the same Project. The default is **Do not copy**.
Only clean, permanent saved-file tabs and their split arrangement are copied;
the new Workspace owns independent tabs and future drafts. Unsaved/transient
tabs, agents, terminals, and browser tabs are excluded. Paths stay physical:
changing App A to an alternate checkout excludes the old App A tabs rather than
silently opening same-named files in that other checkout. A summary reports the
copied and excluded counts. This does not copy undo history or running work.

Follow-on evidence:

- D2: `local-multi-root-cold-restart.spec.ts` passed both cases (20.9 seconds),
  using an E2E build and hidden, isolated profiles. Recorded old process
  identities were absent before reopening; overlapping contexts/drafts returned
  and a fresh shell accepted input. Scripted native chat retained its conversation
  and exact roots, then replied through a new provider process. Inspected both
  screenshots in `test-results/ether-cold-runtime-final/`. The initial assertion
  wrongly froze Claude's advancing message cursor; the corrected check uses its
  existing conversation-root identity, with no production recovery change.
  `docs/ether-maintenance.md` documents the real backup and recovery boundaries.
- D1: `pnpm build:ether` produced the arm64 ad-hoc bundle. Deep code
  signature verification, helper bundle identities, and the bundled CLI version
  command passed. The ASAR's only top-level entries are `LICENSE`, `out`,
  `package.json`, and `resources`; no development profile or test output is
  included. `ether-packaged.spec.ts` passed (8.3 seconds) against that actual
  bundle from a disposable working directory, without a development server or
  test-only renderer store. The hidden production renderer created a two-root
  Project, saved App A, ran a shell writing only App B, and restored App B's
  unsaved draft after normal exit 0/reopen. Inspected both screenshots in
  `test-results/ether-packaged/`. Runtime checks verified packaged Ether identity
  and an explicit isolated profile; focused tests cover the default Ether profile
  path and upstream-updater refusal. No existing user profile was imported.
  A further genuine empty-profile run passed (6.4 seconds): the welcome screen's
  **Skip to project setup** reaches the new multi-root Project form without an
  Orca account, followed by the same save/terminal/draft-reopen journey. The
  initial run stopped at an inherited one-time CLI tip covering the root controls;
  the corrected test closes that tip normally and does not install anything.
  Fresh profiles have their own preferences; the maintenance guide explains
  saving Manual agent permissions with **Continue**, not skipping that choice.
- D3: `local-multi-root-worktree-create.spec.ts` passed its strengthened journey
  (11.4 seconds), alongside the existing Git/search/worktree-selection journey
  (26.2 seconds). Normal controls created a new branch from the selected Project
  root's committed HEAD. An editor save and a terminal write reached only that
  new checkout; the original checkout, other Git root, and plain-folder root were
  unchanged. Existing destinations were refused. Cancelling after creation kept
  the checkout available for reuse. Screenshots are in
  `test-results/ether-worktree-targeting/`.
- D4: `local-multi-root-copy-layout.spec.ts` passed (13.4 seconds). Normal controls
  copied two clean files and their side-by-side splits with fresh file/tab/group
  IDs, while leaving the source's draft, terminal, and scripted native-chat
  session unchanged. PTY counts did not increase. A destination-only draft and
  both layouts survived normal exit 0/reopen. Changing only App A to an alternate
  checkout excluded its old path while retaining App B; source and alternate
  physical files stayed unchanged. Screenshots are in `test-results/ether-copy-layout/`.
  Focused helper/action/UI tests passed 37 cases across four suites, including
  nested split ratios, post-create dirtiness rechecks, empty/partial results, and
  retained Workspace creation on failure. The addition is four renderer modules
  reusing the existing file/group owners; no new persistence or runtime service.
- Final integrated E2E build: all **14 local multi-root tests passed together**
  (2.4 minutes), including the original daily-work journeys and all new recovery,
  copy-layout, and worktree-creation cases. Evidence: `test-results/ether-final-regression/`.
  The focused integration selection passed **109 tests in 17 suites**; `pnpm tc`
  and the full changed-code quality gate also passed. Agent checks in this batch
  use pinned stubs/scripted children, not new paid model calls; the earlier real
  provider acceptance remains recorded above.
- Final artifact: `pnpm build:ether` succeeded with version
  `1.4.197-local.1790383000752.7a864a42f4ec`. The rebuilt bundle passed the
  empty-profile production smoke (7.9 seconds), including normal welcome controls,
  saving Manual Codex/Claude permission settings, Ether titlebar/document/IPC
  identity, both roots, the correct shell write, and saved drafts after normal
  Quit/reopen. Inspected screenshots in `test-results/ether-packaged-final/`.
  Deep signature verification and the runtime-only ASAR audit passed again.
  Output is `dist/ether/mac-arm64/Ether.app`; it was not installed or opened on
  the user's desktop. Internal names, icons, and some inherited Orca copy remain
  deliberately unchanged. This is an ad-hoc local arm64 build, not a notarized
  public release; normal updates remain manual.

### Deferred options, ordered after the approved batch

1. Small friction fixes observed during actual use, including convenient live
   root-set editing once the initial guarded behavior proves useful.
2. Repository cloning/setup shortcuts beyond the explicit per-root worktree
   creation and file-layout copying in the approved batch above.
3. More agent providers/launch modes beyond Codex terminal, Claude Code terminal,
   and built-in chat, with equally complete multi-root support. Those three paths
   are already mandatory, not this optional item.
4. Broader packaging/distribution, cosmetic branding, and a reviewed upstream-update
   procedure beyond this local, manually updated Ether bundle.
5. Richer combined Git/review tools, cross-root bulk operations, or measured
   performance improvements beyond the working per-root tools.
6. Remote/SSH/WSL/paired clients, mobile/dashboard parity, import/migration tools,
   and broad compatibility matrices. Keep existing boundaries intact meanwhile.
7. Formal Tasks/Attempts, orchestration redesign, snapshot/review systems, and
   editor-wide visual or architectural changes.

## 9. Guardrails for implementation decisions

- No mass reset or deletion without preserving user work and agreeing on the
  exact implementation baseline. Historical-profile compatibility is not a gate;
  preserving actual user files and saved work is.
- Reuse before reimplementation. Prefer focused fork-owned feature modules plus
  justified Orca adapters, not a parallel editor/runtime or scattered special cases.
- One Workspace ID owns working state; directory references own physical targets.
  Never deduplicate sidebar contexts merely because their paths or branches match.
- All Project roots reach the supported agent automatically. Never quietly reduce
  a multi-root Workspace to its default cwd to get a launch to succeed.
- Local-first does not mean bypassing process/path/permission safety or changing
  shared remote contracts casually. Use existing platform-aware services.
- Do not add new ledger, catalog-authority, lease, or generic capability frameworks
  for speculative future needs. Reuse existing safeguards where execution needs them.
- Judge progress by the user journey above. No quantity of schemas, tests, or
  management UI compensates for a nonfunctional normal workflow.

The first success is ordinary work across `app_a` and `app_b`, another Project
sharing `app_a`, independent saved contexts, and reliable switching/reopening—all
using Orca's existing tools through one coherent interface.
