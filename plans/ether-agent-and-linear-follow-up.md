# Ether: agent chat and Linear follow-up

Approved 2026-09-26. Work in this order; commit each completed feature separately.
This extends the [local multi-root plan](local-multi-root-workspaces.md), not a
restart or a whole-editor redesign. Keep the existing app profile and saved work.

## Must-haves, in order

### 1. Codex editor-rendered chat — complete

- [x] Correct the multi-root scope check: Codex grants its working directory
      implicitly under `workspaceWrite`; `writableRoots` lists additional directories.
- [x] Keep Manual permissions, unrelated sandbox settings, and refusal when an
      additional Project directory is genuinely missing.
- [x] Add regression tests against realistic responses and the installed Codex
      binary, using disposable homes and no model calls for the protocol contract.
- [x] Verify a fresh chat in the running app, rebuild Ether, and commit the fix.

Diagnosis: the installed Codex 0.156.1 accepted both directories, but Ether
mistook the implicit working-directory grant for missing permission. Both dotted
and nested config overrides produced the correct scope. The existing override
format does not need changing. The generic connection message obscured this
failure; an old failed tab may replay its failed launch, so verify a new tab.

### 2. OpenCode editor-rendered chat — complete

- [x] Inspect and reuse Orca's existing OpenCode/provider integration.
- [x] Support the normal Workspace launch path with every root in scope and
      independent conversations per Workspace.
- [x] Preserve normal provider authentication and approvals. Never commit or
      copy credentials into fixtures; use an existing supported sign-in when possible.
- [x] Verify rendered input/replies and reopening a saved conversation. If live
      authentication is unavailable, distinguish scripted coverage from unverified
      live use instead of claiming full acceptance.
- [x] Rebuild Ether and commit any required changes separately.
- [x] Resolve the installed Homebrew CLI's upstream prompt-crash bug before
      normal OpenCode use. Approved upgrade to `1.18.30_2` passed live acceptance.

Implementation boundary: a local OpenCode adapter uses the existing structured
chat, session journal, status, and ownership machinery. Its privately owned
loopback server provides messages, tools, approvals, model discovery, and saved
session IDs. Existing terminal support stays intact; terminal handoff, imported
history, rewind, and remote OpenCode chat are outside this first slice.
The official OpenCode 1.18.30 binary passed the packaged live test using
`opencode/ling-3.0-flash-fin-free`: one read-only response found random markers
in both roots, rendered in chat, and remained after normal Quit/reopen (15.1s).
No credentials were copied; the free provider worked without a stored sign-in.
The temporary binary was verified against the official release SHA-256 and
selected only in the disposable test profile's existing per-agent PATH setting.

The machine's previous Homebrew build (`1.18.30_1`) crashed before any model
request, matching [upstream issue 48803](https://github.com/anomalyco/opencode/issues/48803).
After approval, Homebrew upgraded only OpenCode to `1.18.30_2`. Its
[formula](https://raw.githubusercontent.com/Homebrew/homebrew-core/HEAD/Formula/o/opencode.rb)
disables the build splitting responsible for server failures. The installed CLI
now passes the same packaged native-chat test without a temporary binary or
per-agent PATH override. `opencode --version` still reports `1.18.30`; the `_2`
is Homebrew's packaging revision. The previous revision is retained for rollback.

Text, tools, approvals, grouped questions, model selection, cancellation, and
saved-session reopening use the existing structured-chat host. Attachments,
slash commands, effort/Fast toggles, imported terminal conversations, and remote
OpenCode chat are not part of this slice. Provider configuration is never edited.

### 3. Linear issues connected to Workspaces — linking implemented; entry-point follow-up below

- [x] Inventory existing Linear issue, task-list, and workspace linking behavior.
- [x] Define one clear local relationship: a Workspace can link multiple Linear
      issues; linking does not create a worktree or implicitly change issue status.
- [x] Reuse the existing issue search, credentials, task types, and persistence
      wherever they fit; do not create a competing task system.
- [x] Make links visible and useful from both the Workspace and the relevant task
      list, with issue identifier/title/status and a way to open the issue in Linear.
- [x] Provide explicit attach/detach actions; retain separate Workspace tabs,
      drafts, and agent conversations regardless of linked issues or shared roots.
- [x] Test multiple links, switching Workspaces, restart persistence, and failure
      states without modifying real Linear issues during automated tests.
- [x] Rebuild Ether, update usage notes, and commit the completed integration.

Relationship: links belong to the Workspace UUID, not its branch or directories.
One issue can be linked to several Workspaces, including Workspaces sharing the
same checkout. Ordinary new Workspaces start with no links; creating one from an
issue verifies and saves its initial link with the Workspace. Archive retains saved links
but excludes the Workspace from active task matches. Unlinking is local metadata
and works offline. Attach verifies the issue using its exact saved local Linear
account; saved snapshots are explicitly historical, not live status promises.
Existing encrypted Linear connections are reused from Orca's credential registry;
they are not copied into the Ether profile or migrated as part of this work.

### Using the Linear integration

1. Connect Linear in Settings → Integrations if it is not already connected.
2. Click a ticket row under a Workspace, or **Link Linear issue** if it has no
   tickets. **Linear issues** in the directory panel opens the same manager.
   Choose an account and search by title (at least two characters), or paste an
   issue identifier/Linear URL. No results load until a query is entered. Select
   more issues without closing the picker. **Unlink** removes only that
   Workspace's link.
3. In Tasks → Linear, **Has Workspace** includes these links. **Workspaces (N)**
   offers named Project / Workspace choices; **Attach Workspace** links another
   existing Workspace without switching to it or launching an agent.
4. **New Workspace for issue** in that chooser opens the normal local form with
   the issue and suggested name preserved. The issue is verified before creation.
5. **Open issue** in the Workspace panel opens Ether's existing issue details;
   **Refresh** updates the saved snapshot. Snapshots remain available offline.
   Jump search finds Workspaces by any linked issue's identifier, title, or URL.

This extends Orca's existing Linear Tasks experience rather than adding another
task system. Legacy single-task/worktree links and remote workflows remain
available. The new many-to-many relationship is local-only. Linking is not a
status transition, branch selection, or automatic agent instruction.

### First-class Linear entry points — current follow-up

The 2026-09-26 usage audit found that working issue links did not make the full
integration discoverable. A fresh packaged profile had Linear enabled in its
preferences, but Tasks hid it until connected. Settings also called an otherwise
usable connection incomplete without the optional agent skill. The earlier
linking test connected through fixture setup and missed this first-use journey.

The user requested first-class defaults and quit Ether for an update:

- [x] Show Linear in Tasks and its sidebar shortcuts before connecting. Reuse the
      existing in-page connection prompt; preserve an explicit choice to hide it.
- [x] Treat connection and visibility as sufficient for browsing/linking. Keep
      the agent skill optional, with no automatic install or permission changes.
- [x] Verify the real packaged first-use journey through UI controls, including
      cancellation, connection, issue browsing and reopening. Use an isolated
      scripted account; never the user's active profile or real API key.
- [x] Rebuild Ether and inspect the final hidden renderer.
- [x] User connected their real account and confirmed the Issues page works.
      Workspace linking and Projects/Views need the follow-up below; this is not
      full real-account acceptance.

The actual settings navigation label is **Task Sources**. Credentials are also
available at **Settings → Integrations → Linear**.

Verification: 113 focused tests in 11 suites, full source typecheck, changed-code
quality gate, production build, and deep bundle signature check passed. The
packaged first-use test passed in 6.4 seconds: Linear appeared before connection,
Cancel preserved its entry point, a UI-entered scripted key enabled issue browsing
without a skill, explicit hide/show worked, and normal Quit/reopen retained the
connection. The first restart attempt met the inherited one-time CLI tip; the
test now closes that tip normally without installing anything. Inspected the
disconnected, optional-skill, and reopened issue-list screenshots under
`test-results/ether-linear-defaults-final/`. The existing packaged file/terminal/
draft-reopen smoke also passed (7.2 seconds). No real Linear account was used.
Previous bundle: `dist/ether-backups/before-linear-defaults-ntRoJhjR/Ether.app`.

Integration gaps identified for the next bounded batch:

1. **Preserve ticket intent when creating a Workspace.** Existing issue/pasted-URL
   actions pass ticket and suggested-name data, but the replacement local
   Workspace form ignores it. Fix the existing action rather than adding an
   automation system.
2. **Open a linked ticket inside Ether.** The Workspace panel currently only
   offers the external Linear link and Unlink, despite the existing in-app viewer.
3. **Find linked Workspaces by ticket in jump search.** Current matching still
   reads the old single-ticket fields rather than the canonical multi-ticket links.
4. **Refresh saved ticket details explicitly.** The Workspace panel labels its
   status as a saved snapshot; Refresh access refreshes accounts, not that snapshot.

### Real-account follow-up — 2026-09-27

The user found an empty Workspace picker and Projects/Views stuck on skeleton
loaders. Real-account use takes precedence over earlier scripted completion.
Keep this batch focused on browsing issues and creating, linking, finding, and
reopening local Workspaces; no automatic Linear mutations or agent prompts.

Must-haves, in order:

- [x] Resolve title searches and identifiers/Linear URLs in the selected account.
      The initial recent-issues list is superseded by search-only results below.
- [x] Keep multiple links in one Workspace independent from links in another;
      preserve tabs, drafts, and saved links through normal restart.
- [x] Open a linked issue in Ether's existing issue details and explicitly refresh
      its saved metadata. Unlink remains local and works offline.
- [x] Surface concrete-account search failures rather than silently returning
      an empty result. Keep healthy results in all-account searches.
- [x] Preserve issue/name intent when creating a Workspace. Verify the issue
      before the single persistence commit, so a failed request creates nothing.
- [x] Index every saved issue link in Workspace jump search, including exact
      organization-scoped issue URLs.
- [x] Keep **New Workspace for issue** available alongside attaching an existing
      Workspace in Tasks, board, and issue details; verify the full rendered flow.
- [x] Bound stalled Linear reads and queue waits, show a retryable error, and
      verify retry recovery without resending any provider mutation.
- [x] Rebuild Ether, verify packaged startup and Linear workflows, and inspect
      hidden screenshots in both themes.
- [x] Retest Projects/Views with the user's account. The user confirmed that
      attaching a real Linear issue works and Projects/Views now appear to work.
      This confirms the browsing paths, not the exact cause of the earlier stalls.

Keychain boundary: an attempted hidden real-account diagnostic could not access
Ether's encryption key under its isolated HOME and prompted the user. It was
stopped, its credential-reading test removed, and no further Keychain retry is
authorized by this batch. The original encrypted API key was not changed. All
remaining automated UI checks use a mock keychain, dummy key, disposable profile,
and scripted GraphQL transport that refuses provider mutations.

Verification so far: 245 focused tests in 35 suites passed, including the real SDK
with abort-aware scripted transport. Node/web/CLI typecheck and changed-code
quality passed. The final rendered Workspace linking/reopen test passed (11.6s),
including recent results, URL lookup, two independent Workspaces, in-app details,
refresh, and light/dark screenshots. The new entry test passed (8.0s): URL preview
and cancellation preserved ticket/name intent, Tasks created exactly one linked
Workspace, a second issue was added, and identifier/title/URL searches reopened
that same Workspace. Screenshots were inspected for readable, unclipped controls.

The old package's complete onboarding plus nonempty Projects/Views also passed
with one-second scripted latency (14.7s), so response latency alone did not
reproduce the user's indefinite skeletons. New reads have an actual transport
and queue deadline of 30 seconds; mutation clients and automatic retry policy
are unchanged. Projects/Views failures display **Unable to load…**, not a false
empty-collection result. These are scripted acceptance, not live account proof.
Previous app retained at `dist/ether-backups/before-linear-workflows-fMj1Kl/Ether.app`.

Delivery: the production Ether build and deep bundle signature verification
passed. The packaged onboarding test passed with `ETHER_LINEAR_STALL_CHECK=1`
(45.1s): a deliberately stalled Projects request left its skeleton after the real
30-second deadline, displayed an error, and **Refresh Linear** loaded the project;
Views loaded both issue/project view rows, Issues still worked, and normal
Quit/reopen preserved the dummy connection. The initial run stopped on a test
label mismatch (`Unable to load projects` versus the actual `Unable to load Linear
projects`); the corrected assertion and full rerun passed. Inspected recovered
Projects/Views screenshots under `test-results/ether-linear-packaged-retry-final/`.
The independent production file/terminal/draft restart smoke passed (6.1s).
Updated app: `dist/ether/mac-arm64/Ether.app`. No real Linear writes, credential
changes, commits, or pushes were made in this follow-up.

User acceptance: a real issue was attached successfully and Projects/Views now
appear to work. Next improvement requested: make linked tickets visible and
accessible directly from each Workspace in the sidebar.

### Sidebar issue visibility — 2026-09-27

- [x] Show a compact saved issue identifier/title under each linked Workspace,
      with an accurate count for additional links and a full-title tooltip.
- [x] Open the existing issue manager directly from that summary; offer a visible
      **Link Linear issue** action for active, unlinked Workspaces.
- [x] Keep summary reads offline/local, preserve Workspace selection and sessions,
      and handle archived Workspaces without advertising an unavailable action.
- [x] Verify one/multiple links, unlink updates, keyboard access, narrow sidebar,
      and light/dark rendering, then deliver the rebuilt app after Ether is quit.

Initial delivery at `dist/ether/mac-arm64/Ether.app`. The first linked issue's identifier
and truncated title are visible below the Workspace; `+N` counts further issues.
Hover reveals the full title and one click opens the existing manager without
activating that Workspace. No additional Linear polling or persistence was added.

Verification: 21 focused tests passed, including seven new sidebar DOM tests.
The rendered linking/restart test passed at a 220px sidebar width with Enter,
Space, Escape, independent selection, and light/dark screenshots inspected. The
existing Tasks/URL/jump entry test also passed. The actual production app passed
dummy-account onboarding, Projects/Views, two sidebar issue links, direct manager
access, and restart persistence (36.0s); the file/terminal/draft restart smoke
passed (6.1s). Full typecheck, changed-code quality, and deep signature verification
passed. All test windows remained hidden with disposable profiles and mock
Keychain; no personal credentials were accessed. Previous app preserved at
`dist/ether-backups/before-linear-sidebar-Ztzpum/Ether.app`.

### Search-only picker and individual ticket rows — 2026-09-27

User feedback supersedes the recent-issues list and compact `+N` summary above.

- [x] Keep search results empty until a query is entered (at least two characters,
      an identifier, or a Linear URL); clearing search hides results and late
      responses cannot repopulate them. Do not fetch recent issues.
- [x] Render a separate sidebar row for every linked ticket, with its identifier,
      truncated title, full-title tooltip, and direct access to the issue manager.
      No collapsed `+N` count; no change to saved links or Workspace sessions.
- [x] Verify adding multiple tickets without reopening the picker, opening the
      second row with keyboard/pointer, unlink updates, and restart persistence;
      rebuild the app after the user's quit confirmation.

Delivered at `dist/ether/mac-arm64/Ether.app`. Verification: 54 tests across six
focused suites passed; full build/typecheck and changed-code quality passed.
The hidden rendered entry and linking/restart workflows passed (21.1s combined),
including cleared search, two independent rows, keyboard access to the second
row, and unchanged Workspace state. Narrow-sidebar light/dark screenshots were
inspected. The rebuilt production app passed empty-search/two-row linking and
restart acceptance with one-second scripted API latency (36.3s), plus the
file/terminal/draft restart smoke (6.1s). Deep bundle signature verification
passed. No real Linear writes, credential changes, or visible test windows.
Previous build: `dist/ether-backups/before-linear-rows-RL14q9/Ether.app`.

## Optional, ordered by likely value

1. Improve failed-chat messages so the actual actionable cause is visible.
2. Explicitly add linked-issue context to an agent prompt, with user review.
3. Workspace-panel status/comment actions, if useful beyond the existing Linear
   issue editor. Keep all provider writes explicit and reviewable.
4. Automatic issue/workspace creation, bidirectional synchronization, and broader
   remote or cross-platform workflow expansion.

## Verification and delivery record

- Codex fix and acceptance tests committed as `4248962716`.
- OpenCode editor chat committed as `7908178403`.
- Linear Workspace linking and Tasks integration committed as `4a947be8f7`.

- Initial Codex diagnosis: isolated app-server handshake/config/read/thread/start
  reproduced the response shape; no model turn, user credentials, or personal
  project files were involved. The disposable child closed normally.
- Existing focused Codex tests: 27 passed, demonstrating the missing real-binary
  case rather than establishing working native-chat support.
- Fixed contract: 33 focused tests and both opt-in Codex 0.156.1 binary cases
  passed. The actual binary used isolated homes, a closed-loopback test provider,
  and no model turns. Full typecheck, changed-code quality checks, and bundle
  signature verification passed.
- Updated packaged Ether passed the fresh-profile file/terminal/draft restoration
  smoke (9.3 seconds); the restored-renderer screenshot was inspected. The opt-in
  signed-in Codex chat smoke also passed (15.3 seconds): explicit GPT-5.6-Luna,
  Low effort, Fast off; one read-only turn found private random markers in both
  fixture roots; normal Quit/reopen restored the same chat and reply. Screenshots
  were inspected. Previous bundle retained under
  `dist/ether-backups/before-codex-XbxuonZq/Ether.app`.
- Updated app: `dist/ether/mac-arm64/Ether.app`. Open a fresh Codex chat after
  updating; a previously failed launch can retain its old failed operation.
- No current user app/profile is a test fixture. All agent-driven windows remain
  hidden and unfocused; screenshots use Playwright/CDP.
- OpenCode: 318 tests across 29 focused suites passed before the final narrow
  protocol fixes; all 19 adapter/event tests and 38 renderer launch/reload tests
  passed afterward. Full source typecheck, changed-code quality, packaged build,
  and signature verification passed. The restored live-chat screenshot was inspected.
  The broad E2E typecheck still reports unrelated existing test errors and missing
  cloud dependencies; the targeted packaged Playwright test passes.
- OpenCode integration testing caught and fixed the provisional-tab provider guard,
  optional experimental API startup probing, and the real server's append-only
  permission-update behavior. No failed prompt was automatically resent.
- Previous working Codex bundle retained at
  `dist/ether-backups/before-opencode-Sg9ngdXO/Ether.app`.
- Previous OpenCode-capable bundle retained at
  `dist/ether-backups/before-linear-5j9oSHHr/Ether.app`.
- Linear: 253 focused tests across 36 suites passed, including actual profile
  persistence, account-scoped validation, failures/rollback, independent links,
  and renderer actions. Full source typecheck and changed-code quality passed.
- Linear hidden rendered acceptance passed (12.4 seconds): two issues on Main,
  one shared with Review, Tasks filtering and explicit Workspace choice, unlink
  on Main without changing Review, unchanged editor/tab/layout snapshots, and
  normal Quit/reopen with persisted links. The real SDK/IPC/Store ran against an
  isolated scripted GraphQL service; all provider mutations were refused. This
  is not a claim of live authenticated Linear acceptance against personal issues.
- The final hidden rerun passed in 11.1 seconds; screenshots of the two-issue
  Workspace popover and two-Workspace Tasks chooser were inspected for readable,
  unclipped controls. Tests never activated a visible window.
- Final Ether production build and deep signature verification passed. The final
  packaged app passed empty-profile startup/file/terminal/draft restoration (6.0s)
  and another actual free-model OpenCode two-root conversation plus normal
  Quit/reopen (15.4s). The restored chat screenshot was inspected. This initial
  acceptance used the official test binary; normal Homebrew acceptance follows.
- After the approved Homebrew upgrade, `/opt/homebrew/bin/opencode` resolves to
  `Cellar/opencode/1.18.30_2/bin/opencode`. The same packaged Ether passed the live
  `opencode/ling-3.0-flash-fin-free` test with no binary/PATH override (14.3s): both
  fixture roots read, reply rendered, original files unchanged, and the same chat
  restored after normal Quit/reopen. No Ether rebuild or provider settings change
  was needed. Homebrew retained `1.18.30_1`; no other packages were upgraded.
