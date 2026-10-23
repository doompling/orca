# Upstream merge 1: renderer conflict plan

BASE `ae3d380b23` → OURS `ether` (`d9a1140d8e`, 12 commits) / THEIRS `52e413ec85` (4,238 commits). Scope: 60 conflicting paths under `src/renderer/`. 58 are content conflicts; `closed-editor-model-registry.test.ts` is modify/delete and `structured-agent-session-provisional-tab.test.ts` is add/add.

## Legend

- **take-theirs**: use upstream's file as-is. Our hunk is obsolete: upstream now covers it, or it belongs to our OpenCode chat, which is being dropped.
- **take-theirs + re-apply**: use upstream's file, then re-add a small fork hook, ideally a single call into a file under `features/local-projects/` or another fork-owned file. Upstream rewrote too much for a line-by-line merge.
- **combine**: keep both sides; the hunks are independent or mechanical.
- **needs-design**: the fork behavior has no safe home yet. A proposal is included.

Counts: take-theirs **18**, take-theirs + re-apply **12**, combine **29**, needs-design **1**.

### Upstream changes that affect every package

1. **Runtime routing changed from `settings` to `target`.** `RuntimeGitContext.settings` is now `target: RuntimeClientTarget`, plus optional `prefs`. File clients take `target` too. `settingsForRuntimeOwner` was replaced by `getRuntimeTargetForFileOwner`/`requireRuntimeTargetForFileOwner`, and `{ activeRuntimeEnvironmentId: null }` becomes `runtimeTargetForOwnerEnvironment(null)`. `getRuntimeEnvironmentIdForWorktree` was replaced by `runtimeEnvironmentIdOrLocalUnlessTwin`.
2. **Modules were split or moved.** `runtime-file-client` became `runtime-file-{read,search,mutation,watch,…}-client`. `runtime-git-client` became `runtime-git-{diff,status,sync,working-tree,generation}-client` plus `-context`. `lib/agent-row-decay-state` and `lib/tab-has-live-pty` moved to `src/shared/`. `components/task-page-linear-*` moved to `components/task-page/linear/`. **Fork files that break:** `local-workspace-content-search.ts`, `use-local-root-git.ts`, `local-sidebar-model.ts`, `local-workspace-scope-edit-guard.ts`, `local-workspace-linear-task-refs` (via the in-orca-issues path), and their tests.
3. **Workspace records now go through selectors.** Read them via `selectFolderWorkspaces`/`selectWorktreesByRepo`; a ratchet script enforces this (`config/scripts/check-workspace-record-read-ratchet.mjs`). `LocalProjectsSidebar.tsx` reads `state.folderWorkspaces` directly and will trip the ratchet.
4. **Editor buffer records.** Tabs of one file on one host now share a single Monaco model, draft, baseline, and conflict, even across workspaces. The owner key is `getEditorModelOwnerKey`. Every save is disk-guarded (`editorSavePrecondition`, banner **Overwrite**). This makes most of our editor work in package C redundant.
5. **Multi-target file watching.** Upstream handles "two folder workspaces on one directory" itself: `findTargets` returns a list, and `acquireWatchRoot` reference-counts native watch roots.

---

## Work packages (in dependency order)

### A. Store and startup (do first; everything else type-checks against it)

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| store/index.ts | content | combine | Adds `createLocalProjectsSlice` | Wraps store in `withEditorBufferRecords`; adds new slices | Keep upstream wrappers; add our slice spread inside the inner creator after `createRepoSlice`. |
| store/slices/store-test-helpers.ts | content | combine | Adds local-projects slice | Wraps in buffer-record middleware; fixtures moved out | Upstream file plus one slice line. |
| store/slices/agent-status-sleeping-records.ts | content | take-theirs + re-apply | `copyLaunchConfig` copies `localWorkspaceScope` | `copyLaunchConfig` moved to `shared/agent-resume-record-from-status.ts` | Take theirs. Add the scope copy to shared `copyLaunchConfig` (shared-scope task). |
| store/terminals/terminal-active-workspace-creation.ts | content | combine | Root-aware new terminal (`rootId`, `startupCwd`) | Owner-function rename; `setActiveTabType(…, worktreeId)` | Keep our root block; use upstream function names. |
| app-shell/use-app-startup-hydration.ts | content | combine | `fetch-local-projects` step; host lister extracted | Structured-chat restore, drafts step, `isOwnedSshTargetId` | Upstream body, plus our step before `fetch-project-groups-local`; keep extraction (file is ~368 lines). |
| hooks/ipc-events/project-catalog-ipc-bridge.ts | content | combine | `fetchLocalProjects()` on `repos:changed` | Explicit `localOwner`; `adoptFromEndpoint` | Upstream body plus our 3-line guard. |
| hooks/useIpcEvents-repos-changed-catalogs.test.ts | content | combine | Mocks and expects `fetchLocalProjects` | Collapsed into one runtime/no-runtime test | Upstream tests; add our mock and `toHaveBeenCalledOnce` assertion. |

### B. Runtime Git clients (local Workspace roots)

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| runtime/runtime-git-client-context.ts | content | combine | `localRoot`, `localRootGitArgs` owner guard | `settings` → `target`/`prefs` | Keep helper; guard on `context.target.kind !== 'local'` instead of `getActiveRuntimeTarget`. |
| runtime/runtime-git-diff-client.ts | content | combine | Spreads `localRootGitArgs` into local diff | Uses `context.target` | Mechanical: keep spread on the local branch. |
| runtime/runtime-git-status-client.ts | content | combine | Spreads `localRoot` into status | `target`; new `getRuntimeGitMutationInFlight` | Keep spread. Decide whether `mutationInFlight` needs `localRoot` (main must accept it). |
| runtime/runtime-git-sync-client.ts | content | combine | `localRoot` on commit | `target` everywhere | Mechanical. |
| runtime/runtime-git-working-tree-client.ts | content | combine | `localRoot` on stage/unstage | `target`; new `stageRuntimeGitWorktreeScope` | Keep spreads; add `localRoot` to the new scope-stage call if Local Workspace Git uses it. |

### C. Editor model and save (mostly take upstream)

Upstream's buffer records already give each host its own model and a guarded save. Our per-tab model URI (`toEditorModelUri(path, fileId)`), per-workspace self-write stamps, and per-target save queue are dropped. **Behavior change:** two Workspaces whose roots point at the same directory now share one unsaved buffer instead of keeping separate drafts, the same way VS Code behaves. If the separate-draft behavior is wanted, the only clean hook is a fork term inside `getEditorModelOwnerKey`. Not recommended.

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| editor/editor-model-uri.ts | content | take-theirs | `fileId` query isolates same-path owners | Owner-key authority under `vscode-remote` scheme | Take theirs. |
| editor/editor-model-uri.test.ts | content | take-theirs | Same-path owner isolation test | Owner/UNC/drive-letter tests | Take theirs. |
| editor/MonacoEditor.tsx | content | take-theirs | Model URI and sync keyed by `fileId` | `modelOwnerKey`, rekey carry, passive mirror | Take theirs. |
| editor/use-monaco-editor-mount.ts | content | take-theirs | Sync/view-state keyed by `fileId` | `fileIdRef`, stale-cache guard, `modelKey` | Take theirs. |
| editor/closed-editor-tab-controller.ts | content | take-theirs | URIs keyed by `file.id` | URIs keyed by `modelOwnerKey`; kept records | Take theirs. |
| editor/closed-editor-tab-disposal.ts | content | take-theirs | Scroll caches keyed by id | Edit-cache sweep removed; check-details only | Take theirs. |
| editor/closed-editor-model-lifetime.test.ts | content | take-theirs | Independent drafts per workspace | Keeps "shared URI until final owner closes"; registry cases merged in | Take theirs; our assertion contradicts the new design. |
| editor/closed-editor-model-registry.test.ts | modify/delete | take-theirs | Passes `file.id` to model helper | Deleted; cases moved into lifetime test | Accept deletion. |
| editor/editor-save-queue.ts | content | take-theirs | Local-target queue; `verifyLocalWorkspaceEditorSave` | Save slots, path write-lock, disk precondition | Take theirs. Delete `features/local-projects/local-workspace-editor-save.ts` and its test. |
| editor/editor-file-save-attempt.ts | content | take-theirs | Surfaces local conflict message | Surfaces `EDITOR_STALE_SAVE_MESSAGE` | Take theirs. |
| editor/editor-self-write-registry.ts | content | take-theirs | `workspaceId` on stamps | Expiry timer | Take theirs; workspace scoping is unneeded with a shared buffer. |
| editor/ExternalFileChangeBanner.tsx | content | take-theirs | Guarded Keep My Edits; local copy | Model-wide Keep, tracked restamp, **Overwrite** | Take theirs; it covers our guard. |
| editor/ExternalFileChangeBanner.test.tsx | content | take-theirs | Local guard tests | Model-sibling tests, new mocks | Take theirs. |
| editor/useEditorPanelDiffContentLoader.ts | content | combine | `localRoot` → local route; in-flight key | `requireRuntimeTargetForFileOwner`; clean-tab baseline stamp | `target = file.localRoot ? { kind: 'local' } : require…`; keep `localRoot` arg and key prefix; keep upstream SAFETY cast. |
| editor/EditorPanelHeaderPath.tsx | content | take-theirs + re-apply | Root label prefix in header path | Location menu extracted; `ImeInput` | Take theirs; re-add `useLocalWorkspaceEditorRoot` and `pathLabel` (4 lines). |
| tab-bar/EditorFileTab.tsx | content | take-theirs + re-apply | `Root / file` tab label | `TabHoverCard`, slot props, `gitStatus` prop | Take theirs; re-add `localRoot` and prefixed `tabLabel` (feeds hover-card title). |

### D. Editor external watch (multi-root)

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| hooks/useEditorExternalWatch.ts | content | take-theirs | Dedupes subscriptions via `editor-external-watch-ownership` | `acquireWatchRoot` refcount; multi-target filter; resync | Take theirs. Delete `editor-external-watch-ownership.ts` and re-check `editor-shared-workspace-watch.test.ts`. |
| hooks/editor-external-watch-targets.ts | content | take-theirs + re-apply | One target per Workspace root; `localProjects` cache | Consumer/host model, `resolveWatchTargets`, background trim | Take theirs. Inside `resolveWatchTargets`, loop paths from a fork helper `localWorkspaceWatchPaths(state, id, owner, connectionId)`; add `localProjects` to the cache check. File is ~302 lines, so keep the hook to 1–3 lines. |
| hooks/editor-external-watch-event-reconciliation.ts | content | take-theirs + re-apply | Target arrays; overflow relative path fix | Arrays built in; overflow moved to `editor-external-watch-overflow.ts` | Take theirs; port the "relative to target root, skip outside" fix to `reconcileEditorTabsAfterOverflow` (`file.relativePath` site). |
| hooks/editor-external-watch-disk-verification.ts | content | take-theirs + re-apply | Root path in debounce key; `workspaceId` self-write | No-starve debounce; echo-read slots; `target` | Take theirs; re-add `worktreePath` to the debounce key (two roots can share a relative path). Drop `workspaceId` args. |

### E. Right sidebar: explorer, search, quick open

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| components/quick-open-file-list.ts | content | combine | `rootPath` override | Target helpers extracted; recent paths; `target` | Upstream plus `rootPath` param; `worktreePath = rootPath ?? worktree?.path`. |
| right-sidebar/FileExplorer.tsx | content | combine | Root bar wrapper; `root` prop overrides path/label | Sparse display root, scope notice, keyed by owner | Keep upstream body; `worktreePath = root?.path ?? …`; wrapper renders `LocalWorkspaceRootBar`; key memo by `ownerKey + root.id`. |
| right-sidebar/SearchResultItems.tsx | content | combine | Root label in row/tooltip; fork result type | `FileTypeIcon`, tooltip toggle, truncation | Upstream markup plus our `dirPath` and tooltip lines. |
| right-sidebar/SearchResultsPane.tsx | content | combine | "Search incomplete" root error banner | `error` prop, alert, empty state | Keep both: upstream `error` for failure, our banner for partial roots (use tokens). |
| right-sidebar/useFileSearchRunner.ts | content | combine | Multi-root branch via `searchLocalWorkspaceContents` | AbortController, error state, twin guard, owner identity | Upstream skeleton; local branch uses local target, `executionHostId: 'local'`, passes `controller.signal` (fork search needs a signal param). |
| right-sidebar/useFileSearchRunner.test.tsx | content | combine | Multi-root test | Many ownership/abort tests; new client module | Upstream tests; port ours to `runtime-file-search-client` and `target`. |
| right-sidebar/right-sidebar-activity-visibility.ts | content | combine | Source Control allowed for local Workspace | `isSshRepo` → `hasSshHost` | Both; one-line filter. |
| right-sidebar/right-sidebar-activity-visibility.test.ts | content | combine | Local Workspace test | Renamed field | Rename to `hasSshHost` in our case. |
| right-sidebar/use-right-sidebar-activity-items.ts | content | combine | `isLocalWorkspace` flag | `hasSshHost` from ports owner | Both. |

### F. Worktree sidebar mount and navigation

Upstream's mount points are stable: `index.tsx` only gained banners and a drop ref; `sidebar-header-actions.tsx` now always shows **Add project**; `visible-worktrees.ts` moved its compute logic to `compute-visible-worktrees.ts` but kept `getVisibleWorktreeShortcutTargets`. Our hooks still fit.

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| sidebar/index.tsx | content | combine | Local top, `LocalProjectsSidebar`, shortcuts | Daemon banners, `sidebarRef` drop owner, git-toolchain banner, sleep-twin dialog | Upstream body; keep our ternaries. Render `LocalGitToolchainScanBanner` above `LocalProjectsSidebar` too. |
| sidebar/sidebar-header-actions.tsx | content | combine | Hide options and New Workspace; "New Project" label | **Add project** shown in every view | Upstream layout; wrap options and `NewWorkspaceButton` in `!localProjects`; translate the label. |
| sidebar/visible-worktrees.ts | content | combine | Local mark slots as shortcut targets | Compute split out; `lineageGroupKey`; selectors | Upstream file plus our 3-line early return. |
| use-worktree-jump-palette-store-state.ts | content | combine | Appends `localWorkspacePaletteRows` | Adds folder workspaces; `workspaces` rename | Append our rows **last** so dedupe keeps "Project / Workspace" names. |
| lib/worktree-activation.ts | content | combine | Remember navigation; folder keys redirect | Floating-panel guard; visit helpers; filter lift | Keep both; our folder redirect goes after the floating guard. |

### G. Linear (multiple issues per Workspace)

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| settings/TaskSourceLinearSetup.tsx | content | combine | Skill moved to optional section; step 2 | `AgentSkillSetupPanel` now takes `skillNames`/`installedSkillNames` | Our layout with upstream's new panel props. |
| use-task-page-linear-filter-selection.ts | content | combine | Adds local Workspace Linear refs | Import paths moved under `task-page/linear/` | Our logic, upstream paths. |
| use-task-page-store-bindings.ts | content | combine | Exposes `localProjects` | `selectFolderWorkspaces`; `preflightDescribesDesktop` | Both. |

### H. Agent launch, resume, and PTY scope

Our pattern: `prepareLocalWorkspaceAgentLaunch` computes scope (cwd, `--add-dir` args, prompt), `allowLocalWorkspaceAgentRoute` gates routes, and `assertLegacyAgentEntrypointSupportsWorkspace` blocks paths that can't carry scope. Upstream added two new routes that skip our injection: host-planned new-tab launches, and OpenCode host session creation.

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| lib/launch-agent-in-new-tab.ts | content | take-theirs + re-apply | Scope injection, route gates, types extracted | Host routing first, request ids, `pendingStartup` on `createTab`, host prompt route | Take theirs; re-add `localLaunch` and gates (see risks). Drop our types file unless max-lines forces it. |
| lib/launch-agent-background-session.ts | content | take-theirs + re-apply | Uses `resolveAgentBackgroundLaunchTarget` guard | Startup-plan inputs, extra args, relay delivery | Take theirs; add one `assertLegacyAgentEntrypointSupportsWorkspace(…)` line before the worktree lookup. |
| lib/agent-background-session-launch-host.ts | content | take-theirs + re-apply | New `resolveAgentBackgroundLaunchTarget` | Host-fact platform, `isLocalHost` | Take theirs; the guard moves to the caller above (or `local-workspace-agent-launch.ts`). |
| lib/launch-ai-vault-session.ts | content | take-theirs + re-apply | Legacy-entrypoint guard | Split handling, `pendingStartup`, tab order helper | Take theirs; re-add the 5-line guard at the top. |
| lib/sleeping-agent-session-launch.ts | content | take-theirs + re-apply | Scope guard, scope in resume plan, `startupCwd` | `resolveResumeLaunchRecipe`, SSH platform | Take theirs; re-add guard; spread `localWorkspaceScope` after the recipe; keep `startupCwd`. |
| pty-connection/cold-restore-resume-startup.ts | content | take-theirs + re-apply | Scope guard and spread; exported session `Pick` | Recipe helper; `transport` runtime for platform | Take theirs; re-add guard and spread; add `'transport'` to `ColdRestoreResumeSession`. |
| terminal-pane/ipc-pty-spawn-request.ts | content | **needs-design** | Scope owner assert; `cwd = scope.cwd`; no cwd fallback | OpenCode `terminal.createAgentSession` branch; `cwdFallback` removed; placement and `agentLaunch` | See risk 3. Proposal: fork helper `local-workspace-pty-spawn-scope.ts`, called once at the top. |

### I. Structured agent sessions (our OpenCode chat dropped)

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| lib/structured-agent-session-launch-persistence.ts | content | take-theirs | Allows `opencode` provider | Record module split; host-scoped tombstones | Take theirs. |
| lib/structured-agent-session-launch-persistence.test.ts | content | take-theirs | Parametrised over opencode | Host tombstone tests | Take theirs. |
| lib/structured-agent-session-provisional-tab.ts | content | take-theirs | `isAgentSessionHandleProvider` gate | Host-admitted launches; no provider gate | Take theirs. |
| lib/structured-agent-session-provisional-tab.test.ts | add/add | take-theirs | 58-line opencode test | 455-line suite | Take theirs. |

---

## Highest-risk files

1. **`lib/launch-agent-in-new-tab.ts`.** Upstream now calls `routeNewTabLaunch` before anything else. It can return `awaited` (re-entering through `launchOnceHostAnswered`) or a structured plan, and it has a new `newTabPromptLaunchesThroughHost` path where **main builds the command**. That path bypasses our scoped `agentArgs`, prompt, and `launchConfig.localWorkspaceScope`, so a local Workspace agent would silently start with only the default root. Re-apply in this order:
   - Compute `localLaunch` after `executionContext`.
   - Gate `allowLocalWorkspaceAgentRoute(localLaunch, plan.route)` right after `const { plan } = route`, and again before `isWebRuntimeSessionActive`.
   - Make `newTabPromptLaunchesThroughHost(...)` false when `localLaunch.kind === 'local'`.
   - Pass `startupCwd` to `createTab`, `localWorkspaceScope` into `startupPlanBase`, and `launchCwd` to `queueTabInitialCwd`.

   The file is ~363 raw lines against a 300-line `.ts` cap, so keep the hook to one helper call that returns the overrides.
2. **`hooks/editor-external-watch-targets.ts`.** Upstream rebuilt target selection: consumers per host, background-workspace trimming, and an unwatched-key resync. Our per-root emission must move into `resolveWatchTargets`. If it's missed, saves in non-default roots of a Workspace never surface "changed on disk", and Explorer doesn't refresh for those roots. Watch out for the background trim: `selectWatchEligibleWorkspaceIds` uses `resolveEditorExternalWatchTargetRows(state, id)`, which must keep resolving our `folder:` ids.
3. **`terminal-pane/ipc-pty-spawn-request.ts`** (needs-design). Upstream's OpenCode-with-preferences branch sends `startupCwd: transportOptions.cwd` to main's `terminal.createAgentSession` before our scope code runs, and returns through a recursive call with `launchConfig: undefined`. That drops the scope assertion and cwd. Proposed helper, `applyLocalWorkspaceSpawnScope(transportOptions, connectOptions)`, called once at the top:
   - Asserts the owner.
   - Returns the scoped `cwd`.
   - Returns `skipHostCreate: true` when a scope exists, so scoped launches stay on the direct spawn.

   Our `cwdFallback` hunk goes away, because upstream deleted the fallback.
4. **`editor/editor-save-queue.ts`, `ExternalFileChangeBanner.tsx`, `editor-model-uri.ts` (the package C decision).** Taking upstream is a product change: same-directory Workspaces share one draft and one conflict banner. It also deletes `local-workspace-editor-save.ts` and the "verify before Keep" UX. Upstream's guarded saves and **Overwrite** button protect against data loss. Re-test with two Workspaces on one root and with checkout overrides (different paths, so separate buffers).
5. **`right-sidebar/FileExplorer.tsx`.** Upstream keys the memoized explorer by operation owner and added sparse display-root plumbing (`displayRootPath`, `effectiveExpanded`, reveal-outside-root). Our `root` override must feed `worktreePath` before `getExplorerDisplayRootPath`, and the memo key must include the root id. Otherwise switching roots reuses the previous root's tree, selection, and expand state. Also confirm `FileExplorerHeader` gets the root path, not the projected `folder:` path.
6. **`right-sidebar/useFileSearchRunner.ts`.** Upstream adds abort, a twin-owner refusal, and `isFileSearchResultOwnerCurrent(owner, worktreeId, rootPath, env, hostId)`. For multi-root results, `resultOwner.rootPath` must equal the panel's `worktreePath`, or results go stale immediately. `searchLocalWorkspaceContents` must honor the abort signal and move to `runtime-file-search-client`.
7. **`store/index.ts` + store-wide changes.** Small conflict, broad fallout. Our slice must sit inside `withEditorBufferRecords`. Also expect compile breaks across `features/local-projects/` from the module splits and the `settings`→`target` change, plus a ratchet failure from direct `state.folderWorkspaces` reads.
8. **`store/slices/agent-status-sleeping-records.ts` + resume files.** `copyLaunchConfig` and `resolveResumeLaunchRecipe` now live in `src/shared/`. If `localWorkspaceScope` isn't added there, sleeping or cold-restored agents lose their roots and hit our "no complete Workspace roots" refusal on every wake. Also note `resolveResumeLaunchRecipe(undefined)` now returns empty args instead of the settings defaults.

---

## UI to re-verify after merge

Build after merging, then launch hidden with `ORCA_BACKGROUND_LAUNCH=1` and drive with the `$electron` skill over Playwright CDP. Take CDP screenshots of the hidden renderer only (never `show()` or focus). Use a fixture with two local Projects: one with 2 roots, plus a second Workspace on the same root directory, and one root with a checkout override.

1. **Left sidebar (local mode):** `LocalSidebarTop`, Marks, Projects list with recency, archive while open, scope footer. Header shows only **New Project**. Daemon banners and the git-toolchain banner render. Collapsed sidebar: mark shortcuts (digits) still switch Workspaces. Agents view still swaps the body correctly.
2. **Cmd+J palette:** each local Workspace appears once, titled "Project / Workspace". Selecting it activates the `folder:` Workspace and records recency.
3. **Explorer:** root bar switches roots, the tree resets per root, and the name filter scopes to the selected root. Create/rename/reveal act on the selected root's path.
4. **Search (Contents):** results from both roots with root labels and tooltips. The "Search incomplete" banner shows when one root is missing. A new query aborts the previous one. Clicking a result opens the right file in the right root.
5. **Editor:** tab label and header show `Root / path`. Edit a file, change it on disk from a terminal, and check the banner shows Reload/Overwrite/Keep. A save after Keep is guarded. Two Workspaces on one root share the draft. A file in a non-default root gets the external-change banner.
6. **Source Control:** visible for a local Workspace. Per-root status, diff, stage, unstage, and commit run against that root. Diff tabs open with the correct base.
7. **Agent launch:** quick launch (terminal), an AI-button launch (`submit-after-ready`, the host-route path), and a structured chat for Claude and Codex. Check the agent sees every root (`--add-dir`/cwd). Upstream's OpenCode with model preferences either keeps scope or is refused clearly.
8. **Resume:** sleep a Workspace agent and wake it; quit and cold-restore. The resumed command still carries scope. A record without scope shows the refusal toast.
9. **New terminal** in a local Workspace opens in the chosen root's cwd.
10. **Linear:** Settings → Tasks → Linear shows connect, optional skill section, and visibility steps. Task page lists issues linked to local Workspaces. Multiple issues per Workspace still show in sidebar rows.
11. **Branding sanity:** window title, About, and empty states still say Ether after the merge.
