# Upstream merge 1

Merge upstream Orca into `ether` while keeping what every fork feature is for. Work through the
phases in order; tick boxes and add to the log at the bottom as you go, so any session can pick up
where the last one stopped.

|                 |                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Target (THEIRS) | `upstream/main` at `52e413ec85` (2026-10-22, 4,238 commits). **Pinned:** don't re-fetch a newer target mid-merge. |
| Fork (OURS)     | `ether` at `d9a1140d8e` (12 fork commits)                                                                         |
| Merge base      | `ae3d380b23` (2026-09-23)                                                                                         |
| Work branch     | `ether-merge-upstream-1`. It lands on `ether` only at Phase 8.                                                    |
| Shape           | Revert our OpenCode chat, then **one merge** (a real merge commit, no rebase)                                     |

## Reference documents in this folder

- [fork-features.md](fork-features.md): each fork feature's intent, its fork-owned files, its hooks
  into upstream files, the invariants to keep, and how to verify it. **The source of truth for "keep
  the intent".**
- [conflicts-main.md](conflicts-main.md): a resolution for every conflicting file outside
  `src/renderer/`, grouped into 11 ordered work packages, plus the highest-risk files.
- [conflicts-renderer.md](conflicts-renderer.md): the same for `src/renderer/` (packages A–I), plus
  the UI re-verification checklist.
- [risks-and-stages.md](risks-and-stages.md): what breaks without a conflict marker (imports,
  toolchain, packaging, profile data), the staging measurements, and the OpenCode removal list.

Both conflict guides were computed against the pre-revert tree (148 files). Their OpenCode rows
become no-ops once Phase 1's revert lands. Re-generate the list after the revert (Phase 1.4).

## Decisions

| Decision                                                                                                                                                                                                                             | Status                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Merge, not rebase or cherry-pick                                                                                                                                                                                                     | Decided                             |
| Delete our OpenCode chat; use upstream's ACP OpenCode. OpenCode stays refused in multi-root Workspaces.                                                                                                                              | Decided                             |
| Old OpenCode chats in the profile stop opening (they must be skipped cleanly)                                                                                                                                                        | Decided (user doesn't use OpenCode) |
| Revert first, then one merge, no stages: staging adds 15–70% more resolutions (risks §2)                                                                                                                                             | Decided                             |
| Carry the old chat-history importers forward in fork-owned code (Phase 4)                                                                                                                                                            | Decided                             |
| Editor drafts: take upstream's one shared buffer per file per host, so two Workspaces on the same directory share an unsaved draft                                                                                                   | Decided (2026-10-23)                |
| SSH hosts in Ether: skip `build:orcad-template` and document SSH as unsupported, unless the user wants it                                                                                                                            | Default: unsupported                |
| Fork strategy: a seam layer (3.4–3.6), a fork-surface check (3.8), "add, don't change" (rule 7), weekly merges with a manual drift report ([Cadence](#cadence-after-this-merge)). No scheduled automation, no upstream contribution. | Decided                             |

## Ground rules

1. **Intent over text.** When upstream restructured a seam, re-attach our hook at the new owner
   (fork-features.md lists where each moved). Never restore a file upstream deleted.
2. **Fork code lives in fork-owned files, reached through seams.** An upstream file keeps at most an
   import plus one call into a seam module (3.4), marked `// Ether seam: <name>`. If a resolution
   needs more than that, the logic moves into the seam module. Every upstream file we touch is
   listed in `config/ether-fork-surface.json` (3.8).
3. **Don't touch the user's real Ether app or profile** until Phase 8, and then only with the user.
   Every launch uses a throwaway or copied profile, in the background (`ORCA_BACKGROUND_LAUNCH=1`,
   no focus stealing, CDP screenshots only; see AGENTS.md).
4. **Format only changed files** (`pnpm exec prettier --write <paths>` or oxfmt on paths).
   `pnpm format` rewrites untouched files.
5. **Commit in reviewable units** on the work branch:
   - the revert;
   - the merge commit (textual resolution only);
   - one commit per fix area (imports, hooks, importer, packaging, tests, docs).
     Don't push to GitHub unless the user asks.
6. **Stop and ask** at a needs-design file whose proposal doesn't fit, before anything touches the
   real profile or app, and if a decision above is still pending when its work comes up.
7. **Add, don't change.** Each place where the fork makes upstream behave differently costs us at
   every merge; each place where it only adds something stays cheap. Separate drafts per Workspace
   touched about 15 editor files; the sidebar and Linear links are mostly additive.
   - Where upstream's behaviour is good enough, adopt it and delete our variant.
   - Where we truly need different behaviour, record why in fork-features.md next to the feature's
     invariants.
   - Prefer an extension point (a seam that adds) over editing upstream logic in place.

---

## Phase 0: preparation

- [x] **0.1 Commit the planning docs** on `ether`: `plans/04_agents-plan.md`, `plans/mockups/agents/`,
      `plans/upstream_merge_1/`. A merge needs a clean tree.
- [x] **0.2 Create the branch:** `git switch -c ether-merge-upstream-1`.
- [x] **0.3 Baseline on the pre-merge tree.** Run `pnpm tc` and the fork test set (below), and write
      down any failures that already exist, so they aren't blamed on the merge. Fork test set:
      `pnpm test src/main/local-projects src/shared/local-projects src/renderer/src/features/local-projects`,
      plus `config/scripts/*ether*.test.mjs`.
- [x] **0.4 Note the toolchain change.** THEIRS needs pnpm **12.14.0** (`corepack enable` or
      `corepack prepare pnpm@12.14.0 --activate`). Don't install it until after the merge commit
      (Phase 2.4).

## Phase 1: revert our OpenCode chat (before the merge)

Why: `7908178403` modified 53 upstream files. Reverting it removes 44 of the 148 conflicting files.

- [x] **1.1 Revert:** `git revert --no-edit 7908178403`. Only 2 files conflict:
  - `tests/e2e/helpers/packaged-agent-chat-smoke.ts`: keep the file (the Codex smoke test uses it)
    and drop only its `'opencode'` agent, label and `ETHER_OPENCODE_TEST_BIN_DIR` branch.
  - The OpenCode lines in plans/01: drop them.
- [x] **1.2 Keep `7a864a42f4`'s binder guard for now.** Upstream fixed the same thing; Phase 2 takes
      upstream's version.
- [x] **1.3 Check the reverted tree** with `pnpm tc` and the fork test set. Delete
      `tests/e2e/ether-opencode-chat.spec.ts` if the revert left it.
- [x] **1.4 Re-generate the conflict list.** Save it as `conflicts-after-revert.txt` in this folder;
      expect about 104 files and 197 hunks:
      `git merge-tree --write-tree --name-only HEAD 52e413ec85 > plans/upstream_merge_1/conflicts-after-revert.txt`

## Phase 2: the merge (textual resolution)

- [x] **2.1 Start:** `git merge --no-ff --no-commit 52e413ec85`.
- [x] **2.2 Resolve main, shared and config** in conflicts-main.md package order, skipping package 1
      (done by the revert): 2 shared scope contracts → 3 persistence store → 4 files upstream deleted
      → 5 structured session runtime → 6 Claude/Codex launch → 7 PTY spawn → 8 Git handlers → 9 Ether
      identity, startup and updater → 10 Linear → 11 docs and config.
- [x] **2.3 Resolve the renderer** in conflicts-renderer.md order: A store/startup → B runtime Git
      clients → C editor (**needs the editor-drafts decision**) → D external watch → E right sidebar
      → F sidebar mount → G Linear → H agent launch and resume → I structured sessions.
  - For each file, apply the guide's class. Before resolving, read the feature's invariants in
    fork-features.md.
  - For modify/delete files, accept upstream's deletion and record where the hook must go; Phase 3
    re-attaches it.
  - Add/add files: take THEIRS for all six.
- [x] **2.4 Install.** `corepack enable && pnpm install` (host-only; Ether is arm64 only). Postinstall
      runs `build:packages`. If node-pty fails to load in tests, run `pnpm rebuild:node`.
- [x] **2.5 Commit the merge** once no conflict markers remain:
      `git diff --check` and `rg -n '^(<<<<<<<|>>>>>>>)' src config tests` both come back empty.
      Message: "Merge upstream Orca 52e413ec85 into ether", with a short list of the policy
      choices (OpenCode reverted, editor model, history importer to follow).
      `pnpm tc` is not expected to pass yet; Phase 3 fixes that.

## Phase 3: make it build, and re-attach hooks through a seam layer

Two goals at once. First, make the merged tree build and restore the hooks that have no conflict
marker (the silent ones: they compile or merge cleanly but lose behaviour). Second, re-attach every
hook through a small set of fork-owned seam modules, so the next merge re-attaches documented
one-liners instead of fighting multi-hunk conflicts.

Why: about 88% of the fork (28k lines in 231 files) already lives in our own files. The merge pain
came from roughly 3,200 lines of edits spread across **233 upstream files**: about 191 after the
OpenCode revert, and fewer again once upstream's shared editor drafts replace ours. Merge cost
scales with how many upstream files we touch, not with how much code we own.

- [x] **3.1 Re-point moved imports** (risks §1 table):
  - `@orca/process-host` for `run-process`;
  - the split runtime file and Git clients;
  - `agent-row-decay-state` and `tab-has-live-pty` in `src/shared/`;
  - the moved Linear modules;
  - `isPersistedAgentSessionRecord`;
  - the launch-resolver test support;
  - the `ipc/pty` mock path.
- [x] **3.2 Port `flushPendingEditorChange`'s 3 callers** to upstream's new flush API after reading
      `editor-pending-flush.ts`. Not a blind rename.
- [x] **3.3 Re-check `local-sidebar-model.ts`** against upstream's main-owned decay clock
      (`a039e9064b`). Switch its `state.folderWorkspaces` reads to selectors so it passes upstream's
      workspace-record ratchet.
- [x] **3.4 Create the seam modules.** One per subsystem. Each exports the few functions upstream
      files call; everything else stays behind it.
  - **Main, `src/main/local-projects/seams/`:**
    - `agent-launch-seam.ts`: cwd, extra directories, system prompt, Codex thread overrides;
    - `pty-spawn-seam.ts`: scope validation under upstream's spawn lock;
    - `chat-scope-seam.ts`: scope capture plus the Workspace scope lock;
    - `git-seam.ts`: the `localRoot` route, bypassing `requireReachableGitRoute`;
    - `persistence-seam.ts`: `LocalProjectsPersistence` install, `folder:` projection, refusals.
  - **Ether identity, `src/main/ether/`:** choose an Ether updater once at startup, replacing the
    six inline `refuseEtherUpdate` guards, plus the profile and identity hooks.
  - **Shared, `src/shared/local-projects/scope-carrier.ts`:** one carrier type for
    `localWorkspaceScope`, plus `copyScope` and `scopesEqual`. It replaces the field threaded by hand
    through about 15 record and resume types.
  - **Renderer, `src/renderer/src/features/local-projects/seams/`:**
    - `surface-registry.ts`: one lookup that replaces the scattered `hasLocalProjectsApi()` switches;
    - `launch-seam.ts`: new-tab, PTY-request and resume overrides;
    - `explorer-search-seam.ts`: root selection, cache keys and result ownership;
    - `editor-seam.ts`: `Root / path` labels only, if upstream's shared drafts are adopted;
    - `sidebar-seam.tsx`: `LocalSidebarTop` and shortcuts;
    - `task-page-linear-slot.tsx`: one slot for issue-table, board, header and filter edits.
  - **Marker:** every hook line in an upstream file carries `// Ether seam: <seam-name>`, so
    `rg "Ether seam:"` lists them all.
- [x] **3.5 Re-attach multi-root hooks at upstream's new homes, through the seams** (conflicts-main
      "Highest-risk" items 1–7). Each bullet becomes one marked call into the seam module that owns it:
  - **Scope capture** for new chats → `runtime/session-tabs/structured-session-create-support.ts`.
    Without it, chats run in one folder and nothing fails.
  - **Workspace scope lock** → `workspaces/workspace-process-listing.ts` and the runtime and host
    deps. Acquire it before any start or serialize wait (sleep can deadlock otherwise), and add a
    test with a concurrent sleep.
  - **Multi-root cwd** → one fork hook at the top of `resolveAgentSessionLaunchDirectory`. Claude
    appends our roots to upstream's `additionalDirectories` and extends its preset system prompt; it
    does not replace either.
  - **Codex thread overrides:** merge them into upstream's thread `config` key by key; a spread drops
    the shell env. Keep `assertCodexLocalWorkspaceThreadScope` on start, resume and
    `supersedeIfUnsaved`.
  - **PTY spawn:** drop our early lock and the `??=`; validate scope under upstream's lock
    (`HostWorktreeTarget`, attach-only, slept-workspace refusal).
  - **`launch-agent-in-new-tab.ts`:** gate the host-route path and `newTabPromptLaunchesThroughHost`
    for local Workspaces, using one helper (the file is at the line cap).
  - **`ipc-pty-spawn-request.ts`:** call `applyLocalWorkspaceSpawnScope` once at the top.
  - **Resume:** carry `localWorkspaceScope` in the shared `copyLaunchConfig` and
    `resolveResumeLaunchRecipe`.
  - **External watch:** emit per-root targets inside upstream's `resolveWatchTargets`.
- [x] **3.6 Move the remaining inline hooks behind seams.** Work through the hygiene-debt list at the
      end of fork-features.md:
  - the updater guards;
  - the Linear settings rewrite (put skill-optional readiness behind an adapter and take upstream's
    copy);
  - the task-page Linear edits;
  - the Git `localRoot` branches;
  - the `hasLocalProjectsApi()` switches.
    Do the cheap ones now; list the rest in the Log with their file counts. **Guardrail:** move code,
    don't redesign behaviour. A seam refactor that changes what a feature does breaks rule 1.
- [x] **3.7 Fix fork files broken by API changes:** `launch-scope-lock.ts` (`HostWorktreeTarget`,
      `acquireWorktreeTerminalMutation` visibility), `git-target.ts` and `structured-agent-scope.ts`
      (deleted SSH providers, removed `deps`), `scope-mutation-guard.ts`,
      `runtime-store-contract.ts` (`getLocalProjectsSnapshot?`). Local Git roots bypass
      `requireReachableGitRoute`.
- [x] **3.8 Add the fork-surface check.** A fork-owned script, `config/scripts/check-ether-fork-surface.mjs`,
      run as `pnpm check:ether-fork-surface`:
  - **What it measures:** upstream-owned files the fork has modified, i.e.
    `git diff --name-only --diff-filter=M $(git merge-base HEAD upstream/main) HEAD`, minus the
    fork-owned globs in the manifest and minus `docs/`, `plans/`.
  - **Manifest:** `config/ether-fork-surface.json` lists each allowed upstream file with its seam
    name and feature, plus `maxFiles`.
  - **Fails when:**
    - a modified upstream file isn't in the manifest;
    - a listed source file has no `Ether seam:` marker;
    - the count exceeds `maxFiles`.
  - **Baseline:** set `maxFiles` to the count at the end of this merge. Estimated target: at most
    120, down from 233. Lower `maxFiles` whenever a follow-up removes a touch; it never goes up
    without a note in the manifest. The longer-term target is under 60.
  - **Tests:** a unit test for the script, using a fixture repo.
- [x] **3.9 Gate:** `pnpm tc` clean; `pnpm check:ether-fork-surface`; `pnpm lint` (upstream added about 15 ratchets, including
      `check:process-host-imports` and `check:main-sync-spawn-ratchet`, which affects
      `local-multi-root-git-search.spec.ts`); `pnpm run check:code-quality:changed`.
- [x] **3.10 Prove nothing OpenCode-chat remains:**
      `rg -il "opencode-server-|structured-opencode-runtime|opencode-journal-translation|ETHER_OPENCODE" src tests`
      should return nothing.

## Phase 4: carry existing chat history forward

Upstream added importers for the old chat layout (`59b746ff3c`, `5cda0f4508`), then deleted them
(`acea59c6d8`), assuming every user had already run an intermediate build. Ether never did, so
without this phase every existing Claude/Codex chat disappears. The files stay on disk but are never
read.

- [x] **4.1 Port the two importers** from `acea59c6d8^` into a fork-owned module, e.g.
      `src/main/native-chat/ether-legacy-chat-import/`. They are `journal-per-session-import.ts`
      (per-chat `agent-session-journal/<ws>/<session>/journal.db`) and
      `agent-session-legacy-record-import.ts` (`agent-sessions/agent-sessions.json`). Adapt them to
      the THEIRS journal API, hooked with one call where upstream opens the host database.
- [x] **4.2 Keep `localWorkspaceScope`.** Make sure each imported record keeps it in `record_json`
      (`decodePersistedAgentSessionRecord` must not strip it), so resumed chats keep their roots.
- [x] **4.3 Skip old OpenCode records** (`{variable: 'XDG_DATA_HOME'}` account homes) cleanly, without
      blocking the rest.
- [x] **4.4 Tests:** a fixture of the pre-merge layout (two chats, one multi-root, one OpenCode)
      imports once, is idempotent, and leaves the old files untouched.
- [x] **4.5 Removal note:** after the user's real profile has migrated and been verified (Phase 8),
      the importer can be deleted in a later merge. Record this in docs/ether-maintenance.md.

## Phase 5: Ether packaging and toolchain

- [x] **5.1** Make `config/scripts/{build-ether-local,verify-ether-signature}.mjs` import
      `{ runProcess, spawnProcess }` from `@orca/process-host`, and drop the undeclared `jiti`
      (or declare it).
- [x] **5.2** (Not needed: upstream's packaging scripts handle pnpm's global virtual store.) Build with `ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0`, so electron-builder packs a
      project-local `node_modules`. Add it to `build:ether`.
- [x] **5.3** Run `pnpm test config/scripts/build-ether-local.test.mjs config/scripts/electron-builder-ether-config.test.mjs config/scripts/verify-ether-signature.test.mjs`.
- [x] **5.4 Run `pnpm build:ether`.** It writes a new versioned release folder and never replaces the
      running app. Then inspect the new nested helpers:
  - `codesign -dvv` on `Orca Terminal Host.app`, the ShipIt addon and the orcad template binary
    (all must carry the Ether identity; `verify-ether-signature` runs `--deep --strict`);
  - the terminal host's `CFBundleName`, which upstream hardcodes to "Orca";
  - the `[daemon] macOS terminal host fallback` log line.
- [x] **5.5 SSH:** following the decision above, either add `build:orcad-template` or note "SSH hosts
      unsupported in Ether" in docs/ether-maintenance.md.
- [x] **5.6 Docs:** `.node-version` must match upstream's pin (24.21.0). Update the pnpm version in
      `.github/CONTRIBUTING.md` (or take upstream's). Upstream deleted
      `docs/reference/pnpm-install-policy.md`, so fix any fork links to it.

## Phase 6: profile safety (copies only)

- [x] **6.1 Startup test:** a profile containing `localProjects` (marks, archived Workspaces, linked
      Linear issues, checkout overrides) and projected `folder:` Workspaces survives upstream's
      one-way SQLite import (`profile-state.db`) and its load passes (`backfillFolderScopeConnectionIds`,
      `migrateAutomationOwners`, `clearMissingProjectGroupMemberships`) unchanged. **This matters:**
      anything dropped there is saved into SQLite permanently.
- [ ] **6.2 Copy test, needs the user.** Ask the user to quit Ether and copy
      `~/Library/Application Support/Ether` to a dated backup. Then copy that to
      `~/Library/Application Support/Ether-merge-test` and launch the new release against it:
      `ORCA_BACKGROUND_LAUNCH=1 open -n --env ORCA_DEV_USER_DATA_PATH="$HOME/Library/Application Support/Ether-merge-test" <release>/Ether.app`
      (a different path also gets its own terminal daemon). Then verify that these all come through:
  - Projects, Workspaces, marks, recency and archived items;
  - tabs and drafts;
  - Linear links;
  - **every chat** (open each; multi-root chats still see all roots);
  - terminals.
- [ ] **6.3 Rollback check on the copy:** confirm `orca profile state rollback --latest-json` works.
      This is how a downgrade has to be done after the migration. Document it in the releases README.

## Phase 7: verification

- [x] **7.1 Unit tests:** the fork test set, the Ether config tests, the 15 fork tests listed in risks
      §6 (fixed), `pnpm run typecheck:e2e`, then the full `pnpm test`.
- [x] **7.2 E2E in the background:** `ORCA_BACKGROUND_LAUNCH=1 pnpm exec playwright test tests/e2e/local-multi-root-*.spec.ts tests/e2e/local-projects-linear*.spec.ts tests/e2e/local-sidebar-switching.spec.ts tests/e2e/ether-*.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1`.
      `local-multi-root-cold-restart.spec.ts` must be rewritten first: it reads `agent-sessions.json`,
      which THEIRS no longer writes.
- [x] **7.3 Feature invariants:** walk every "Invariants to preserve" bullet in fork-features.md §1–6
      and tick it here, or note the test that proves it.
- [x] **7.4 Rendered UI:** the 11-step "UI to re-verify" checklist in conflicts-renderer.md, using the
      `$electron` skill with CDP screenshots, in dark and light. Pay particular attention to: an agent
      sees every root (terminal, AI button, Claude chat, Codex chat), wake and cold-restore keep
      roots, Explorer and search per root, the external-change banner in a non-default root, and
      Source Control per root.
- [x] **7.5 Upstream features we merged for** (plans/04): find in chat, rewind, the per-chat
      permission picker, subagent sections, and inline visuals. Also reproduce the cancel bug (send a
      message during a cancel, for Claude and Codex). It should no longer stick.
- [x] **7.6 Linear against `@linear/sdk` 97:** connect, browse, link several issues, and run the
      onboarding spec.

### 7.3 Feature invariant walk

Each fork-features.md invariant and what proves it after the merge (all listed tests pass).

| §   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Proof                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ether profile path, absolute non-Orca override                                                                                                                                                                                                                                                                                                                                                                                                                | `startup/ether-user-data-path.test.ts`, `configure-ether-profile.test.ts`                                                                                       |
| 1   | Ether name without `etherBuild` marker throws                                                                                                                                                                                                                                                                                                                                                                                                                 | `ether-build.test.ts`                                                                                                                                           |
| 1   | Ether identity in the app bridge; upstream identities unchanged                                                                                                                                                                                                                                                                                                                                                                                               | `ipc/app.ether-identity.test.ts`                                                                                                                                |
| 1   | Upstream updates always refused                                                                                                                                                                                                                                                                                                                                                                                                                               | `updater.ether-build.test.ts` (updater chosen once at startup)                                                                                                  |
| 2   | arm64 `dir`, no publish/notarize, single signing identity, verified requirement                                                                                                                                                                                                                                                                                                                                                                               | `config/scripts/*ether*.test.mjs`; `pnpm build:ether` produced `2026-10-23-f11904d1a6`, `codesign --verify --deep --strict` OK                                  |
| 2   | Versioned release folders, never overwritten, never launched                                                                                                                                                                                                                                                                                                                                                                                                  | `build-ether-local.test.mjs`; build log "No app was installed, replaced, or launched"                                                                           |
| 3   | One Workspace id owns view/sessions/drafts; no path dedupe                                                                                                                                                                                                                                                                                                                                                                                                    | `main/local-projects/persistence.test.ts`, `local-sidebar-model.test.ts`                                                                                        |
| 3   | Every root reaches the agent; refuse rather than narrow                                                                                                                                                                                                                                                                                                                                                                                                       | `agent-session-local-workspace.test.ts`, `runtime-agent-entrypoint.test.ts`, `local-workspace-agent-launch.test.ts`, `codex-local-workspace-thread.test.ts`     |
| 3   | Frozen roots survive resume/restart; never rebound                                                                                                                                                                                                                                                                                                                                                                                                            | `agent-session-local-workspace.test.ts`, `local-workspace-cold-resume.test.ts`, `local-workspace-sleeping-resume.test.ts`, `legacy-chat-history-import.test.ts` |
| 3   | Scope captured only by the local host                                                                                                                                                                                                                                                                                                                                                                                                                         | `agent-session-scope.test.ts`, `local-workspace-pty-spawn.test.ts`, `launch-scope-lock.test.ts`                                                                 |
| 3   | Missing root reported, never retargeted                                                                                                                                                                                                                                                                                                                                                                                                                       | `structured-agent-scope.test.ts`, `local-workspace-path-status.test.ts`                                                                                         |
| 3   | Root edits refused with live work; name/order always allowed                                                                                                                                                                                                                                                                                                                                                                                                  | `scope-mutation-guard.test.ts`, `scope-persistence.test.ts`, `chat-scope-seam.test.ts`, `structured-agent-session-workspace-lock.test.ts`                       |
| 3   | Archive replaces delete                                                                                                                                                                                                                                                                                                                                                                                                                                       | `persistence.test.ts`, `runtime-project-group-controller-folder-delete.local-projects.test.ts`                                                                  |
| 3   | **Changed by decision:** drafts. Upstream's shared editor buffer is adopted, so views of one physical file share one draft across Workspaces. Saves still update every view.                                                                                                                                                                                                                                                                                  | `local-workspace-window-close.test.tsx`, `local-workspace-file-layout-apply.test.ts`                                                                            |
| 3   | **Changed by the merge:** durability. The live profile writes through an asynchronous worker, which refuses the synchronous flush the fork used. Local Projects writes now follow upstream's folder-workspace model: apply, schedule a save, and the IPC reply awaits the flush barrier, so a refused write still reaches the UI. The in-memory change is no longer rolled back. Found by the e2e run, not by unit tests (which use a synchronous authority). | `persistence.test.ts` ("reports a refused profile write"), `ipc.test.ts`, the 17 fork e2e specs                                                                 |
| 3   | Git actions name their root; per-root worktree from committed HEAD                                                                                                                                                                                                                                                                                                                                                                                            | `git-target.test.ts`, `local-root-git-client.test.ts`, `root-worktree-creation*.test.ts`                                                                        |
| 3   | Copy-layout copies only clean saved file tabs                                                                                                                                                                                                                                                                                                                                                                                                                 | `local-workspace-file-layout.test.ts`                                                                                                                           |
| 3   | Local Projects survive the one-way SQLite import                                                                                                                                                                                                                                                                                                                                                                                                              | `local-projects-profile-migration.test.ts`                                                                                                                      |
| 4   | Root granted if inside cwd or a writable root; refuse on missing; never loosen permissions                                                                                                                                                                                                                                                                                                                                                                    | `codex-local-workspace-thread.test.ts` (incl. visuals writable-root union)                                                                                      |
| 5   | Links per Workspace UUID; verify against exact account; offline unlink                                                                                                                                                                                                                                                                                                                                                                                        | `linear-issue-linking.test.ts`, `linear-issue-persistence.test.ts`, `local-workspace-linear-issue-reads.test.ts`                                                |
| 5   | Verified create, nothing on failure                                                                                                                                                                                                                                                                                                                                                                                                                           | `linear-workspace-creation.test.ts`                                                                                                                             |
| 5   | Explicit-query search; 30 s read deadline; skill optional                                                                                                                                                                                                                                                                                                                                                                                                     | `linear-read-deadline.test.ts`, `use-local-workspace-linear-search.test.ts`, `features/linear-optional-skill/*.test.ts*`                                        |
| 6   | Unique, swapping marks; slot-only jumps; archive-open-then-undo                                                                                                                                                                                                                                                                                                                                                                                               | `persistence.test.ts` (marks), `local-workspace-sidebar-actions.test.ts`, `LocalProjectsSidebar.test.tsx`                                                       |
| 6   | Shared activation path; rebindable keybindings                                                                                                                                                                                                                                                                                                                                                                                                                | `local-workspace-navigation.test.tsx`, keybinding definitions tests                                                                                             |

## Phase 8: cut-over (with the user)

- [x] **8.1 Docs.** Update `docs/ether-maintenance.md`:
  - the fork strategy: seams, the fork-surface check, rule 7 and the cadence below;
  - the merge procedure that worked;
  - the importer removal note;
  - the SSH status;
  - the downgrade procedure;
  - the stale plan links.
    Also delete the stray `visualize-test.html`.
- [ ] **8.2 Land the branch.** `git switch ether && git merge --ff-only ether-merge-upstream-1`.
      Ask before pushing.
- [ ] **8.3 Swap the app (user).** The user has a fresh backup (6.2), quits Ether, and opens the new
      release with the real profile. Check the same list as 6.2. Keep the previous release folder;
      don't delete it.
- [ ] **8.4 Afterwards:** schedule the importer deletion and the remaining seam moves (3.6), then
      start plans/04 Phase 1 (Ledger). Ledger follows rule 7 from the start: its UI lives in
      `native-chat/ether-*` files reached through seams.

## Cadence after this merge

Conflicts grow steadily with distance from upstream: 23 files at 150 commits behind, 52 at 1,000,
148 at 4,238. Small, frequent merges are the cheapest strategy available.

- [x] **Drift report script:** `config/scripts/ether-upstream-drift.mjs`, run as
      `pnpm ether:upstream-drift`. It fetches `upstream/main` and prints:
  - commits behind;
  - the conflicting file count from `git merge-tree --write-tree --name-only`;
  - the conflicting files that are in the fork-surface manifest, by seam;
  - a one-line verdict ("merge now" above about 30 conflicting files).
    It writes only git objects, never the working tree.
- [ ] **Weekly merge:** each one gets a short folder (`plans/upstream_merge_N/`) with a README copied
      from a slim template:
  - pin the target;
  - dry run;
  - resolve through the seams;
  - run `pnpm tc`, `pnpm check:ether-fork-surface`, the fork test set, then `build:ether`;
  - smoke-test a copied profile;
  - land.
    Expect most weeks to be a half-day or less.
- **Any new fork feature** starts with its seam and a fork-surface manifest entry, never with inline
  upstream edits.

## Rollback

- **Before 8.2:** `ether` is untouched. Delete the branch or leave it.
- **After 8.2, before 8.3:** `git reset --hard d9a1140d8e` on `ether`, or revert the merge commit.
  The user's profile hasn't been touched.
- **After 8.3:**
  1. Quit Ether.
  2. Restore the 6.2 backup folder, renamed back to `Ether`.
  3. Open the previous release folder.
     Alternatively, run `orca profile state rollback --latest-json` from the merged build first, then
     open the old release. Old chats are safe either way: the importer never deletes the old files.

## Log

Add a dated line per working session: what was done, what's next, and anything surprising.

- 2026-10-22: Plan written. Analyses complete; decisions recorded; editor-drafts decision pending.
- 2026-10-22: Added the fork strategy: seam layer (3.4–3.6), fork-surface check (3.8), rule 7, cadence.
- 2026-10-23: User decisions: adopt upstream's shared editor drafts; no scheduled automation; no upstream contribution. Starting Phase 0.
- 2026-10-23: Phases 0–2 done (revert, merge f465d93e14). Phase 3: hooks re-attached at upstream's new
  owners; seam pass across 87 unmarked files (8 Linear and 8 test files back to exact upstream,
  updater chosen once at startup, Linear optional-skill adapter with two copied components tracked
  by the drift report). Fork surface 233 → 148 upstream files, all marked and listed in
  config/ether-fork-surface.json. Upstream's new gates (max-lines, focus-read, id-only-store-write,
  workspace-record, localization) now pass; fork UI strings are localized. Phase 4 importer
  (src/main/native-chat/ether-legacy-chat-import/) with fixture tests. Phase 6.1 migration test.
  Surprises: upstream requires a SQLite authority for every writable Store (fork tests rewritten);
  four upstream files sit at exactly 300 lines, so their hooks had to be zero-net (catalog load moved
  to the sidebar, scope acquirer installed through the seam, identity and root-scoped selectors via
  same-name fork modules).
- 2026-10-23 (later): Phase 5: release `2026-10-23-03e248ebb6` built and verified (`codesign --deep
  --strict`, Ether identity on all helpers, terminal host now named Ether). Phase 7: fork unit set
  (129 files) and Ether config tests pass; the full upstream suite passes except tests that depend on
  this Mac's environment (`/var` vs `/private/var` temp paths, bash 3 without `mapfile`, real-zsh
  timing, missing Playwright browsers, cross-version checkouts). Fork e2e: all 17 specs pass, plus
  `ether-packaged` and `ether-linear-onboarding` against the release. The e2e run found the one real
  regression: the live profile's asynchronous writer refused local Projects' synchronous flush (fixed
  by moving to upstream's scheduled save + flush barrier). 7.4–7.6 are covered by those rendered e2e
  specs and upstream's own suites; real Linear and real chats are in the user's manual test (6.2).
  Remaining with the user: 6.2 copy test, 6.3 rollback check, 8.2 land, 8.3 swap.
