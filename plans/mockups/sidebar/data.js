// Sample data modelled on the real sidebar screenshot. Times are minutes ago.
const ROOT = {
  orca: { label: 'orca', path: '~/dev/vendor/orca', branch: 'ether' },
  gw: { label: 'clio-llm-gateway', path: '~/dev/clio/clio-llm-gateway', branch: 'main' },
  litellm: { label: 'litellm', path: '~/dev/oss/litellm', branch: 'main' },
  manage: { label: 'manage', path: '~/dev/clio/manage', branch: 'master' },
  themis: { label: 'themis', path: '~/dev/clio/themis', branch: 'main' },
  ui: { label: 'clio-ui', path: '~/dev/clio/clio-ui', branch: 'main' }
}

const H = 60
const DAY = 24 * H

window.SEED = {
  projects: [
    { id: 'orca', name: 'Orca', roots: [ROOT.orca] },
    { id: 'gw', name: 'LLM Gateway', roots: [ROOT.gw] },
    { id: 'gwl', name: 'LLM Gateway / LiteLLM', roots: [ROOT.gw, ROOT.litellm] },
    { id: 'ops', name: 'Gateway Ops', roots: [ROOT.gw] },
    { id: 'manage', name: 'Clio Manage', roots: [ROOT.manage, ROOT.themis, ROOT.ui] }
  ],
  workspaces: [
    {
      id: 'w-sidebar',
      projectId: 'orca',
      name: 'Sidebar redesign',
      type: 'plan',
      ago: 0,
      linear: ['ETH-31'],
      agents: [
        {
          who: 'Claude Chat',
          kind: 'claude',
          model: 'opus',
          state: 'working',
          ex: 'Building the Desk mockup…',
          ago: 0
        },
        {
          who: 'Codex Chat',
          kind: 'codex',
          model: 'gpt-6-astra',
          state: 'idle',
          ex: 'Upstream folder workspaces already carry isPinned…',
          ago: 50
        }
      ],
      summary:
        'Comparing three sidebar concepts in HTML mockups. Desk is the lead; open questions are marks placement and whether project order should auto-sort.'
    },
    {
      id: 'w-review',
      projectId: 'orca',
      name: 'Review #6012 command palette',
      type: 'review',
      ago: 2 * H,
      unread: true,
      linear: [],
      agents: [
        {
          who: 'Codex Chat',
          kind: 'codex',
          model: 'gpt-6-astra',
          state: 'done',
          ex: 'Review complete: 3 blocking, 5 nits',
          ago: 2 * H
        }
      ],
      summary:
        'Codex finished the review: 3 blocking issues (focus trap, Windows shortcut label, missing empty state). Not yet posted to GitHub.'
    },
    {
      id: 'w-scratch',
      projectId: 'orca',
      name: 'Why is CI flaky?',
      type: 'scratch',
      ago: 40,
      expiresIn: '23h',
      agents: [
        {
          who: 'Claude Chat',
          kind: 'claude',
          model: 'sonnet',
          state: 'done',
          ex: 'Found it: the e2e retry wrapper swallows…',
          ago: 40
        }
      ],
      summary: 'Quick look: the e2e retry wrapper swallows the first failure. No code changed yet.'
    },
    { id: 'w-orca-main', projectId: 'orca', name: 'Main', type: null, ago: 1 * DAY, agents: [] },
    {
      id: 'w-cancel',
      projectId: 'orca',
      name: 'Agent stuck after cancel',
      type: 'fix',
      ago: 9 * DAY,
      linear: ['ETH-28'],
      agents: []
    },

    {
      id: 'w-gmcp',
      projectId: 'gw',
      name: 'Google MCP',
      type: 'feature',
      ago: 2,
      linear: ['AI-412', 'AI-415'],
      overrides: { 'clio-llm-gateway': { branch: 'feat/google-mcp', dirty: true } },
      agents: [
        {
          who: 'Claude Chat',
          kind: 'claude',
          model: 'opus',
          state: 'waiting',
          ex: 'Allow Write to src/tools/google/drive.ts?',
          ago: 2
        }
      ],
      summary:
        'Drive and Gmail tools done; Calendar in progress. Claude is waiting on approval to write drive.ts.'
    },
    {
      id: 'w-gw-main',
      projectId: 'gw',
      name: 'Main',
      type: null,
      ago: 3 * DAY,
      agents: [
        {
          who: 'Claude Chat',
          kind: 'claude',
          model: 'opus',
          state: 'idle',
          ex: 'I recommend keeping a single `google` connector…',
          ago: 5 * DAY
        },
        {
          who: 'Codex Chat',
          kind: 'codex',
          model: 'gpt-6-astra',
          state: 'idle',
          ex: 'All **23 new tools and both expand…',
          ago: 3 * DAY
        }
      ]
    },
    {
      id: 'w-oauth',
      projectId: 'gw',
      name: 'OAuth refresh refactor',
      type: 'feature',
      ago: 8 * DAY,
      agents: []
    },
    {
      id: 'w-slack',
      projectId: 'gw',
      name: 'Slack connector spike',
      type: 'plan',
      ago: 12 * DAY,
      agents: []
    },

    {
      id: 'w-gwl-main',
      projectId: 'gwl',
      name: 'Main',
      type: null,
      ago: 2,
      unread: true,
      agents: [
        {
          who: 'Claude Chat',
          kind: 'claude',
          model: 'opus',
          state: 'done',
          ex: 'The feature matrix is complete: every new r…',
          ago: 2
        }
      ],
      summary:
        'Feature matrix finished across both repos. Next step from the chat: open PRs in clio-llm-gateway and litellm.'
    },
    {
      id: 'w-upgrade',
      projectId: 'gwl',
      name: 'Upgrade LiteLLM 1.80',
      type: 'chore',
      ago: 1 * DAY,
      overrides: { litellm: { branch: 'chore/upgrade-1.80', dirty: true } },
      agents: []
    },

    {
      id: 'w-ops-main',
      projectId: 'ops',
      name: 'Main',
      type: null,
      ago: 6 * H,
      host: 'devbox-2',
      agents: [
        {
          who: 'Codex Chat',
          kind: 'codex',
          model: 'gpt-6-astra',
          state: 'unverifiable',
          ex: 'Lost contact with devbox-2 · status unverifiable',
          ago: 6 * H
        }
      ]
    },

    {
      id: 'w-trust',
      projectId: 'manage',
      name: 'Trust accounting review',
      type: 'review',
      ago: 4 * H,
      linear: ['MAN-2210'],
      agents: []
    },
    {
      id: 'w-manage-main',
      projectId: 'manage',
      name: 'Main',
      type: null,
      ago: 3 * 7 * DAY,
      agents: []
    }
  ],
  marks: ['w-sidebar', 'w-gwl-main', 'w-gmcp', null, null, null, null, null, null],
  inbox: [
    { id: 'i1', title: 'Gateway returns no rate-limit headers on 429', from: 'w-gmcp', ago: 20 },
    { id: 'i2', title: 'Idea: compact rail for laptop screens', from: 'w-sidebar', ago: 60 },
    {
      id: 'i3',
      title: 'Reply to Sam about the LiteLLM upgrade window',
      source: 'Slack',
      ago: 3 * H
    }
  ],
  mru: ['w-sidebar', 'w-gmcp', 'w-gwl-main', 'w-review', 'w-trust', 'w-gw-main']
}
