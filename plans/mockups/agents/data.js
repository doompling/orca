// Sample data for the agent mockups. Times are seconds unless noted.

// lucide paths (24x24, stroke)
const SHIELD =
  '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'
window.ICONS = {
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  chevU: '<path d="m18 15-6-6-6 6"/>',
  term: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  filePlus:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  shieldCheck: `${SHIELD}<path d="m9 12 2 2 4-4"/>`,
  shieldAlert: `${SHIELD}<path d="M12 8v4"/><path d="M12 16h.01"/>`,
  shieldX: `${SHIELD}<path d="m14.5 9.5-5 5"/><path d="m9.5 9.5 5 5"/>`,
  shieldQ: `${SHIELD}<path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
  shieldOff:
    '<path d="m2 2 20 20"/><path d="M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71"/><path d="M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  square: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  fork: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  inbox:
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  rewind: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  branch:
    '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  linear:
    '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  enter: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
  fileText:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  sparkle:
    '<path d="M9.94 14.06 4 20"/><path d="m15 4 1.5 3.5L20 9l-3.5 1.5L15 14l-1.5-3.5L10 9l3.5-1.5Z"/>'
}

const PROVIDER_CHILDREN = [
  { id: 'sa1', label: 'Matrix cells: Portkey', short: 'Portkey', url: 'portkey.ai/docs/pricing' },
  {
    id: 'sa2',
    label: 'Matrix cells: Bifrost',
    short: 'Bifrost',
    url: 'docs.getbifrost.ai/pricing'
  },
  {
    id: 'sa3',
    label: 'Matrix cells: TrueFoundry',
    short: 'TrueFoundry',
    url: 'truefoundry.com/pricing'
  },
  {
    id: 'sa4',
    label: 'Matrix cells: Cloudflare',
    short: 'Cloudflare',
    url: 'developers.cloudflare.com/ai-gateway/pricing'
  }
]

window.SUBAGENTS = PROVIDER_CHILDREN.map((p, i) => ({
  id: p.id,
  label: p.label,
  short: p.short,
  type: 'general-purpose',
  model: 'sonnet',
  effort: 'med',
  modelSource: i === 2 ? 'requested' : 'actual',
  prompt: `Check every ${p.short} cell in config/matrix.yml against ${p.url}. For each cell compare input/output price, context window and streaming support. Report mismatches as a table with the cell id, our value and the documented value. Do not edit files.`,
  tokens: [58100, 53600, 45700, 51800][i],
  dur: [163, 157, 151, 144][i],
  acts: [
    [
      'Read config/matrix.yml',
      `Fetched ${p.url}`,
      'Searched "portkey" in lib/',
      'Comparing 9 cells'
    ],
    [
      'Read config/matrix.yml',
      `Fetched ${p.url}`,
      'Read lib/gateway/bifrost.rb',
      'Comparing 7 cells'
    ],
    [
      'Read config/matrix.yml',
      `Fetched ${p.url}`,
      'Searched "context_window"',
      'Comparing 6 cells'
    ],
    ['Read config/matrix.yml', `Fetching ${p.url}`]
  ][i],
  result: ['2 mismatches', '1 mismatch', '6 cells checked, no mismatches', 'Fetch blocked: 403'][i],
  failed: i === 3,
  tools: [
    { id: `${p.id}-r`, kind: 'read', file: 'config/matrix.yml', range: 'L1–412' },
    {
      id: `${p.id}-w`,
      kind: 'web',
      mode: 'fetch',
      url: p.url,
      size: '34 KB',
      failed: i === 3,
      status: i === 3 ? '403' : null
    },
    ...(i === 3
      ? []
      : [
          {
            id: `${p.id}-g`,
            kind: 'grep',
            pattern: p.short.toLowerCase(),
            scope: 'lib/',
            matches: 5 + i,
            files: 2
          }
        ])
  ],
  answer:
    i === 3
      ? 'Cloudflare returned 403 for the pricing page. I could not verify these cells.'
      : i === 2
        ? 'All 6 TrueFoundry cells match the published pricing.'
        : `| cell | ours | docs |\n|---|---|---|\n| ${p.short.toLowerCase()}/gpt-6 | $2.50 in | $2.00 in |${i === 0 ? `\n| ${p.short.toLowerCase()}/sonnet-5.5 | 200k ctx | 1M ctx |` : ''}`
}))

// Nine children requested at once (the "double check a list" case in 04).
window.SPAWN_NINE = [
  'Portkey',
  'Bifrost',
  'TrueFoundry',
  'Cloudflare',
  'OpenRouter',
  'LiteLLM proxy',
  'Kong AI',
  'Helicone',
  'Vercel AI Gateway'
].map((n) => ({
  label: `Matrix cells: ${n}`,
  prompt: `Check every ${n} cell in config/matrix.yml against the provider's pricing page…`
}))

// One finished turn that exercises every tool renderer.
window.SETTLED_TOOLS = {
  explore: [
    { id: 'r1', kind: 'read', file: 'config/matrix.yml', range: 'L1–412' },
    { id: 'r2', kind: 'read', file: 'docs/providers.md' },
    { id: 'r3', kind: 'read', file: 'lib/gateway/cells.rb', range: 'L40–120' },
    { id: 'r4', kind: 'read', file: 'spec/fixtures/cells.json' },
    {
      id: 'g1',
      kind: 'grep',
      pattern: 'cell_id',
      scope: 'lib/',
      matches: 14,
      files: 6,
      results: [
        {
          file: 'lib/gateway/cells.rb',
          lines: ['42  def cell_id(provider, model)', '57    cell_id = [provider, model].join("/")']
        },
        { file: 'lib/gateway/router.rb', lines: ['18  cell = Cells.find(cell_id)'] },
        { file: 'lib/gateway/pricing.rb', lines: ['9   PRICES = load_cells.index_by(&:cell_id)'] }
      ]
    }
  ],
  work: [
    {
      id: 'b1',
      kind: 'bash',
      desc: 'Run the pricing matrix specs',
      cmd: 'bundle exec rspec spec/matrix',
      exit: 1,
      dur: 4.2,
      out: [
        'Failures:',
        '  1) Matrix bifrost/gpt-6 matches published input price',
        '     expected: 2.0',
        '          got: 2.5',
        '     # ./spec/matrix/bifrost_spec.rb:42',
        '',
        'Finished in 4.18 seconds',
        '61 examples, 1 failure'
      ],
      outLines: 214,
      review: {
        codex: {
          verdict: 'approved',
          risk: 'low',
          auth: 'high',
          at: '12:41:03',
          reason:
            "Running the gateway's matrix specs in its isolated test database is a local validation step with no production or external effects."
        },
        claude: { by: 'you', at: '12:41:03', how: 'Allowed once' }
      }
    },
    {
      id: 'e1',
      kind: 'edit',
      file: 'config/matrix.yml',
      add: 12,
      del: 3,
      diff: [
        ['n', '  bifrost/gpt-6:'],
        ['d', '    input_per_mtok: 2.50'],
        ['a', '    input_per_mtok: 2.00'],
        ['n', '    output_per_mtok: 10.00'],
        ['n', '  portkey/sonnet-5.5:'],
        ['d', '    context_window: 200_000'],
        ['a', '    context_window: 1_000_000'],
        ['a', '    long_context_surcharge: true']
      ],
      review: {
        codex: {
          verdict: 'approved',
          risk: 'low',
          auth: 'high',
          at: '12:42:10',
          reason:
            'Editing a tracked configuration file inside the workspace is within the task and reversible through git.'
        },
        claude: { by: 'mode', at: '12:42:10', how: 'Accept edits mode' }
      }
    },
    {
      id: 'b2',
      kind: 'bash',
      desc: 'Re-run the Bifrost spec',
      cmd: 'bundle exec rspec spec/matrix/bifrost_spec.rb:42',
      exit: 0,
      dur: 1.6,
      out: ['1 example, 0 failures'],
      review: {
        codex: {
          verdict: 'approved',
          risk: 'medium',
          auth: 'high',
          at: '12:42:31',
          reason:
            'Re-running a single spec is local, but it reads .env.test, which can hold real API keys, so the reviewer rates it medium risk.'
        },
        claude: {
          by: 'rule',
          at: '12:42:31',
          how: 'Session rule',
          rule: 'Bash(bundle exec rspec:*)'
        }
      }
    },
    {
      id: 's1',
      kind: 'skill',
      name: 'write-pr',
      about:
        'Create or revise pull request titles and descriptions with brief what-and-why context.'
    },
    {
      id: 'b3',
      kind: 'bash',
      desc: 'Commit, push branch, and open PR',
      cmd: 'git add config/matrix.yml && git commit -q -m "Fix Bifrost and Portkey matrix cells" && git push -q -u origin HEAD && gh pr create --base main --title "Fix Bifrost and Portkey matrix cells" --body-file $TMPDIR/pr.md',
      heredoc: true,
      sandboxOff: true,
      exit: 0,
      dur: 3.8,
      out: [
        'remote:',
        "remote: Create a pull request for 'eth-40-matrix' on GitHub",
        'https://github.com/clio/clio-llm-gateway/pull/848'
      ],
      review: {
        codex: {
          verdict: 'approved',
          risk: 'low',
          auth: 'high',
          at: '12:44:02',
          reason:
            'Pushing a feature branch and opening a draft PR was explicitly requested by the user.'
        },
        claude: { by: 'you', at: '12:44:02', how: 'Allowed once' }
      }
    },
    {
      id: 'm1',
      kind: 'mcp',
      server: 'linear',
      tool: 'save_comment',
      arg: 'ETH-40',
      args: {
        issueId: 'ETH-40',
        body: 'Audit done. 3 cells fixed in #848; Cloudflare unverified (403).'
      },
      result: 'Comment posted on ETH-40.'
    },
    {
      id: 'w1',
      kind: 'web',
      mode: 'search',
      query: 'cloudflare ai gateway pricing 2026',
      results: 8
    }
  ],
  // provider frames that today render raw
  frames: [
    {
      kind: 'message:system:code_change_published',
      payload:
        '{"type":"system","subtype":"code_change_published","branch":"eth-40-matrix","remote":"origin","pr":848}',
      ledger: {
        icon: 'branch',
        html: 'Pushed <b>eth-40-matrix</b> to origin · opened <b>PR #848</b>'
      }
    },
    {
      kind: 'message:system:vcs_state_changed',
      payload: '{"type":"system","subtype":"vcs_state_changed","dirty":false,"ahead":0}',
      ledger: null
    }
  ]
}

window.PLAN = [
  'Load matrix and provider list',
  'Split cells by provider',
  'Verify Portkey, Bifrost, TrueFoundry, Cloudflare',
  'Fix mismatches in matrix.yml',
  'Run matrix specs',
  'Open PR',
  'Comment on ETH-40'
]

window.LINEAR = [
  {
    key: 'ETH-40',
    title: 'Matrix audit: verify provider cells',
    parts: { description: true, comments: true, subissues: false, links: true },
    counts: { comments: 4, subissues: 2, links: 1 },
    tokens: { description: 420, comments: 610, subissues: 260, links: 90 },
    body: 'Verify every cell in config/matrix.yml against the provider docs. Known drift: Bifrost changed input prices on Oct 1.\n\nComments (4): "Cloudflare page needs login", "Portkey long-context is 1M now", …'
  },
  {
    key: 'ETH-38',
    title: 'Gateway pricing page copy',
    parts: { description: true, comments: false, subissues: false, links: false },
    counts: { comments: 1, subissues: 0, links: 0 },
    tokens: { description: 180, comments: 90, subissues: 0, links: 0 },
    body: 'Update the public pricing table once the matrix audit lands.'
  }
]

window.FOLLOWUPS = [
  'Cloudflare pricing page needs a logged-in fetch; cells are unverified.',
  'spec/matrix has no test for long-context surcharges.'
]
