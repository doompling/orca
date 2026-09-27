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

### 3. Linear issues connected to Workspaces — complete

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
same checkout. A new Workspace starts with no links. Archive retains saved links
but excludes the Workspace from active task matches. Unlinking is local metadata
and works offline. Attach verifies the issue using its exact saved local Linear
account; saved snapshots are explicitly historical, not live status promises.
Existing encrypted Linear connections are reused from Orca's credential registry;
they are not copied into the Ether profile or migrated as part of this work.

### Using the Linear integration

1. Connect Linear in Settings → Integrations if it is not already connected.
2. Open a Workspace and select **Linear issues** in the directory panel, or from
   its sidebar menu. Choose an account, search by issue identifier/title, and
   select issues to link. **Unlink** removes only that Workspace's link.
3. In Tasks → Linear, **Has Workspace** includes these links. **Workspaces (N)**
   offers named Project / Workspace choices; **Attach Workspace** links another
   existing Workspace without switching to it or launching an agent.
4. Issue details also list linked Workspaces. Workspace snapshots remain visible
   offline; live issue details continue to use the existing Linear reader.

This extends Orca's existing Linear Tasks experience rather than adding another
task system. Legacy single-task/worktree links and remote workflows remain
available. The new many-to-many relationship is local-only. Linking is not a
status transition, branch selection, or automatic agent instruction.

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
