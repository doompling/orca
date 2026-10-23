# Ether fork features: intent catalogue for upstream merge 1

Merge: upstream `52e413ec85` into `ether` (`d9a1140d8e`), base `ae3d380b23`. Upstream changed about 29,600 files; 202 files were also changed by the fork. Rule from the fork's hygiene note: fork behaviour lives in fork-owned modules, and upstream files keep only small, clearly marked hooks (an import plus one call). Where upstream restructured a seam, re-attach the hook at the new owner. Do not restore the old file.

Upstream **deleted or moved** some fork-hooked files, so their hooks need a new home. Under `src/main/runtime/`:
- `orca-runtime-get-worktree-ps.ts` moved to `structured-agent-session-runtime.ts` and `workspaces/workspace-process-listing.ts`.
- `orca-runtime-resolve-recovered-structured-tui-transcript.ts` moved to `session-tabs/structured-session-create-support.ts`.
- `orca-runtime-resolve-worktree-removal-target.ts` moved to `workspaces/workspace-removal-target.ts`.
- `orca-runtime-stop-terminals-for-worktree.ts` moved to `terminal/stop/`, and `orca-runtime-transition-graph-reload-to-terminal-state.ts` to `session-graph/`.

Elsewhere, the renderer's `agent-status-recovery-equivalence.ts` moved to `shared/agent-resume-record-equivalence.ts`, `task-page-linear-in-orca-issues.ts` moved into `task-page/linear/`, and `src/shared/child-process/run-process.ts` moved to `src/packages/process-host/src/`.

---

## 1. Ether app identity and profile

**Intent:** Ether is a separate Mac app that can run next to upstream Orca. It has its own name, bundle ID, profile and keychain identity. It never installs an Orca update or touches Orca's data.

**Fork-owned files:** `src/shared/ether-product.json`, `src/main/ether-build.ts`, `src/main/startup/ether-user-data-path.ts`, `src/renderer/src/app-shell/use-titlebar-app-name.ts`, `docs/ether-maintenance.md`.

**Hooks into upstream files:**
- `src/main/startup/configure-process.ts`: a packaged Ether build sets `userData` to the Ether path.
- `src/main/startup/dev-instance-identity.ts`: an `etherProduct` parameter overrides the name and AppUserModelId. `main-process-preflight.ts` and `src/main/ipc/app.ts` pass in `getPackagedEtherProduct()`.
- `src/main/updater/updater-status.ts` and `updater-setup.ts`: `refuseEtherUpdate()` makes every updater entry return early, and `getAutoUpdater` throws.
- `TitlebarLeftControls.tsx`: the label comes from `useTitlebarAppName()`.
- `.gitignore`: ignores `/.orca-local-profile/` and un-ignores `docs/ether-maintenance.md`.

**Invariants to preserve:**
- The profile is `~/Library/Application Support/Ether`. An override must be absolute and must not be an `Orca`, `orca` or `orca-dev` profile.
- An app named Ether without a matching `etherBuild` marker throws at startup rather than using another profile.
- The bundle ID `com.joelkorpela.ether` keeps the Ether profile and the "Ether Safe Storage" keychain item separate from Orca. Orca data is never imported or changed.
- Upstream updates are always refused. A user-initiated check shows the manual-update message.

**How to verify:** `src/main/{ether-build,updater.ether-build}.test.ts`, `src/main/startup/{ether-user-data-path,configure-ether-profile}.test.ts`, `src/main/ipc/app.test.ts`, `use-titlebar-app-name.test.tsx`, and `tests/e2e/ether-packaged.spec.ts` against a built release (see `docs/ether-maintenance.md`).

## 2. Packaging, signing and versioned release folders

**Intent:** `pnpm build:ether` builds a local arm64 `Ether.app`, signed with one persistent self-signed certificate so keychain approval survives rebuilds. Each build lands in its own folder, so a build never replaces a running app or its terminal daemon, and older releases remain available for rollback.

**Fork-owned files:** `config/electron-builder.ether.config.cjs`, `config/scripts/{build-ether-local.mjs,ether-signing-identity.cjs,verify-ether-signature.mjs}` and their `*.test.mjs` files, `tests/e2e/helpers/ether-release-bundle.ts`.

**Hooks into upstream files:**
- `package.json`: the `build:ether` script.
- `config/scripts/install-dev-cli.mjs`: `ORCA_SKIP_DEV_CLI_INSTALL=1` skips the global `orca-dev` symlink.

- Unhooked dependencies to re-check: the base `electron-builder.config.cjs` (`files`, `mac.extendInfo`, `beforePack`, `afterPack`), the launcher line `ELECTRON="$CONTENTS/MacOS/Orca"` in `resources/darwin/bin/orca`, `orca-local-build.json`, `getLocalBuildIdentity`, `resolvePnpmCliInvocation`, and the builders' `--single-arch` and `--bundle-id` flags. `build-ether-local.mjs` and `verify-ether-signature.mjs` import `src/shared/child-process/run-process.ts`, which upstream moved, so **update those imports**.

**Invariants to preserve:**
- Builds are macOS arm64 `dir` only, with `publish: null`, `protocols: []` and no notarization. Upstream release flags (`ORCA_MAC_RELEASE` and the like) are refused.
- Exactly one signing identity, `ETHER_SIGN_IDENTITY` (default "Ether Local Code Signing"), is resolved to a SHA-1 before building. There is no unsigned fallback, `CSC_LINK` and `CSC_KEY_PASSWORD` are stripped, and the app's designated requirement is verified.
- Helper bundle IDs derive from the Ether app ID. The bundled CLI runs `MacOS/Ether` with the Ether profile.
- The app is built in `dist/ether-build`, verified, then moved to `dist/ether-releases/<date>-<commit>[-N]/Ether.app` with a README row. Releases are never overwritten, and the build never installs or launches the app. E2E specs use the newest release.

**How to verify:** `config/scripts/*ether*.test.mjs`; `pnpm build:ether`, then `tests/e2e/ether-packaged.spec.ts`.

## 3. Local multi-root Projects and Workspaces

**Intent:** A Project groups several existing directories. A directory can belong to several Projects. Each Workspace is a separately saved context (its own tabs, drafts, layout, terminals and agent sessions) over its Project's roots, optionally with a different checkout per root. Creating a Workspace never creates a branch or worktree. Every agent started in a Workspace gets all of its roots. This replaces upstream's repo, worktree and project-group flow whenever `window.api.localProjects` exists (not in paired web clients).

**Fork-owned files:**
- `src/{shared,main}/local-projects/**` (the schema in `orca-data.json`, persistence, `localProjects:*` IPC, launch-scope lock, scope guard, Git target, root worktree creation) and `src/renderer/src/features/local-projects/**`.
- `src/preload/api/local-projects-bridge.ts`, `src/main/codex/codex-local-workspace-thread.ts`, `src/renderer/src/lib/{local-workspace-agent-launch,launch-agent-in-new-tab-types}.ts`, `src/renderer/src/hooks/editor-external-watch-ownership.ts`, `src/renderer/src/startup/runtime-session-hosts.ts`, `tests/e2e/helpers/local-project-*.ts`. `src/shared/agent-session-launch-args.ts` was added on both sides; take upstream's version.

**Hooks into upstream files:**

*Persistence and store*
- `persistence/loading-store/store-domain-composition.ts` and `store.ts`: construct and install `LocalProjectsPersistence`.
- `persistence/loading-store/project-collection-operations.ts`:
  - `getFolderWorkspaces` and `getFolderWorkspace` append local Workspaces projected as `folder:` rows;
  - metadata updates go to the local owner;
  - delete and first-agent-message rename are refused.
- `src/shared/persisted-state-types.ts`: `localProjects?` in `orca-data.json`.
- `runtime-store-contract.ts`: adds `resolveLocalWorkspace?`.
- `runtime-project-group-controller.ts`: refuses to delete a local Workspace.
- `src/main/ipc/repos.ts`: `registerLocalProjectHandlers`.
- `src/preload/index.ts` and `api-types.ts`: the `localProjects` API.

*UI shell*: each of these switches on `hasLocalProjectsApi()` or reads the local slice.
- `AppRootSurfaces.tsx` (local Project and Workspace dialogs), `Landing.tsx`, `sidebar/index.tsx`, `SidebarHeader.tsx`, `sidebar-header-actions.tsx`, `visible-worktrees.ts`, `use-worktree-jump-palette-store-state.ts`.
- `use-app-startup-hydration.ts` and `project-catalog-ipc-bridge.ts` call `fetchLocalProjects`. `store/{index,types}.ts` add `createLocalProjectsSlice`. `worktree-activation.ts` remembers local navigation and routes `folder:` keys.

*Files, editor and search*
- `filesystem-allowed-roots.ts` allows every resolved local root. `QuickOpen.tsx`, `quick-open-file-list.ts`, `FileExplorer.tsx`, `use-file-explorer-name-filter.ts`, `useFileSearchRunner.ts` and `SearchResult{sPane,Items}.tsx` work per root with root labels. The right-sidebar activity files show Source Control for local Workspaces.
- `editor-model-uri.ts` adds an `orca-editor=<fileId>` query, giving each Workspace its own model and draft (call sites: `MonacoEditor.tsx`, `use-monaco-editor-mount.ts`, `closed-editor-tab-{controller,disposal}.ts`, `EditorContent.tsx`).
- `editor-save-queue.ts`, `editor-file-save-attempt.ts` and `ExternalFileChangeBanner.tsx` queue saves by physical target and check for conflicts. `editor-self-write-registry.ts`, `editor-external-*` and `useEditorExternalWatch.ts` scope self-writes to a Workspace and share watch ownership.
- `EditorFileTab.tsx` and `EditorPanelHeaderPath.tsx` show "root / path" labels. `use-terminal-{editor-close-foundation,editor-close-queue,window-lifecycle}.ts` flush Workspace drafts on window close.

*Git per root*
- `filesystem-git-{status,index,commit}-handlers.ts` resolve a `localRoot` argument through `resolveDesktopGitTarget`. The preload `git-*` APIs and `runtime-git-*-client.ts` pass `localRootGitArgs`. `SourceControl.tsx` renders `LocalWorkspaceSourceControl`. `open-unstaged-diff.ts`, `open-file.ts` and `useEditorPanelDiffContentLoader.ts` put `localRoot` on diff tabs.

*Terminals and launch scope*
- `ipc/pty/host-env/spawn-cwd.ts` sets the default cwd to the default root. A launch scope must belong to its Workspace, its cwd must match, and every root must exist.
- `ipc/pty/{ipc,runtime}/spawn-preflight.ts` and `runtime/spawn.ts` call `acquireLocalWorkspacePtyLaunch`; the `ipc` preflight also refuses WSL for multi-root agents. `spawn-options.ts` and `spawn-execute.ts` use `releaseWorktreeSpawn ??=`. `spawn-types.ts`, `register-handlers.ts` and `controller-deps.ts` pass the launch context through.
- `folder-workspace-path-status.ts` checks the default root. `ipc-pty-spawn-request.ts` and `cold-restore-resume-startup.ts` check the owner in the renderer. `terminal-active-workspace-creation.ts` gives new terminals a `rootId`.

*Agent context injection*
- Claude and Codex terminals: `launch-agent-in-new-tab.ts` calls `prepareLocalWorkspaceAgentLaunch`, which adds `--add-dir` for every root, plus `--cd <cwd>` for Codex. `tui-agent-startup.ts` adds a `--` prompt separator for Claude.
- Claude chat: `claude-structured-launch-resolution.ts` sets `additionalDirectories`, appends the Workspace context to the `claude_code` system prompt, and uses the scope cwd.
- Codex chat: `codex-structured-{launch-resolution,session-state,thread-open}.ts` use the scope cwd and merge writable roots and developer instructions through `localWorkspaceCodexThreadOverrides`.
- The scope field is carried in `shared/{agent-session-record,agent-session-resume,sleeping-agent-launch-config,tui-agent-resume-startup,workspace-session-sleeping-agents}.ts`, `agent-session-reservation-admission.ts` (which validates and pins it), `structured-agent-session-{attach,read-restore,create-adoption}.ts`, `runtime-agent-launch-resolution.ts` and `agent-status-sleeping-records.ts`. `structured-conversation-command.ts` also carries it; that line arrived in the OpenCode commit, so **keep it**.
- An `acquireWorkspaceScope` lock wraps attach (`structured-agent-session-attach-orchestration.ts`, `-host-types.ts`, `structured-agent-session-runtime.ts`).
- Launch paths that can't carry every root refuse: `orca-runtime-create-agent-session.ts`, `launch-agent-background-session.ts`, `launch-ai-vault-session.ts`, `sleeping-agent-session-launch.ts`.

**Invariants to preserve:**
- One Workspace ID owns the saved view, sessions and drafts. Directory references own physical targets. Rows are never deduplicated by path or branch.
- All Workspace roots are passed to the agent, with labels, real paths and one cwd, and the provider's tools actually get access to all of them. Never fall back to the default root, a common parent, or a narrower scope. Launch paths that can't carry scope refuse with a message instead.
- The roots captured at launch are frozen on the session record and survive resume and restart. A resumed session is never rebound to the currently selected Workspace.
- Scope is captured by the local host only. It is never accepted from the remote attach schema; `connectionId` must be empty and `executionHostId` must be `local`.
- A missing root is reported. Work is never retargeted to another root.
- Changing a root set or checkout is refused while the affected Workspaces have live terminals or agents, or dirty buffers. Name and order edits are always allowed.
- Archive replaces delete and keeps tabs, drafts and directories. Workspace names are never changed automatically.
- Saving a shared file updates disk for every view. Dirty drafts in other Workspaces are kept, and conflicting saves are blocked.
- Git actions name their root. A per-root worktree is created from that root's committed HEAD and is never deleted implicitly.
- Copy-layout copies only clean saved file tabs.

**How to verify:**
- Unit tests: the tests in the three `local-projects` directories, plus `agent-session-local-workspace`, `local-workspace-spawn-cwd`, `structured-agent-session-workspace-lock`, `local-workspace-{agent-launch,agent-entrypoints,sleeping-resume}`, and the editor, search and Git tests in commit `8b2d8cb0d3`.
- E2E: the 11 `tests/e2e/local-multi-root-*.spec.ts` specs.
- Manual: WF1–WF7 in `plans/02` §7. Make a two-root Project, a second Workspace and an App A-only Project; check independent drafts and an agent editing both roots; then Quit and reopen.

## 4. Codex chat Workspace-directory fix (`4248962716`)

**Intent:** Built-in Codex chat used to refuse multi-root Workspaces. Codex grants its cwd implicitly under `workspaceWrite` and lists only the *additional* directories in `writableRoots`.

**Fork-owned files:** `src/main/codex/codex-local-workspace-thread.ts` (`assertCodexLocalWorkspaceThreadScope`), `codex-local-workspace-binary-contract.test.ts`, `tests/e2e/ether-codex-chat.spec.ts`.

**Hooks into upstream files:** only through `codex-structured-thread-open.ts` (section 3).

**Invariants to preserve:**
- A root counts as granted if it is inside the reported cwd or one of the writable roots.
- Chat still refuses when a root is genuinely missing, or when Codex doesn't confirm the cwd.
- Manual permissions and the sandbox settings are never loosened. `danger-full-access` is accepted only when the user chose it.

**How to verify:** `src/main/codex/codex-local-workspace-thread.test.ts`. The binary contract test is opt-in through `ORCA_CODEX_CONTRACT_BINARY`, `ORCA_CODEX_CONTRACT_VERSION` and `ORCA_CODEX_CONTRACT_REQUIRED`. The E2E spec needs `ETHER_CODEX_LIVE_SMOKE=1` and `ETHER_CODEX_TEST_MODEL`.

## 5. Linear: multiple issues per Workspace, and setup

**Intent:**
- A local Workspace can link many Linear issues, and one issue can link to many Workspaces.
- Links show in the sidebar, Tasks, issue details and jump search.
- Linear is usable for browsing and linking without the optional agent skill, and appears in Tasks before it is connected.
- Stalled reads time out with a retryable error.

**Fork-owned files:**
- `src/shared/local-projects/linear-issues.ts` (`linearIssues` on `LocalWorkspace`, `linearIssue` on create).
- `src/main/local-projects/linear-issue-{linking,persistence}.ts`.
- `src/main/linear/linear-read-deadline.ts`.
- `src/renderer/src/features/local-projects/{LocalIssueWorkspace*,LocalWorkspaceLinear*,local-workspace-linear-*,local-workspace-composer-intent.ts,use-local-*linear*}`.
- `src/renderer/src/lib/worktree-palette-local-linear-issues.ts`.
- `tests/e2e/helpers/local-project-linear-backend.ts`.

**Hooks into upstream files:**
- Task page: `IssueTable.tsx` and `IssueBoardColumns.tsx` render `LocalIssueWorkspaceActions`. `linear-issue-workspace-{header,sidebar}.tsx` and `LinearIssueWorkspace.tsx` show local links and "New Workspace for issue". `use-task-page-linear-filter-selection.ts` and `use-task-page-store-bindings.ts` make "Has Workspace" include local links. `use-task-page-linear-in-orca-effects.ts` and `task-page-linear-in-orca-issues.ts` (moved upstream) read issues by exact account. `CustomViewList.tsx` and `ProjectList.tsx` show errors.
- `use-task-page-composer-actions.ts` and `worktree-jump-palette-create-worktree.ts` pass `linearIssue`. `worktree-palette-{document,task-url-match}.ts` add jump-search matching. `linear-issue-detail-actions.ts` uses an explicit-source cache key.
- Main process: `client.ts` (`signal`), `linear-request-concurrency.ts` (abortable queue), and four `linear-*` read modules wrapped in `withLinearReadDeadline`.
- `src/shared/task-providers.ts` makes Linear always available. `task-source-setup-state.ts` and `TaskSourceProviderCard.tsx` drop the skill-required statuses. Six settings components change copy.
- `config/oxlint-design-system.json` adds a `CommandItem` contract.

**Invariants to preserve:**
- Links belong to the Workspace UUID. Linking never creates a worktree, changes issue status, or prompts an agent. Tests never write to Linear.
- Attaching verifies the issue against its exact saved account. Unlinking is local and works offline.
- Creating a Workspace from an issue verifies the issue before a single write; a failure creates nothing. Archived Workspaces keep their links but drop out of active matches.
- Search runs only after an explicit query. Reads time out after 30 seconds, and mutations are never retried.
- The agent skill stays optional. Credentials are reused, never copied.

**How to verify:** `src/main/local-projects/linear-*.test.ts`, `src/main/linear/linear-{read-deadline,issue-search}.test.ts`, the Linear tests in `features/local-projects`, `task-page-linear-collection-effects.test.tsx`, `task-providers.test.ts`; E2E `tests/e2e/local-projects-linear{,-entry}.spec.ts` and `ether-linear-onboarding.spec.ts` (needs a built release; set `ETHER_LINEAR_STALL_CHECK=1` for the stall check); manually, "Using the Linear integration" in plans/01.

## 6. Local Projects sidebar P0 (`ae81434245`)

**Intent:** A quieter, attention-first sidebar: Harpoon-style marks 1–9, Workspaces sorted by recent activity inside a fixed Project order, a held Ctrl+` recent switcher, archive of the *open* Workspace with Undo, Linear keys shown inline (linking moved into menus), and a footer with the open Workspace's roots, branches and changes.

**Fork-owned files:** `src/renderer/src/features/local-projects/{LocalSidebar*,LocalWorkspaceMarksDialog,LocalWorkspaceRecentSwitcher,LocalWorkspaceShortcuts,local-sidebar-model,local-workspace-sidebar-actions,local-workspace-quick-actions}.ts(x)`, `src/shared/local-projects/mark-slots.ts`, `src/shared/keybindings/definitions-local-workspaces.ts`.

**Hooks into upstream files:**
- `components/sidebar/index.tsx`: `LocalSidebarTop` replaces `SidebarNav`; `LocalWorkspaceShortcuts` stays mounted even while the sidebar is collapsed.
- `app-shell/app-command-handlers.ts` and `hooks/ipc-events/workspace-shortcut-ipc-bridge.ts`: in local mode, `workspace.delete` archives the open local Workspace.
- `use-worktree-jump-palette-project-targets.ts`: adds `getLocalWorkspaceQuickActions()`.
- `shared/keybindings/definitions.ts` and `types.ts`: spread `KEYBINDING_DEFINITION_LOCAL_WORKSPACES` and add `LocalWorkspaceKeybindingActionId`.

**Invariants to preserve:**
- `markSlot` is unique (enforced by the schema). Slots never renumber. Taking a held slot swaps the two Workspaces in one write. Archiving clears the slot.
- Mod+1–9 jumps by slot only. There is no fallback to the nth row.
- Archiving the open Workspace first opens the previous one: the most recently visited, else a sibling in the same Project, else any Workspace. It then archives and offers Undo, which restores the mark. Running agents are named in the toast and are not stopped.
- Sorting freezes while the pointer or focus is in the list.
- Sidebar clicks use the shared activation path, so they feed recency and back/forward history.
- The new keybinding IDs stay rebindable: Mod+Shift+H, Mod+; and Ctrl+Backquote.
- Builds older than this one can't read a profile that has marks. `RELEASES_README` documents this.

**How to verify:** `local-sidebar-model.test.ts`, `local-workspace-sidebar-actions.test.ts`, `LocalProjectsSidebar.test.tsx`, `local-workspace-navigation.test.tsx`, `src/main/local-projects/persistence.test.ts` (marks); E2E `tests/e2e/local-sidebar-switching.spec.ts` and `local-multi-root-navigation.spec.ts`; the manual checklist is "P0 as built" in `plans/03_sidebar-plan.md`.

## 7. "Setup fix" (`7a864a42f4`)

**Intent:** Make a fresh checkout build and run reliably: pin Node, document the toolchain, and stop OpenCode's terminal-status binder from warning when `opencode.db` doesn't exist yet.

**Fork-owned files:** `.node-version` (24.21.0).

**Hooks into upstream files:** `.github/CONTRIBUTING.md` (setup notes, which still say pnpm 12.0.0 while upstream uses 12.14.0); `src/main/opencode/opencode-session-binder.ts` and its test (a guard for a missing store).

**Invariants to preserve:** a missing store is skipped silently and never created; a corrupt store still warns. Upstream fixed the same problem in `cb03a0545a` and `b06f40f3ba`, so **take upstream's binder and test**. Keep `.node-version` only if it matches upstream's `engines`.

**How to verify:** `server-opencode-binder.test.ts`; `pnpm install --frozen-lockfile && pnpm dev` from a clean checkout.

## 8. OpenCode built-in chat: REMOVE (`7908178403`, `d12085ef99`)

Decision: delete the fork's OpenCode chat and use upstream's ACP OpenCode. `d12085ef99` only edited the plan text.

**Files the fork added; delete them.** Where a file marked † conflicts, keep upstream's version.
- `src/main/opencode/`:
  - `opencode-adapter-test-fixture.ts`, `opencode-journal-translation.ts`;
  - `opencode-server-{connection,connection-types,events,http,process,test-fixture}.ts`, with tests;
  - `opencode-session-{dispatch,open,options,prompts,protocol}.ts`, `opencode-session-history.ts`†;
  - `opencode-structured-account-home.ts`†, `opencode-structured-launch-resolution.ts` with its test;
  - `opencode-structured-session-{acquire,adapter,state}.ts`, `opencode-structured-session-{adapter,events}.test.ts`.
- `src/main/runtime/structured-opencode-runtime-adapter.ts`, `src/main/runtime/rpc/methods/structured-agent-session-opencode-capability.test.ts`, `src/main/native-chat/agent-session-wire/structured-agent-session-opencode.test.ts`.
- `src/shared/agent-session-account-home.ts`†, `src/shared/agent-session-option-catalog-opencode.ts`†, `src/shared/agent-session-opencode-identity.test.ts`, `src/renderer/src/lib/structured-agent-session-provisional-tab.test.ts`†.
- `tests/e2e/ether-opencode-chat.spec.ts`.
- Generic extractions made in the same commit: `src/main/native-chat/structured-agent-session-location-support.ts` and `agent-session-wire/structured-agent-session-journal-identity.ts`. Drop them and take upstream's shape.

**Hooks to revert (take upstream's side):**
- Provider widened to include `'opencode'`: `shared/agent-session-{provider-handle,journal-types,journal-item-key,option-catalog,record}.ts` (in `agent-session-record.ts`, drop the `XDG_DATA_HOME` rule but keep the `localWorkspaceScope` lines), `runtime-mobile-session-tab-contracts.ts`, `structured-agent-session-mutation.ts`, `structured-session-worktree-teardown.ts`, `structured-worker-authority.ts`, `structured-agent-session-host-types.ts`, `structured-provider-session-ownership.ts`, `structured-agent-session-history-{adoption,result}.ts`, `orca-runtime-restore-structured-agent-session-tabs-once.ts`, and renderer `structured-agent-session-{launch-persistence,provisional-tab}.ts`.
- Wire capability `agent-session.structured.opencode.v1`: `protocol-version.ts`, `desktop-renderer-runtime-capabilities.ts`, `structured-native-chat-launch-route.ts`, `rpc-contract/structured-agent-session-params.ts`, `session-tab-agent-status-projection.ts`, and `structured-agent-session-gate.ts` (`structuredProviderVisibleToClient`) with its callers in the `structured-agent-session{,-create,-hold,-reveal,-send-compatibility,-restart-resume,-status-stream,-turn-completion-stream}.ts` RPC methods.
- Runtime wiring: `structured-agent-session-runtime.ts` (adapter and deps), `structured-agent-session-adapter-router.ts`, `orca-runtime-get-worktree-ps.ts`, `orca-runtime-resolve-recovered-structured-tui-transcript.ts`, `agent-session-record-store-file.ts`, and `agent-session-reservation-admission.ts` (keep its scope lines).
- OpenCode refusals in `agent-session-wire/`: `agent-session-journal-recovery.ts` and `structured-agent-session-{adopted-import,attach,handoff-admission,handoff-reverse,host-handoff,provider-support,rewind}.ts`. `claude-` and `codex-structured-location-support.ts` were turned into re-exports.
- `src/renderer/src/lib/local-workspace-agent-launch.ts`: drop the `nativeOnly` OpenCode branch and restore the Codex/Claude-only message. Update the matching tests.

**Dependents:**
- `tests/e2e/helpers/packaged-agent-chat-smoke.ts` is shared with the Codex smoke test. Keep the file and remove the `'opencode'` agent, its label and the `ETHER_OPENCODE_TEST_BIN_DIR` branch.
- plans/01 §2 is historical only.
- Existing OpenCode records in the Ether profile's `agent-sessions/agent-sessions.json` use `{variable: 'XDG_DATA_HOME', path}`. Upstream uses `{kind: 'opencode', locator}`. Confirm upstream treats the old shape as unreadable without blocking other sessions.
- After removal, ACP OpenCode is refused in multi-root Workspaces (`supportsLocalWorkspaceAgent` allows only Claude and Codex) until scope injection is added. That is follow-up work.

---

## Hygiene debt: candidates to move into fork-owned files during the merge

README steps 3.4–3.6 turn this list into seam modules; 3.8 adds the fork-surface check that keeps it from growing back.

1. **The updater**: six inline `refuseEtherUpdate` guards. Choose an Ether updater once at startup instead.
2. **The Linear settings rewrite** (`fb047d1a2f`) edits about 10 upstream settings components. Put the skill-optional readiness behind a fork-owned adapter, and take upstream's copy.
3. **Task-page Linear**: `LocalIssueWorkspaceActions` and filter edits are spread across `IssueTable`, `IssueBoardColumns`, the header, sidebar and filter hooks. Use one slot component.
4. **Editor identity** (model URI query, target-keyed save queue, self-write registry, watch reconciliation) is deeply inline. Export these from `features/local-projects` and keep only call sites in upstream files.
5. **`localWorkspaceScope`** is threaded through about 15 shared and runtime types. Use one carrier type plus copy and compare helpers in `shared/local-projects`.
6. **Git `localRoot` branches** are repeated in three IPC handlers and four renderer clients. Use one wrapper per side.
7. **`hasLocalProjectsApi()` switches** are scattered across ten or more UI files. A small surface registry would reduce each to one line.
8. **Ether packaging** depends on upstream launcher text and builder hooks. Add a check that fails fast when they change; the `run-process` path is the first break.
9. **Stray files:** `visualize-test.html` at the repo root (from `e4b4a05cbf`), and links in `docs/ether-maintenance.md` and `plans/02` to plan files that have since been renamed.
