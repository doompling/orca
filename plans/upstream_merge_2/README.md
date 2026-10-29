# Upstream merge 2

Date: 2026-10-28. Target: `upstream/main` as fetched on 2026-10-28 (1,601 commits ahead of the
merge-1 base `52e413ec85`). Branch `ether-merge-upstream-2`, worked in the git worktree
`.claude/worktrees/merge-2` so the main checkout's uncommitted plans stay untouched.

Goal: catch up with upstream and shrink the fork's upstream surface while keeping every behaviour
in [docs/ether-changes.md](../../docs/ether-changes.md). Intent, invariants and checks per feature
are in [docs/ether-changes-technical.md](../../docs/ether-changes-technical.md), which replaces
`plans/upstream_merge_1/fork-features.md` as the reference.

Dry run before any work: 48 conflicting files (47 content, 1 modify/delete), about 70 hunks; 15
fork imports of modules upstream deleted or moved; 152 touched upstream files.

## Baseline (on `ether` 06becdd5d9)

- `pnpm tc` clean.
- Fork unit tests 395/396; the failure was a stale route count in `local-projects/ipc.test.ts`
  (Fork Chat added a twelfth route), fixed in the first commit.
- Fork e2e: 18 passed, 1 skipped (`ether-codex-chat.spec.ts` needs the live opt-in).

## Phase A: before the merge

- [x] Readable change list and technical reference; the fork-surface check ties every seam to a
      documented feature.
- [x] Linear (E7): fork actions render beside upstream JSX and hide the upstream sibling in local
      mode; one filter hook; three files back to upstream (152 -> 149). The settings test edits
      and the workspace-creation hooks stayed (see Phase C for the tests).

## Phase B: the merge (`7df8c5a516`, target `f640517132`, 1,690 commits)

- [x] Terminal starts: upstream's version of all eight files (accepting the deletion of
      `runtime/spawn-execute.ts`), re-attached at `spawn-cwd.ts` and `spawn-operation.ts`.
- [x] Agent launch and chat scope: upstream's side plus the scope lines; moved imports re-pointed.
- [x] i18n: upstream's catalogues, then both sync scripts.
- [x] Fork Chat follows upstream's new chat-pane menu; the window-close draft backup became one
      guarded call; fork tests follow upstream's profile-database close and conversation view.
- [x] `pnpm tc` clean; full `pnpm test`: every failure that is not also a failure on a plain
      upstream checkout fixed (about 40 files fail on both here); fork e2e 16/18, the two failures
      were upstream's new full-access default in a test expectation (fixed after).
- Upstream files touched after the merge: 145.

## Phase C: after the merge

- [x] E4: chat roots moved to `ether-agent-session-scopes.json` (`session-scope-store.ts`), read
      from pre-store records once; a chat without its roots refuses (145 -> 139). Terminal agents
      keep the typed field: upstream's schemas strip unknown fields on load, so moving it would
      strand existing sleeping agents.
- [x] E4: upstream's new launch paths either go through the new-tab admit check or set
      `launchAgent`, which the main-process PTY check refuses without roots; chats capture roots in
      main whatever the entry point. The folder composer creates upstream folder workspaces, not
      local Workspaces.
- [x] Upstream tests Ether changes are replaced, not edited (`config/ether-replaced-upstream-tests.mjs`
      and `*.ether.test.*` copies); the repo-catalog bridge refresh became a best-effort fork call
      (139 -> 136).
- [x] E5: the window-close draft flow is one guarded call (done in the merge).
- [ ] Not done, on purpose: E6 fork-owned Git channels (six files saved for duplicating upstream's
      status, diff, staging and commit handlers); E8 sidebar header slot (would copy upstream's
      whole `SidebarHeader`); E7 deadline in `createLinearClient` (would also cut off writes and miss
      queue waits). Revisit Git if its handlers keep conflicting.
- [x] Docs and manifest (136).
- [ ] `pnpm build:ether` and the packaged specs.

## Log

- 2026-10-28: dry run 48 conflicts; Phase A; merge; Phase C to 136 touched upstream files.
