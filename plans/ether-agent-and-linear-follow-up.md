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

### 2. OpenCode editor-rendered chat — queued

- [ ] Inspect and reuse Orca's existing OpenCode/provider integration.
- [ ] Support the normal Workspace launch path with every root in scope and
      independent conversations per Workspace.
- [ ] Preserve normal provider authentication and approvals. Never commit or
      copy credentials into fixtures; use an existing supported sign-in when possible.
- [ ] Verify rendered input/replies and reopening a saved conversation. If live
      authentication is unavailable, distinguish scripted coverage from unverified
      live use instead of claiming full acceptance.
- [ ] Rebuild Ether and commit any required changes separately.

### 3. Linear issues connected to Workspaces — queued

- [ ] Inventory existing Linear issue, task-list, and workspace linking behavior.
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
