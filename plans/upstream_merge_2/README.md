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
- [ ] Linear (E7): render fork actions beside upstream JSX, one filter hook, fork assertions out of
      upstream tests, drop low-value touches.

## Phase B: the merge

- [ ] Take upstream for the terminal-start files and re-attach `pty-spawn` at `spawn-cwd.ts` and
      `spawn-operation.ts` (`runPtySpawn`, after the lock and `adapter.facts()`).
- [ ] Agent launch and chat scope: take upstream, keep the typed scope field for now, re-point
      moved imports.
- [ ] i18n: take upstream's catalogues, then `pnpm sync:localization-catalog` and
      `pnpm sync:localization-runtime-catalog`.
- [ ] Trivial conflicts, then `pnpm install`, `pnpm tc`, the check, fork tests and fork e2e.

## Phase C: after the merge

- [ ] E4: move the frozen session scope out of upstream's record types (fork store for chats,
      saved agent environment for terminals) with a one-time migration; one hook per provider at
      upstream's launch builders.
- [ ] E4: check upstream's new launch paths refuse or carry every root (folder composer first).
- [ ] E6: fork-owned Git channels; E8: the sidebar as one slot; E5: the window-close draft flow
      behind one call.
- [ ] E7: the 30-second read limit once in `createLinearClient`.
- [ ] Docs, manifest count, `pnpm build:ether`, packaged specs.

## Log
