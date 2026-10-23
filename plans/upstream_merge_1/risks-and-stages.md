# Upstream merge 1: risks outside the textual conflicts, and staging

- OURS = `ether` at `d9a1140d8e` (12 commits on top of the merge base).
- THEIRS = upstream `52e413ec85` (4,238 commits).
- BASE = `ae3d380b23`.
- A full `git merge-tree` produces **148 conflicting files with 297 conflict hunks**. The per-file guides cover those; this document covers everything else.
- Scripts and raw output are in `/tmp/claude/agent-shots/risk/`:
  - `check_imports.py` and `imports-report.txt`;
  - `simulate_stages.sh` and the `stages-*/` lists;
  - `revert-commit.txt`.

**The most important finding:** reverting our OpenCode chat (`7908178403`) on `ether` *before* merging removes 44 of the 148 conflicting files (leaving 104 files, 197 hunks). The user wants that code gone anyway. The revert alone conflicts in only 2 files.

---

## 1. Semantic breakage (files that merge cleanly but no longer build)

Method: `check_imports.py` resolved every relative, `@/` and `vi.mock` import in the 314 fork-added or fork-modified files that merge cleanly. It resolved them against the merged tree, which is THEIRS plus our added files. For upstream modules it also checked the named imports against the module's exports, following `export *` re-exports. One false positive was removed: `PullRequestGenerationSlice` arrives through `export type *`.

**Result: 27 missing import targets in 21 files, and 15 missing named exports in 13 files.** About a third of these are OpenCode files, which go away with the revert.

### Missing modules, grouped by the upstream change

| Upstream change | Old path → new path | Our importers that survive the OpenCode removal |
|---|---|---|
| `1912c90141` (10-09) moved subprocess handling into a workspace package | `src/shared/child-process/run-process(.ts)` → `@orca/process-host` (`src/packages/process-host/src/run-process.ts`); `retryable-process-exit-proof` → `@orca/process-host/retryable-process-exit-proof` | `config/scripts/build-ether-local.mjs`, `config/scripts/verify-ether-signature.mjs` (both load it through jiti: **this breaks `pnpm build:ether`**), `src/main/codex/codex-local-workspace-binary-contract.test.ts`, `tests/e2e/golden-stub-agent-launch-capture.unit.test.ts`, `tests/e2e/local-multi-root-worktree-create.spec.ts` |
| `6be60909c7` (10-12) removed the `runtime-git-client` barrel | `@/runtime/runtime-git-client` → `runtime-git-status-client`, `runtime-git-client-context`, and others | `features/local-projects/use-local-root-git.ts` (+ test), `LocalWorkspaceSourceControl.test.tsx`, `components/editor/local-root-diff-content-loader.test.tsx` |
| `5763792718` (10-12) removed the `runtime-file-client` barrel | `@/runtime/runtime-file-client` → `runtime-file-search-client`, `runtime-file-read-client`, and others | `local-workspace-content-search.ts` (+ test), `local-workspace-editor-save.ts` (+ test) |
| `a039e9064b` (10-17) moved the sidebar's time rules into main | `@/lib/agent-row-decay-state` → `src/shared/agent-row-decay-state.ts`; `@/lib/tab-has-live-pty` → `src/shared/tab-has-live-pty.ts` | `local-sidebar-model.ts` (+ test), `local-workspace-scope-edit-guard.ts`. **What these functions do also changed** (main now owns one clock), so review the sidebar model rather than only re-pointing the import. |
| `cae9a066b3` (10-22) moved the Linear files | `@/components/task-page-linear-in-orca-issues` → `@/components/task-page/linear/task-page-linear-in-orca-issues` | `local-workspace-linear-task-refs.ts`, `local-workspace-linear-attachments.test.ts` |
| `aeffeb4cfb` (10-11) removed the `ipc/pty` barrel | `src/main/ipc/pty` is gone | `src/main/updater.ether-build.test.ts` (in a `vi.mock` path) |
| `d791421568` (10-05) moved Codex process supervision out of the Codex folder | `codex-app-server-posix-supervisor`, `codex-app-server-process-teardown`, `codex-process-exit-deadline` are gone | Only `src/main/opencode/opencode-server-process.ts` (to be deleted) |

All renderer importers listed above live under `src/renderer/src/features/local-projects/` unless shown with another path.

### Missing named exports

| Symbol (old module) | Now | Our importers |
|---|---|---|
| `flushPendingEditorChange` (`components/editor/editor-pending-flush`) | Removed; the nearest replacement is `flushPendingEditorBuffer` / `flushClosingEditorBuffers`. **Check that it does the same thing.** | `local-workspace-draft-close.ts`, `local-workspace-file-layout-apply.ts`, `local-workspace-scope-tabs.ts` |
| `getDiskBaselineSignature` (`components/editor/diff-content-signature`) | Moved to `src/shared/disk-baseline-signature.ts` | `local-workspace-editor-save.ts` (+ test) |
| `isAgentSessionRecord` (`shared/agent-session-record`) | Renamed `isPersistedAgentSessionRecord` | `src/shared/local-projects/agent-session-scope.test.ts`, `tests/e2e/local-multi-root-cold-restart.spec.ts`, plus 2 OpenCode tests |
| `createClaudeStructuredLaunchResolver`, `createCodexStructuredLaunchResolver` | Moved to `src/main/runtime/structured-agent-launch-composition.test-support.ts` | `src/main/runtime/agent-session-local-workspace.test.ts` |
| `AgentSessionProviderHandle`, `DEFAULT_JOURNAL_PAYLOAD_LIMITS`, `adapterSupportsRecord`, `CODEX_SPAWN_TOKEN_ENV` | Removed or moved | OpenCode files only: delete them |

The modules our files import most are `store/index.ts` (45 importers), `ui/button`, `i18n`, `shared/workspace-scope.ts` (20), `shared/linear/*`, `store/slices/editor.ts`, and `tests/e2e/helpers/orca-app.ts`. None of those lost an export we use. Changes to types and function signatures are not detected by this check; `pnpm tc` is the real gate.

There is one more breakage outside `src`. Upstream's lint now runs `check:process-host-imports` and `check:main-sync-spawn-ratchet`. `tests/e2e/local-multi-root-git-search.spec.ts` uses `execFileSync` from `node:child_process`, so check it against those two ratchets.

**Action items**
1. After the merge, re-point the imports in the tables above. Make `config/scripts/{build-ether-local,verify-ether-signature}.mjs` import `{ runProcess, spawnProcess }` from `@orca/process-host`; `postinstall` builds it through `build:packages`.
2. Port the 3 `flushPendingEditorChange` callers by reading the new `editor-pending-flush.ts`. Don't do a blind rename.
3. Re-check `local-sidebar-model.ts` against upstream's main-owned decay clock (`a039e9064b`).
4. Run `pnpm tc`, then `pnpm test src/renderer/src/features/local-projects src/main/local-projects src/shared/local-projects`, and re-run `check_imports.py` against the real merge tree.

---

## 2. Staging

Measured with `git merge-tree`, plus a simulation that writes only objects. The simulation stands in a resolved stage with an `-X ours` or `-X theirs` merge, built with `commit-tree`, and merges the next cut into it. Real resolutions land between the two bounds.

Conflicts grow steadily with no cliff: 23 at upstream commit 150, 52 at 1,000, 93 at 1,500, 124 at 2,250, 140 at 3,500, and 148 at THEIRS. No single rename adds a spike; the process-host extraction and the barrel removals each add zero conflicting files at their commit.

| Plan | Start | Stage conflict files (ours bound / theirs bound) | Total file resolutions |
|---|---|---|---|
| Single merge | HEAD | 148 (297 hunks) | **148** |
| Single merge | **after the OpenCode revert** | **104 (197 hunks)** | **104** |
| 2 stages: `5cafefe726` | HEAD | 88 → 120/82 | 170–208 |
| 2 stages: `2233fd3669` | HEAD | 123 → 92/46 | 169–215 |
| 3 stages: `5cafefe726`, `2233fd3669` | HEAD | 88 → 75/46 → 91/46 | 180–254 |
| 2 stages: `5cafefe726` | after revert | 48 → 90/71 | 119–138 |
| 2 stages: **`6bc529176b`** | after revert | **47** → 91/72 | 119–138 |
| 2 stages: `2233fd3669` | after revert | 79 → 70/42 | 121–149 |
| 3 stages: `5cafefe726`, `2233fd3669` | after revert | 48 → 50/39 → 70/42 | 129–168 |

In the stage column, each arrow is the next stage. Where a stage shows two numbers, the first comes from the `-X ours` simulation and the second from `-X theirs`.

Staging never reduces the work. It adds 15–70% more file resolutions, because 14–46 files conflict again at every stage. That re-resolution happens at the level of the stage merge (our 12 commits stay as they are), but our hunks in `src/main/native-chat`, `src/main/runtime`, the sidebar and the store get re-fought each time.

**Recommendation:** use a pre-merge revert, then one merge. That is the least total work: 104 files, 197 hunks.

Stage at **`6bc529176b`** (2026-10-06, the parent of `acea59c6d8`) only if one of these is true:
- you want a checkpoint you can build before the orcad, process-host and barrel refactors; or
- you want to keep Ether's existing structured-chat history (see §4).

That cut costs the same as `5cafefe726` (47 conflicting files after the revert). It comes before `acea59c6d8`, which deleted the importers for the old per-chat journals and records. It also comes before `1912c90141`, so `pnpm build:ether` still works there unchanged.

**Action items**
1. On `ether`, commit a revert of `7908178403`. Resolve its 2 conflicts this way:
   - Keep `tests/e2e/helpers/packaged-agent-chat-smoke.ts`, because `tests/e2e/ether-codex-chat.spec.ts` uses it, but drop its `'opencode'` branch.
   - Drop the OpenCode lines from `plans/ether-agent-and-linear-follow-up.md`.
2. Then merge `52e413ec85` in one go. If you stage, cut at `6bc529176b`, build, then merge THEIRS.
3. Run `git merge-tree --write-tree --name-only <revert-commit> 52e413ec85` again to give the per-file guides the reduced list (104 files).

---

## 3. Toolchain and Ether packaging

### Upstream changes, BASE to THEIRS
- **Version and runtimes:** the version goes from 1.4.197 to 1.4.214. Electron goes from 43.7.0 to **43.7.8** (same major and ABI). Node stays at `.node-version` 24.21.0 with `engines.node: "24"`, and there is a new `check:node-runtime-pin`. The `packageManager` goes from pnpm 12.0.0 to **12.14.0**.
- **Build tools:**
  - vite moves from rolldown-vite 7.3.1 to **vite ^8.3.4**;
  - electron-vite from 5 to **6**;
  - vitest from 4.1 to **5.0.5**;
  - `@vitejs/plugin-react` from 5 to 6;
  - electron-builder is now pinned to 26.15.3, and `electron-builder-squirrel-windows` is gone;
  - new devDependencies: `bun` 1.4.3 (`allowBuilds: true`; used by `verify:localization-catalogs` and `typecheck:ci`), `node-gyp` 12.3.0, `@electron/osx-sign` 2.7.0.
- **Dependencies:** added `@orca/process-host` (`workspace:*`), `fflate`, `smol-toml`, `stream-json`, `stream-chain` and `@vscode/ripgrep-universal`. Removed `sherpa-onnx`, `@streamparser/json` and `@electron-toolkit/utils`. `@linear/sdk` jumps from 82 to **97**, which matters for our Linear features: re-test the Linear setup.
- **Workspace and install:**
  - `pnpm-workspace.yaml` adds `src/packages/*` and `native/windows-security`;
  - new `pnpmfile: config/pnpmfile.cjs` turns on **pnpm's global virtual store outside CI** (opt out with `ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0`);
  - new `packageExtensions` and `addMissingPeerTypes`;
  - new patches.
  - The lockfile changes by about +4.2k/−3.7k lines. We never touched the lockfile, so it merges cleanly.
- **Build steps:**
  - `build:relay` is gone, replaced by `build:wsl-guest`.
  - Almost every script now runs `build:packages` first (including `postinstall`, `tc`, `test` and `dev`).
  - `test` now goes through `config/scripts/run-vitest.mjs`.
  - `lint` gains about 15 ratchets.
- **New native helpers:**
  - `native/macos-shipit-scheduling` is built with node-gyp in `afterPack`, so Xcode CLT is required;
  - the macOS terminal host app (`Orca Terminal Host`) is built and signed in `afterPack`;
  - also new: `wayland-clipboard`, `windows-agent-hook`, `windows-security`.
- `docs/reference/pnpm-install-policy.md` **was deleted upstream** (`16cd1e0c75`), and the "Native Dependency Installs" section of `AGENTS.md` is gone. The `install:release` script still exists.

### Effect on Ether packaging (`config/electron-builder.ether.config.cjs`, `config/scripts/build-ether-local.mjs`)
- **This breaks:** both Ether scripts load `src/shared/child-process/run-process.ts` (§1). `jiti` is only a transitive dependency (2.7.0, in neither version's `package.json`). Under the global virtual store, undeclared dependencies may stop resolving from the repo root. Switch to `@orca/process-host` and drop jiti, or add `jiti` as a devDependency.
- **These still hold:**
  - `base.beforePack(context, ...args)` and `base.afterPack(context)` are still compatible. The new `beforePack` parameters have defaults.
  - The CLI launcher still contains `ELECTRON="$CONTENTS/MacOS/Orca"`, exactly once (`resources/darwin/bin/orca:22`).
  - `orca-local-build.json` is still written (`mac-build-compatibility.cjs`).
  - `base.mac.extendInfo` is now `macUsageDescriptions` (adds the folder usage descriptions), so the `'Orca'` → `'Ether'` replacement still works.
  - `files: 'out/{…,relay}/**'` is harmless: base now negates `out/relay`.
- **New signing surface (works, but untested):**
  - Upstream's `signMacStandaloneHelper` signs the ShipIt scheduling addon, the terminal host app and the orcad template binary with `CSC_NAME`. `build-ether-local` sets that to the Ether certificate hash, so it should use the persistent identity from `60cd123fb1`.
  - The terminal host takes the app's `CFBundleIdentifier`, which for us is `com.joelkorpela.ether`, but it hardcodes `CFBundleName: 'Orca'`.
  - Upstream says only Developer ID builds use the launchd helper path; ad-hoc builds fall back to forking (`docs/reference/macos-daemon-tcc-attribution.md`). Ether's certificate-bound designated requirement may take the helper path. Check the `[daemon] macOS terminal host fallback` log line.
  - `verify-ether-signature.mjs` runs `--verify --deep --strict`, so it will catch a nested helper signed with a different identity.
- **orcad template:** `assertOrcadTemplateBuilt` only enforces when `ORCA_REQUIRE_ORCAD_TEMPLATE=1`. A local Ether build without `pnpm build:orcad-template` therefore ships no managed server for SSH hosts. Upstream's SSH model needs one since `5cafefe726`.
- **Ripgrep:** `assertBundledRipgrepInstalled` requires the `@vscode/ripgrep-universal` binaries. A normal install provides them.
- **Versioned release folders (`d9a1140d8e`):** not affected. That logic is fork-only and runs after electron-builder.

**Action items**
1. Install with `corepack prepare pnpm@12.14.0 --activate` (or `corepack enable`), then `pnpm install`. Keep it host-only: Ether builds arm64 only, so `install:release` is not needed. Then run `pnpm run build:packages` (postinstall does this) and `pnpm rebuild:node` if tests fail to load node-pty.
2. Consider building Ether with `ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0`, so electron-builder packs a project-local `node_modules`. CI packages that way too.
3. Fix the two Ether scripts (§1). Then run `pnpm test config/scripts/build-ether-local.test.mjs config/scripts/electron-builder-ether-config.test.mjs config/scripts/verify-ether-signature.test.mjs`.
4. Add `build:orcad-template` to the Ether build plan if SSH hosts matter. Otherwise, note that SSH is unsupported in Ether.
5. After the first `pnpm build:ether`, inspect the bundle:
   - `codesign -dvv` on `Contents/…/Orca Terminal Host.app` and on the ShipIt addon;
   - check the daemon log line about the fallback.
6. Re-test the Linear onboarding against `@linear/sdk` 97.

---

## 4. Profile data (`~/Library/Application Support/Ether`)

These conclusions come from reading the code; the real profile was not opened.

| Area | BASE (the running Ether) | THEIRS on first launch | Reversible? Can an older Ether read it? |
|---|---|---|---|
| **App state** | `profiles/<id>/orca-data.json` (`SCHEMA_VERSION` 1) | Imports it into `profiles/<id>/profile-state.db` (`PROFILE_STATE_DATABASE_SCHEMA_VERSION = 3`, from `82412dab8b` on). Writes `orca-data.json.sqlite-export.<rev>.json`, a `profile-state.db.authority` marker, and a hash of the imported JSON. Never writes `orca-data.json` again. | **One-way.** An older Ether silently loads the *pre-merge* JSON and writes to it. The next merged launch sees a hash mismatch and **refuses to start** (`diverged-json`) until someone runs `orca profile state rollback --current-json`/`--current-sqlite`. Deleting the `.db` doesn't help, because the authority marker still exists. To downgrade cleanly, run `rollback --latest-json` from the merged build *first*. |
| **Structured chats** | One SQLite file per chat under `agent-session-journal/<ws>/<session>/journal.db`, plus `agent-sessions/agent-sessions.json` | One `agent-session-journal.db` per host with an owner lock (`59b746ff3c`, **not in BASE**); records live inside it (`5cda0f4508`). **`acea59c6d8` (10-06) deleted both importers.** | The merged Ether **does not see existing Ether chats**. Their tabs probably show "Unable to load this chat" (inferred). The old files stay untouched, so an older Ether still reads its own chats, but not chats created after the merge. |
| **Orchestration DB** | v41 | v43: v42 adds columns; v43 rewrites `session:` addresses to `orca_session_id:` | An older build opens it without refusing, but it probably won't match the renamed addresses (inferred). |
| **Terminal daemon** | protocol 36, forked | protocol 51, launchd job `com.stablyai.orca.terminal.<sha256(userData)[:16]>.v51`. The helper is copied to `userData/daemon-host/macos/` (~124 MiB). v36 is in `PREVIOUS_DAEMON_PROTOCOL_VERSIONS`, so it keeps serving the terminals it already has. | Existing terminals survive. After a rollback, the old build can't see v51 terminals and the launchd job is left orphaned (inferred). |
| **Hooks and agent status** | hook protocol `'1'` | Fields are only added | Safe. |
| **Local projects (fork)** | `localProjects` (`version: 1`, strict zod) is a top-level key in `orca-data.json` (`src/shared/local-projects/persistence.ts`) | There is no upstream key with that name. The SQLite import stores one document per top-level key with no allow-list, and loading still spreads the defaults with the parsed values, so the key survives, *provided the merge keeps our `Store`/`persisted-state-types` wiring*. | Unverified risk: our local workspaces show up as `FolderWorkspace` records missing from `state.folderWorkspaces`, with `projectGroupId` set to a local project id. Upstream's load passes (`backfillFolderScopeConnectionIds`, `migrateAutomationOwners`, `clearMissingProjectGroupMemberships`) may drop their sessions or group links as unknown, **and that loss then gets saved into SQLite for good**. |

The Ether releases README already warns that releases before `2026-10-23-ae81434245` can't read Workspace marks. After this merge, **no pre-merge release can safely run on the migrated profile**.

**Action items**
1. Quit Ether and copy the whole `~/Library/Application Support/Ether` before the first merged launch. That copy is the only complete rollback.
2. Launch the first merged build against a copy:
   `ORCA_BACKGROUND_LAUNCH=1 open -n --env ORCA_DEV_USER_DATA_PATH="$HOME/Library/Application Support/Ether-merge-test" …/Ether.app`
   A different path also gets its own daemon label. Then check that local projects, workspace marks, tabs, Linear links and chats all come through.
3. Decide about chat history:
   - (a) accept losing it;
   - (b) port `journal-per-session-import.ts` and `agent-session-legacy-record-import.ts` from `acea59c6d8^` into a fork-owned module; or
   - (c) stage at `6bc529176b` and open each chat once in that build.
4. Add a startup test showing that a profile containing `localProjects` and local `FolderWorkspace` scopes comes through the SQLite import and the upstream load passes unchanged.
5. In the releases README, document that a downgrade requires `orca profile state rollback --latest-json` first.

---

## 5. OpenCode removal

### After `merge-tree`, these OpenCode files are still in the tree (37 files; 32 merge cleanly, so they need explicit deletion)

- **`src/main/opencode/`:**
  - `opencode-adapter-test-fixture.ts`, `opencode-journal-translation.ts`;
  - `opencode-server-{connection-types,connection,events,http,process,test-fixture}.ts`, plus the tests for connection, events, http and process;
  - `opencode-session-{dispatch,open,options,prompts,protocol}.ts`;
  - `opencode-structured-launch-resolution.ts` (+ test);
  - `opencode-structured-session-{acquire,adapter,state}.ts`, plus the adapter and events tests.
- **`src/main/native-chat/`:** `structured-agent-session-location-support.ts`, `agent-session-wire/structured-agent-session-journal-identity.ts`, `agent-session-wire/structured-agent-session-opencode.test.ts`.
- **`src/main/runtime/`:** `structured-opencode-runtime-adapter.ts`, `rpc/methods/structured-agent-session-opencode-capability.test.ts`.
- **`src/shared/`:** `agent-session-opencode-identity.test.ts`.
- **`tests/e2e/`:** `ether-opencode-chat.spec.ts`. Keep `helpers/packaged-agent-chat-smoke.ts` but remove its OpenCode branch.
- **Add/add conflicts: take THEIRS, do not delete.** Upstream has its own `src/main/opencode/opencode-session-history.ts`, `opencode-structured-account-home.ts`, `src/shared/agent-session-account-home.ts`, `agent-session-option-catalog-opencode.ts` and `src/renderer/src/lib/structured-agent-session-provisional-tab.test.ts`.
- Our OpenCode commit also modified 53 upstream files: native-chat wire, runtime RPC methods, `protocol-version.ts`, `agent-session-record.ts` and others. Those hunks cause **44 of the textual conflicts**. Deleting files after the merge doesn't remove them; reverting `7908178403` first does (§2).
- Keep the `7a864a42f4` edit to `opencode-session-binder.ts`: it fixes upstream's terminal-mode OpenCode binder and has nothing to do with chat.
- `d12085ef99` only touches a plan doc.

### What upstream's ACP OpenCode needs at launch (`src/main/acp/acp-launch-specs.ts`)
- **Command:** `opencode acp` (on 2.x, `opencode2` also exists).
  - The env it adds: `OPENCODE_CLIENT=acp`, `OPENCODE_ENABLE_QUESTION_TOOL=false`.
  - It honours the per-agent Command setting.
- **Finding the binary:** first the user's Command setting. Otherwise `opencode` on the PATH of the resolved login-shell environment, which includes `/opt/homebrew/bin` when the shell sets it. Then `~/.opencode/bin`.
- **Minimum versions:** `OPENCODE_MINIMUM_VERSIONS = ['1.18.31', '2.0.14']`. The floor applies per major version (`agentCliMinimumVersion`): 1.x needs ≥ **1.18.31**, and 2.x needs ≥ 2.0.14 (`opencode2` needs ≥ 2.0.14).
  - `opencode --version` is probed before every create and every launch. A version that is too old makes the launch fall back to a terminal.
  - **The user's Homebrew OpenCode 1.18.30 is one patch below the floor.**
- **Turning it on:** chat routing needs `experimentalNativeChat`, plus `nativeChatProviders.opencode` (on by default when OpenCode is installed). It is refused for a custom start directory and for some remote and project runtimes (`structured-native-chat-launch-route.ts`).

**Action items**
1. Revert `7908178403` before the merge (§2). After the merge, check: `rg -il "opencode-server-|structured-opencode-runtime|opencode-journal-translation|ETHER_OPENCODE" src tests` should return nothing.
2. Run `brew upgrade opencode` to get ≥ 1.18.31, then confirm with `opencode --version`. Once the merged Ether is running, look for `[agent-cli-version] opencode --version: … is supported` in the main log.
3. Delete `tests/e2e/ether-opencode-chat.spec.ts`. If the user wants coverage, add a packaged smoke test for upstream's ACP OpenCode.

---

## 6. Fork-only tests

The fork added 112 test or e2e files: 42 under `src/renderer/src` (mostly `features/local-projects`), 14 under `src/main/local-projects`, 3 under `src/shared/local-projects`, 4 Ether config-script tests, and 26 files under `tests/e2e/`. The e2e files are:

- **Ether specs:** `ether-codex-chat`, `ether-linear-onboarding`, `ether-opencode-chat`, `ether-packaged`.
- **Local-projects specs:** `local-multi-root-*` (11 specs), `local-projects-linear(-entry)`, `local-sidebar-switching`.
- **Golden-stub:** `golden-stub-agent-launch-capture.unit.test.ts`.
- **Helpers:** `ether-release-bundle`, `golden-stub-agent-launch-capture`, `local-project-{controls,linear-backend,scripted-chat}`, `packaged-agent-chat-smoke`.

**Delete (OpenCode chat):**
- 7 tests in `src/main/opencode/*.test.ts`;
- `structured-agent-session-opencode.test.ts`;
- `structured-agent-session-opencode-capability.test.ts`;
- `src/shared/agent-session-opencode-identity.test.ts`;
- `tests/e2e/ether-opencode-chat.spec.ts`.

**Will break against upstream internals (fix after the merge):**
- `codex-local-workspace-binary-contract.test.ts`, `golden-stub-agent-launch-capture.unit.test.ts`, `local-multi-root-worktree-create.spec.ts`: `run-process` moved.
- `agent-session-local-workspace.test.ts`: the launch-resolver factories moved.
- `updater.ether-build.test.ts`: mocks `./ipc/pty`, which no longer exists.
- `local-root-diff-content-loader.test.tsx`, `LocalWorkspaceSourceControl.test.tsx`, `use-local-root-git.test.tsx`, `local-workspace-content-search.test.ts`, `local-workspace-editor-save.test.ts`: the runtime barrels are gone.
- `local-sidebar-model.test.ts`: decay state moved, and its behaviour changed.
- `local-workspace-linear-attachments.test.ts`: the Linear module moved.
- `agent-session-scope.test.ts`: `isAgentSessionRecord` was renamed.
- **`local-multi-root-cold-restart.spec.ts`:** it reads `userData/agent-sessions/agent-sessions.json` directly, a file THEIRS no longer writes. Rewrite it against the journal database, or assert through the UI.
- `local-multi-root-native-chat.spec.ts` and `local-project-scripted-chat.ts`: these drive structured chats, and upstream reworked the journal, permission modes (`2233fd3669`) and launch routing. Expect behavioural fixes.
- `src/renderer/src/lib/structured-agent-session-provisional-tab.test.ts` is an add/add conflict; take THEIRS.
- Any e2e that reads `orca-data.json` must now go through profile state. The only hit today is the agent-sessions read above.

The fork also modifies about 30 upstream test files. The ones in the conflict list are covered by the per-file guides.

**Action items**
1. Delete the OpenCode tests (handled by the revert).
2. Fix the 15 tests listed above. Then run:
   - `pnpm test` on the local-projects folders and `config/scripts/*ether*.test.mjs`;
   - `pnpm run typecheck:e2e`, which upstream now gates with `check:e2e-typecheck-ratchet`.
3. Run the Ether e2e specs in the background: `ORCA_BACKGROUND_LAUNCH=1 pnpm exec playwright test tests/e2e/local-multi-root-*.spec.ts tests/e2e/ether-*.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1`.
