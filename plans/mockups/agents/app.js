/* Ether agent mockups: "Ledger" vs today's baseline. Plain JS, no build. */

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s))
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )
const fmtDur = (s) => {
  s = Math.max(0, Math.round(s))
  if (s < 60) {
    return `${s}s`
  }
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}
const fmtTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const now = () => Date.now()
const ago = (sec) => now() - sec * 1000
const since = (ms, cls = '') =>
  `<span class="tab ${cls}" data-since="${ms}">${fmtDur((now() - ms) / 1000)}</span>`
const clone = (o) => JSON.parse(JSON.stringify(o))
const mac = navigator.userAgent.includes('Mac')
const MOD = mac ? '⌘' : 'Ctrl+'

/* ---------------- Settings (controls) ---------------- */
const S = {
  view: 'ledger',
  scene: 'live',
  provider: 'claude',
  theme: 'dark',
  chatW: 1100,
  sbW: 300,
  perm: 'ask',
  deleg: 'auto3',
  gray: false,
  reduced: false,
  showSystem: false,
  inlineAllow: true,
  highlight: false
}

const AGENT = () => (S.provider === 'claude' ? 'Claude' : 'Codex')
const MAIN_MODEL = () => (S.provider === 'claude' ? 'opus·high' : 'gpt-6·high')
const MODEL_PILL = () => (S.provider === 'claude' ? 'Opus 5.5 · High' : 'GPT-6 · High')
const SUB_MODEL = (sa) =>
  S.provider === 'claude' ? `${sa.model}·${sa.effort}` : `gpt-6·${sa.effort}`

/* ---------------- Runtime state (reset per scene) ---------------- */
let R = null
function freshRuntime() {
  return {
    items: [],
    turn: null,
    turnOpen: true,
    subs: [],
    lanesOpen: null,
    planOpen: false,
    planIdx: 2,
    showPlan: false,
    now: null,
    approvals: [],
    approvalFolded: false,
    denyOpen: false,
    prespawn: null,
    queue: [],
    open: new Set(),
    peek: null,
    peekPromptOpen: false,
    childMore: false,
    linear: {
      chips: clone(LINEAR).map((c, i) => ({ ...c, included: i === 0 })),
      sent: false,
      drift: false
    },
    ctxOpen: new Set(),
    composer: '',
    find: { open: false, q: '' },
    fuOpen: true,
    fuSent: new Set(),
    capture: null,
    inbox: 0,
    toast: null,
    menu: null,
    stopOutcome: 'confirm',
    chipPop: null,
    spawnMore: false,
    timers: [],
    nextId: 1
  }
}
function later(ms, fn) {
  R.timers.push(setTimeout(fn, ms))
}
function every(ms, fn) {
  R.timers.push(setInterval(fn, ms))
}
function clearTimers() {
  if (R) {
    R.timers.forEach((t) => (clearTimeout(t), clearInterval(t)))
  }
}
function toast(html, ms = 3200) {
  R.toast = html
  render()
  const mine = html
  later(ms, () => {
    if (R.toast === mine) {
      R.toast = null
      render()
    }
  })
}

/* ---------------- Scenes ---------------- */
const USER_ASK =
  'double check the matrix list against the provider docs and fix anything that drifted'

function subFrom(sa, startedSecAgo, opts = {}) {
  return {
    ...clone(sa),
    state: 'working',
    startedAt: ago(startedSecAgo),
    settledAt: null,
    lastEventAt: ago(opts.quiet ? 95 : 3),
    actIdx: Math.min(opts.actIdx ?? 1, sa.acts.length - 1),
    quiet: !!opts.quiet,
    tokens: Math.round(sa.tokens * (opts.frac ?? 0.7))
  }
}

function settledSubs() {
  return SUBAGENTS.map((sa) => ({
    ...clone(sa),
    state: sa.failed ? 'failed' : 'done',
    startedAt: ago(390),
    settledAt: ago(390 - sa.dur),
    lastEventAt: ago(390 - sa.dur),
    actIdx: sa.acts.length - 1
  }))
}

function baseItems(turnState) {
  return [
    { t: 'user', text: USER_ASK, time: '12:38 PM' },
    { t: 'turnh' },
    {
      t: 'prose',
      html: "I'll load the matrix, split the cells by provider and verify each provider in parallel."
    },
    { t: 'run', id: 'run-explore', tools: clone(SETTLED_TOOLS.explore) },
    { t: 'batch', id: 'batch1', state: turnState }
  ]
}

function liveNow(desc, cmd, secAgo) {
  return {
    desc,
    cmd,
    startedAt: ago(secAgo),
    tail: ['Randomized with seed 41922', '..............F......', '.........................'],
    tailPool: [
      '..........*..........',
      '.......................',
      'Pending: (Failures listed here are expected)',
      '.........F...........'
    ]
  }
}

const SETUP = {
  live() {
    R.items = baseItems('working')
    R.items.push({
      t: 'tool',
      tool: {
        id: 'b-live',
        kind: 'bash',
        desc: 'Run the pricing matrix specs',
        cmd: 'bundle exec rspec spec/matrix',
        state: 'running',
        startedAt: ago(64)
      }
    })
    R.turn = { state: 'working', startedAt: ago(252), steps: 23 }
    R.subs = SUBAGENTS.map((sa, i) =>
      subFrom(sa, [163, 157, 151, 144][i], {
        actIdx: [2, 1, 2, 1][i],
        quiet: i === 3,
        frac: 0.6 + i * 0.05
      })
    )
    R.now = liveNow('Run the pricing matrix specs', 'bundle exec rspec spec/matrix', 64)
    R.showPlan = true
    R.planIdx = 2
    startLiveEngine()
  },
  settled() {
    R.items = [
      ...baseItems('done'),
      {
        t: 'prose',
        html: "Three providers verified. Cloudflare's pricing page returned 403, so its cells are <b>unverified</b>. Fixing the two drifted cells now."
      },
      ...SETTLED_TOOLS.work.slice(0, 4).map((tool) => ({ t: 'tool', tool: clone(tool) })),
      { t: 'tool', tool: clone(SETTLED_TOOLS.work[4]) },
      { t: 'frame', frame: SETTLED_TOOLS.frames[0] },
      { t: 'frame', frame: SETTLED_TOOLS.frames[1] },
      { t: 'tool', tool: clone(SETTLED_TOOLS.work[5]) },
      { t: 'tool', tool: clone(SETTLED_TOOLS.work[6]) },
      {
        t: 'prose',
        keep: true,
        html: 'Done. <b>PR #848</b> fixes <code>bifrost/gpt-6</code> input price and <code>portkey/sonnet-5.5</code> context window; specs pass. Cloudflare cells are still unverified (403 on their pricing page). I left a comment on ETH-40.'
      }
    ]
    R.turn = { state: 'settled', dur: 393, steps: 31 }
    R.subs = settledSubs()
  },
  approval() {
    R.items = baseItems('done').concat([
      { t: 'tool', tool: clone(SETTLED_TOOLS.work[0]) },
      {
        t: 'prose',
        html: 'One spec fails on Bifrost. The test database is out of date, so I need to prepare it before re-running.'
      }
    ])
    R.subs = settledSubs()
    R.turn = { state: 'working', startedAt: ago(301), steps: 26 }
    addApproval('bash')
  },
  delegation() {
    R.items = [
      { t: 'user', text: 'double check this list of provider cells', time: '12:51 PM' },
      { t: 'turnh' },
      { t: 'prose', html: "I'll check each provider's cells against its pricing page." }
    ]
    R.turn = { state: 'working', startedAt: ago(14), steps: 2 }
    if (S.deleg === 'off') {
      R.items.push({
        t: 'notice',
        icon: 'bot',
        html: `Subagents are off for this chat, so ${AGENT()} is working through the list itself.`
      })
      R.items.push({
        t: 'tool',
        tool: {
          id: 'w-off',
          kind: 'web',
          mode: 'fetch',
          url: 'portkey.ai/docs/pricing',
          state: 'running',
          startedAt: ago(4)
        }
      })
      R.now = { desc: 'Fetching portkey.ai/docs/pricing', startedAt: ago(4), tail: [] }
      return
    }
    const limit = { ask: 0, auto2: 2, auto3: 3, auto5: 5, auto8: 8 }[S.deleg] ?? 3
    R.prespawn = {
      limit,
      items: SPAWN_NINE.map((s, i) => ({ ...s, checked: limit === 0 ? true : i < limit }))
    }
  },
  linear() {
    R.items = []
    R.turn = null
    R.composer = USER_ASK
  },
  stop() {
    R.items = [
      { t: 'user', text: 'run the gmail suite and fix whatever fails', time: '12:49 PM' },
      { t: 'turnh' },
      { t: 'prose', html: 'Running the full Gmail suite first to see what fails.' },
      {
        t: 'tool',
        tool: {
          id: 'b-stop',
          kind: 'bash',
          desc: 'Run the Gmail suite',
          cmd: 'cd /tmp/claude/clio-srv-109 && bundle exec rspec',
          state: 'running',
          startedAt: ago(701)
        }
      }
    ]
    R.turn = { state: 'working', startedAt: ago(707), steps: 9 }
    R.now = liveNow('Run the Gmail suite', 'bundle exec rspec', 701)
    startTailEngine()
  },
  away() {
    SETUP.settled()
    R.items.unshift(
      { t: 'user', text: 'what does the matrix spec cover today?', time: '11:52 AM' },
      {
        t: 'prose',
        html: 'It checks input/output prices and streaming support for every cell, but not context windows or surcharges.'
      },
      { t: 'new' },
      { t: 'receipt' }
    )
    R.items.push({ t: 'followups' })
    R.turnOpen = false
  }
}

function setScene(scene) {
  clearTimers()
  const keep = R ? { inbox: R.inbox } : {}
  R = freshRuntime()
  Object.assign(R, keep)
  S.scene = scene
  SETUP[scene]()
  render({
    scrollTo:
      scene === 'settled' || scene === 'linear' ? 'top' : scene === 'away' ? 'new' : 'bottom'
  })
}

/* ---------------- Live engine ---------------- */
function startTailEngine() {
  every(2200, () => {
    if (!R.now || !R.now.tailPool || R.turn?.state !== 'working') {
      return
    }
    R.now.tail = [
      ...R.now.tail.slice(-2),
      R.now.tailPool[Math.floor(Math.random() * R.now.tailPool.length)]
    ]
    renderSoon()
  })
}
function startLiveEngine(opts = {}) {
  startTailEngine()
  every(opts.fast ? 2300 : 3600, () => {
    if (R.turn?.state !== 'working') {
      return
    }
    const live = R.subs.filter((s) => s.state === 'working' && !s.quiet)
    if (!live.length) {
      return
    }
    const s = live[Math.floor(Math.random() * live.length)]
    s.actIdx++
    s.lastEventAt = now()
    s.tokens += 2100 + Math.round(Math.random() * 3000)
    R.turn.steps++
    if (s.actIdx >= s.acts.length) {
      s.actIdx = s.acts.length - 1
      s.state = s.failed ? 'failed' : 'done'
      s.settledAt = now()
    }
    renderSoon()
  })
  if (opts.failQuiet) {
    later(opts.failQuiet, () => {
      const q = R.subs.find((s) => s.quiet && s.state === 'working')
      if (!q) {
        return
      }
      q.state = 'failed'
      q.quiet = false
      q.settledAt = now()
      render()
    })
  }
}
let renderQueued = false
function renderSoon() {
  if (renderQueued) {
    return
  }
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    render()
  })
}

/* ---------------- Tools: Ledger renderers ---------------- */
function reviewOf(t) {
  if (t.reviewNow) {
    return { ...t.reviewNow, src: 'user' }
  }
  if (!t.review) {
    return null
  }
  return S.provider === 'codex'
    ? { ...t.review.codex, src: 'auto' }
    : { ...t.review.claude, src: 'claude' }
}
function reviewGlyph(t) {
  if (t.state === 'waiting') {
    return { icon: 'shieldQ', cls: 'ask' }
  }
  if (t.state === 'denied') {
    return { icon: 'shieldX', cls: 'deny' }
  }
  const r = reviewOf(t)
  if (!r) {
    return null
  }
  if (r.src === 'auto') {
    if (r.verdict === 'denied') {
      return { icon: 'shieldX', cls: 'deny' }
    }
    if (r.risk !== 'low') {
      return { icon: 'shieldAlert', cls: 'warn' }
    }
  }
  return { icon: 'shieldCheck', cls: 'ok' }
}
function reviewCard(t) {
  const auto = reviewOf(t)?.src === 'auto'
  if (t.state === 'denied' && !auto) {
    return `<div class="cap deny"><span>Denied by you</span><span class="tm">${t.deniedAt || ''}</span></div>
      <div>${t.denyNote ? `Told ${AGENT()}: “${esc(t.denyNote)}”` : `${AGENT()} was told not to run it.`}</div>`
  }
  const r = reviewOf(t)
  if (!r) {
    return ''
  }
  if (r.src === 'auto') {
    const warn = r.verdict === 'denied' ? 'deny' : r.risk !== 'low' ? 'warn' : ''
    return `<div class="cap ${warn}"><span>Auto-review · ${r.verdict === 'denied' ? 'Blocked' : 'Approved'}</span><span class="tm">${r.at}</span></div>
      <div class="facts">Risk <b>${r.risk}</b> · Authorization <b>${r.auth}</b></div>
      <div>${esc(r.reason)}</div>
      <div class="ft"><span>Codex auto-review</span><button data-act="copy-raw">Copy raw event</button></div>`
  }
  const cap = { you: 'Approved by you', rule: 'Allowed by session rule', mode: 'Allowed by mode' }[
    r.by
  ]
  return `<div class="cap"><span>${cap}</span><span class="tm">${r.at || ''}</span></div>
    <div class="facts">${esc(r.how)}${r.rule ? ` · <span class="mono">${esc(r.rule)}</span>` : ''}</div>
    <div class="ft"><span>${AGENT()} permission</span><button data-act="copy-raw">Copy raw event</button></div>`
}

function hiCmd(cmd) {
  return esc(cmd.replace(/ && /g, ' &&\n  '))
    .replace(/(&quot;[^&]*?&quot;)/g, '<span class="tk-s">$1</span>')
    .replace(/^(\S+)/gm, '<span class="tk-k">$1</span>')
    .replace(/(&amp;&amp;)/g, '<span class="tk-c">$1</span>')
}

function waitLabel(t) {
  const i = R.approvals.findIndex((a) => a.toolId === t.id)
  return `<span class="waitlbl">Waiting for you${i > 0 ? ` · ${i + 1} of ${R.approvals.length}` : ''}</span>`
}

function toolSpec(t) {
  const running = t.state === 'running'
  const meta = []
  switch (t.kind) {
    case 'bash': {
      if (t.sandboxOff) {
        meta.push(`<span class="sbx" data-hc="sbx">${ic('shieldOff', 's3')}Outside sandbox</span>`)
      }
      if (running && R.turn?.state === 'unverifiable') {
        meta.push('<span>Unverifiable</span>')
      } else if (running) {
        meta.push('<span>Running</span>')
      } else if (t.dur > 1) {
        meta.push(`<span class="tab">${t.dur < 60 ? `${t.dur}s` : fmtDur(t.dur)}</span>`)
      }
      if (t.exit) {
        meta.push(`<span class="bad">exit ${t.exit}</span>`)
      }
      if (t.state === 'waiting') {
        meta.push(waitLabel(t))
      }
      if (t.state === 'denied') {
        meta.push(
          `<span class="bad">${reviewOf(t)?.src === 'auto' ? 'Blocked by auto-review' : 'Denied'}</span>`
        )
      }
      if (t.state === 'interrupted') {
        meta.push('<span>Interrupted</span>')
      }
      return {
        icon: 'term',
        tgt: esc(t.desc),
        sub: `<span class="mono">${esc(t.cmd)}</span>`,
        meta,
        body: () => {
          const out = t.out || (running ? R.now?.tail : null)
          return `<div class="blk"><div class="lab">Command<span class="r"><button data-act="copy">${ic('copy', 's3')}</button></span></div><pre>${hiCmd(t.cmd)}</pre></div>
            ${
              out
                ? `<div class="blk"><div class="lab">${running ? 'Output (live)' : 'Output'}<span class="r">${t.exit ? `<span class="bad">exit ${t.exit}</span>` : ''}<button data-act="copy">${ic('copy', 's3')}</button></span></div><pre>${esc(out.slice(-6).join('\n'))}</pre>${t.outLines ? `<button class="more">Show full output (${t.outLines} lines)</button>` : ''}</div>`
                : ''
            }`
        }
      }
    }
    case 'read':
      return {
        icon: 'eye',
        verb: 'Read',
        tgt: `<span class="pill">${esc(t.file)}</span>`,
        sub: t.range ? `<span class="mono">${t.range}</span>` : '',
        meta,
        body: null
      }
    case 'edit':
    case 'write':
      if (t.state === 'waiting') {
        meta.push(waitLabel(t))
      }
      meta.push(
        `<span class="add">+${t.add}</span>${t.del ? ` <span class="del">−${t.del}</span>` : ''}`
      )
      return {
        icon: t.kind === 'edit' ? 'pencil' : 'filePlus',
        verb: t.kind === 'edit' ? 'Edited' : 'Created',
        tgt: `<span class="pill">${esc(t.file)}</span>`,
        meta,
        body: () =>
          `<div class="blk diff"><div class="lab">${esc(t.file)}<span class="r"><button>Open diff</button></span></div><pre>${t.diff.map(([k, l]) => `<span class="${k}">${k === 'a' ? '+' : k === 'd' ? '−' : ' '} ${esc(l)}</span>`).join('')}</pre></div>`
      }
    case 'grep':
      meta.push(`${t.matches} matches${t.files ? ` in ${t.files} files` : ''}`)
      return {
        icon: 'search',
        verb: 'Searched',
        tgt: `<span class="mono">"${esc(t.pattern)}"</span>`,
        sub: `in <span class="mono">${esc(t.scope)}</span>`,
        meta,
        body: t.results
          ? () =>
              t.results
                .map(
                  (r) =>
                    `<div class="matchfile"><span class="pill">${esc(r.file)}</span>${r.lines.map((l) => `<span class="ln">${esc(l)}</span>`).join('')}</div>`
                )
                .join('')
          : null
      }
    case 'skill':
      return {
        icon: 'wrench',
        verb: 'Used skill',
        tgt: `<span class="pill">${esc(t.name)}</span>`,
        meta,
        body: () => `<div class="prose" style="font-size:13px;margin:0">${esc(t.about)}</div>`
      }
    case 'web':
      if (t.mode === 'fetch') {
        if (running) {
          meta.push(since(t.startedAt))
        } else if (t.failed) {
          meta.push(`<span class="bad">HTTP ${t.status}</span>`)
        } else if (t.size) {
          meta.push(t.size)
        }
        const [host, ...rest] = t.url.split('/')
        return {
          icon: 'globe',
          verb: running ? 'Fetching' : 'Fetched',
          tgt: esc(host),
          sub: rest.length ? `› ${esc(rest.join('/'))}` : '',
          meta,
          body: null
        }
      }
      meta.push(`${t.results} results`)
      return {
        icon: 'globe',
        verb: 'Searched web',
        tgt: `<span class="mono">"${esc(t.query)}"</span>`,
        meta,
        body: null
      }
    case 'mcp':
      return {
        icon: 'plug',
        verb: esc(t.server),
        tgt: `${esc(t.tool)} <span class="mono" style="color:var(--c-faint)">${esc(t.arg)}</span>`,
        meta,
        body: () =>
          `<table class="kv">${Object.entries(t.args)
            .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
            .join(
              ''
            )}</table><div class="prose" style="font-size:13px;margin:0">${esc(t.result)}</div>`
      }
  }
  return { icon: 'wrench', tgt: esc(t.kind), meta, body: null }
}

function toolLine(t) {
  const sp = toolSpec(t)
  const g = reviewGlyph(t)
  const open = R.open.has(t.id) && sp.body
  const cls = [
    'tl',
    open ? 'open' : '',
    t.state === 'failed' || t.exit ? 'failed' : '',
    t.state === 'waiting' ? 'waiting' : ''
  ].join(' ')
  const unconfirmed = t.state === 'running' && R.turn?.state === 'unverifiable'
  const icon = unconfirmed
    ? ic('circle', 's35')
    : t.state === 'running'
      ? ic('loader', 's35 spin')
      : ic(sp.icon, 's35')
  return `<div class="${cls}" data-tool="${t.id}">
    <div class="tlh" tabindex="0" ${sp.body ? `data-act="toggle" data-arg="${t.id}"` : ''}>
      <span class="ico">${icon}</span>
      ${sp.verb ? `<span class="verb">${sp.verb}</span>` : ''}
      <span class="tgt">${sp.tgt}</span>
      ${sp.sub ? `<span class="sub">${sp.sub}</span>` : '<span class="fill"></span>'}
      <span class="meta">${sp.meta.join('')}</span>
      <span class="gl ${g ? `${g.cls} eth` : ''}" ${g ? `data-hc="review:${t.id}" tabindex="0"` : ''}>${g ? ic(g.icon, 's3') : ''}</span>
      <span class="chev">${sp.body ? ic('chevR', 's35') : ''}</span>
    </div>
    ${open ? `<div class="tlb">${sp.body()}</div>` : ''}
  </div>`
}

function runSummary(tools) {
  const n = (k) => tools.filter((t) => t.kind === k).length
  const parts = []
  if (n('read')) {
    parts.push(`Read ${n('read')} file${n('read') > 1 ? 's' : ''}`)
  }
  if (n('grep')) {
    parts.push(`searched ${n('grep')} pattern${n('grep') > 1 ? 's' : ''}`)
  }
  if (n('bash')) {
    parts.push(`ran ${n('bash')} command${n('bash') > 1 ? 's' : ''}`)
  }
  if (n('edit')) {
    parts.push(`edited ${n('edit')} file${n('edit') > 1 ? 's' : ''}`)
  }
  const s = parts.join(', ')
  const matches = tools.filter((t) => t.kind === 'grep').reduce((a, t) => a + t.matches, 0)
  return { text: s.charAt(0).toUpperCase() + s.slice(1), meta: matches ? `${matches} matches` : '' }
}

function ledgerRun(it) {
  const open = R.open.has(it.id)
  const sum = runSummary(it.tools)
  return `<div class="run">
    <div class="runh" data-act="toggle" data-arg="${it.id}">
      <span class="ico" style="width:16px;display:flex;justify-content:center">${ic('list', 's35')}</span>
      <span class="sum">${sum.text}</span>
      <span class="meta">${sum.meta}</span>
      <span style="width:14px;display:flex">${ic(open ? 'chevD' : 'chevR', 's35')}</span>
    </div>
    ${open ? `<div class="runb">${it.tools.map(toolLine).join('')}</div>` : ''}
  </div>`
}

function subStateIcon(s, cls = 's3') {
  if (s.state === 'working') {
    return ic('loader', `${cls} spin`)
  }
  if (s.state === 'failed') {
    return `<span style="color:var(--destructive);display:flex">${ic('x', cls)}</span>`
  }
  if (s.state === 'stopped') {
    return ic('square', cls)
  }
  return ic('check', cls)
}
function subMeta(s) {
  const end = s.settledAt ? `${fmtDur((s.settledAt - s.startedAt) / 1000)}` : since(s.startedAt)
  return `${end} · ${fmtTok(s.tokens)}`
}

function batchRow(it) {
  const subs = R.subs
  if (!subs.length) {
    return ''
  }
  const open = R.open.has(it.id)
  const working = subs.filter((s) => s.state === 'working').length
  const tokens = subs.reduce((a, s) => a + s.tokens, 0)
  const startedAt = Math.min(...subs.map((s) => s.startedAt))
  const settledAt = working ? null : Math.max(...subs.map((s) => s.settledAt || 0))
  return `<div class="tl batch ${open ? 'open' : ''}">
    <div class="tlh" tabindex="0" data-act="toggle" data-arg="${it.id}">
      <span class="ico">${ic('bot', 's35')}</span>
      <span class="verb">${working ? 'Running' : 'Ran'}</span>
      <span class="tgt">${subs.length} subagents</span>
      <span class="stack">${subs.map((s) => subStateIcon(s)).join('')}</span>
      <span class="fill"></span>
      <span class="meta"><span class="mchip eth">${SUB_MODEL(subs[0])}</span>${settledAt ? `${fmtDur((settledAt - startedAt) / 1000)} · ${fmtTok(tokens)}` : `${working} working`}</span>
      <span class="gl"></span>
      <span class="chev">${ic('chevR', 's35')}</span>
    </div>
    ${
      open
        ? `<div class="tlb" style="gap:0">${subs
            .map(
              (s) => `<div class="tlh eth" data-act="peek" data-arg="${s.id}">
                <span class="ico">${subStateIcon(s, 's35')}</span>
                <span class="tgt">${esc(s.short)}</span>
                <span class="sub">${esc(s.state === 'working' ? s.acts[s.actIdx] : s.result)}</span>
                <span class="meta"><span class="mchip ${s.modelSource === 'requested' ? 'req' : ''}">${SUB_MODEL(s)}</span>${subMeta(s)}</span>
                <span class="gl"></span><span class="chev" style="opacity:1">${ic('panel', 's3')}</span>
              </div>`
            )
            .join('')}</div>`
        : ''
    }
  </div>`
}

/* ---------------- Transcript items ---------------- */
function userMsg(it) {
  const ctx = it.ctx
  return `<div class="um">
    <div class="bub">${esc(it.text)}</div>
    ${
      ctx
        ? `<div class="ctxblk eth">
            <div class="h" data-act="ctx-toggle" data-arg="${it.id}">${ic('linear', 's3')} Included ${ctx.map((c) => `<b>${c.key}</b>`).join(', ')} · ${ctx[0].summary} ${ic(R.ctxOpen.has(it.id) ? 'chevD' : 'chevR', 's3')}</div>
            ${R.ctxOpen.has(it.id) ? `<div class="b">${ctx.map((c) => `<b>${c.key} ${esc(c.title)}</b>\n${esc(c.body)}`).join('\n\n')}</div>` : ''}
            ${R.linear.drift ? `<div class="drift">${ic('clock', 's3')} ETH-40 updated since sent <button class="xbtn outline" data-act="send-update">Send update</button></div>` : ''}
          </div>`
        : ''
    }
    <div class="meta"><button class="rw" data-act="rewind" title="Rewind to here">${ic('rewind', 's3')} Rewind</button>${it.time}</div>
  </div>`
}

function turnHeader() {
  const t = R.turn
  if (!t) {
    return ''
  }
  const subs = R.subs.length ? ` <span class="sep">·</span> ${R.subs.length} subagents` : ''
  if (S.view === 'baseline') {
    if (t.state === 'settled') {
      return `<div class="turnh settled" data-act="turn-toggle">Worked for ${fmtDur(t.dur)} ${ic('chevR', 's3')}</div>`
    }
    return ''
  }
  if (t.state === 'working' || t.state === 'stopping') {
    return `<div class="turnh">${ic('loader', 's3 spin')} <span>${t.state === 'stopping' ? 'Stopping' : 'Working'} ${since(t.startedAt)}</span><span class="sep">·</span> ${t.steps} steps${subs}
      <button class="jump" data-act="jump">Jump to now ${ic('arrowDown', 's3')}</button></div>`
  }
  if (t.state === 'unverifiable') {
    return `<div class="turnh">${ic('circle', 's3')} Couldn't confirm the stop <span class="sep">·</span> ${t.steps} steps</div>`
  }
  if (t.state === 'stopped' || t.state === 'ended') {
    return `<div class="turnh settled" data-act="turn-toggle">${ic('square', 's3')} ${t.state === 'ended' ? 'Session ended' : 'Stopped'} after ${fmtDur(t.dur)} <span class="sep">·</span> ${t.steps} steps ${ic(R.turnOpen ? 'chevD' : 'chevR', 's3')}</div>`
  }
  const work = SETTLED_TOOLS.work
  const cmds = work.filter((x) => x.kind === 'bash').length
  return `<div class="turnh settled" data-act="turn-toggle">Worked for ${fmtDur(t.dur)} <span class="sep">·</span> ${cmds} commands <span class="sep">·</span> 1 file <span class="sep">·</span> <span style="color:var(--c-added)">+12</span> <span style="color:var(--c-removed)">−3</span> <span class="sep">·</span> <span class="fail">1 failed</span>${subs} ${ic(R.turnOpen ? 'chevD' : 'chevR', 's3')}</div>`
}

function receipt() {
  return `<div class="receipt eth">
    <div class="h">While you were away <span class="t">2 turns · 41m · 12:38 → 1:19 PM</span></div>
    <div class="facts">
      <span><b>5</b> commands</span><span><b>4</b> subagents</span><span><b>1</b> file changed <span style="color:var(--c-added)">+12</span> <span style="color:var(--c-removed)">−3</span></span>
      <span class="bad"><b>1</b> failed, then passed</span><span><b>PR #848</b> opened</span><span><b>2</b> possible follow-ups</span>
    </div>
    <div class="src">Built from the event log, not a summary from the model. <button class="xbtn" data-act="turn-toggle" style="height:18px;padding:0 4px">Show the work ${ic('chevR', 's3')}</button></div>
  </div>`
}

function followups() {
  return `<div class="fu eth">
    <div class="tlh" data-act="fu-toggle" style="font-size:12px">
      <span class="ico">${ic('inbox', 's35')}</span><span class="verb">${FOLLOWUPS.length} possible follow-ups</span><span class="fill"></span>
      <span class="chev" style="opacity:1">${ic(R.fuOpen ? 'chevD' : 'chevR', 's35')}</span>
    </div>
    ${
      R.fuOpen
        ? FOLLOWUPS.map(
            (f, i) =>
              `<div class="it ${R.fuSent.has(i) ? 'sent' : ''}"><span>${esc(f)}</span>${
                R.fuSent.has(i)
                  ? '<span>In Inbox</span>'
                  : `<button class="xbtn outline" data-act="fu-send" data-arg="${i}">${ic('inbox', 's3')} Send to Inbox</button>`
              }</div>`
          ).join('')
        : ''
    }
  </div>`
}

function frameRow(f) {
  if (S.view === 'baseline') {
    return `<div class="b-sys">${ic('chevR', 's35')} <b>claude</b> ${esc(f.kind)}</div>`
  }
  if (f.ledger) {
    return `<div class="notice">${ic(f.ledger.icon, 's35')}<span>${f.ledger.html}</span></div>`
  }
  return S.showSystem
    ? `<div class="sysrow">${esc(f.kind)} · hidden (the footer shows git state)</div>`
    : ''
}

function ledgerItem(it) {
  switch (it.t) {
    case 'user':
      return userMsg(it)
    case 'prose':
      return `<div class="prose">${it.html}</div>`
    case 'run':
      return ledgerRun(it)
    case 'tool':
      return toolLine(it.tool)
    case 'batch':
      return batchRow(it)
    case 'frame':
      return frameRow(it.frame)
    case 'notice':
      return `<div class="notice">${ic(it.icon, 's35')}<span>${it.html}</span></div>`
    case 'stopline':
      return `<div class="stopln">${ic(it.icon || 'square', 's3')} ${it.text}</div>`
    case 'new':
      return '<div class="newln">New</div>'
    case 'receipt':
      return receipt()
    case 'followups':
      return followups()
    case 'denied-note':
      return `<div class="notice" style="padding-left:24px">${ic('msg', 's3')}<span>Told ${AGENT()}: “${esc(it.text)}”</span></div>`
  }
  return ''
}

/* ---------------- Baseline (today's rendering) ---------------- */
const BASE_NAME = {
  bash: 'Bash',
  read: 'Read',
  edit: 'Edit',
  write: 'Write',
  grep: 'Grep',
  skill: 'Skill',
  web: 'WebFetch',
  mcp: 'mcp__linear__save_comment'
}
function baseJson(t) {
  switch (t.kind) {
    case 'bash':
      return {
        command: t.cmd,
        description: t.desc,
        ...(t.sandboxOff ? { dangerouslyDisableSandbox: true } : {})
      }
    case 'read':
      return { file_path: `/Users/joel/dev/clio/clio-llm-gateway/${t.file}` }
    case 'edit':
      return {
        file_path: t.file,
        old_string: t.diff
          .filter((d) => d[0] === 'd')
          .map((d) => d[1])
          .join('\n'),
        new_string: t.diff
          .filter((d) => d[0] === 'a')
          .map((d) => d[1])
          .join('\n')
      }
    case 'grep':
      return { pattern: t.pattern, path: t.scope }
    case 'skill':
      return { skill: t.name }
    case 'web':
      return t.mode === 'fetch'
        ? { url: `https://${t.url}`, prompt: 'Extract the pricing table' }
        : { query: t.query }
    case 'mcp':
      return t.args
  }
  return {}
}
function baseTool(t, expanded) {
  const j = JSON.stringify(baseJson(t))
  const name = t.kind === 'web' && t.mode === 'search' ? 'WebSearch' : BASE_NAME[t.kind]
  const out =
    t.kind === 'bash'
      ? (t.out || []).join('\n')
      : t.kind === 'skill'
        ? `Launching skill: ${t.name}`
        : t.kind === 'mcp'
          ? t.result
          : ''
  return `<div class="b-tool"><div class="h">${ic(t.kind === 'bash' ? 'term' : 'wrench', 's35')} <b>${name}</b> <span class="j">${esc(j)}</span> ${ic(expanded ? 'chevD' : 'chevR', 's3')}</div>
    ${expanded ? `<div class="b-pre">${esc(JSON.stringify(baseJson(t), null, 2))}</div>${out ? `<div class="b-pre">${esc(out)}</div>` : ''}` : ''}</div>`
}
function baseRun(tools, key) {
  const cmds = tools.filter((t) => t.kind === 'bash').length
  const other = tools.length - cmds
  const label = [
    other ? `Used ${other} tool${other > 1 ? 's' : ''}` : '',
    cmds ? `ran ${cmds} command${cmds > 1 ? 's' : ''}` : ''
  ]
    .filter(Boolean)
    .join(' and ')
  const open = !R.open.has(`b-${key}`)
  const reviews =
    S.provider === 'codex'
      ? tools
          .filter((t) => t.review)
          .map(
            (
              t
            ) => `<div class="b-amber"><div class="m">${ic('alert')}<span>Automatic approval review approved (risk: ${t.review.codex.risk}, authorization: ${t.review.codex.auth}): ${esc(t.review.codex.reason)}</span></div>
              <div class="d">› <b>codex</b> Details</div></div>`
          )
          .join('')
      : ''
  return `<div class="b-run"><div class="b-runh" data-act="toggle" data-arg="b-${key}">${ic('wrench', 's35')} ${label.charAt(0).toUpperCase() + label.slice(1)} ${ic('check', 's3')} ${ic(open ? 'chevD' : 'chevR', 's3')}</div>
    ${open ? tools.map((t) => baseTool(t, t.kind === 'bash' || t.kind === 'skill')).join('') : ''}</div>${reviews}`
}
function baselineItems(items) {
  let out = ''
  let buf = []
  const flush = () => {
    if (buf.length) {
      out += baseRun(buf, buf[0].id)
    }
    buf = []
  }
  for (const it of items) {
    if (it.t === 'tool') {
      buf.push(it.tool)
      continue
    }
    if (it.t === 'run') {
      buf.push(...it.tools)
      continue
    }
    flush()
    if (it.t === 'batch') {
      out += baseRun(
        R.subs.map((s) => ({
          id: s.id,
          kind: 'mcp',
          args: { description: s.label, subagent_type: s.type, prompt: s.prompt },
          result: ''
        })),
        it.id
      ).replace(/mcp__linear__save_comment/g, 'Agent')
      continue
    }
    if (it.t === 'user') {
      out += `<div class="um"><div class="bub">${esc(it.text)}</div><div class="meta">${it.time}</div></div>`
    } else if (it.t === 'turnh') {
      out += turnHeader()
    } else if (it.t === 'prose') {
      out += `<div class="prose">${it.html}</div>`
    } else if (it.t === 'frame') {
      out += frameRow(it.frame)
    } else if (it.t === 'stopline') {
      out += `<div class="stopln">${it.text}</div>`
    } else if (it.t === 'notice') {
      out += `<div class="prose">${it.html}</div>`
    }
  }
  flush()
  const t = R.turn
  if (t && (t.state === 'working' || t.state === 'stopping' || t.state === 'unverifiable')) {
    out += `<div class="stopln" style="font-size:14px">${ic('loader', 'spin')} Working for ${since(t.startedAt)}</div>`
  }
  return out
}

/* ---------------- Dock ---------------- */
const diffPre = (t) =>
  t.diff
    .map(
      ([k, l]) => `<span class="${k}">${k === 'a' ? '+' : k === 'd' ? '−' : ' '} ${esc(l)}</span>`
    )
    .join('')
// "Bash(bin/rails db:*)" → "bin/rails db:…": never show rule syntax.
const ruleWords = (rule) => rule.replace(/^\w+\((.*)\)$/, '$1').replace(/:?\*$/, ':…')

function approvalCard() {
  const a = R.approvals[0]
  if (!a) {
    return ''
  }
  const t = findTool(a.toolId)
  const n = R.approvals.length
  if (S.view === 'baseline') {
    return `<div class="b-card"><div class="t">${ic('shieldQ')} ${a.kind === 'bash' ? `${AGENT()} wants to run a command` : `${AGENT()} wants to edit ${esc(t.file)}`}</div>
      <div class="d">${a.kind === 'bash' ? `<span class="mono">${esc(t.cmd)}</span>` : 'Allow this edit?'}<br/>Reason: ${esc(a.reason)}</div>
      <div class="o"><button data-act="approve" data-arg="once">Allow</button><button data-act="approve" data-arg="session">Allow for this session</button><button data-act="deny">Deny</button></div></div>`
  }
  if (R.approvalFolded) {
    return `<div class="dcard strip eth"><div class="hd" data-act="unfold-approval">${ic('shieldQ', 's35')} <span style="color:var(--c-question)">Waiting for you</span> <span class="mono" style="color:var(--c-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.kind === 'bash' ? t.cmd : t.file)}</span><span class="r">${n > 1 ? `${n} pending · ` : ''}${ic('chevU', 's3')}</span></div></div>`
  }
  const rule = S.provider === 'claude' ? a.ruleClaude : null
  return `<div class="dcard eth" data-approval data-for="${t.id}">
    <div class="hd">${ic('shieldQ', 's35')}<span class="t">${a.kind === 'bash' ? 'Run this command?' : `Edit ${esc(t.file)}?`}</span>
      <span class="mono" style="font-size:11px;color:var(--c-faint)">${a.kind === 'bash' ? '~/dev/clio/clio-llm-gateway' : `+${t.add} −${t.del}`}</span>
      <span class="r">${n > 1 ? `<span>1 of ${n}</span><button class="ib" data-act="next-approval" title="Next ( ] )">${ic('chevR', 's3')}</button>` : ''}<button class="ib" data-act="fold-approval" title="Fold (Esc)">${ic('chevD', 's3')}</button></span></div>
    <div class="bd"><div class="blk"><pre>${a.kind === 'bash' ? hiCmd(t.cmd) : diffPre(t)}</pre></div></div>
    <div class="ft">
      <button class="xbtn primary" data-act="approve" data-arg="once">Allow <kbd>1</kbd></button>
      <button class="xbtn outline" data-act="approve" data-arg="session">${rule ? `Always allow <span class="mono">${esc(ruleWords(rule))}</span> in this chat` : 'Allow for this session'} <kbd>2</kbd></button>
      <button class="xbtn" data-act="deny">Deny… <kbd>3</kbd></button>
      <span class="cap">${AGENT()} is paused · ${since(a.at)}</span>
    </div>
    ${
      R.denyOpen
        ? `<div class="denynote"><input id="denynote" placeholder="Tell ${AGENT()} what to do instead (optional)" /><button class="xbtn outline" data-act="deny-send">Deny ${ic('enter', 's3')}</button></div>`
        : ''
    }
  </div>`
}

function prespawnCard() {
  const p = R.prespawn
  if (!p) {
    return ''
  }
  const sel = p.items.filter((x) => x.checked).length
  const enforced =
    S.provider === 'claude'
      ? 'Enforced by a hook on every Task call'
      : 'Instruction only: Codex has no spawn hook'
  const shown = R.spawnMore ? p.items : p.items.slice(0, 6)
  return `<div class="dcard eth">
    <div class="hd">${ic('bot', 's35')}<span class="t">${AGENT()} wants to start ${p.items.length} subagents</span>
      <span class="mchip">${p.items.length} × general-purpose · ${S.provider === 'claude' ? 'sonnet·med' : 'gpt-6·med'}</span>
      <span class="r">${p.limit ? `Limit for this chat: ${p.limit}` : 'Ask first'}</span></div>
    <div class="bd" style="max-height:none">${shown
      .map(
        (
          x,
          i
        ) => `<label class="spawnrow"><input type="checkbox" data-act="spawn-check" data-arg="${i}" ${x.checked ? 'checked' : ''}/>
          <span class="nm">${esc(x.label)}</span><span></span><span class="pr">“${esc(x.prompt)}”</span></label>`
      )
      .join(
        ''
      )}${p.items.length > 6 && !R.spawnMore ? `<button class="xbtn" data-act="spawn-more" style="margin-left:18px">+${p.items.length - 6} more</button>` : ''}</div>
    <div class="ft">
      <button class="xbtn primary" data-act="spawn-start" ${sel ? '' : 'disabled'}>Start ${sel} selected <kbd>⏎</kbd></button>
      <button class="xbtn outline" data-act="spawn-all">Start all ${p.items.length}</button>
      <button class="xbtn" data-act="spawn-none">Do it without subagents</button>
      <span class="cap">${enforced}</span>
    </div>
  </div>`
}

function planItems() {
  // Step 3 names the providers actually started, never ones that weren't.
  return PLAN.map((p, i) =>
    i === 2 && R.subs.length ? `Verify ${R.subs.map((s) => s.short).join(', ')}` : p
  )
}
function planRow() {
  if (!R.showPlan) {
    return ''
  }
  const items = planItems()
  return `<div class="drow btn eth" data-act="plan-toggle">${ic(R.planOpen ? 'chevD' : 'chevR', 's3')}${ic('list', 's35')}<span>Plan <span class="tab">${R.planIdx + 1}/${items.length}</span></span><span class="strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(items[R.planIdx])}</span></div>
    ${
      R.planOpen
        ? `<div class="plan">${items.map((p, i) => `<div class="pi ${i < R.planIdx ? 'done' : i === R.planIdx ? 'cur' : ''}">${ic(i < R.planIdx ? 'check' : i === R.planIdx ? 'loader' : 'circle', `s3 ${i === R.planIdx ? 'spin' : ''}`)} ${esc(p)}</div>`).join('')}</div>`
        : ''
    }`
}

function lanesOpenNow() {
  // Default: collapsed when the lanes would squeeze the transcript (more than 4 rows).
  return R.lanesOpen ?? R.subs.length <= 4
}
function lanes() {
  const subs = R.subs
  if (!subs.length || ['approval', 'away', 'settled'].includes(S.scene)) {
    return ''
  }
  const working = subs.filter((s) => s.state === 'working').length
  const done = subs.filter((s) => s.state === 'done').length
  const failed = subs.filter((s) => s.state === 'failed').length
  if (S.view === 'baseline') {
    return `<div class="b-strip"><div class="h">${ic('bot', 's35')} <b>${subs.length} agents</b> — ${working} working ${ic('chevU', 's3')}</div><div class="cap">AGENTS</div>
      ${subs.map((s) => `<div class="r">${ic('bot', 's35')} ${s.state === 'working' ? ic('loader', 's35 spin') : ic('check', 's35')} ${esc(s.label)}<span class="n">${fmtTok(s.tokens)} · ${s.settledAt ? fmtDur((s.settledAt - s.startedAt) / 1000) : since(s.startedAt)}</span><button class="xbtn">Stop</button></div>`).join('')}</div>`
  }
  const open = lanesOpenNow()
  const order = { failed: 0, working: 1, done: 2, stopped: 3 }
  const sorted = [...subs].sort((a, b) => order[a.state] - order[b.state])
  // Collapsed, the head surfaces the one exception worth knowing.
  const exception = open
    ? ''
    : failed
      ? ` · <span style="color:var(--destructive)">${esc(sorted[0].short)} failed</span>`
      : ''
  const head = `<div class="drow btn eth" data-act="lanes-toggle">${ic(open ? 'chevD' : 'chevR', 's3')}${ic('bot', 's35')}<span class="strong">${subs.length} subagents</span>
    <span>${[working && `${working} working`, done && `${done} done`, open && failed && `<span style="color:var(--destructive)">${failed} failed</span>`].filter(Boolean).join(' · ')}${exception}</span>
    <span class="r"><span class="tab">${fmtTok(subs.reduce((a, s) => a + s.tokens, 0))}</span></span></div>`
  if (!open) {
    return head
  }
  return (
    head +
    sorted
      .map((s) => {
        const act =
          s.state === 'working'
            ? `<span class="act">${esc(s.acts[s.actIdx])}</span>`
            : `<span class="act ${s.state === 'failed' ? 'bad' : ''}">${s.state === 'failed' ? 'Failed · ' : s.state === 'stopped' ? '' : 'Done · '}${esc(s.result)}</span>`
        const req = s.modelSource === 'requested'
        return `<div class="lane eth ${s.state}" data-act="peek" data-arg="${s.id}" data-peek="${R.peek === s.id}">
          <span style="display:flex">${subStateIcon(s, 's35')}</span>
          <span class="nm">${esc(s.short)}</span>
          <span class="mchip lane-model ${req ? 'req' : ''}" ${req ? 'title="Requested in the Task call"' : ''}>${SUB_MODEL(s)}${req ? ' <span class="reqtag">req</span>' : ''}</span>
          ${act}
          <span class="end"><span class="nums mono tab">${fmtTok(s.tokens)} · ${s.settledAt ? fmtDur((s.settledAt - s.startedAt) / 1000) : since(s.startedAt)}</span>
          <span class="acts"><button class="xbtn" data-act="peek" data-arg="${s.id}">Open</button>${s.state === 'working' ? `<button class="xbtn" data-act="stop-sub" data-arg="${s.id}">Stop</button>` : ''}</span></span>
        </div>`
      })
      .join('')
  )
}

function queueCards() {
  return R.queue
    .map(
      (q, i) =>
        `<div class="queued"><span class="l">${ic('clock', 's3')} Queued</span><span style="flex:1">${esc(q)}</span><button class="xbtn" data-act="queue-edit">Edit</button><button class="xbtn" data-act="queue-drop" data-arg="${i}">${ic('x', 's3')}</button></div>`
    )
    .join('')
}

// Stop lives only on the composer button (upstream's), so the now line has none.
function nowLine() {
  const t = R.turn
  if (!t || S.view === 'baseline') {
    return ''
  }
  if (t.state === 'stopping') {
    return `<div class="nowln">${ic('loader', 's35 spin')}<span>Stopping…</span><span class="el">waiting for ${AGENT()} to confirm</span></div>`
  }
  if (t.state === 'unverifiable') {
    return `<div class="nowln eth">${ic('circle', 's35')}<span>${t.ssh ? 'Lost contact with the host. The agent may still be running.' : "Couldn't confirm the stop. The agent may still be running."}</span>
      <span class="r"><button class="xbtn outline" data-act="retry-stop">${ic('rewind', 's3')} ${t.ssh ? 'Reconnect' : 'Retry stop'}</button><button class="xbtn" data-act="end-session">End session</button></span></div>`
  }
  if (t.state !== 'working' || R.approvals.length || R.prespawn) {
    return ''
  }
  if (R.now) {
    return `<div class="nowwrap"><div class="nowln">${ic('loader', 's35 spin')}<span class="what">${esc(R.now.desc)}${R.now.cmd ? ` <span class="mono" style="color:var(--c-faint)">${esc(R.now.cmd)}</span>` : ''}</span><span class="el">· ${since(R.now.startedAt)}</span>${R.now.tail?.length ? `<span class="r tailhint">${ic('term', 's3')} output</span>` : ''}</div>
      ${R.now.tail?.length ? `<div class="tail">${esc(R.now.tail.join('\n'))}</div>` : ''}</div>`
  }
  const working = R.subs.filter((s) => s.state === 'working').length
  return `<div class="nowln">${ic('loader', 's35 spin')}<span>${working ? `Waiting on ${working} subagent${working > 1 ? 's' : ''}` : 'Thinking'}</span></div>`
}

function dock() {
  const parts = [
    approvalCard(),
    prespawnCard(),
    S.view === 'ledger' ? planRow() : '',
    lanes(),
    queueCards(),
    nowLine()
  ].filter(Boolean)
  return parts.length
    ? `<div class="dock" data-scroll="dock"><div class="col">${parts.join('')}</div></div>`
    : ''
}

/* ---------------- Composer ---------------- */
const PERMS = {
  claude: [
    ['ask', 'hand', 'Ask for approval', 'Claude asks before edits and commands.'],
    ['edits', 'pencil', 'Accept edits', 'File edits apply; commands still ask.'],
    ['full', 'shieldOff', 'Full access', 'Nothing asks. Use in disposable checkouts.']
  ],
  codex: [
    ['ask', 'hand', 'Ask for approval', 'Codex asks before leaving the sandbox.'],
    [
      'auto',
      'shieldCheck',
      'Approve for me',
      'An auto-reviewer approves low-risk actions and asks about the rest.'
    ],
    ['full', 'shieldOff', 'Full access', 'No sandbox and no approvals.']
  ]
}
const DELEG = [
  ['off', 'Off', "Don't use subagents"],
  ['ask', 'Ask first', 'Ask before starting any'],
  ['auto2', 'Auto, up to 2', 'Start up to 2 at once; ask beyond that'],
  ['auto3', 'Auto, up to 3', 'Start up to 3 at once; ask beyond that'],
  ['auto5', 'Auto, up to 5', 'Start up to 5 at once; ask beyond that'],
  ['auto8', 'Auto, up to 8', 'Start up to 8 at once; ask beyond that']
]
function permNow() {
  const list = PERMS[S.provider]
  return list.find((p) => p[0] === S.perm) || list[0]
}
function delegLabel() {
  return {
    off: 'Off',
    ask: 'Ask first',
    auto2: 'Auto ≤2',
    auto3: 'Auto ≤3',
    auto5: 'Auto ≤5',
    auto8: 'Auto ≤8'
  }[S.deleg]
}

function composerPlaceholder() {
  const t = R.turn
  const a = AGENT()
  if (!t) {
    return `Message ${a}…`
  }
  if (t.state === 'unverifiable') {
    return `Message ${a}… (queues until the agent is confirmed idle)`
  }
  if (t.state === 'working' || t.state === 'stopping') {
    return `Queue a message for ${a}…`
  }
  if (t.state === 'stopped') {
    return `Message ${a}… the next message continues the conversation`
  }
  if (t.state === 'ended') {
    return `Message ${a}… starts a fresh process and resumes the conversation`
  }
  return `Message ${a}…`
}

function composer() {
  const t = R.turn
  const busy = t && (t.state === 'working' || t.state === 'stopping')
  const unv = t && t.state === 'unverifiable'
  const p = permNow()
  const showChips = S.view === 'ledger' && S.scene === 'linear' && !R.linear.sent
  const chips = showChips
    ? `<div class="ctxrow eth">${R.linear.chips
        .map(
          (c) =>
            `<button class="cchip ${c.included ? '' : 'off'}" data-act="chip-pop" data-arg="${c.key}" aria-expanded="${R.chipPop === c.key}">${ic('linear', 's3')}<span class="k">${c.key}</span>${esc(c.title)}${ic('chevD', 's3')}</button>`
        )
        .join('')}<span class="cchip add" data-act="noop">${ic('plus', 's3')} Context</span></div>`
    : ''
  return `<div class="composer"><div class="col"><div class="cbox">
    ${chips}
    <textarea id="composer" rows="2" placeholder="${composerPlaceholder()}">${esc(R.composer)}</textarea>
    <div class="cbar">
      <button class="pk" data-act="noop" title="Attach">${ic('plus', 's35')}</button>
      <button class="pk" data-act="noop" title="Model">${MODEL_PILL()} ${ic('chevD', 's3')}</button>
      <button class="pk ${p[0] === 'full' ? 'warn' : ''}" data-menu="perm">${ic(p[1], 's35')} ${p[2]} ${ic('chevD', 's3')}</button>
      ${S.view === 'ledger' ? `<button class="pk eth" data-menu="deleg">${ic('bot', 's35')} ${delegLabel()} ${ic('chevD', 's3')}</button>` : ''}
      <span class="sp"></span>
      <span class="ring" title="Context used: 38%"></span>
      ${
        busy
          ? `<button class="send stop" data-act="stop" ${t.state === 'stopping' ? 'disabled' : ''} title="Stop (Esc Esc)">${ic('square', 's35')}</button>`
          : `<button class="send" data-act="send" title="${unv ? 'Queue: sends when the agent is confirmed idle' : 'Send'}">${ic(unv ? 'clock' : 'arrowUp', 's35')}</button>`
      }
    </div>
  </div></div></div>`
}

/* ---------------- Peek ---------------- */
function peekPane(takeover) {
  const s = R.subs.find((x) => x.id === R.peek)
  if (!s) {
    return ''
  }
  const idx = R.subs.indexOf(s)
  const tools = s.tools.slice(
    0,
    s.state === 'working' ? Math.min(s.actIdx, s.tools.length) : s.tools.length
  )
  const t = R.turn
  const parentStrip =
    takeover && t
      ? `<div class="pkparent" data-act="peek-close">${t.state === 'working' ? ic('loader', 's3 spin') : ic('check', 's3')}<span class="strong">${AGENT()} Chat</span><span>${t.state === 'working' ? `Working ${since(t.startedAt)}` : t.state}</span><span class="r">${t.state === 'working' ? `<button class="xbtn" data-act="stop">${ic('square', 's3')} Stop</button>` : ''}</span></div>`
      : ''
  return `<div class="peek eth ${takeover ? 'takeover' : ''}" style="${takeover ? '' : 'width:44%'}">
    <div class="pkh">
      <button class="crumb" data-act="peek-close">${ic('chevL', 's3')} ${AGENT()} Chat</button>${ic('chevR', 's3')}
      <span class="here">${esc(s.short)}</span>
      <span class="r">
        <button class="ib" data-act="peek-step" data-arg="-1" ${idx === 0 ? 'disabled' : ''} title="Previous subagent ( [ )">${ic('chevU', 's35')}</button>
        <button class="ib" data-act="peek-step" data-arg="1" ${idx === R.subs.length - 1 ? 'disabled' : ''} title="Next subagent ( ] )">${ic('chevD', 's35')}</button>
        <button class="ib" data-act="peek-tab" title="Open as tab">${ic('ext', 's35')}</button>
        <button class="ib" data-act="peek-close" title="Close (Esc)">${ic('x', 's35')}</button>
      </span>
    </div>
    <div class="pksub">${subStateIcon(s, 's35')}<span>${s.state === 'working' ? 'Working' : s.state === 'failed' ? 'Failed' : s.state === 'stopped' ? 'Stopped' : 'Done'}</span>
      <span class="mchip ${s.modelSource === 'requested' ? 'req' : ''}">${SUB_MODEL(s)}${s.modelSource === 'requested' ? ' (requested)' : ''}</span>
      <span class="tab">${fmtTok(s.tokens)} tokens</span><span>${s.settledAt ? fmtDur((s.settledAt - s.startedAt) / 1000) : since(s.startedAt)}</span>
    </div>
    <div class="pkprompt ${R.peekPromptOpen ? '' : 'clamp'}" data-act="peek-prompt"><span class="lbl">Prompt</span><span class="p">${esc(s.prompt)}</span></div>
    <div class="scroll" data-scroll="peek"><div class="col">
      ${tools.map(toolLine).join('')}
      ${
        s.state === 'working'
          ? `<div class="nowln">${ic('loader', 's35 spin')}<span class="what">${esc(s.acts[s.actIdx])}</span><span class="el">· <span class="tab" data-since="${s.lastEventAt}">${fmtDur((now() - s.lastEventAt) / 1000)}</span></span></div>`
          : `<div class="prose" style="white-space:pre-wrap">${s.answer.includes('|') ? mdTable(s.answer) : esc(s.answer)}</div>`
      }
    </div></div>
    ${parentStrip}
    <div class="pkft"><button class="xbtn outline" data-act="peek-tab">${ic('ext', 's3')} Open as tab</button>${s.state === 'working' ? `<button class="xbtn" data-act="stop-sub" data-arg="${s.id}">${ic('square', 's3')} Stop subagent</button>` : ''}</div>
  </div>`
}
function mdTable(md) {
  const rows = md.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('|---'))
  const cells = (l) =>
    l
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
  return `<table><tr>${cells(rows[0])
    .map((c) => `<th>${esc(c)}</th>`)
    .join('')}</tr>${rows
    .slice(1)
    .map(
      (r) =>
        `<tr>${cells(r)
          .map((c) => `<td class="mono" style="font-size:12px">${esc(c)}</td>`)
          .join('')}</tr>`
    )
    .join('')}</table>`
}

/* ---------------- Sidebar ---------------- */
function mainAgentState() {
  const t = R.turn
  if (R.approvals.length || R.prespawn) {
    return 'ask'
  }
  if (!t) {
    return 'idle'
  }
  if (t.state === 'working' || t.state === 'stopping') {
    return 'working'
  }
  if (t.state === 'unverifiable') {
    return 'unverifiable'
  }
  return 'done'
}
function mainExcerpt() {
  const t = R.turn
  if (R.approvals.length) {
    return 'Waiting for you'
  }
  if (R.prespawn) {
    return `Wants to start ${R.prespawn.items.length} subagents`
  }
  if (!t) {
    return 'Done. PR #848 fixes two cells'
  }
  if (t.state === 'unverifiable') {
    return "Couldn't confirm the stop"
  }
  if (t.state === 'stopping') {
    return 'Stopping…'
  }
  if (t.state === 'stopped') {
    return `Stopped after ${fmtDur(t.dur)}`
  }
  if (t.state === 'ended') {
    return 'Session ended'
  }
  if (t.state === 'settled') {
    return 'Done. PR #848 fixes two cells'
  }
  return R.now ? R.now.desc : 'Splitting by provider…'
}
function needsYou() {
  const rows = []
  if (R.approvals.length) {
    const a = R.approvals[0]
    const t = findTool(a.toolId)
    rows.push({
      dot: 'ask',
      title: 'Matrix audit',
      sub: a.kind === 'bash' ? `Run ${t.cmd}?` : `Edit ${t.file}?`,
      wait: since(a.at),
      approval: S.inlineAllow && R.approvals.length === 1 ? { a, t } : null
    })
  }
  if (R.prespawn) {
    rows.push({
      dot: 'ask',
      title: 'Matrix audit',
      sub: `Wants to start ${R.prespawn.items.length} subagents`
    })
  }
  rows.push({
    dot: 'ask',
    title: 'Gmail RSpec',
    sub: 'Codex asks: push to a branch or main?',
    wait: '14m'
  })
  if (R.turn?.state === 'unverifiable') {
    rows.push({
      dot: 'hollow',
      title: 'Matrix audit',
      sub: R.turn.ssh ? 'Lost contact with the host' : "Couldn't confirm the stop",
      uncounted: true
    })
  }
  return rows
}
function needRow(n) {
  const ap = n.approval
  return `<div class="need ${ap ? 'can-answer eth' : ''}"><span class="dot ${n.dot}"></span><span class="t"><b>${n.title}</b><span class="s">${esc(n.sub)}</span>
    ${
      ap
        ? `<span class="exp"><span class="blk"><pre>${ap.a.kind === 'bash' ? hiCmd(ap.t.cmd) : esc(ap.t.file)}</pre></span>
          <span class="row"><button class="xbtn primary" data-act="approve" data-arg="once">Allow <kbd>1</kbd></button><button class="xbtn" data-act="peek-close">Open</button><span class="cap">${AGENT()} is paused · ${since(ap.a.at)}</span></span></span>`
        : ''
    }</span>${n.wait ? `<span class="wait">${n.wait}</span>` : ''}</div>`
}

function sidebar() {
  const w = S.sbW
  const base = S.view === 'baseline'
  const st = mainAgentState()
  const mainIcon =
    st === 'working'
      ? ic('loader', 's3 spin')
      : `<span class="dot ${st === 'ask' ? 'ask' : st === 'unverifiable' ? 'hollow' : st}"></span>`
  const excerpt = mainExcerpt()
  let agents = ''
  if (base) {
    agents += `<div class="ag"><span class="claude-mark">✳</span><span class="who">${AGENT()} Chat</span><span class="ex">- ${esc(excerpt)}</span><span class="mono" style="font-size:11px">${MAIN_MODEL().split('·')[0]}</span><span>22h</span></div>`
    agents += R.subs
      .map(
        (s) =>
          `<div class="ag base-child">${s.state === 'working' ? ic('loader', 's3 spin') : '<span class="dot done"></span>'}<span class="ex">${esc(s.label)} <span style="opacity:.6">- ${s.type}</span></span><span>2m</span></div>`
      )
      .join('')
  } else {
    agents += `<div class="ag clickable" data-act="peek-close">${mainIcon}<span class="who">${AGENT()} Chat</span><span class="ex">${esc(excerpt)}</span>${w >= 280 ? `<span class="mchip eth">${MAIN_MODEL().replace('high', 'hi')}</span>` : ''}</div>`
    if (R.subs.length) {
      const order = { failed: 0, working: 1, done: 2, stopped: 3 }
      const sorted = [...R.subs].sort((a, b) => order[a.state] - order[b.state])
      const shown = R.childMore ? sorted : sorted.slice(0, 3)
      agents += shown
        .map(
          (s) =>
            `<div class="ag child clickable eth" data-act="peek" data-arg="${s.id}" data-peek="${R.peek === s.id}">${subStateIcon(s)}<span class="who">${esc(s.short)}</span><span class="ex">${esc(s.state === 'working' ? s.acts[s.actIdx] : s.result)}</span>${w >= 280 ? `<span class="mchip">${SUB_MODEL(s).replace('med', 'md')}</span>` : ''}</div>`
        )
        .join('')
      if (sorted.length > 3) {
        agents += `<div class="ag child"><button class="more" data-act="child-more">${R.childMore ? 'Show less' : `+${sorted.length - 3} more`}</button></div>`
      }
    }
  }
  const needs = base ? [] : needsYou()
  const counted = needs.filter((n) => !n.uncounted).length
  return `<aside class="sb ${w < 280 ? 'narrow' : ''}" style="width:${w}px">
    <div class="sb-top"><div class="sb-search">${ic('search', 's35')} Search<kbd>${MOD}J</kbd></div></div>
    <div class="sb-scroll">
      ${needs.length ? `<div class="sb-sec">Needs you <span class="n">· ${counted}</span></div>${needs.map(needRow).join('')}<div class="sb-hr"></div>` : ''}
      ${R.inbox ? `<div class="sb-sec">Inbox <span class="n muted">· ${R.inbox}</span></div><div class="sb-hr"></div>` : ''}
      <div class="sb-sec">Projects</div>
      <div class="sb-proj">LLM Gateway</div>
      <div class="ws" data-current="true"><span class="rail"></span><span class="nm">Matrix audit</span><span class="key">ETH-40</span>${base ? '' : '<span class="chip-n" title="1 idle agent">+1</span>'}<span class="ago">now</span></div>
      ${agents}
      <div class="ws"><span class="rail"></span><span class="nm">Gmail RSpec</span><span class="key">SRV-109</span>${base ? '' : `<span class="chip-n">${ic('bot', 's3')}3 ${ic('loader', 's3 spin')}</span><span class="dot ask"></span>`}<span class="ago">12m</span></div>
      ${
        base
          ? ['Portkey', 'Bifrost', 'TrueFoundry']
              .map(
                (n) =>
                  `<div class="ag base-child">${ic('loader', 's3 spin')}<span class="ex">Gmail cells: ${n} <span style="opacity:.6">- general-purpose</span></span><span>12m</span></div>`
              )
              .join('')
          : ''
      }
      <div class="ws"><span class="rail"></span><span class="nm">Rotate provider keys</span><span class="ago">2d</span></div>
      <div class="sb-proj">Orca</div>
      <div class="ws"><span class="rail"></span><span class="nm">Sidebar redesign</span><span class="key">ETH-31</span><span class="ago">2h</span></div>
      <div class="ws"><span class="rail"></span><span class="nm">Review #6012 command palette</span><span class="ago">1d</span></div>
    </div>
  </aside>`
}

/* ---------------- Pane ---------------- */
function chatBody() {
  if (S.scene === 'linear' && !R.items.length) {
    return `<div class="empty"><span class="t">New ${AGENT()} chat in Matrix audit</span><span>Roots: clio-llm-gateway · ⎇ eth-40-matrix</span>
      ${S.view === 'ledger' ? '' : '<span>(Today: linked issues never reach the agent.)</span>'}</div>`
  }
  let out = ''
  if (S.view === 'baseline') {
    out = baselineItems(R.items)
  } else {
    let folded = false
    for (const it of R.items) {
      if (it.t === 'turnh') {
        out += turnHeader()
        folded = R.turn && ['settled', 'stopped', 'ended'].includes(R.turn.state) && !R.turnOpen
        continue
      }
      if (folded && !it.keep && it.t !== 'followups') {
        continue
      }
      out += ledgerItem(it)
    }
  }
  return `<div class="col" id="transcript">${out}</div>`
}

function pane() {
  const split = S.chatW >= 900
  const takeover = R.peek && !split && S.view === 'ledger'
  const peek = R.peek && S.view === 'ledger' ? peekPane(takeover) : ''
  return `<section class="pane ${S.chatW < 600 ? 'narrow' : ''}" style="width:${S.chatW}px">
    <div class="tabs">
      <div class="tb on">${S.provider === 'claude' ? '<span class="claude-mark" style="color:#d97757">✳</span>' : ic('term', 's3')} ${AGENT()} Chat ${S.view === 'ledger' ? `<span class="mchip eth">${MAIN_MODEL()}</span>` : ''}</div>
      <div class="tb">${ic('fileText', 's3')} matrix.yml</div>
      <div class="tb">${ic('term', 's3')} zsh</div>
      <span class="sp"></span>
      <button class="ic" data-act="find" title="Find in chat (${MOD}F)">${ic('search', 's35')}</button>
      <button class="ic" data-act="noop">${ic('dots', 's35')}</button>
    </div>
    <div class="split">
      ${
        takeover
          ? ''
          : `<div class="chat">
        ${R.find.open ? `<div class="findbar">${ic('search', 's3')}<input id="find" placeholder="Find in chat" value="${esc(R.find.q)}"/><span class="ct" id="findct"></span><button class="ib" data-act="find-close">${ic('x', 's3')}</button></div>` : ''}
        <div class="scroll" data-scroll="chat">${chatBody()}</div>
        ${dock()}
        ${composer()}
      </div>`
      }
      ${peek}
    </div>
  </section>`
}

/* ---------------- Render ---------------- */
function render(opts = {}) {
  const app = $('#app')
  const keep = {}
  $$('[data-scroll]', app).forEach(
    (e) =>
      (keep[e.dataset.scroll] = {
        top: e.scrollTop,
        bottom: e.scrollHeight - e.scrollTop - e.clientHeight < 40
      })
  )
  const ae = document.activeElement
  const focusId = ae && app.contains(ae) && ae.id ? ae.id : null
  const sel = focusId && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null
  const denyVal = $('#denynote')?.value

  app.dataset.theme = S.theme
  app.className = ['app', S.gray && 'gray', S.reduced && 'reduced', S.highlight && 'hl']
    .filter(Boolean)
    .join(' ')
  app.style.width = `${S.sbW + S.chatW + 2}px`
  app.innerHTML =
    sidebar() +
    pane() +
    (R.toast ? `<div class="toast">${R.toast}</div>` : '') +
    (R.capture ? captureBox() : '')

  $$('[data-scroll]', app).forEach((e) => {
    const k = keep[e.dataset.scroll]
    const mode = opts.scrollTo
    if (mode && e.dataset.scroll === 'chat') {
      if (mode === 'top') {
        e.scrollTop = 0
      } else if (mode === 'bottom') {
        e.scrollTop = e.scrollHeight
      } else if (mode === 'new') {
        const n = $('.newln', e)
        e.scrollTop = n ? n.offsetTop - 60 : 0
      }
    } else if (k) {
      e.scrollTop = k.bottom && e.dataset.scroll !== 'dock' ? e.scrollHeight : k.top
    }
  })
  if (focusId) {
    const el = document.getElementById(focusId)
    if (el) {
      el.focus()
      if (sel && 'setSelectionRange' in el) {
        el.setSelectionRange(sel[0], sel[1])
      }
    }
  }
  if (denyVal !== undefined && $('#denynote')) {
    $('#denynote').value = denyVal
  }
  applyFind()
  renderPopover()
  syncApprovalBody()
  renderControls()
  renderNotes()
}

// Linear chip popover: click-open (interactive content never lives in a hover card).
function renderPopover() {
  $('#pop')?.remove()
  const anchor = R.chipPop && $(`[data-act="chip-pop"][data-arg="${R.chipPop}"]`)
  if (!anchor) {
    return
  }
  const c = R.linear.chips.find((x) => x.key === R.chipPop)
  const sum = Object.entries(c.parts).reduce((a, [k, on]) => a + (on ? c.tokens[k] : 0), 0)
  const d = document.createElement('div')
  d.className = 'hc'
  d.id = 'pop'
  d.innerHTML = `<label class="opt" style="font-weight:500"><input type="checkbox" data-act="linear-include" data-arg="${c.key}" ${c.included ? 'checked' : ''}/> Include ${c.key} in the first message</label>
    <div style="color:var(--c-faint);margin:0 0 4px 22px">${esc(c.title)}</div>
    ${[
      ['description', 'Description', ''],
      ['comments', 'Comments', c.counts.comments],
      ['subissues', 'Sub-issues', c.counts.subissues],
      ['links', 'Links', c.counts.links]
    ]
      .map(
        ([k, l, n]) =>
          `<label class="opt" style="padding-left:22px;${c.included ? '' : 'opacity:.45'}"><input type="checkbox" data-act="linear-part" data-arg="${c.key}:${k}" ${c.parts[k] ? 'checked' : ''} ${c.included ? '' : 'disabled'}/> ${l}<span class="n">${n || ''}</span></label>`
      )
      .join('')}
    <div class="ft"><span>About ${(sum / 1000).toFixed(1)}k tokens</span><span>Shown on your message as sent</span></div>`
  document.body.appendChild(d)
  copyTheme(d)
  const r = anchor.getBoundingClientRect()
  d.style.left = `${Math.max(8, r.left)}px`
  d.style.top = `${r.top - d.offsetHeight - 8}px`
}

// The dock repeats the command only while the transcript row is out of view.
function syncApprovalBody() {
  const card = $('[data-approval]')
  const sc = $('[data-scroll="chat"]')
  if (!card || !sc) {
    return
  }
  const row = $(`[data-tool="${card.dataset.for}"]`, sc)
  if (!row) {
    return (card.dataset.offscreen = 'true')
  }
  const a = row.getBoundingClientRect()
  const b = sc.getBoundingClientRect()
  card.dataset.offscreen = String(a.bottom < b.top + 20 || a.top > b.bottom - 20)
}

function applyFind() {
  const q = R.find.q.trim()
  const ct = $('#findct')
  if (!R.find.open || !q) {
    if (ct) {
      ct.textContent = ''
    }
    return
  }
  const root = $('#transcript')
  if (!root) {
    return
  }
  let n = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits = []
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeValue.toLowerCase().includes(q.toLowerCase())) {
      hits.push(node)
    }
  }
  for (const node of hits) {
    const parts = node.nodeValue.split(
      new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    )
    const frag = document.createDocumentFragment()
    for (const p of parts) {
      if (p.toLowerCase() === q.toLowerCase()) {
        const m = document.createElement('mark')
        m.className = 'hit'
        m.textContent = p
        frag.appendChild(m)
        n++
      } else {
        frag.appendChild(document.createTextNode(p))
      }
    }
    node.parentNode.replaceChild(frag, node)
  }
  if (ct) {
    ct.textContent = n ? `${n} found` : 'None'
  }
}

function captureBox() {
  const c = R.capture
  return `<div class="capture eth">
    <input id="capture" placeholder="Capture a follow-up…" value="${esc(c.text)}" />
    <div class="ctx">From <b>Matrix audit</b> · ${AGENT()} Chat · step “${esc(c.step)}”${c.quote ? `<br/><q>${esc(c.quote)}</q>` : ''}</div>
    <div class="ft"><span>Goes to the Inbox. The running chat is not touched.</span><span><button class="xbtn primary" data-act="capture-save">Add to Inbox <kbd>⏎</kbd></button></span></div>
  </div>`
}

/* ---------------- Actions ---------------- */
function findTool(id) {
  for (const it of R.items) {
    if (it.t === 'tool' && it.tool.id === id) {
      return it.tool
    }
    if (it.t === 'run') {
      const t = it.tools.find((x) => x.id === id)
      if (t) {
        return t
      }
    }
  }
  return null
}
function stamp() {
  const d = new Date()
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function addApproval(kind) {
  if (!R.turn || R.turn.state !== 'working') {
    R.turn = { state: 'working', startedAt: ago(120), steps: 12 }
  }
  R.now = null
  const id = `ap${R.nextId++}`
  const tool =
    kind === 'bash'
      ? {
          id,
          kind: 'bash',
          desc: 'Prepare the test database',
          cmd: 'bin/rails db:prepare RAILS_ENV=test',
          state: 'waiting'
        }
      : {
          id,
          kind: 'edit',
          file: 'spec/matrix/bifrost_spec.rb',
          add: 4,
          del: 1,
          state: 'waiting',
          diff: [
            ['n', '  it "matches published input price" do'],
            ['d', '    expect(cell.input).to eq(2.5)'],
            ['a', '    expect(cell.input).to eq(2.0)'],
            ['a', '    expect(cell.updated_on).to be >= Date.new(2026, 10, 1)']
          ]
        }
  R.items.push({ t: 'tool', tool })
  if (!R.approvals.length) {
    R.open.add(id)
  }
  R.approvals.push({
    toolId: id,
    kind,
    at: now(),
    ruleClaude: kind === 'bash' ? 'Bash(bin/rails db:*)' : null,
    reason: kind === 'bash' ? 'Needs to write the local test database.' : 'Edits a spec file.'
  })
  R.approvalFolded = false
}

function resolveApproval(how, note) {
  const a = R.approvals.shift()
  if (!a) {
    return
  }
  const t = findTool(a.toolId)
  R.denyOpen = false
  R.open.delete(t.id)
  if (how === 'deny') {
    t.state = 'denied'
    t.deniedAt = stamp()
    t.denyNote = note
    if (note) {
      R.items.push({ t: 'denied-note', text: note })
    }
  } else {
    t.reviewNow =
      how === 'session' && S.provider === 'claude'
        ? {
            by: 'rule',
            at: stamp(),
            how: 'Session rule, added by you',
            rule: a.ruleClaude || 'Edit(spec/**)'
          }
        : {
            by: 'you',
            at: stamp(),
            how: how === 'session' ? 'Allowed for this session' : 'Allowed once'
          }
    t.state = 'running'
    t.startedAt = now()
    later(1800, () => {
      t.state = 'done'
      t.dur = 1.8
      t.exit = 0
      if (t.kind === 'bash') {
        t.out = ['Database "gateway_test" is up to date.']
      }
      render()
    })
  }
  if (R.approvals.length) {
    R.open.add(R.approvals[0].toolId)
  } else {
    R.now = null
  }
  render()
}

function doStop(outcome = R.stopOutcome) {
  const t = R.turn
  if (!t || t.state !== 'working') {
    return
  }
  t.state = 'stopping'
  render()
  if (S.view === 'baseline') {
    R.items.push({ t: 'stopline', text: 'Cancellation requested.' })
    t.state = 'working'
    render()
    return
  }
  later(outcome === 'confirm' ? 1500 : 4000, () => {
    if (outcome === 'confirm') {
      confirmStopped()
    } else {
      t.state = 'unverifiable'
      render()
    }
  })
}
function confirmStopped(ended) {
  const t = R.turn
  t.dur = (now() - t.startedAt) / 1000
  t.state = ended ? 'ended' : 'stopped'
  R.subs.forEach((s) => {
    if (s.state === 'working') {
      s.state = 'stopped'
      s.settledAt = now()
      s.result = 'Stopped'
    }
  })
  for (const it of R.items) {
    if (it.t === 'tool' && it.tool.state === 'running') {
      it.tool.state = 'interrupted'
      it.tool.dur = Math.round((now() - it.tool.startedAt) / 1000)
    }
  }
  R.now = null
  render()
}

function startSpawn(list) {
  R.subs = list.map((x, i) => {
    const src = SUBAGENTS[i % 4]
    const sa = {
      ...src,
      id: i < 4 ? src.id : `sx${i}`,
      label: x.label,
      short: x.label.replace('Matrix cells: ', ''),
      failed: i === 3
    }
    const s = subFrom(sa, 1 + i, { actIdx: 0, frac: 0.05 })
    if (i === 3) {
      s.quiet = true
      s.lastEventAt = ago(50)
    }
    return s
  })
  R.items.push({ t: 'batch', id: `batch${R.nextId++}`, state: 'working' })
  R.showPlan = true
  R.planIdx = 2
  startLiveEngine({ fast: true, failQuiet: 14000 })
}

function setupMenus(btn) {
  const kind = btn.dataset.menu
  const r = btn.getBoundingClientRect()
  const html =
    kind === 'perm'
      ? `<div class="mh">Permissions for this chat</div>${PERMS[S.provider]
          .map(
            ([id, icn, label, d]) =>
              `<button class="mi ${id === 'full' ? 'warn' : ''}" data-act="set-perm" data-arg="${id}"><span class="ck">${S.perm === id ? ic('check', 's3') : ''}</span><span>${ic(icn, 's3')} <span class="t">${label}</span><span class="d">${d}</span></span></button>`
          )
          .join('')}<div class="mf">From upstream. Default: Settings › Agents.</div>`
      : `<div class="mh">Subagents for this chat</div>${DELEG.map(([id, label, d]) => `<button class="mi" data-act="set-deleg" data-arg="${id}"><span class="ck">${S.deleg === id ? ic('check', 's3') : ''}</span><span><span class="t">${label}</span><span class="d">${d}</span></span></button>`).join('')}
      <div class="mf">${S.provider === 'claude' ? 'Enforced: a hook checks every Task call.' : 'Instruction only: Codex has no spawn hook, so this is added to its instructions.'}<br/>Default: Settings › Agents.</div>`
  closeMenu()
  const m = document.createElement('div')
  m.className = 'menu'
  m.id = 'menu'
  m.innerHTML = html
  m.dataset.theme = S.theme
  document.body.appendChild(m)
  copyTheme(m)
  const h = m.offsetHeight
  m.style.left = `${r.left}px`
  m.style.top = `${r.top - h - 6}px`
  btn.setAttribute('aria-expanded', 'true')
}
function closeMenu() {
  $('#menu')?.remove()
}
function copyTheme(el) {
  const cs = getComputedStyle($('#app'))
  for (const v of [
    '--popover',
    '--fg',
    '--muted',
    '--border',
    '--border-strong',
    '--accent',
    '--shadow-floating',
    '--c-fg',
    '--c-faint',
    '--c-warning',
    '--destructive',
    '--c-hover',
    '--bg',
    '--canvas'
  ]) {
    el.style.setProperty(v, cs.getPropertyValue(v))
  }
  if (S.gray) {
    el.style.filter = 'grayscale(1)'
  }
}

/* hover cards */
let hcTimer = null
function showHc(anchor) {
  const key = anchor.dataset.hc
  let html = ''
  if (key.startsWith('review:')) {
    html = reviewCard(findTool(key.slice(7)) || {})
  } else if (key === 'sbx') {
    html = `<div class="cap warn"><span>Outside sandbox</span></div><div>This command ran with <span class="mono">dangerouslyDisableSandbox</span>. It could reach the network and files outside the Workspace roots.</div>`
  }
  if (!html) {
    return
  }
  hideHc(true)
  const d = document.createElement('div')
  d.className = 'hc'
  d.id = 'hc'
  d.innerHTML = html
  document.body.appendChild(d)
  copyTheme(d)
  const r = anchor.getBoundingClientRect()
  const left = Math.min(window.innerWidth - 316, Math.max(8, r.right - 300))
  const top = r.top - d.offsetHeight - 8 > 8 ? r.top - d.offsetHeight - 8 : r.bottom + 8
  d.style.left = `${left}px`
  d.style.top = `${top}px`
  d.addEventListener('mouseenter', () => clearTimeout(hcTimer))
  d.addEventListener('mouseleave', () => hideHc())
}
function hideHc(now_) {
  clearTimeout(hcTimer)
  if (now_) {
    $('#hc')?.remove()
  } else {
    hcTimer = setTimeout(() => $('#hc')?.remove(), 160)
  }
}

const ACTS = {
  noop() {},
  toggle(id) {
    if (!R.open.delete(id)) {
      R.open.add(id)
    }
    render()
  },
  'turn-toggle'() {
    R.turnOpen = !R.turnOpen
    render()
  },
  jump() {
    const sc = $('[data-scroll="chat"]')
    sc.scrollTop = sc.scrollHeight
  },
  peek(id) {
    if (S.view === 'baseline') {
      return toast("Today this row isn't clickable. Ledger opens the subagent's own transcript.")
    }
    R.peek = R.peek === id ? null : id
    R.peekPromptOpen = false
    render()
  },
  'peek-close'() {
    R.peek = null
    render()
  },
  'peek-step'(d) {
    const i = R.subs.findIndex((s) => s.id === R.peek) + Number(d)
    if (R.subs[i]) {
      R.peek = R.subs[i].id
    }
    render()
  },
  'peek-tab'() {
    toast(
      `Opens “${R.subs.find((s) => s.id === R.peek)?.short}” as its own tab. Useful for Codex subagents that outlive the turn.`
    )
  },
  'peek-prompt'() {
    R.peekPromptOpen = !R.peekPromptOpen
    render()
  },
  'stop-sub'(id) {
    const s = R.subs.find((x) => x.id === id)
    s.state = 'stopped'
    s.settledAt = now()
    s.result = 'Stopped by you'
    render()
  },
  'child-more'() {
    R.childMore = !R.childMore
    render()
  },
  'lanes-toggle'() {
    R.lanesOpen = !lanesOpenNow()
    render()
  },
  'plan-toggle'() {
    R.planOpen = !R.planOpen
    render()
  },
  approve(how) {
    resolveApproval(how)
  },
  deny() {
    if (S.view === 'baseline') {
      return resolveApproval('deny')
    }
    R.denyOpen = true
    render()
    $('#denynote')?.focus()
  },
  'deny-send'() {
    resolveApproval('deny', $('#denynote')?.value.trim())
  },
  'fold-approval'() {
    R.approvalFolded = true
    render()
  },
  'unfold-approval'() {
    R.approvalFolded = false
    render()
  },
  'next-approval'() {
    R.open.delete(R.approvals[0].toolId)
    R.approvals.push(R.approvals.shift())
    R.open.add(R.approvals[0].toolId)
    render()
  },
  'spawn-check'(i) {
    R.prespawn.items[i].checked = !R.prespawn.items[i].checked
    render()
  },
  'spawn-start'() {
    const chosen = R.prespawn.items.filter((x) => x.checked)
    const skipped = R.prespawn.items.length - chosen.length
    R.prespawn = null
    if (skipped) {
      R.items.push({
        t: 'notice',
        icon: 'bot',
        html: `Started ${chosen.length}; ${AGENT()} was told to check the other ${skipped} itself after these finish.`
      })
    }
    startSpawn(chosen)
    render()
  },
  'spawn-all'() {
    const all = R.prespawn.items
    R.prespawn = null
    startSpawn(all)
    render()
  },
  'spawn-none'() {
    R.prespawn = null
    R.items.push({
      t: 'notice',
      icon: 'bot',
      html: `No subagents started. ${AGENT()} is checking the list itself.`
    })
    R.items.push({
      t: 'tool',
      tool: {
        id: 'w-inline',
        kind: 'web',
        mode: 'fetch',
        url: 'portkey.ai/docs/pricing',
        state: 'running',
        startedAt: now()
      }
    })
    R.now = { desc: 'Fetching portkey.ai/docs/pricing', startedAt: now(), tail: [] }
    render()
  },
  stop() {
    doStop()
  },
  'retry-stop'() {
    R.turn.state = 'working'
    R.turn.ssh = false
    doStop('confirm')
  },
  'end-session'() {
    confirmStopped(true)
  },
  send() {
    const text = ($('#composer')?.value || '').trim()
    if (R.turn && (R.turn.state === 'working' || R.turn.state === 'unverifiable')) {
      if (!text) {
        return
      }
      R.queue.push(text)
      R.composer = ''
      return render()
    }
    if (S.scene === 'linear' && !R.linear.sent) {
      const inc = R.linear.chips.filter((c) => c.included)
      R.linear.sent = true
      const id = `u${R.nextId++}`
      R.items.push({
        t: 'user',
        id,
        text: text || USER_ASK,
        time: 'now',
        ctx:
          S.view === 'ledger' && inc.length
            ? inc.map((c) => ({
                ...c,
                summary: Object.entries(c.parts)
                  .filter(([, on]) => on)
                  .map(([k]) =>
                    k === 'comments'
                      ? `${c.counts.comments} comments`
                      : k === 'subissues'
                        ? `${c.counts.subissues} sub-issues`
                        : k
                  )
                  .join(', ')
              }))
            : null
      })
      R.items.push({ t: 'turnh' })
      R.items.push({
        t: 'prose',
        html:
          S.view === 'ledger' && inc.length
            ? 'ETH-40 says Bifrost changed input prices on Oct 1 and Cloudflare needs a login. Starting with those two.'
            : 'Let me look at the matrix first.'
      })
      R.items.push({
        t: 'tool',
        tool: { id: 'lr1', kind: 'read', file: 'config/matrix.yml', range: 'L1–412' }
      })
      R.turn = { state: 'working', startedAt: now(), steps: 2 }
      R.composer = ''
      return render()
    }
    if (text) {
      R.items.push({ t: 'user', text, time: 'now' })
      R.composer = ''
      R.turn = { state: 'working', startedAt: now(), steps: 0 }
      R.items.push({ t: 'turnh' })
      render({ scrollTo: 'bottom' })
    }
  },
  'chip-pop'(key) {
    R.chipPop = R.chipPop === key ? null : key
    render()
  },
  'spawn-more'() {
    R.spawnMore = true
    render()
  },
  'ctx-toggle'(id) {
    if (!R.ctxOpen.delete(id)) {
      R.ctxOpen.add(id)
    }
    render()
  },
  'send-update'() {
    R.linear.drift = false
    R.queue.push('ETH-40 changed: “Cloudflare page is public again.”')
    render()
  },
  'fu-toggle'() {
    R.fuOpen = !R.fuOpen
    render()
  },
  'fu-send'(i) {
    R.fuSent.add(Number(i))
    R.inbox++
    toast(`${ic('inbox', 's35')} Added to Inbox · Matrix audit`)
  },
  'capture-save'() {
    R.capture = null
    R.inbox++
    toast(`${ic('inbox', 's35')} Added to Inbox · Matrix audit. The chat wasn't touched.`)
  },
  rewind() {
    toast(
      `${ic('rewind', 's35')} Rewind comes from upstream: confirm, then the chat returns to before this message (Claude forks, Codex reverts the thread).`,
      4500
    )
  },
  find() {
    R.find.open = true
    render()
    $('#find')?.focus()
  },
  'find-close'() {
    R.find = { open: false, q: '' }
    render()
  },
  'set-perm'(id) {
    S.perm = id
    closeMenu()
    render()
  },
  'set-deleg'(id) {
    S.deleg = id
    closeMenu()
    if (S.scene === 'delegation') {
      setScene('delegation')
    } else {
      render()
    }
  },
  'queue-drop'(i) {
    R.queue.splice(Number(i), 1)
    render()
  },
  'queue-edit'() {
    toast('Queued messages stay editable until they send (upstream).')
  },
  'copy-raw'() {
    toast('Raw event copied.')
  },
  copy() {
    toast('Copied.')
  }
}

/* ---------------- Simulations (controls) ---------------- */
const SIMS = {
  'ask-bash'() {
    if (!['approval', 'live', 'stop'].includes(S.scene)) {
      setScene('approval')
    } else {
      addApproval('bash')
      render({ scrollTo: 'bottom' })
    }
  },
  'ask-edit'() {
    if (!['approval', 'live'].includes(S.scene)) {
      setScene('approval')
    }
    addApproval('edit')
    render({ scrollTo: 'bottom' })
  },
  review(kind) {
    S.provider = 'codex'
    S.perm = 'auto'
    if (!R.turn) {
      setScene('settled')
    }
    if (kind === 'unmatched') {
      R.items.push({
        t: 'notice',
        icon: 'shieldCheck',
        html: 'Auto-review approved: <span style="color:var(--c-faint)">reading ~/.codex/config.toml is a local read with no side effects.</span>'
      })
    } else {
      const id = `rv${R.nextId++}`
      const map = {
        low: {
          verdict: 'approved',
          risk: 'low',
          auth: 'high',
          reason: 'Listing files in the workspace is a read-only local action.'
        },
        medium: {
          verdict: 'approved',
          risk: 'medium',
          auth: 'high',
          reason:
            'Installing gems changes the lockfile and reaches rubygems.org; the user asked for dependency updates.'
        },
        deny: {
          verdict: 'denied',
          risk: 'high',
          auth: 'low',
          reason: 'Force-pushing to main was not requested and would rewrite shared history.'
        }
      }[kind]
      const tool = {
        low: {
          id,
          kind: 'bash',
          desc: 'List spec files',
          cmd: 'ls spec/matrix',
          exit: 0,
          dur: 0.2,
          out: ['bifrost_spec.rb', 'portkey_spec.rb', 'truefoundry_spec.rb']
        },
        medium: {
          id,
          kind: 'bash',
          desc: 'Update the tzinfo-data gem',
          cmd: 'bundle update tzinfo-data',
          exit: 0,
          dur: 8.4,
          out: ['Bundle updated!']
        },
        deny: {
          id,
          kind: 'bash',
          desc: 'Force-push to main',
          cmd: 'git push --force origin main',
          state: 'denied',
          deniedAt: stamp()
        }
      }[kind]
      tool.review = {
        codex: { ...map, at: stamp() },
        claude: { by: 'you', at: stamp(), how: 'Allowed once' }
      }
      R.items.push({ t: 'tool', tool })
    }
    R.turnOpen = true
    render({ scrollTo: 'bottom' })
  },
  spawn4() {
    setScene('live')
    clearTimers()
    R.items = R.items.filter((i) => i.t !== 'batch')
    startSpawn(SUBAGENTS.map((s) => ({ label: s.label })))
    render({ scrollTo: 'bottom' })
  },
  spawn9() {
    setScene('delegation')
  },
  plan() {
    if (!R.showPlan) {
      setScene('live')
    }
    R.planIdx = (R.planIdx + 1) % PLAN.length
    R.planOpen = true
    render()
  },
  'stop-ok'() {
    if (S.scene !== 'stop') {
      setScene('stop')
    }
    doStop('confirm')
  },
  'stop-stuck'() {
    if (S.scene !== 'stop') {
      setScene('stop')
    }
    doStop('stuck')
  },
  ssh() {
    if (!R.turn || R.turn.state !== 'working') {
      setScene('live')
    }
    R.turn.state = 'unverifiable'
    R.turn.ssh = true
    render()
  },
  frame() {
    if (!R.turn) {
      setScene('settled')
    }
    R.items.push({
      t: 'frame',
      frame: {
        kind: 'message:system:compact_boundary',
        payload: '{"subtype":"compact_boundary"}',
        ledger: {
          icon: 'sparkle',
          html: 'Context compacted <span style="color:var(--c-faint)">· 182k → 31k tokens</span>'
        }
      }
    })
    R.turnOpen = true
    render({ scrollTo: 'bottom' })
  },
  queue() {
    if (!R.turn || R.turn.state !== 'working') {
      setScene('live')
    }
    R.queue.push("dont run the full test suite, it'll run in CI. just push it up")
    render()
  },
  edited() {
    if (S.scene !== 'linear' || !R.linear.sent) {
      setScene('linear')
      ACTS.send()
    }
    R.linear.drift = true
    render()
  },
  away() {
    setScene('away')
  },
  capture() {
    R.capture = {
      text: '',
      step: 'Run the pricing matrix specs',
      quote: (window.getSelection()?.toString() || FOLLOWUPS[1]).slice(0, 140)
    }
    render()
    $('#capture')?.focus()
  },
  reset() {
    setScene(S.scene)
  }
}

/* ---------------- Controls + notes ---------------- */
function renderControls() {
  $$('.controls [data-set]').forEach((b) => {
    const [k, v] = b.dataset.set.split(':')
    b.setAttribute('aria-pressed', String(String(S[k]) === v))
  })
  $$('.controls [data-check]').forEach((c) => (c.checked = !!S[c.dataset.check]))
}

const T_UP = '<span class="tag up">upstream</span>'
const T_ETH = '<span class="tag eth">Ether</span>'
const NOTES = {
  live: `<h2>Live turn: "what the heck is it working on?"</h2>
    <p>The <b>dock</b> above the composer holds the present and never scrolls away. From top to bottom it shows the plan (${PLAN.length} steps), the subagent lanes and the <b>now line</b> with the running step's own elapsed time and the last few lines of its output. The <b>sticky turn header</b> keeps "Working 4m · 23 steps · 4 subagents · Jump to now" visible while you scroll back through the transcript.</p>
    <table><tr><th>Element</th><th>Answers</th><th>Source</th></tr>
    <tr><td>Now line with per-step elapsed time and output tail</td><td>"what is it working on", "Worked for 6m 33s" opacity</td><td>${T_UP} activity line, ${T_ETH} per-step elapsed time and output tail</td></tr>
    <tr><td>Subagent lanes: model·effort and the step each one is on</td><td>subagent visibility, model/effort</td><td>${T_ETH} (replaces the "4 agents — 4 working" strip)</td></tr>
    <tr><td>Click a lane, the batch row, or a sidebar child row → peek</td><td>"I can't click on these"</td><td>${T_ETH}. Data: the child's journal rows filtered by <span class="mono">agentId</span></td></tr>
    <tr><td>Plan row</td><td>progress</td><td>${T_UP} docked task list, collapsed to one line</td></tr></table>
    <p>The transcript keeps the record (no live clocks there); the dock owns the present. Lanes start collapsed when there are more than 4, and the collapsed row names a failure if there is one.</p>
    <p>Try: click <b>Portkey</b>, then step siblings with <kbd>[</kbd> <kbd>]</kbd>; set Chat width to 720 to see the peek take over (a parent strip keeps the main agent's state and Stop); <b>Spawn 4</b> runs the lanes live (Cloudflare fails after about 14s); <b>Spawn 9</b> then "Start all 9" shows collapsed lanes.</p>`,
  settled: `<h2>Settled turn: every tool renderer</h2>
    <p>Each tool call is a <b>line with its own proof</b>: exit code, duration, diff counts, match counts. Expanding a line never shows JSON. You get the command (highlighted, heredocs unescaped), the output tail, the diff, or the matches. Approval is a 12px shield in the margin, shown on row hover unless it carries a warning; <b>hover a row, then the shield</b>. Switch Provider to <b>Codex</b> to see auto-review verdicts. The medium-risk one is amber, which is the only time approval uses colour.</p>
    <table><tr><th>Line</th><th>What to notice</th></tr>
    <tr><td>Commit, push branch, and open PR</td><td>The <b>Outside sandbox</b> chip surfaces <span class="mono">dangerouslyDisableSandbox</span>, which today is buried in JSON.</td></tr>
    <tr><td>Pushed eth-40-matrix · PR #848</td><td><span class="mono">code_change_published</span> as a sentence. <span class="mono">vcs_state_changed</span> is hidden (turn on "System events").</td></tr>
    <tr><td>linear save_comment ETH-40</td><td>MCP: the server is faint, the tool name and its identifying argument are prominent; args as a key/value table.</td></tr>
    <tr><td>Turn header</td><td>"Worked for 6m 33s · 3 commands · 1 file · +12 −3 · 1 failed": a receipt, not just a duration.</td></tr></table>
    <p>Flip <b>View → Baseline</b> to compare with today's rendering (amber cards, raw JSON, raw system rows).</p>`,
  approval: `<h2>Approvals: proportionate</h2>
    <p>The tool line being approved <b>auto-expands in the transcript</b>, because the command or diff <i>is</i> what you are approving. The docked bar is compact: <kbd>1</kbd> Allow, <kbd>2</kbd> Always allow (worded from the provider's real rule scope, e.g. <span class="mono">Bash(bin/rails db:*)</span>), <kbd>3</kbd> Deny… (opens "Tell Claude what to do instead"). <kbd>Esc</kbd> folds it to a strip so you can keep typing. <b>Needs you</b>: hover the approval row to answer it in place (command, Allow, Open) without switching Workspace; only a single plain approval qualifies. Anything session-wide opens the chat. The dock repeats the command only when its transcript row is scrolled out of view.</p>
    <p>After you answer, the line keeps a shield glyph whose hover card says who allowed it and how. Try <b>Agent asks (edit)</b> to queue a second approval ("1 of 2", <kbd>]</kbd>).</p>
    <p>${T_UP} has the approval card and its option set; ${T_ETH} restyles it into the dock bar, auto-expands the transcript line and adds the margin glyph.</p>`,
  delegation: `<h2>Delegation: "it spun up 9 subagents"</h2>
    <p>A <b>Subagents</b> chip in the composer (Off / Ask first / Auto up to N) sets the policy per chat. The global default lives in Settings › Agents. When the agent asks for more than the limit, Task calls that arrive within about 300ms batch into <b>one pre-spawn card</b>: pick which to start, start all, or "Do it without subagents" (denied with an instruction to continue inline).</p>
    <p>The menu and card say <b>how it is enforced</b>. Claude: a PreToolUse hook on Task, so the limit is real. Codex: no hook, so it is only an instruction. Switch Provider to see the caption change. Change the chip to <b>Off</b> or <b>Ask first</b> to see each path.</p>
    <p>${T_ETH} entirely. It is a separate fork-owned component, so upstream's permission picker stays untouched for clean merges.</p>`,
  linear: `<h2>Linear context the agent can actually see</h2>
    <p>A new chat in a Workspace with linked issues shows them as <b>chips in the composer</b>, included by default. Click a chip to include or leave it out and choose what goes in (description, comments, sub-issues, links), with a token estimate. On send, the context is a <b>visible, collapsible block on your message</b>, never a hidden system prompt. If the issue changes later: "Updated since sent · Send update".</p>
    <p>Try: click <b>ETH-40</b>, untick comments, send, then <b>Issue edited</b>. ${T_ETH} entirely; today linked issues never reach the agent (not upstream either).</p>`,
  stop: `<h2>Stop states: never an eternal spinner</h2>
    <p>One status line, never two that contradict each other. <b>Stop</b> → "Stopping…" (button disabled) → either <b>Stopped after 11m 47s</b> (the provider confirmed the turn ended) or, after 10s with no confirmation (20s over SSH; 4s in this mockup), <b>"Couldn't confirm the stop. The agent may still be running."</b> with Retry stop and End session. The spinner stops in that state, the sidebar shows a hollow dot, and Needs you lists it last without counting it. While unverifiable, Send becomes Queue.</p>
    <p>Flip to <b>Baseline</b> and Stop to reproduce today's bug: "Cancellation requested." and then "Working for…" forever. Root cause (backend): a message sent during the cancel stays <span class="mono">pending</span> forever, and any pending message counts as working. Upstream's stop fixes plus our pending-message settlement fix the engine; ${T_ETH} adds the honest states.</p>`,
  away: `<h2>Return after away: out of sight, out of mind</h2>
    <p>Above the unseen turns (${T_UP} "New" line) sits a <b>turn receipt</b> built only from events, not a model summary: commands, subagents, files changed, failures, PR opened, follow-ups. The work is folded; the answer stays visible. <b>Possible follow-ups</b> are things the agent mentioned in passing. One click sends each to the Desk <b>Inbox</b> without touching this chat's context. <b>Capture</b> (<kbd>${MOD}⇧K</kbd>) works on any selected text.</p>
    <p>${T_ETH}. This is the seed of 07_assistant: the same event facts later feed Needs you, a cross-Workspace "All agents" view and the assistant.</p>`
}
function renderNotes() {
  $('#notes').innerHTML = `${
    NOTES[S.scene] || ''
  }<h2>Keyboard</h2><p><kbd>${MOD}F</kbd> find in chat (${T_UP}) · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> answer an approval · <kbd>Esc</kbd> close the peek or fold the approval · <kbd>[</kbd> <kbd>]</kbd> sibling subagents in the peek · <kbd>${MOD}⇧K</kbd> capture to Inbox · hover a user message for Rewind (${T_UP})</p>
    <p style="color:#777">Tick "Highlight Ether" to outline everything this fork adds on top of upstream; that is the merge-maintenance surface.</p>`
}

/* ---------------- Wiring ---------------- */
document.addEventListener('click', (e) => {
  const setB = e.target.closest('[data-set]')
  if (setB) {
    const [k, v] = setB.dataset.set.split(':')
    S[k] = /^\d+$/.test(v) ? Number(v) : v
    if (k === 'scene' || k === 'view') {
      return setScene(S.scene)
    }
    if (k === 'provider') {
      if (v === 'codex' && S.perm !== 'full') {
        S.perm = 'auto'
      }
      if (!PERMS[v].some((p) => p[0] === S.perm)) {
        S.perm = 'ask'
      }
      if (S.scene === 'delegation') {
        return setScene('delegation')
      }
    }
    return render()
  }
  const simB = e.target.closest('[data-sim]')
  if (simB) {
    const [k, arg] = simB.dataset.sim.split(':')
    return SIMS[k](arg)
  }
  const menuB = e.target.closest('[data-menu]')
  if (menuB) {
    if ($('#menu')) {
      return closeMenu()
    }
    return setupMenus(menuB)
  }
  const a = e.target.closest('[data-act]')
  if (
    a &&
    !(
      a.tagName === 'INPUT' &&
      a.type === 'checkbox' &&
      a.dataset.act !== 'spawn-check' &&
      a.dataset.act !== 'linear-part' &&
      a.dataset.act !== 'linear-include'
    )
  ) {
    if (a.dataset.act === 'spawn-check') {
      e.preventDefault()
    }
    if (a.dataset.act === 'linear-part') {
      const [key, part] = a.dataset.arg.split(':')
      R.linear.chips.find((x) => x.key === key).parts[part] = a.checked
      return render()
    }
    if (a.dataset.act === 'linear-include') {
      R.linear.chips.find((x) => x.key === a.dataset.arg).included = a.checked
      return render()
    }
    if (e.target.closest('.gl[data-hc]')) {
      return
    }
    const fn = ACTS[a.dataset.act]
    if (fn) {
      e.stopPropagation()
      fn(a.dataset.arg)
    }
  }
  if (!e.target.closest('#menu')) {
    closeMenu()
  }
  if (R.chipPop && !e.target.closest('#pop') && !e.target.closest('[data-act="chip-pop"]')) {
    R.chipPop = null
    render()
  }
})
document.addEventListener(
  'scroll',
  (e) => e.target.dataset?.scroll === 'chat' && syncApprovalBody(),
  true
)
document.addEventListener('change', (e) => {
  const c = e.target.closest('.controls [data-check]')
  if (c) {
    S[c.dataset.check] = c.checked
    render()
  }
})
document.addEventListener('input', (e) => {
  if (e.target.id === 'composer') {
    R.composer = e.target.value
  }
  if (e.target.id === 'find') {
    R.find.q = e.target.value
    render()
  }
  if (e.target.id === 'capture') {
    R.capture.text = e.target.value
  }
})
document.addEventListener('mouseover', (e) => {
  const a = e.target.closest('[data-hc]')
  if (a && $('#app').contains(a)) {
    clearTimeout(hcTimer)
    if ($('#hc')?.dataset.for !== a.dataset.hc) {
      hcTimer = setTimeout(() => {
        showHc(a)
        if ($('#hc')) {
          $('#hc').dataset.for = a.dataset.hc
        }
      }, 120)
    }
  }
})
document.addEventListener('mouseout', (e) => {
  const a = e.target.closest('[data-hc]')
  if (a && !a.contains(e.relatedTarget)) {
    hideHc()
  }
})
document.addEventListener('focusin', (e) => {
  const a = e.target.closest('.gl[data-hc]')
  if (a) {
    showHc(a)
  }
})
document.addEventListener('keydown', (e) => {
  const mod = mac ? e.metaKey : e.ctrlKey
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
  if (mod && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    return ACTS.find()
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    return SIMS.capture()
  }
  if (e.key === 'Escape') {
    if ($('#hc')) {
      return hideHc(true)
    }
    if (R.chipPop) {
      return ((R.chipPop = null), render())
    }
    if ($('#menu')) {
      return closeMenu()
    }
    if (R.capture) {
      return ((R.capture = null), render())
    }
    if (R.find.open) {
      return ACTS['find-close']()
    }
    if (R.denyOpen) {
      return ((R.denyOpen = false), render())
    }
    if (R.peek) {
      return ACTS['peek-close']()
    }
    if (R.approvals.length && !R.approvalFolded) {
      return ACTS['fold-approval']()
    }
    return
  }
  if (e.key === 'Enter' && document.activeElement?.id === 'capture') {
    return ACTS['capture-save']()
  }
  if (e.key === 'Enter' && document.activeElement?.id === 'denynote') {
    return ACTS['deny-send']()
  }
  if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.id === 'composer') {
    e.preventDefault()
    return ACTS.send()
  }
  if (typing) {
    return
  }
  if (R.approvals.length && !R.approvalFolded && ['1', '2', '3'].includes(e.key)) {
    e.preventDefault()
    if (e.key === '1') {
      return ACTS.approve('once')
    }
    if (e.key === '2') {
      return ACTS.approve('session')
    }
    return ACTS.deny()
  }
  if (R.approvals.length > 1 && e.key === ']') {
    return ACTS['next-approval']()
  }
  if (R.prespawn && e.key === 'Enter') {
    return ACTS['spawn-start']()
  }
  if (R.peek && (e.key === '[' || e.key === ']')) {
    return ACTS['peek-step'](e.key === '[' ? -1 : 1)
  }
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList.contains('tlh')) {
    e.preventDefault()
    document.activeElement.click()
  }
})

setInterval(() => {
  $$('[data-since]').forEach((el) => {
    el.textContent = fmtDur((now() - Number(el.dataset.since)) / 1000)
  })
}, 1000)

setScene(S.scene)
