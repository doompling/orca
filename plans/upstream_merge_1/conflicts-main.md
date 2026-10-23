# Upstream merge 1: main/shared/config conflict plan

BASE `ae3d380b23` → OURS `ether` (`d9a1140d8e`) / THEIRS `52e413ec85`. Scope: the 88 conflicting paths outside `src/renderer/` (74 content, 5 add/add, 9 modify/delete). Two content conflicts are renames: `runtime/session-tabs/structured-session-tab-restoration.ts` ← `orca-runtime-restore-structured-agent-session-tabs-once.ts`, and `shared/agent-resume-record-equivalence.ts` ← `renderer/.../agent-status-recovery-equivalence.ts`.

## Legend

- **Type**: C = content, AA = add/add, MD = modify/delete (upstream deleted, we modified).
- **take-theirs**: use upstream's file (or accept the deletion). Our hunk is obsolete or OpenCode-only.
- **take-theirs + re-apply**: use upstream's file, then re-add our intent, preferably as one call into `src/main/local-projects/` or `src/shared/local-projects/`.
- **combine**: keep both sides; the hunks are independent.
- **needs-design**: upstream moved the responsibility; a new home is proposed.

Counts: take-theirs **45**, take-theirs + re-apply **31**, combine **7**, needs-design **5**.

Paths drop `src/`. "Scope" means `LocalWorkspaceLaunchScope` (multi-root roots + cwd).

### Upstream changes that affect several packages

1. **One composed launch path** (`runtime/structured-agent-launch-composition.ts`, #27204). Each agent's part returns `launch` without `cwd`/`env`; the composition sets `cwd` from `resolveAgentSessionLaunchDirectory(record)` (`runtime/agent-session-launch-directory.ts`). Our `cwd: localWorkspaceScope?.cwd ?? …` has no line to land on.
2. **Agent registry.** Adapters come from `runtime/structured-agent-runtime-registrations.ts`; OpenCode runs over ACP (`acp/*`). `AgentSessionRecord.provider` is `string`; `accountHome` has its own module.
3. **Runtime class split.** The `orca-runtime-*.ts` mixins became `runtime/{session-tabs,workspaces,terminal/stop,...}/`. Four of our MD files are this split.
4. **SSH providers deleted** (#27644). `providers/ssh-git-dispatch.ts` and `ssh-filesystem-dispatch.ts` are gone; handlers call `requireReachableGitRoute(getConnectionExecutionHostId(id))`. `getFolderWorkspacePathStatus*` no longer takes `deps`.
5. **Records live in the journal SQLite DB** (`agent_session_records.record_json`); the import from `agent-sessions.json` was removed (#26038). See risk 8.
6. **Terminal locks take a host target.** `acquireWorktreeTerminalSpawn(target: HostWorktreeTarget, opts)`; `acquireWorktreeTerminalMutation` is still `protected`, now in `runtime/terminal/stop/worktree-terminal-stop.ts`.

**Fork-owned files that will break even though they do not conflict:** `main/local-projects/launch-scope-lock.ts` (spawn signature, protected mutation), `structured-agent-scope.ts` and `git-target.ts` (deleted SSH providers / `deps` arg), `scope-mutation-guard.ts` (`store.recoveredFromBackup` is gone; `lease.handoffStage` is legacy), `runtime/runtime-store-contract.ts` (needs `getLocalProjectsSnapshot?`).

---

## Work packages (in dependency order)

### 1. OpenCode removal (do first: pure take-theirs, removes most noise)

Our OpenCode chat (7908178403, d12085ef99) goes. Every hunk below is OpenCode-only unless noted; take upstream. Dirs: `main/native-chat/agent-session-wire/` (NC), `main/runtime/rpc/methods/` (RPC).

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| shared/agent-session-provider-handle.ts | C | take-theirs | Adds `opencode` handle, `agentSessionProviderSessionId` | Opaque handle encoding; registered agents | Take theirs. Drop every caller of `agentSessionProviderSessionId`. |
| shared/agent-session-option-catalog-opencode.ts | AA | take-theirs | Empty OpenCode catalog | Real catalog (flags, model prefs) | Take theirs. |
| shared/protocol-version.ts | C | take-theirs | `OPENCODE_STRUCTURED_…_CAPABILITY` | Per-area capability lists | Take theirs; capability constant disappears. |
| shared/rpc-contract/structured-agent-session-params.ts | C | take-theirs | `XDG_DATA_HOME` account home, opencode enums | Generic agent ids, new params | Take theirs. |
| shared/runtime-mobile-session-tab-contracts.ts | C | take-theirs | `agent` widened to handle provider | Tab state, names | Take theirs. |
| shared/structured-agent-session-mutation.ts | C | take-theirs | Widened `agent` type | Sleep, resume verification | Take theirs. |
| shared/structured-native-chat-launch-route.ts | C | take-theirs | OpenCode capability gate | Per-agent chat choice | Take theirs. |
| shared/structured-native-chat-launch-route.test.ts | C | take-theirs | OpenCode route test | Updated route tests | Take theirs. |
| main/ipc/desktop-renderer-runtime-capabilities.ts | C | take-theirs | Advertises OpenCode capability | New capabilities | Take theirs. |
| main/claude/claude-structured-location-support.ts | C | take-theirs | Re-exports fork `supportsNativeStructuredLocation` | Windows start-time change | Take theirs; delete `native-chat/structured-agent-session-location-support.ts`. |
| main/codex/codex-structured-location-support.ts | C | take-theirs | Same re-export | Same | Take theirs. |
| main/opencode/opencode-session-binder.ts | C | take-theirs | Quiet absent store (setup fix) | Same fix (#24577), worker reader | Take theirs; upstream already covers it. |
| main/agent-hooks/server-opencode-binder.test.ts | C | take-theirs | Absent/corrupt store tests | Equivalent tests, worker | Take theirs. |
| main/opencode/opencode-session-history.ts | AA | take-theirs | HTTP history reader | Session History reader | Take theirs. |
| main/opencode/opencode-structured-account-home.ts | AA | take-theirs | `XDG_DATA_HOME` capture | ACP account locator | Take theirs. |
| NC/structured-agent-session-adapter-router.ts | C | take-theirs | Optional opencode adapter | Registry-driven router | Take theirs. |
| NC/structured-agent-session-provider-support.ts | C | take-theirs | Local-only OpenCode gates | Definition-driven support | Take theirs. |
| NC/structured-agent-session-history-result.ts | C | take-theirs | Uses `agentSessionProviderSessionId` | Opaque handle | Take theirs. |
| NC/structured-provider-session-ownership.ts | C | take-theirs | Widened provider type | Opaque handle | Take theirs. |
| main/native-chat/structured-agent-session-history-adoption.ts | C | take-theirs | Refuses opencode adoption | OpenCode resume supported | Take theirs. |
| NC/structured-agent-session-rewind.ts | C | take-theirs | Refuses opencode rewind | Fork-based rewind | Take theirs. |
| NC/structured-conversation-command.ts | C | take-theirs | Widened type; scope on /clear replacement | /clear keeps same conversation | Take theirs; the replacement attach is gone, so scope propagation is obsolete. |
| RPC/session-tab-agent-status-projection.ts | C | take-theirs | Hides opencode tabs per capability | Registered-agent projection | Take theirs. |
| RPC/structured-agent-session-create.ts | C | take-theirs | Moves `resolveClientSuppliedAttach`; widened types | Layout-owner tabs, options | Take theirs. |
| RPC/structured-agent-session-gate.ts | C | take-theirs | Per-session provider capability gate | Per-agent chat choice | Take theirs. |
| RPC/structured-agent-session-hold.ts | C | take-theirs | `requireStructuredHost(ctx, id)` | SSH fixes | Take theirs. |
| RPC/structured-agent-session-restart-resume.ts | C | take-theirs | Filters opencode sessions | Continue after stop | Take theirs. |
| RPC/structured-agent-session-reveal.ts | C | take-theirs | Session gate | Reveal publishes tab | Take theirs. |
| RPC/structured-agent-session-send-compatibility.ts | C | take-theirs | Session gate | Image queue | Take theirs. |
| RPC/structured-agent-session-status-stream.ts | C | take-theirs | Filters opencode events | Sleep state | Take theirs. |
| RPC/structured-agent-session-turn-completion-stream.ts | C | take-theirs | Filters opencode completions | Prompt alerts | Take theirs. |
| RPC/structured-agent-session.ts | C | take-theirs | Session gates everywhere | Main-first tabs, sleep | Take theirs. |
| main/runtime/session-tabs/structured-session-tab-restoration.ts | C (rename) | take-theirs | Widened agent guard | New file from mixin split | Take theirs. |
| main/runtime/structured-session-worktree-teardown.ts | C | take-theirs | Widened type | Host-scoped teardown | Take theirs. |
| main/runtime/structured-worker-authority.ts | C | take-theirs | Widened type | Sleep, all-agent workers | Take theirs. |

Also: delete our non-conflicting OpenCode files (`main/opencode/opencode-server-*`, `opencode-session-{dispatch,open,options,prompts,protocol}`, `opencode-structured-*` other than the two above, `opencode-journal-translation.ts`, `opencode-adapter-test-fixture.ts`, `runtime/structured-opencode-runtime-adapter.ts`, `NC/structured-agent-session-journal-identity.ts`, `NC/structured-agent-session-opencode.test.ts`, `RPC/structured-agent-session-opencode-capability.test.ts`, `shared/agent-session-opencode-identity.test.ts`, `tests/e2e/ether-opencode-chat.spec.ts`). Revert our hunks in the auto-merged `NC/structured-agent-session-adopted-import.ts`, `shared/agent-session-journal-item-key.ts`, `shared/agent-session-journal-types.ts`, `shared/agent-session-option-catalog.ts`.

### 2. Shared contracts that carry multi-root scope

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| shared/agent-session-account-home.ts | AA | take-theirs | OpenCode union + equality | Legacy/OpenCode homes, `agentSessionAccountHomesEqual` | Take theirs; same helper names our admission used. |
| shared/agent-session-launch-args.ts | AA | take-theirs | Extracted validator | Same validator | Take theirs (only the type annotation differs). |
| shared/agent-session-record.ts | C | take-theirs + re-apply | `localWorkspaceScope?` field + validator; OpenCode checks | `provider: string`, `launchDirectory`, split modules | Take theirs; add `localWorkspaceScope?` and `isLocalWorkspaceSessionScope(record.localWorkspaceScope, record.location)` to `isAgentSessionRecord`. |
| shared/agent-resume-record-equivalence.ts | C (rename) | take-theirs + re-apply | `launchConfigsEqual` compares scope | Moved from renderer to shared | Take theirs; add `localWorkspaceLaunchScopesEqual(a.localWorkspaceScope, b.localWorkspaceScope)` to the guard. |
| shared/persisted-state-types.ts | C | combine | `localProjects?: LocalProjectsState` | Orcad, snapshot, tip fields | Keep both. |
| shared/tui-agent-startup.ts | C | combine | `localWorkspaceScope` arg; Claude `--` separator | `buildFlagPromptStartupPlan` extraction | Keep upstream extraction plus our argv-separator branch and both arg fields. |

### 3. Persistence store and folder workspaces

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| main/persistence/loading-store/store.ts | C | take-theirs | `LocalProjectsPersistence` in `interface Store extends` | `interface Store extends StoreDomainOperations {}` | Take theirs; the type moves to the composition file. |
| main/persistence/loading-store/store-domain-composition.ts | C | take-theirs + re-apply | Registers `LocalProjectsPersistence` | `StoreDomainOperations` type; generic symbol installer | Add to `StoreDomainOperations`, `StoreDomains`, `STORE_DOMAIN_OPERATION_CLASSES`, `createStoreDomains`; pass it to `ProjectCollectionOperations`. Drop `installLocalProjectsPersistenceContext` (the generic installer copies symbols). |
| main/persistence/loading-store/project-collection-operations.ts | C | combine | Projects local Workspaces into folder APIs; archive-only removal | `RepoHostTarget`, orcad hint drop on remove | Keep both; our local-workspace guard runs before upstream's remove + hint drop. |
| main/project-groups/folder-workspace-path-status.ts | C | take-theirs + re-apply | Local Workspace → default root stat | `deps` removed, SSH gone | Re-add branch at top of `getFolderWorkspacePathStatus`: `statFolderPath(root.path, { kind: 'local' })`. |
| main/ipc/filesystem-allowed-roots.ts | C | take-theirs + re-apply | Adds every local root; skips projected rows | `RuntimeStore`, `hasRemoteFilesystemOwner` | Re-add root block; add `getLocalProjectsSnapshot?` to `RuntimeStore` contract and `FolderScopeStore`. |

### 4. Files deleted upstream (modify/delete)

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| NC/agent-session-journal-recovery.ts | MD | take-theirs | OpenCode rehydrate refusal | Deleted (#24576, never delete history on read) | Accept deletion. |
| NC/structured-agent-session-handoff-admission.ts | MD | take-theirs | OpenCode handoff refusal | Terminal handoff removed (#22783) | Accept deletion. |
| NC/structured-agent-session-handoff-reverse.ts | MD | take-theirs | OpenCode refusal | Same | Accept deletion. |
| NC/structured-agent-session-host-handoff.ts | MD | take-theirs | OpenCode refusal | Same | Accept deletion. |
| main/runtime/agent-session-record-store-file.ts | MD | take-theirs | Moved `hasPersistedStructuredAgentSessionStore` here | Records in journal DB (#26038) | Accept deletion; upstream's DB-based helper stays in `structured-agent-session-runtime.ts` (fork `scope-mutation-guard.ts` already imports from there). |
| main/runtime/orca-runtime-get-worktree-ps.ts | MD | take-theirs + re-apply | `acquireWorkspaceScope` dep; OpenCode env | Split (#27945) | Re-apply `acquireWorkspaceScope: (p) => acquireLocalWorkspaceStructuredLaunch(this.requireStore(), this, p)` in `runtime/workspaces/workspace-process-listing.ts` `ensureStructuredAgentSessionHost`. |
| main/runtime/orca-runtime-resolve-recovered-structured-tui-transcript.ts | MD | take-theirs + re-apply | Captures scope into create intent; OpenCode intent | Handoff removed; create intent now in `session-tabs/structured-session-create-support.ts` | In `resolveStructuredAgentSessionIntent`, add `captureStructuredLocalWorkspaceScope(store, location)` and spread `localWorkspaceScope` into the returned params. |
| main/runtime/orca-runtime-resolve-worktree-removal-target.ts | MD | take-theirs + re-apply | Entrypoint guard for agent creates | Moved (#27624) to `runtime/runtime-agent-terminal-startup.ts` | One line at the top of `resolveAgentTerminalCreateOptions`: guard via `host.store` when the create carries agent fields. |
| main/runtime/orca-runtime-stop-terminals-for-worktree.ts | MD | take-theirs + re-apply | Made `acquireWorktreeTerminalMutation` public | Moved to `terminal/stop/worktree-terminal-stop.ts`, protected | Make it public there; re-check `project-terminal-stop.ts` overrides. |

### 5. Structured session runtime and attach

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| NC/structured-agent-session-host-types.ts | C | take-theirs + re-apply | `acquireWorkspaceScope?` dep; reveal agent type | Many new deps | Take theirs; add `acquireWorkspaceScope?: (params: AgentSessionAttachParams) => Promise<() => void>`. |
| main/runtime/structured-agent-session-runtime.ts | C | take-theirs + re-apply | OpenCode adapter; store-dir refactor; scope dep | Registry install, journal DB | Take theirs; add `acquireWorkspaceScope?` to runtime deps and pass it into `new StructuredAgentSessionHost({...})`. |
| NC/structured-agent-session-attach.ts | C | take-theirs + re-apply | Scope in params, fingerprint, reserve request; OpenCode refusal | Options/permission, resume verification | Re-add: `localWorkspaceScope?` on `AgentSessionAttachParams`, in `attachFingerprintFields`, in `reserveRequestFor`. Drop the OpenCode admission and `journalIdentityFor` move. |
| NC/structured-agent-session-attach-orchestration.ts | C | needs-design | Wraps the serialized attach in workspace lock | `runAttach` shared by client attach and start-flight lane | See risk 3. Acquire at the top of `runAttach` with try/finally, so both lanes hold it. |
| NC/structured-agent-session-read-restore.ts | C | take-theirs | Scope on `attachParamsForRecord` | Builder moved to `structured-agent-session-conversation-open.ts` | Take theirs. Existing records keep their scope; re-add only if fingerprint tests require it. |
| main/runtime/agent-session-record-store.ts | C | take-theirs + re-apply | `hasUnreadableRecords` getter | Store over journal DB | Re-add getter (`this.state.unreadableRecords.size > 0`); fork `scope-mutation-guard.ts` reads it. |
| main/runtime/agent-session-reservation-admission.ts | C | take-theirs + re-apply | Scope validate/copy/compare; OpenCode gate | Founding admission, refusal errors | Re-add `localWorkspaceScope?` on request, `isLocalWorkspaceSessionScope` check, scope in conflict test and `createAgentSessionRecord`. Drop the OpenCode gate. |
| main/runtime/orca-runtime-create-agent-session.ts | C | take-theirs + re-apply | Entrypoint guard after scope resolve | Host planner | Re-add `assertRuntimeAgentEntrypointSupportsWorkspace(this.store, workspace.id)` after `resolveTerminalWorkspaceLaunchScope`. |

### 6. Claude/Codex launch resolution

New fork hook (**needs-design**, shared by both agents): in `runtime/agent-session-launch-directory.ts`, as the first line of `resolveAgentSessionLaunchDirectory`, `const scoped = await localWorkspaceLaunchDirectory(record); if (scoped) return scoped`. Implement this in `main/local-projects/structured-agent-scope.ts` on top of `readStructuredLocalWorkspaceScope`, which validates the roots.

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| main/claude/claude-structured-launch-resolution.ts | C | needs-design | Scope → cwd, `additionalDirectories`, `systemPrompt.append` | `claudeStructuredLaunchPart` in the composition; builds `additionalDirectories` | Take theirs; cwd via hook; append roots to `additionalDirectories`; spread fork `localWorkspaceClaudeOptions(scope)` for `systemPrompt`. |
| main/codex/codex-structured-launch-resolution.ts | C | needs-design | Scope → cwd; passes scope on launch | `codexStructuredLaunchPart` | Take theirs; cwd via hook; add `...(scope ? { localWorkspaceScope: scope } : {})` to `launch`. |
| main/codex/codex-structured-session-state.ts | C | take-theirs + re-apply | `localWorkspaceScope?` on `CodexStructuredLaunch` | Many new launch fields | Re-add the optional field. |
| main/codex/codex-structured-thread-open.ts | C | take-theirs + re-apply | `config/read` overrides + post-open scope assert | `threadSettings` with `config` from `threadConfig` | Merge our `config` entries into `config`, keep `developerInstructions` top-level, assert after open. See risk 2. |
| main/claude/__fixtures__/claude-agent-sdk-scripted-cli.mjs | C | combine | `cwd`, `sessionIdFromLaunch`, `replayLastUserMessage` | `--version`, env report, control-request waits | Keep upstream; add our two scenario features (`cwd` is already in both). |

### 7. PTY spawn path

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| main/ipc/pty/host-env/spawn-cwd.ts | C | take-theirs + re-apply | Launch-scope path checks; default-root cwd | `assertWorkspaceAcceptsNewPty` (WSL-move fence); no `deps` | Add optional `launch` param to `assertWorkspaceAcceptsNewPty` and pass it to our checks; re-add the default-root branch in `resolvePtySpawnStartupCwd`. |
| main/ipc/pty/ipc/spawn-types.ts | C | take-theirs + re-apply | `launch?` on path-usable dep | Dep renamed `assertWorkspaceAcceptsNewPty(worktreeId, sessionId)` | Add third `launch?: FolderWorkspacePtyLaunchContext` param. |
| main/ipc/pty/runtime/controller-deps.ts | C | take-theirs + re-apply | Same | Same rename | Same third param. |
| main/ipc/pty/register-handlers.ts | C | take-theirs + re-apply | Forwards `launch` | Same rename, new deps | Forward `launch` to the impl. |
| main/ipc/pty/ipc/spawn-preflight.ts | C | take-theirs + re-apply | Takes local lock early; WSL-shell refusal | Startup target extracted; admission renamed | Pass `args` as `launch`; put the WSL refusal right after `ctx.terminalRuntimeOptions = target.terminalRuntimeOptions`. Do not take the lock here. |
| main/ipc/pty/runtime/spawn-preflight.ts | C | take-theirs + re-apply | Passes `args` | Admission renamed | Pass `args` as third arg. |
| main/ipc/pty/ipc/spawn-options.ts | C | needs-design | `releaseWorktreeSpawn ??=` to reuse our lock | Acquire takes host target + attach-only options | See risk 4. Keep upstream's acquire; then, under that lock, call fork `assertLocalWorkspacePtyLaunchFresh(store, args)` and release on throw. |
| main/ipc/pty/runtime/spawn-execute.ts | C | needs-design | Same `??=` | Same acquire with `refuseSleptWorktree` | Same as spawn-options. |

### 8. Desktop Git handlers (local Workspace roots)

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| main/ipc/filesystem/filesystem-git-commit-handlers.ts | C | take-theirs + re-apply | `resolveDesktopGitTarget` + `localRoot` | SSH branch → `requireReachableGitRoute` | `if (!args.localRoot) requireReachableGitRoute(...)`; then `resolveDesktopGitTarget(store, args)`. |
| main/ipc/filesystem/filesystem-git-index-handlers.ts | C | take-theirs + re-apply | Same for stage/unstage | Same | Same pattern in `git:stage`/`git:unstage`. |
| main/ipc/filesystem/filesystem-git-status-handlers.ts | C | take-theirs + re-apply | Same for status/diff | Same, plus `git:mutationInFlight` | Same pattern in `git:status`/`git:diff`; leave the new handler as upstream wrote it. |

### 9. Ether identity, startup, updater

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| main/ipc/app.ts | C | take-theirs + re-apply | Ether product in identity | `is.dev` → `!app.isPackaged` | `getDevInstanceIdentity(!app.isPackaged, process.env, getPackagedEtherProduct())`. |
| main/ipc/app.test.ts | C | take-theirs + re-apply | Identity tests via `is` mock | Electron `app.isPackaged` mock | Re-add both identity tests; drive a hoisted mutable `isPackaged` instead of `runtimeFlags.dev`. |
| main/startup/main-process-preflight.ts | C | take-theirs + re-apply | Ether product in identity | `const isDev = !app.isPackaged` | `getDevInstanceIdentity(isDev, process.env, getPackagedEtherProduct())`. |
| main/startup/configure-process.ts | C | combine | Ether userData path for packaged app | Serve user-data guard, SQLite marker | Keep our `!isDev` block. Check that `checkServeUserDataPath` accepts the Ether path. |
| main/updater/updater-setup.ts | C | combine | `refuseEtherUpdate` guards | Drops `is`; mac ShipIt; nullable window | Keep guards; in `setupAutoUpdater` the guard goes after the `mainWindowRef = mainWindow ?? …` line. |

### 10. Linear

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| main/linear/linear-request-concurrency.ts | C | take-theirs | Signal-aware `acquire` | Equivalent signal-aware `acquire` | Take theirs. |
| main/linear/linear-issue-lookups.ts | C | take-theirs + re-apply | Read deadline on `getIssue`/`searchIssues`; explicit-workspace rethrow | `getIssue` has its own 30s deadline; image URLs | Take theirs for `getIssue`; wrap only `searchIssues` in `withLinearReadDeadline`, using `getClients(ws, signal)`, `acquire(signal)`, and the explicit-workspace rethrow. |

### 11. Repo docs and config

| File | Type | Class | Ours | Theirs | Resolution |
|---|---|---|---|---|---|
| .gitignore | C | combine | `/.orca-local-profile/`, `!docs/ether-maintenance.md` | Native targets, Vite cache, slimmer docs allowlist | Keep upstream; add our two lines. |
| .github/CONTRIBUTING.md | C | take-theirs + re-apply | Long setup guide (Node 24.21.0, pnpm 12.0.0), fork-distribution notes | Bun, shared pnpm store, pnpm 12.14 | Take theirs. Move fork notes into `docs/ether-maintenance.md` (fork-owned). Drop our pinned versions, which are now stale. |

---

## Highest-risk files

1. **main/claude/claude-structured-launch-resolution.ts.** Upstream's composition forbids an agent part from setting `cwd` ("an agent's own part never sets the directory"), so a careless merge either loses the multi-root cwd or reintroduces it in a way the type `Omit<L, 'cwd'|…>` rejects. The hook in `resolveAgentSessionLaunchDirectory` gives Claude and Codex the same cwd. Upstream now builds `additionalDirectories` from configured args + attachment dir + visuals, so append our roots to that array rather than overwriting it. Upstream's `CLAUDE_STRUCTURED_BASE_OPTIONS` already sets `systemPrompt: { type: 'preset' }`; our append must extend it, not replace it. Verify with the scripted CLI fixture's `cwd` report and argv.

2. **main/codex/codex-structured-thread-open.ts (+ launch-resolution, session-state).** This is where the Codex fix lives (`writableRoots` lists only extra roots; cwd is implicit). Upstream now sends `config` built from `threadConfig` + `shell_environment_policy.set.*`. Our old `...workspaceOverrides` spread places its own `config` key, which would silently drop upstream's command-env config and break orchestration identity inside Codex. Merge the two objects key by key. Keep `config/read` before open and `assertCodexLocalWorkspaceThreadScope` after it, and run both on start, resume, and the new `supersedeIfUnsaved` restart path. Re-run `codex-local-workspace-thread.test.ts` and the binary contract test.

3. **NC/structured-agent-session-attach-orchestration.ts.** Upstream added an agent-start lane (`attachStructuredAgentSessionForStart`) that runs outside the session `serialize` under its own lock. Both lanes call `runAttach`, so acquiring there covers both. The danger is lock order: our hook takes `acquireWorktreeTerminalMutation(workspace, 'shared')`, and upstream's sleep path takes the same lock `exclusive` and then stops native chats. Sleep waiting on a chat start that waits on sleep is a deadlock. Acquire before any start-flight or serialize wait, release in `finally`, and add a test with a sleep running concurrently.

4. **main/ipc/pty/ipc/spawn-options.ts and runtime/spawn-execute.ts.** Our `??=` reused the lock taken in preflight. Upstream's acquire now carries `spawnWorktreeTarget(...)`, `reattachSessionId`, `requireAttachOnly` and `refuseSleptWorktree`. Keeping `??=` would skip them on local Workspaces, so a slept workspace would not wake or refuse, and a reattach would not switch to attach-only. Drop the early lock and the `??=`. Validate scope freshness under upstream's lock instead. Fork `launch-scope-lock.ts` must also adopt the new `HostWorktreeTarget` signature.

5. **orca-runtime-get-worktree-ps.ts → workspaces/workspace-process-listing.ts.** The deletion leaves no conflict marker at the new home. If `acquireWorkspaceScope` is not re-wired, through runtime deps → host deps → `ensureStructuredAgentSessionHost`, chats start without the scope-freshness check and scope edits can race a live launch. Add a test that `installStructuredAgentSessionHost` receives the dep.

6. **orca-runtime-resolve-recovered-structured-tui-transcript.ts → session-tabs/structured-session-create-support.ts.** This is the only place a new native chat captures its roots. If it is missed, every new Claude/Codex chat in a multi-root Workspace silently runs in one folder with no extra roots, and nothing fails. Note that upstream also returns `hostLaunchDirectory` for floating workspaces; keep scope capture independent of it.

7. **orca-runtime-stop-terminals-for-worktree.ts → terminal/stop/worktree-terminal-stop.ts.** Making `acquireWorktreeTerminalMutation` public again is required by `launch-scope-lock.ts` and `scope-mutation-guard.ts`. `project-terminal-stop.ts` subclasses and overrides spawn acquisition, so check that the visibility change type-checks across the chain. The mutation lock is now keyed by `worktreeIdentityKey`; confirm folder keys match what the guard sorts and acquires.

8. **main/runtime/agent-session-record-store-file.ts (+ shared/agent-session-record.ts).** Upstream reads records only from `agent_session_records` in the journal DB, and it removed the one-time import from `agent-sessions.json` (#26038 assumes every user already passed through the import build). Ether profiles are BASE-era, so their native chats live in `agent-sessions.json` and per-chat `journal.db`, and would vanish after this merge. Decide before shipping: either run the import from an intermediate upstream build (≥ #24006, < #26038) once per profile, or restore the import in a fork-owned file. Also confirm `decodePersistedAgentSessionRecord` keeps `localWorkspaceScope` in `record_json` rather than stripping it.

9. **main/persistence/loading-store/store-domain-composition.ts / project-collection-operations.ts.** `LocalProjectsPersistence` must be part of `StoreDomainOperations`, or the `Store` interface loses `resolveLocalWorkspace`/`getLocalProjectsSnapshot` and every fork caller fails to type-check. Upstream code that walks `getFolderWorkspaces()` will now also see projected local Workspaces: the WSL mover, layout-owner drops, and orcad restore hints. Removal is refused for local Workspaces, so upstream's orcad hint drop never runs for them; that is intended, but archive should drop their hints too.

10. **Git handlers + main/local-projects/git-target.ts.** Upstream deleted SSH dispatch and made non-local connection ids throw at `requireReachableGitRoute`. Our `localRoot` path must bypass that check (local roots refuse any `connectionId` themselves). `git-target.ts` and `structured-agent-scope.ts` still import deleted SSH helpers or pass the removed `deps` argument, so they fail to compile until updated.
