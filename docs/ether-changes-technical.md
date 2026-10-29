# Ether changes: technical reference

The engineering companion to [ether-changes.md](ether-changes.md). For each feature ID it records
why the feature exists, what must stay true through an upstream merge, which code the fork owns,
which seams attach it to upstream, and how to check it. Build, recovery and release steps live in
[ether-maintenance.md](ether-maintenance.md).

`config/ether-fork-surface.json` is the only list of upstream files the fork touches. This document
names seams, not files, so it doesn't go stale when upstream moves code. List the files for a seam
with:

```sh
node -e "const m=require('./config/ether-fork-surface.json');for(const[f,v]of Object.entries(m.files))if(v.seam===process.argv[1])console.log(f)" agent-launch
```

## How the fork attaches to upstream

- **Fork-owned code** lives in its own directories: `src/{shared,main}/local-projects/`,
  `src/renderer/src/features/{local-projects,linear-optional-skill,ether-chat-fork}/`,
  `src/main/native-chat/{ether-chat-fork,ether-legacy-chat-import}/`, `src/preload/api/*-bridge.ts`
  files the fork added, `config/scripts/*ether*`, and `tests/e2e/{local-,ether-}*.spec.ts`.
- **Seams.** An upstream file gets at most an import plus one call or element into a fork-owned
  module, marked `// Ether seam: <name>`. Seam modules sit in `src/main/local-projects/seams/` and
  `src/renderer/src/features/local-projects/seams/`. Upstream files at the lint line limit that
  need a hook are listed in the Ether `max-lines` overrides at the end of `.oxlintrc.json`, which
  allow 20 extra lines; add a file there rather than contorting its hook.
- **The manifest** (`config/ether-fork-surface.json`) lists every touched upstream file with its
  seam; each seam names the feature IDs below. `pnpm check:ether-fork-surface` fails on an
  unlisted file, a missing marker, a stale entry, a count above `maxFiles`, or a seam whose
  features aren't documented here. `maxFiles` only goes down.
- **Add, don't change.** Adopt upstream behaviour where it is good enough. A new fork feature
  starts with its seam, its manifest entry and an entry in both change docs.

### Conventions that keep merges small

- Put fork imports first in an import block, fork members first in a union, and fork fields last
  in an object type; upstream usually appends at the end of imports and unions.
- Add a fork element beside upstream JSX instead of wrapping it; a wrapper re-indents upstream
  lines and conflicts with every upstream edit to them.
- Never edit an upstream test file. When Ether changes what an upstream test asserts, copy it to a
  fork-owned `*.ether.test.*` file with Ether's expectations and list the original in
  `config/ether-replaced-upstream-tests.mjs`, which the unit test config excludes.
- Don't copy an upstream component unless it has to diverge. A copy goes under `copiedUpstream`
  in the manifest so the drift report flags upstream changes to the original.
- Strings: add fork keys to `src/renderer/src/i18n/locales/en.json` (upstream's lint reads only
  that file). In a merge, take upstream's `en.json` and `en-runtime-required.json`, then run
  `pnpm sync:localization-catalog` and `pnpm sync:localization-runtime-catalog`.

### Merging upstream

1. `pnpm ether:upstream-drift` shows how far behind Ether is and the conflicts by seam. Merge
   about twice a week; upstream lands roughly 270 commits a day.
2. Work on a branch in a separate worktree. Resolve each conflict by taking upstream's side and
   re-applying the seam hook at upstream's new owner. Never restore a file upstream deleted.
3. Fix fork imports of modules upstream moved, then run `pnpm tc`, `pnpm check:ether-fork-surface`,
   the fork tests, and the fork e2e specs (below). Unit tests alone are not enough: in merge 1 they
   passed while every local Projects write failed in the live app. For the full `pnpm test`, compare
   failures against a scratch worktree of the upstream target: about 40 files (cross-version wire,
   orcad, some `config/scripts`) fail on a plain upstream checkout here too.
4. Commit the merge with `--no-verify` (lint-staged would re-lint every upstream file in it) after
   running `oxlint` on the fork-changed files; later commits keep the hooks.
5. Update this document where a seam moved, lower `maxFiles`, and record the merge in
   `plans/upstream_merge_N/`.

### Fork test set

- Unit: `pnpm test src/main/local-projects src/shared/local-projects src/renderer/src/features src/main/native-chat/ether-chat-fork src/main/native-chat/ether-legacy-chat-import config/scripts/*ether*`.
- E2E (builds the app; never shows windows):
  `ORCA_BACKGROUND_LAUNCH=1 pnpm exec playwright test tests/e2e/local-multi-root-*.spec.ts tests/e2e/local-projects-linear*.spec.ts tests/e2e/local-sidebar-switching.spec.ts tests/e2e/ether-chat-fork.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1`.
- Packaged (after `pnpm build:ether`): `tests/e2e/ether-packaged.spec.ts`,
  `tests/e2e/ether-linear-onboarding.spec.ts`.

---

## E1. Ether is its own Mac app

**Why:** Ether must run beside Orca without sharing its profile, keychain item or updates.

**Must stay true:**

- The profile is `~/Library/Application Support/Ether`. An override must be absolute and must not
  be an `Orca`, `orca` or `orca-dev` profile.
- An app named Ether without a matching `etherBuild` marker throws at startup rather than opening
  another profile.
- Bundle ID `com.joelkorpela.ether` keeps the profile and the "Ether Safe Storage" keychain item
  separate. Orca data is never imported or changed.
- Upstream updates are always refused; a user-initiated check shows the manual-update message.

**Fork-owned:** `src/shared/ether-product.json`, `src/main/ether-build.ts`,
`src/main/startup/ether-user-data-path.ts`, `src/renderer/src/app-shell/use-titlebar-app-name.ts`.

**Seams:** `identity` (startup user-data path, dev-instance identity, titlebar name), `updater`
(an Ether updater is chosen once at startup).

**Check:** `src/main/{ether-build,updater.ether-build}.test.ts`,
`src/main/startup/{ether-user-data-path,configure-ether-profile}.test.ts`,
`use-titlebar-app-name.test.tsx`; `tests/e2e/ether-packaged.spec.ts` against a built release.

## E2. Local signed builds, one folder per release

**Why:** keychain approval must survive rebuilds, and a build must never replace the running app or
its terminal daemon.

**Must stay true:**

- macOS arm64 `dir` builds only, with `publish: null`, `protocols: []` and no notarization.
  Upstream release flags (`ORCA_MAC_RELEASE` and the like) are refused.
- Exactly one signing identity (`ETHER_SIGN_IDENTITY`, default "Ether Local Code Signing") is
  resolved to a SHA-1 before building. No unsigned fallback; `CSC_LINK` and `CSC_KEY_PASSWORD` are
  stripped; the designated requirement is verified.
- Helper bundle IDs derive from the Ether app ID; the bundled CLI runs `MacOS/Ether` with the Ether
  profile.
- Builds land in `dist/ether-releases/<date>-<commit>[-N]/Ether.app` with a README row and are
  never overwritten. The build never installs or launches the app.

**Fork-owned:** `config/electron-builder.ether.config.cjs`,
`config/scripts/{build-ether-local.mjs,ether-signing-identity.cjs,verify-ether-signature.mjs}`,
`tests/e2e/helpers/ether-release-bundle.ts`.

**Seams:** `packaging` (`build:ether` script, `ORCA_SKIP_DEV_CLI_INSTALL`, terminal-host bundle ID).

**Depends on, without a hook:** the base `electron-builder.config.cjs` (`files`,
`mac.extendInfo`, `beforePack`, `afterPack`), the launcher line `ELECTRON="$CONTENTS/MacOS/Orca"` in
`resources/darwin/bin/orca`, `getLocalBuildIdentity`, `resolvePnpmCliInvocation`, and the
`--single-arch` / `--bundle-id` builder flags. Re-check these when upstream changes packaging.

**Check:** `config/scripts/*ether*.test.mjs`; `pnpm build:ether`, then
`tests/e2e/ether-packaged.spec.ts`.

## E3. Projects with several folders, and Workspaces over them

**Why:** real work spans several repositories. Orca's model is one repo, many worktrees; Ether's is
one Project of several directories, with many saved Workspaces over it.

**Must stay true:**

- A Project groups existing directories; a directory can be in several Projects. Rows are never
  deduplicated by path or branch.
- One Workspace ID owns its saved view, sessions and drafts. Directory references own physical
  targets.
- Creating a Workspace never creates a branch or worktree. A per-root worktree, when asked for, is
  created from that root's committed HEAD and is never deleted implicitly.
- A missing root is reported; work is never retargeted to another root.
- Changing a root set or checkout is refused while affected Workspaces have live terminals or
  agents, or dirty buffers. Name and order edits are always allowed.
- Archive replaces delete and keeps tabs, drafts and directories. Workspace names are never
  changed automatically.
- Copy-layout copies only clean saved file tabs.
- Terminals in a local Workspace start in its default root (or the requested root) under the
  Workspace launch lock. A launch scope must belong to its Workspace, its cwd must match, and every
  root must exist. Multi-root agents are refused under WSL.
- The local flow replaces Orca's repo, worktree and project-group flow only when
  `window.api.localProjects` exists, so paired web and mobile clients keep upstream's UI. Local
  Workspaces are projected to them as `folder:` workspaces.
- `localProjects` lives in the profile's `orca-data.json`, written through upstream's asynchronous
  profile writer. The schema is strict: an older build refuses a newer profile rather than
  dropping data.

**Fork-owned:** `src/shared/local-projects/` (schema, scope, folder projection),
`src/main/local-projects/` (persistence, `localProjects:*` IPC, launch-scope lock, scope mutation
guard, Git target, root worktree creation), `src/renderer/src/features/local-projects/`,
`src/preload/api/local-projects-bridge.ts`, `tests/e2e/helpers/local-project-*.ts`.

**Seams:** `local-projects` (UI shell switches, store slice, IPC registration, folder-workspace
projection), `persistence` (profile store, allowed filesystem roots, folder path status),
`pty-spawn` (terminal cwd and the launch lock). Terminal starts attach at two points: the default
root in `resolvePtySpawnStartupCwd` (`host-env/spawn-cwd.ts`), and one `assertLocalWorkspacePtyStart`
call inside upstream's `runPtySpawn` (`spawn-operation.ts`), after it takes the worktree spawn lock
and before the start runs; upstream's operation releases the lock when the check throws.

**Check:** unit tests in the three `local-projects` directories; e2e
`local-multi-root-{workspaces,navigation,restart,cold-restart,recovery,copy-layout,worktree-create}.spec.ts`.
By hand: make a two-root Project, a second Workspace and a one-root Project over the same folder;
check independent drafts and an agent editing both roots; quit and reopen.

## E4. Agents see every folder in the Workspace

**Why:** an agent limited to one folder of a multi-folder task silently does the wrong thing.

**Must stay true:**

- Every agent started in a local Workspace gets all of its roots, with labels, real paths and one
  cwd, and the provider's tools actually get access to all of them. Never fall back to the
  default root, a common parent or a narrower scope.
- Claude terminals get `--add-dir` per root (and a `--` prompt separator); Codex terminals get
  `--cd <cwd>` plus `--add-dir`. Claude chat gets `additionalDirectories` and the Workspace context
  appended to the `claude_code` system prompt. Codex chat gets the scope cwd, writable roots and
  developer instructions.
- Codex counts a root as granted when it is inside the reported cwd or a writable root; the chat
  still refuses when a root is genuinely missing or Codex doesn't confirm the cwd. Manual
  permissions and sandbox settings are never loosened.
- Where the frozen roots live: a chat's in `ether-agent-session-scopes.json` beside
  `agent-session-journal.db`, keyed by session ID and written before the chat is reserved
  (`session-scope-store.ts`; records from before the store carried them on the record and are
  read once from there); a terminal agent's as `localWorkspaceScope` on its saved launch config.
  Upstream's schemas strip unknown fields on load, which is why the terminal field stays typed.
  A chat whose roots are missing refuses to attach.
- The roots captured at launch are frozen with the session and survive resume, restart and Fork
  Chat. A resumed session is never rebound to the currently selected Workspace.
- Scope is captured by the local host only. It is never accepted from a remote attach;
  `connectionId` must be empty and the execution host local.
- Launch paths that can't carry every root refuse with a message: background sessions, AI vault
  sessions, and providers other than Claude and Codex (including Orca's OpenCode).
- A chat attach holds the Workspace scope lock, so a root-set edit can't race a launch.

**Fork-owned:** `src/main/local-projects/{structured-agent-scope,runtime-agent-entrypoint,launch-scope-lock}.ts`,
`src/shared/local-projects/{agent-launch-scope,agent-session-scope,agent-root-arguments,agent-entrypoint}.ts`,
`src/main/codex/codex-local-workspace-thread.ts`, `src/renderer/src/lib/local-workspace-agent-launch.ts`,
the launch seams in `src/renderer/src/features/local-projects/seams/`.

**Seams:** `agent-launch` (provider launch options, terminal agent arguments, refusals),
`chat-scope` (scope lock around attach, frozen scope on the session), `pty-spawn`.

**Check:** `agent-session-local-workspace.test.ts`, `structured-agent-session-workspace-lock`,
`local-workspace-{agent-launch,agent-entrypoints,sleeping-resume}`, `codex-local-workspace-thread.test.ts`;
e2e `local-multi-root-{agent-tui,native-chat,cold-restart}.spec.ts`. Codex chat against the real
binary: `codex-local-workspace-binary-contract.test.ts` (`ORCA_CODEX_CONTRACT_BINARY`,
`ORCA_CODEX_CONTRACT_VERSION`, `ORCA_CODEX_CONTRACT_REQUIRED`) and `tests/e2e/ether-codex-chat.spec.ts`
(`ETHER_CODEX_LIVE_SMOKE=1`, `ETHER_CODEX_TEST_MODEL`).

## E5. Files, search and editor work across folders

**Must stay true:**

- The file explorer, quick open and search cover every root, labelled "root / path".
- Each Workspace has its own editor model and draft for a shared file (an `orca-editor=<fileId>`
  query on the model URI).
- Saving a shared file updates disk for every view. Dirty drafts in other Workspaces are kept;
  saves are queued by physical target and a conflicting save is blocked.
- Self-writes are scoped to a Workspace, and external-change watches are shared per target.
- Workspace drafts are flushed and backed up when the window closes.
- Every resolved local root is an allowed filesystem root.

**Fork-owned:** `src/renderer/src/features/local-projects/` (editor identity, explorer roots,
search banner, the `file-search` and `editor-watch` seams),
`src/renderer/src/hooks/editor-external-watch-ownership.ts`.

**Seams:** `editor`, `local-projects` (explorer, quick open, search), `persistence` (allowed roots).

**Check:** editor and search tests under `features/local-projects`; e2e
`local-multi-root-{editor-view,git-search}.spec.ts`.

## E6. Source Control per folder

**Must stay true:** each root in a Workspace has its own status, diffs, staging and commits; every
Git action names its root; diff tabs carry the root they came from. Upstream's single-repo Source
Control is unchanged outside local Workspaces.

**Fork-owned:** `src/main/local-projects/git-target.ts` (`resolveDesktopGitTarget`),
`src/shared/local-projects/git-root.ts`, `LocalWorkspaceSourceControl` and the `runtime-git` and
`local-root-diff-tab` seams in `features/local-projects/seams/`.

**Seams:** `git` (a `localRoot` argument on the Git IPC handlers, preload APIs and runtime Git
clients), `local-projects` (Source Control panel switch).

**Check:** `git-target.test.ts`, the runtime Git seam tests; e2e `local-multi-root-git-search.spec.ts`.

## E7. Linear issues linked to Workspaces

**Must stay true:**

- Links belong to the Workspace UUID; a Workspace can link many issues and an issue many
  Workspaces. Linking never creates a worktree, changes issue status or prompts an agent.
- Attaching verifies the issue against its exact saved account. Unlinking is local and works
  offline. Archived Workspaces keep their links but drop out of active matches.
- Creating a Workspace from an issue verifies the issue before a single write; a failure creates
  nothing.
- Links show in the sidebar, Tasks rows, issue details and jump search; "Has Workspace" counts
  local links.
- Search runs only after an explicit query. Reads time out after 30 seconds with a retryable error;
  mutations are never retried.
- The Linear agent skill is optional, and Linear appears in Tasks before it is connected.
  Credentials are reused, never copied. Tests never write to Linear.

**Fork-owned:** `src/shared/local-projects/linear-issues.ts`,
`src/main/local-projects/linear-*.ts`, `src/main/linear/linear-read-deadline.ts`, the `*Linear*`
modules in `features/local-projects/`, `src/renderer/src/features/linear-optional-skill/` (copies
of two upstream settings components, listed under `copiedUpstream`),
`src/renderer/src/lib/worktree-palette-local-linear-issues.ts`,
`tests/e2e/helpers/local-project-linear-backend.ts`.

**Seams:** `linear` (Tasks rows and issue details, the "Has Workspace" filter, read deadlines,
optional-skill readiness, jump search). The read deadline wraps each whole read, queue wait
included, so it stays on the four read modules: upstream's `createLinearClient` only retries brief
network failures, and a deadline there would also cut off writes. Tasks rows and issue details
render a fork element just before the upstream action and hide that sibling in local mode.

**Check:** `src/main/local-projects/linear-*.test.ts`, `src/main/linear/linear-{read-deadline,issue-search}.test.ts`,
the Linear tests in `features/`; e2e `local-projects-linear{,-entry}.spec.ts` and the packaged
`ether-linear-onboarding.spec.ts` (`ETHER_LINEAR_STALL_CHECK=1` adds the stall check).

## E8. A quieter sidebar

**Must stay true:**

- `markSlot` is unique (enforced by the schema). Slots never renumber; taking a held slot swaps the
  two Workspaces in one write; archiving clears the slot. Mod+1–9 jumps by slot only.
- Workspaces sort by recency inside a fixed Project order, and sorting freezes while the pointer or
  focus is in the list.
- Archiving the open Workspace first opens the previous one (most recently visited, else a sibling,
  else any), then archives and offers Undo, which restores the mark. Running agents are named in
  the toast and not stopped. In local mode, the delete-workspace command archives instead.
- Sidebar clicks use the shared activation path, so they feed recency and back/forward history.
- Keybindings stay rebindable: Mod+Shift+H, Mod+; and Ctrl+Backquote. The shortcuts stay mounted
  while the sidebar is collapsed.

**Fork-owned:** `src/renderer/src/features/local-projects/{LocalSidebar*,LocalWorkspaceMarksDialog,LocalWorkspaceRecentSwitcher,LocalWorkspaceShortcuts,local-sidebar-model,local-workspace-sidebar-actions,local-workspace-quick-actions}`,
`src/shared/local-projects/mark-slots.ts`, `src/shared/keybindings/definitions-local-workspaces.ts`.

**Seams:** `sidebar` (sidebar top and header, archive command, jump palette actions, keybinding
definitions).

**Check:** `local-sidebar-model.test.ts`, `local-workspace-sidebar-actions.test.ts`,
`LocalProjectsSidebar.test.tsx`, `local-workspace-navigation.test.tsx`; e2e
`local-sidebar-switching.spec.ts`, `local-multi-root-navigation.spec.ts`.

## E9. Fork Chat

**Must stay true:** Fork Chat copies the provider conversation (Claude transcript fork, Codex
`thread/fork`) into a new chat tab beside the original, keeps every Workspace root, and leaves the
original unchanged. It is offered only for built-in Claude and Codex chats.

**Fork-owned:** `src/main/native-chat/ether-chat-fork/`, `src/renderer/src/features/ether-chat-fork/`,
`src/shared/ether-chat-fork.ts`, `src/preload/api/ether-chat-bridge.ts`.

**Seams:** `chat-fork` (the chat context menu item).

**Check:** `chat-conversation-fork.test.ts`; e2e `ether-chat-fork.spec.ts`. Codex `thread/fork` is
tested only against a stand-in.

## E10. Old chat history carried forward (temporary)

**Why:** merge 1 replaced the JSON chat records with a SQLite database.

**Must stay true:** the import runs once, keeps each chat's frozen roots, and skips old OpenCode
records without blocking the rest.

**Fork-owned:** `src/main/native-chat/ether-legacy-chat-import/`.

**Seams:** `chat-history-import` (one call when the journal database opens).

**Remove when** every Ether profile has opened on a build that ran it. Then delete the directory and
its seam.

**Check:** `legacy-chat-history-import.test.ts`.

## M1. Fork-surface check and drift report

**Fork-owned:** `config/ether-fork-surface.json`, `config/scripts/check-ether-fork-surface.mjs`,
`config/scripts/ether-upstream-drift.mjs` and their tests; this document and
[ether-changes.md](ether-changes.md).

**Seams:** shares `packaging` (the `package.json` scripts).

**Check:** `config/scripts/{check-ether-fork-surface,ether-upstream-drift}.test.mjs`;
`pnpm check:ether-fork-surface`.
