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

### 2. OpenCode editor-rendered chat — implemented, live verified

- [x] Inspect and reuse Orca's existing OpenCode/provider integration.
- [x] Support the normal Workspace launch path with every root in scope and
      independent conversations per Workspace.
- [x] Preserve normal provider authentication and approvals. Never commit or
      copy credentials into fixtures; use an existing supported sign-in when possible.
- [x] Verify rendered input/replies and reopening a saved conversation. If live
      authentication is unavailable, distinguish scripted coverage from unverified
      live use instead of claiming full acceptance.
- [x] Rebuild Ether and commit any required changes separately.
- [ ] Resolve the installed Homebrew CLI's upstream prompt-crash bug before
      normal OpenCode use. Updating that separate installation awaits user approval.

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

The machine's Homebrew build of the same version crashes before any model
request, matching [upstream issue 48803](https://github.com/anomalyco/opencode/issues/48803).
It remains untouched pending approval to update the separate CLI installation.
Do not interpret native-chat test success with the official binary as success
with that broken Homebrew binary.

Text, tools, approvals, grouped questions, model selection, cancellation, and
saved-session reopening use the existing structured-chat host. Attachments,
slash commands, effort/Fast toggles, imported terminal conversations, and remote
OpenCode chat are not part of this slice. Provider configuration is never edited.

### 3. Linear issues connected to Workspaces — queued

- [x] Inventory existing Linear issue, task-list, and workspace linking behavior.
- [ ] Define one clear local relationship: a Workspace can link multiple Linear
      issues; linking does not create a worktree or implicitly change issue status.
- [ ] Reuse the existing issue picker, credentials, task types, and persistence
      wherever they fit; do not create a competing task system.
- [ ] Make links visible and useful from both the Workspace and the relevant task
      list, with issue identifier/title/status and a way to open the issue in Linear.
- [ ] Provide explicit attach/detach actions; retain separate Workspace tabs,
      drafts, and agent conversations regardless of linked issues or shared roots.
- [ ] Test multiple links, switching Workspaces, restart persistence, and failure
      states without modifying real Linear issues during automated tests.
- [ ] Rebuild Ether, update usage notes, and commit the completed integration.

## Optional, ordered by likely value

1. Improve failed-chat messages so the actual actionable cause is visible.
2. Explicitly add linked-issue context to an agent prompt, with user review.
3. Explicit Linear status/comment updates from Ether, only after local linking is
   useful and the user can clearly see what will be sent.
4. Automatic issue/workspace creation, bidirectional synchronization, and broader
   remote or cross-platform workflow expansion.

## Verification and delivery record

- Codex fix and acceptance tests committed as `4248962716`.

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
