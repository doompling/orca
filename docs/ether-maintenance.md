# Ether: build, recovery, and maintenance

This is the local Apple Silicon handoff, not an upstream Orca release guide.
The [active plan](../plans/local-multi-root-workspaces.md) records which user
journeys actually passed and any remaining limitations.

## App and data boundaries

- App: `Ether.app`, bundle ID `com.joelkorpela.ether`.
- Default data: `~/Library/Application Support/Ether`.
- Build output: one release per build in `dist/ether-releases/<date>-<commit>/Ether.app`,
  logged in `dist/ether-releases/README.md`. Builds before 2026-10-23 lived in `dist/ether/`.
- Updates are manual. Ether does not install an upstream Orca update.
- The existing `.orca-local-profile` and upstream Orca data are not imported,
  renamed, or deleted. Ether's different app/keychain identity means copying
  encrypted account settings is not a supported sign-in migration.

Keep Projects pointed at their existing directories. The app-data folder holds
organization, saved views, and session records; it does **not** contain a backup
of the code in those directories. Back up source files separately.

Launch a release from Finder. Releases are never overwritten, so rolling back means quitting
Ether and opening an older release folder. The build does not install or launch the app, or
replace the global `orca-dev` command.

On first launch, Ether does not inherit development preferences. For normal agent
approvals, uncheck **Yolo / Dangerously skip permissions** on the agent-selection
step and click **Continue** before skipping optional setup. **Skip to project
setup** alone does not save that checkbox change. If you already skipped, choose
**Manual** under Settings → Agents before starting an agent. Review your telemetry
choice under Settings → Privacy & Telemetry; this fork retains the upstream
defaults rather than changing those policies. Local Projects do not require an
Orca account, and optional integration prompts can be closed.

The development route remains separate:

```sh
ORCA_DEV_USER_DATA_PATH="$PWD/.orca-local-profile" ORCA_E2E_ENFORCE_SINGLE_INSTANCE_LOCK=1 pnpm dev
```

Keep the same explicit profile between development launches. Do not point two
running builds at the same profile or use the packaged Ether profile as a casual
development test directory.

## Rebuild and verify

### One-time local signing setup

Normal Ether builds require a persistent code-signing certificate. In Keychain
Access, choose **Certificate Assistant → Create a Certificate**, name it
**Ether Local Code Signing**, choose **Self Signed Root** and **Code Signing**,
and save it in the login keychain. Keep this certificate and its private key
between builds; do not generate a replacement for each update. A local
self-signed certificate provides identity continuity, not public distribution
or notarization. See [Apple's certificate setup guide](https://support.apple.com/guide/keychain-access/create-self-signed-certificates-kyca8916/mac).

Check availability with `security find-identity -v -p codesigning`. If macOS
does not consider the new certificate valid, inspect its expiry and **Trust**
settings in Keychain Access. For this local certificate, trust **Code Signing**
only; do not change SSL, email, or other trust policies. Enter passwords only
into macOS dialogs, never into build commands or chat. On the first signing
operation, macOS may ask permission for `/usr/bin/codesign` to use this private
key; future builds need that same access.

The build defaults to the exact certificate name above. To use another
uniquely named certificate, set `ETHER_SIGN_IDENTITY` to its exact name or SHA-1
fingerprint. The runner resolves it to one valid identity before any build
work, uses its fingerprint for the app and native helpers, and verifies the
finished app's certificate and designated requirement. Missing, ambiguous,
expired, or ad-hoc identities stop the build; there is no unsigned fallback.
Private keys and certificate passwords must not be committed to this repository.

### Build commands

From this checkout on the supported Apple Silicon Mac:

```sh
pnpm install
pnpm tc
pnpm run check:code-quality:changed
pnpm build:ether
```

`build:ether` reuses Orca's build and package checks, packages only the current
arm64 Mac, signs with the persistent local certificate, and disables publishing. It is not a notarized
release for other machines. Building another architecture requires the upstream
[release dependency policy](reference/pnpm-install-policy.md), not just changing
the output filename.

### Releases

Each build is packaged in the scratch folder `dist/ether-build`, verified, and moved to its own
`dist/ether-releases/<local date>-<commit>/Ether.app` (with `-2`, `-3`… for a rebuild on the same
day). A row is added to `dist/ether-releases/README.md`. No existing bundle is replaced, so it is
safe to build while Ether runs; the terminal daemon keeps running from its own bundle path.

Every release opens the same profile, `~/Library/Application Support/Ether`, and the
single-instance lock lets only one of them own it: opening a second release on that profile just
focuses the running one. To switch, quit Ether and open the other release.

To try a release next to the one you use, give it a separate absolute profile path. It starts with
no Projects and its own terminal daemon:

```sh
open -n --env ORCA_DEV_USER_DATA_PATH="$HOME/Library/Application Support/Ether-try" \
  dist/ether-releases/<release>/Ether.app
```

To try it with your Projects, copy only the saved state into that profile before launching
(`mkdir -p "$HOME/Library/Application Support/Ether-try/profiles/local-default"`, then copy
`profiles/local-default/orca-data.json`). Don't copy the whole profile folder: it holds the running
app's single-instance lock and daemon socket. Marks set in the trial profile stay there.

When changing from the old ad-hoc build to certificate signing, macOS may ask
once for access to **Ether Safe Storage**. Approve the expected Ether app with
**Always Allow** if desired. Keep the existing Keychain item and Ether profile;
do not delete credentials or weaken access to all applications. Verify two
different builds signed by the same certificate and repeated launches after
that approval. Matching signature requirements are necessary, but do not alone
prove that macOS retained Keychain approval. Repeated prompts for an unchanged
build after **Always Allow** require separate Keychain-permission investigation.

Quit the app before replacing its bundle. Keep its data and source directories
intact. Test the replacement with a disposable profile before pointing it at
valuable saved work. A successful TypeScript build does not prove that the app
renders or that its packaged native modules work.

The actual production bundle passed this hidden smoke check: start with an empty
profile, save Manual agent permissions through onboarding, create a two-root
Project, save a file, write through a terminal in the second root, and restore an
unsaved draft and those permission settings after a normal Quit/reopen:

```sh
ETHER_E2E_APP="$PWD/dist/ether-releases/<release>/Ether.app" ORCA_BACKGROUND_LAUNCH=1 SKIP_BUILD=1 pnpm exec playwright test tests/e2e/ether-packaged.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1
```

The check launches that bundle from outside the checkout with a disposable HOME
and explicit test-profile override. It verifies packaged Ether identity, rendered
UI, and hidden/unfocused windows without the development-only store hook. It does
not use or migrate the normal `~/Library/Application Support/Ether` profile;
that remains the default for an ordinary launch without a profile override.
An explicitly configured missing bundle fails the check rather than skipping it.

The bounded cold-runtime check uses the existing E2E harness:

```sh
ORCA_BACKGROUND_LAUNCH=1 pnpm exec electron-vite build --mode e2e
ORCA_BACKGROUND_LAUNCH=1 SKIP_BUILD=1 pnpm exec playwright test tests/e2e/local-multi-root-cold-restart.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1
```

Prepare the Electron native runtime using `pnpm run ensure:electron-runtime`
before those app checks if Node-based tests have changed the installed native
ABI. Do not run Node-native tests and Electron checks concurrently against this
checkout. The E2E build is distinct from `build:ether`; `SKIP_BUILD=1` is safe only
after the appropriate fresh build. Keep all agent-run windows hidden and inspect
CDP screenshots; native-focus tests belong on an isolated display.

## What recovery means

Normal Quit checkpoints saved contexts and drafts. Terminal processes may remain
in Orca's reused daemon and reattach on the next launch. This is different from a
reboot, stopped daemon, or loss of the original provider process.

After cold runtime loss, persisted tabs/drafts/history can return, but the old
processes are gone. A usable replacement shell or a resumed provider conversation
is a **new process**, not evidence that the old work kept running. Agent recovery
also depends on its provider history, authentication, directories, and supported
resume path. An unavailable session must remain identifiable rather than being
silently reassigned to another Workspace or presented as still running.

The cold E2E spec captures fixture-owned PIDs and start identities, closes the
app normally, stops only those recorded processes, and verifies their absence
before relaunch. Its native-chat child is scripted: it checks persisted history,
frozen roots, and process replacement without real authentication or model calls.
It does not replace the separately recorded signed-in read/edit acceptance.

Cursor/view caches retain Orca's existing limits. No new durable cursor-position
or uninterrupted-process-after-reboot guarantee is added.

## Back up and restore

Treat a profile backup as sensitive: it can contain drafts, conversations,
terminal output, browser state, and account-related data. Store it privately;
do not attach it wholesale to a bug report or commit it to Git.

For a coherent manual backup:

1. Finish or explicitly stop running jobs/agents, then Quit Ether normally so
   pending drafts and session state are flushed.
2. Ensure Ether's background processes are also stopped. Closing its window
   alone is not enough. The simple cold boundary is a Mac restart followed by
   copying before Ether is reopened, with automatic app reopening disabled.
   Skip that restart only when the profile's own runtime processes are verified
   stopped; never kill every Electron or Node process on the machine.
3. Copy the **whole** `~/Library/Application Support/Ether` folder to a new,
   dated backup location. Retain the original. Include SQLite databases and any
   accompanying WAL files; do not assemble a live backup from selected files.
4. Back up the referenced source directories separately. A profile restore does
   not restore Git working files, uncommitted disk changes, or missing worktrees.

For a restore, first reach the same fully stopped boundary. Rename the current
`Ether` data folder to a dated `Ether.before-restore-...` folder, then copy the
chosen complete backup into `~/Library/Application Support/Ether`. Do not merge
it into the current folder or delete the current data. Launch one Ether instance
and verify the last Workspace, an inactive Workspace's draft, directory paths,
and session availability before continuing work. Keep the pre-restore copy
until satisfied. On another Mac or a different app identity, expect to sign in
again; a profile backup is not a copy of the system keychain or all provider data.

Existing automatic recovery is narrower than that full backup:

- `profiles/local-default/orca-data.json` contains the local Projects and saved
  workspace state, including unsaved file drafts. Its `.bak.0` through `.bak.4`
  rotate on writes at most once per hour; the loader tries backups when primary
  state cannot be loaded. They are older snapshots, not continuous versioning.
- `agent-sessions/agent-sessions.json.bak` is the previous committed native-agent
  record store. Its existing recovery preserves process-ownership checks.
- `agent-session-journal/` contains separate native-chat SQLite journals;
  `terminal-history/` contains terminal recovery data. Browser/profile metadata
  and other state also live elsewhere under the app-data folder.

Do not restore one JSON backup and assume it also rolled back journals, browser
state, or source files. Preserve the full current folder before investigating an
individual damaged file. There is no new backup service or automatic source
backup in this fork.

## Debugging and safe rollback

Record the build/commit, exact launch command, selected Project/Workspace, root
paths, and a short reproduction. Inspect `<profile>/logs/main.trace.ndjson` and
`<profile>/logs/daemon.log`; redact private paths, conversation content, and
credentials before sharing excerpts. For the development profile, the matching
status command is:

```sh
ORCA_DEV_USER_DATA_PATH="$PWD/.orca-local-profile" node config/scripts/orca-dev.mjs status --json
```

An unresponsive or missing session is not permission to kill an unrelated app,
delete a profile, reset a checkout, or relaunch the agent in a different root.
Inspect ownership and retain the logs/data first.

The pre-packaging local-first-use implementation was preserved locally at
`refs/ether/checkpoints/local-first-use-20260925` (`da41a0ef35`). This local-only
checkpoint is not included in a normal branch push. Inspect it in this checkout
without changing current work:

```sh
git show --stat refs/ether/checkpoints/local-first-use-20260925
git diff refs/ether/checkpoints/local-first-use-20260925 -- src/shared/local-projects src/main/local-projects src/renderer/src/features/local-projects
```

For a separate source recovery copy, choose an unused sibling path and run:

```sh
git worktree add --detach ../ether-recovery-20260925 refs/ether/checkpoints/local-first-use-20260925
```

Do not reset or clean the current checkout. That checkpoint predates standalone
packaging; it is not a promise that older code can safely write a newer profile.
Test it only with a separate copied profile, never the active data.

## Fork touchpoints

The concentrated feature modules are `src/shared/local-projects/`,
`src/main/local-projects/`, and `src/renderer/src/features/local-projects/`.
Narrow integrations connect startup/sidebar/navigation, physical file targeting
and independent editor models, existing workspace persistence, PTY launches,
agent-session root snapshots, and per-root Git. Do not replace those existing
session/runtime owners with parallel stores when merging upstream changes.

Packaging lives in `config/electron-builder.ether.config.cjs`,
`config/scripts/build-ether-local.mjs`, and the Ether product identity. Review
upstream changes at these boundaries and rerun the local user journeys. Pulling
in a whole-editor redesign, remote support, or more providers remains separate
work, not a prerequisite for maintaining this local app.
