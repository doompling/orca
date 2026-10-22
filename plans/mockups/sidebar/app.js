/* Ether sidebar mockup. Plain JS, no build step. */
const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac')
const MOD = isMac ? '⌘' : 'Ctrl'
const SHIFT = isMac ? '⇧' : 'Shift'
const ALT = isMac ? '⌥' : 'Alt'
const CTRL = isMac ? '⌃' : 'Ctrl'
const D = 24 * 60

// ---------- icons (lucide paths) ----------
const P = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  tasks:
    '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  branch:
    '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  feature:
    '<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>',
  review:
    '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  plan: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
  fix: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/>',
  chore:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  scratch:
    '<path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>',
  none: '<circle cx="12" cy="12" r="4"/>',
  inbox:
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  q: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  sort: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  folderPlus:
    '<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  move: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'
}
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[n] || ''}</svg>`
const claudeGlyph = `<svg class="i s3" viewBox="0 0 24 24" style="stroke:#d97757;stroke-width:2.6"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></svg>`
const codexGlyph = `<svg class="i s3" viewBox="0 0 24 24"><path d="M12 2 21 7v10l-9 5-9-5V7z"/></svg>`
const agentGlyph = (k) => (k === 'claude' ? claudeGlyph : codexGlyph)

const TYPES = {
  feature: { label: 'Feature', color: 'var(--type-feature)', icon: 'feature' },
  review: { label: 'Review', color: 'var(--type-review)', icon: 'review' },
  plan: { label: 'Plan', color: 'var(--type-plan)', icon: 'plan' },
  fix: { label: 'Fix', color: 'var(--type-neutral)', icon: 'fix' },
  chore: { label: 'Chore', color: 'var(--type-neutral)', icon: 'chore' },
  scratch: { label: 'Scratch', color: 'var(--type-neutral)', icon: 'scratch' }
}

// ---------- state ----------
const clone = (x) => JSON.parse(JSON.stringify(x))
const S = {
  concept: 'desk',
  scope: 'p0',
  theme: 'dark',
  width: 330,
  marker: 'both',
  marksPlacement: 'move',
  projectOrder: 'manual',
  rootsStyle: 'footer',
  grayscale: false,
  compact: false,
  assistantOpen: true,
  model: clone(window.SEED),
  current: 'w-sidebar',
  collapsed: {},
  parkedOpen: {},
  inboxOpen: false,
  menu: null,
  overlay: null,
  selSlot: 0,
  mruOpen: false,
  mruIdx: 1,
  toast: null,
  streamFilter: 'all',
  railSel: 'orca',
  captureText: ''
}
const SCOPE_RANK = { p0: 0, p1: 1, p2: 2 }
const FEATURES = {
  needsYou: 1,
  park: 1,
  dnd: 1,
  typeMarker: 1,
  inbox: 2,
  scratch: 2,
  hovercard: 2,
  assistant: 2,
  compact: 2
}
const f = (name) => SCOPE_RANK[S.scope] >= (FEATURES[name] ?? 0)

// ---------- selectors ----------
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )
const ago = (m) =>
  m < 1
    ? 'now'
    : m < 60
      ? `${m}m`
      : m < D
        ? `${Math.round(m / 60)}h`
        : m < 7 * D
          ? `${Math.round(m / D)}d`
          : `${Math.round(m / (7 * D))}w`
const proj = (id) => S.model.projects.find((p) => p.id === id)
const wsById = (id) => S.model.workspaces.find((w) => w.id === id)
const live = () => S.model.workspaces.filter((w) => !w.archived)
const effType = (w) => (w.type === 'scratch' && !f('scratch') ? null : w.type)
const markIndex = (id) => (f('marks') && id ? S.model.marks.indexOf(id) : -1)
const isMarked = (id) => markIndex(id) >= 0
const hasAgent = (w, ...states) => (w.agents || []).some((a) => states.includes(a.state))
const isParked = (w) =>
  f('park') &&
  w.ago > 7 * D &&
  !hasAgent(w, 'working', 'waiting') &&
  !isMarked(w.id) &&
  w.id !== S.current
const needsYou = () =>
  f('needsYou')
    ? live()
        .filter((w) => hasAgent(w, 'waiting', 'unverifiable'))
        .sort((a, b) =>
          hasAgent(a, 'waiting') === hasAgent(b, 'waiting')
            ? a.ago - b.ago
            : hasAgent(a, 'waiting')
              ? -1
              : 1
        )
    : []
const projActivity = (p) =>
  Math.min(
    ...live()
      .filter((w) => w.projectId === p.id)
      .map((w) => w.ago),
    Infinity
  )
const sortedProjects = () => {
  const ps = [...S.model.projects]
  return S.projectOrder === 'recent' ? ps.sort((a, b) => projActivity(a) - projActivity(b)) : ps
}
const effectiveRoots = (w) =>
  proj(w.projectId).roots.map((r) => {
    const o = w.overrides?.[r.label]
    return { ...r, branch: o?.branch ?? r.branch, dirty: o?.dirty ?? false, override: !!o }
  })
const shortProj = (p) => p.name.split(' / ').pop()

function activity(w) {
  if (hasAgent(w, 'waiting')) {
    return '<span class="dot q" title="Agent needs you"></span>'
  }
  if (hasAgent(w, 'working')) {
    return ic('loader', 's3 spin')
  }
  if (hasAgent(w, 'unverifiable')) {
    return '<span class="dot hollow" title="Agent status unverifiable"></span>'
  }
  if (w.unread) {
    return '<span class="dot" title="Finished since you last looked"></span>'
  }
  return ''
}

// ---------- row renderers ----------
function typeRail(w) {
  const t = effType(w)
  if (!f('typeMarker') || S.marker === 'glyph' || !t) {
    return ''
  }
  return `<span class="rail" style="background:${TYPES[t].color}"></span>`
}
function typeGlyph(w) {
  const t = effType(w)
  if (!f('typeMarker') || S.marker === 'rail' || !t) {
    return ''
  }
  return `<span class="tglyph" style="color:${TYPES[t].color}" title="${TYPES[t].label}">${ic(TYPES[t].icon, 's3')}</span>`
}

function shownAgents(w, ctx) {
  const agents = w.agents || []
  if (ctx === 'needs') {
    return agents.filter((a) => ['waiting', 'unverifiable'].includes(a.state))
  }
  if (ctx === 'compactlist') {
    return []
  }
  // The question/lost-contact line lives only in Needs you; own rows just carry the dot.
  const asks = (a) => f('needsYou') && ['waiting', 'unverifiable'].includes(a.state)
  if (w.id === S.current) {
    return agents.filter((a) => !asks(a))
  }
  if (ctx === 'mark') {
    return agents.filter((a) => a.state === 'working')
  }
  return agents.filter(
    (a) =>
      a.state === 'working' ||
      (a.state === 'done' && w.unread) ||
      (!f('needsYou') && ['waiting', 'unverifiable'].includes(a.state))
  )
}

function wsRow(w, ctx) {
  const p = proj(w.projectId)
  const mi = markIndex(w.id)
  const shown = shownAgents(w, ctx)
  const hidden = (w.agents || []).filter(
    (a) => !shown.includes(a) && !['waiting', 'unverifiable'].includes(a.state)
  ).length
  const scratch = effType(w) === 'scratch'
  const ovr = f('overrides') !== false && w.overrides && S.width >= 250 && ctx !== 'needs'
  const ovrSeg = ovr
    ? Object.values(w.overrides)
        .map(
          (o) =>
            `<span class="seg mono" title="Checkout override: ${esc(o.branch)}">${ic('branch', 's3')}${ctx === 'project' || ctx === 'rail' ? `<span class="b">${esc(o.branch)}</span>` : ''}${o.dirty ? '<span class="dirty" title="Uncommitted changes"></span>' : ''}</span>`
        )
        .join('')
    : ''
  const lin =
    w.linear?.length && S.width >= 240 && !ovr && (ctx === 'project' || ctx === 'rail')
      ? `<span class="lin mono">${w.linear[0]}${w.linear.length > 1 ? ` +${w.linear.length - 1}` : ''}</span>`
      : ''
  const psfx =
    ctx === 'needs' || (ctx === 'mark' && S.marksPlacement === 'move')
      ? `<span class="psfx">${esc(shortProj(p))}</span>`
      : ''
  const chip =
    hidden > 0 && ctx !== 'needs'
      ? `<span class="agents-chip" title="${hidden} idle agent${hidden > 1 ? 's' : ''}">${ic('bot', 's3')}${hidden}</span>`
      : ''
  const keep = scratch
    ? `<button class="keep" data-a="keep:${w.id}" title="Auto-archives after ${w.expiresIn} idle">Keep</button>`
    : ''
  const markChip = mi >= 0 ? `<span class="mark" title="${MOD}${mi + 1}">${mi + 1}</span>` : ''
  const draggable = f('dnd') && ['project', 'rail', 'mark'].includes(ctx) ? 'draggable="true"' : ''
  const row = `<div class="ws ${scratch ? 'scratch' : ''}" tabindex="0" ${draggable} data-ws="${w.id}" data-ctx="${ctx}" data-a="open:${w.id}"
      data-current="${ctx !== 'needs' && w.id === S.current}" data-unread="${!!w.unread}">
      ${typeRail(w)}<span class="lead">${activity(w)}</span>${typeGlyph(w)}
      <span class="nm">${esc(w.name)}</span>${ovrSeg}${lin}${psfx}${chip}${keep}${markChip}
      <span class="trail">${f('timestamps') !== false ? `<span class="time">${ago(w.ago)}</span>` : ''}<button class="more" data-a="more:${w.id}" aria-label="Workspace actions">${ic('more', 's35')}</button></span>
    </div>`
  return row + shown.map((a) => agentRow(a, w)).join('')
}

function agentRow(a, w) {
  const st =
    a.state === 'working'
      ? ic('loader', 's3 spin')
      : a.state === 'waiting'
        ? `<span style="color:var(--question)">${ic('q', 's3')}</span>`
        : a.state === 'unverifiable'
          ? '<span class="dot hollow"></span>'
          : a.state === 'done'
            ? `<span style="color:var(--success)">${ic('check', 's3')}</span>`
            : `<span style="color:var(--faint)">${ic('check', 's3')}</span>`
  return `<div class="ag ${a.state === 'waiting' ? 'q' : ''}" data-a="open:${w.id}">
    <span class="st">${st}</span>${agentGlyph(a.kind)}<span class="ex">${esc(a.ex)}</span>
    <span class="md mono">${a.model} ${ago(a.ago)}</span>
    ${a.state === 'waiting' ? `<button class="act" data-a="open:${w.id}">Review</button>` : ''}
  </div>`
}

function rootsLine(p) {
  if (S.rootsStyle === 'footer') {
    return ''
  }
  const shown = S.width < 260 && p.roots.length > 2 ? p.roots.slice(0, 1) : p.roots
  const extra = p.roots.length - shown.length
  const sep = S.rootsStyle === 'chips' ? '' : '<span class="sep">·</span>'
  return `<div class="roots mono ${S.rootsStyle === 'chips' ? 'chips' : ''}" title="${p.roots.map((r) => r.path).join('\n')}">
    ${shown.map((r) => `<span class="r">${esc(r.label)}</span>`).join(sep)}${extra ? `<span class="more">+${extra}</span>` : ''}
  </div>`
}

function projectBlock(p, ctx = 'project') {
  let wss = live().filter((w) => w.projectId === p.id)
  if (S.marksPlacement === 'move' && f('marks') && S.concept === 'desk') {
    wss = wss.filter((w) => !isMarked(w.id))
  }
  wss = wss.sort((a, b) => a.ago - b.ago)
  const active = wss.filter((w) => !isParked(w))
  const parked = wss.filter((w) => isParked(w))
  const collapsed = S.collapsed[p.id]
  const latest = projActivity(p)
  return `<section class="proj" data-pid="${p.id}">
    <div class="proj-h" data-a="toggle:${p.id}">
      <span class="chev">${ic(collapsed ? 'chevR' : 'chevD', 's3')}</span>
      <span class="nm">${esc(p.name)}</span>
      ${collapsed && Number.isFinite(latest) ? `<span class="meta">${active.length}</span>` : ''}
      <span class="hov"><button class="ibtn" data-a="newws:${p.id}" title="New Workspace">${ic('plus')}</button><button class="ibtn" data-a="pmore:${p.id}" title="Project actions">${ic('more')}</button></span>
    </div>
    ${rootsLine(p)}
    <div class="drop-cap"></div>
    ${collapsed ? '' : active.map((w) => wsRow(w, ctx)).join('')}
    ${!collapsed && parked.length ? `<div class="parked"><button class="fold" data-a="park:${p.id}">${ic(S.parkedOpen[p.id] ? 'chevD' : 'chevR', 's3')} Parked · ${parked.length}</button>${S.parkedOpen[p.id] ? parked.map((w) => wsRow(w, ctx)).join('') : ''}</div>` : ''}
  </section>`
}

function topbar() {
  return `<div class="topbar">
    <div class="search">${ic('search', 's35')}<span class="t">Search</span><span class="kbd"><b>${MOD}</b><b>J</b></span></div>
    <button class="ibtn" title="Tasks">${ic('tasks')}</button>
    <button class="ibtn" title="Automations">${ic('clock')}</button>
    <button class="ibtn" title="Orca Mobile">${ic('phone')}</button>
  </div>`
}

function needsSection() {
  const n = needsYou()
  if (!n.length) {
    return ''
  }
  const waiting = n.filter((w) => hasAgent(w, 'waiting')).length
  const shown = S.needsOpen ? n : n.slice(0, 3)
  return `<div class="sec"><div class="sec-h"><span class="grow">Needs you</span>${waiting ? `<span class="count" style="color:var(--question-text)">${waiting}</span>` : ''}</div>
    ${shown.map((w) => wsRow(w, 'needs')).join('')}${n.length > shown.length ? `<button class="fold" style="padding-left:28px" data-a="needsmore">+${n.length - shown.length} more</button>` : ''}</div>`
}
function marksSection() {
  if (!f('marks') || !S.model.marks.some(Boolean)) {
    return ''
  }
  const ws = S.model.marks
    .filter(Boolean)
    .map(wsById)
    .filter((w) => w && !w.archived)
  return `<div class="sec"><div class="sec-h"><span class="grow">Marks</span><button class="ibtn" data-a="overlay:marks" title="Marks (${MOD};)">${ic('bookmark')}</button></div>
    ${ws.map((w) => wsRow(w, 'mark')).join('')}</div>`
}
function inboxSection() {
  if (!f('inbox')) {
    return ''
  }
  const items = S.model.inbox
  return `<div class="sec"><div class="sec-h" data-a="inbox" style="cursor:default">${ic(S.inboxOpen ? 'chevD' : 'chevR', 's3')}<span class="grow">Inbox</span><span class="count">${items.length}</span>
      <button class="ibtn on" data-a="capture" title="Capture (${MOD}${SHIFT}K)">${ic('plus')}</button></div>
    ${
      S.inboxOpen
        ? items
            .map((it) => {
              const from = it.from ? wsById(it.from)?.name : it.source
              return `<div class="inbox-it">${ic('inbox', 's3')}<span class="t">${esc(it.title)}</span><span class="src">${esc(from || '')}</span>
        <button class="ibtn" data-a="start:${it.id}" title="Start as scratch Workspace">${ic('zap')}</button></div>`
            })
            .join('')
        : ''
    }</div>`
}

function footer() {
  if (!f('footer')) {
    return ''
  }
  const w = wsById(S.current)
  if (!w) {
    return ''
  }
  const p = proj(w.projectId)
  return `<div class="footer">
    <div class="fn">${typeGlyph({ ...w }) || ''}<span>${esc(w.name)}</span><span class="p">${esc(p.name)}</span></div>
    <div class="chips">${effectiveRoots(w)
      .map(
        (r) =>
          `<button class="chip mono ${r.override ? 'ovr' : ''}" title="${esc(r.path)}${r.override ? ' (checkout override)' : ''}">${esc(r.label)} ${ic('branch', 's3')}<span class="b">${esc(r.branch)}</span>${r.dirty ? '<span class="dirty"></span>' : ''}</button>`
      )
      .join('')}</div>
  </div>`
}

// ---------- concepts ----------
function renderDesk() {
  if (S.compact && f('compact')) {
    return renderRailColumn(true)
  }
  return `<aside class="sb" style="width:${S.width}px">${topbar()}
    <div class="sb-scroll">
      ${needsSection()}${marksSection()}${inboxSection()}
      <div class="sec"><div class="sec-h"><span class="grow">Projects</span>
        <button class="ibtn ${S.projectOrder === 'recent' ? 'on' : ''}" data-a="order" title="Order: ${S.projectOrder === 'recent' ? 'most recent first' : 'manual'}">${ic('sort')}</button>
        <button class="ibtn" title="New Project">${ic('folderPlus')}</button></div>
        ${sortedProjects()
          .map((p) => projectBlock(p))
          .join('')}
      </div>
    </div>${footer()}</aside>`
}

function streamRow(w) {
  const p = proj(w.projectId)
  const t = effType(w)
  const color = t && f('typeMarker') ? TYPES[t].color : 'var(--faint)'
  const icon = t ? TYPES[t].icon : null
  const mi = markIndex(w.id)
  const agent = (w.agents || []).slice().sort((a, b) => a.ago - b.ago)[0]
  const line2 = agent
    ? `<span class="${agent.state === 'waiting' ? 'q' : ''}">${agentGlyph(agent.kind)}</span><span class="${agent.state === 'waiting' ? 'q' : ''}">${esc(agent.ex)}</span>`
    : '<span>idle</span>'
  return `<div class="ws2" tabindex="0" data-ws="${w.id}" data-a="open:${w.id}" data-current="${w.id === S.current}" data-unread="${!!w.unread}">
    <span class="g" style="color:${color}">${icon ? ic(icon, 's35') : ''}</span>
    <span class="nm">${esc(w.name)}</span>
    <span class="ldot">${activity(w)}</span>
    ${mi >= 0 ? `<span class="mark">${mi + 1}</span>` : '<span></span>'}
    <span class="time">${ago(w.ago)}</span>
    <span class="l2"><span style="color:var(--faint)">${esc(shortProj(p))}</span>·${line2}</span>
  </div>`
}
function streamList(filterPid) {
  let ws = live().filter((w) => filterPid === 'all' || w.projectId === filterPid)
  const n = new Set(needsYou().map((w) => w.id))
  const groups = [
    ['Needs you', ws.filter((w) => n.has(w.id)), 'needs'],
    ['Today', ws.filter((w) => !n.has(w.id) && w.ago < D && !isParked(w))],
    ['This week', ws.filter((w) => !n.has(w.id) && w.ago >= D && w.ago < 7 * D && !isParked(w))],
    ['Older', ws.filter((w) => !n.has(w.id) && w.ago >= 7 * D && !isParked(w))]
  ]
  const parked = ws.filter((w) => !n.has(w.id) && isParked(w))
  return (
    groups
      .filter(([, l]) => l.length)
      .map(
        ([t, l, cls]) =>
          `<div class="sec"><div class="sec-h ${cls || ''}"><span class="grow">${t}</span><span class="count">${l.length}</span></div>${l
            .sort((a, b) => a.ago - b.ago)
            .map(streamRow)
            .join('')}</div>`
      )
      .join('') +
    (parked.length
      ? `<div class="sec"><button class="fold" style="padding-left:8px" data-a="park:stream">${ic(S.parkedOpen.stream ? 'chevD' : 'chevR', 's3')} Parked · ${parked.length}</button>${S.parkedOpen.stream ? parked.map(streamRow).join('') : ''}</div>`
      : '')
  )
}
function renderStream() {
  const label = S.streamFilter === 'all' ? 'All projects' : proj(S.streamFilter).name
  return `<aside class="sb" style="width:${S.width}px">
    <div class="topbar"><button class="filter-btn" data-a="filter"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span>${ic('chevD', 's3')}</button>
      <button class="ibtn" title="Search (${MOD}J)">${ic('search')}</button><button class="ibtn" title="New Workspace">${ic('plus')}</button></div>
    <div class="sb-scroll">${inboxSection()}${streamList(S.streamFilter)}</div>${footer()}</aside>`
}

function monogram(p) {
  const parts = p.name.replace('/', ' ').split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : p.name.slice(0, 2)).toUpperCase()
}
function renderRailColumn(standalone) {
  const n = needsYou()
  const tiles = S.model.projects
    .map((p) => {
      const ws = live().filter((w) => w.projectId === p.id)
      const q = ws.some((w) => hasAgent(w, 'waiting'))
      const unread = ws.some((w) => w.unread)
      return `<button class="tile" data-pid="${p.id}" data-a="rail:${p.id}" data-active="${!standalone && S.railSel === p.id}" title="${esc(p.name)}">${monogram(p)}${q ? '<span class="badge q"></span>' : unread ? '<span class="badge"></span>' : ''}</button>`
    })
    .join('')
  const marks = f('marks')
    ? S.model.marks
        .map((id, i) => [id && wsById(id), i])
        .filter(([w]) => w && !w.archived)
        .map(([w, i]) => {
          const t = effType(w)
          return `<button class="tile mk" data-a="open:${w.id}" data-active="${w.id === S.current}" title="${esc(w.name)} · ${MOD}${i + 1}">${t && f('typeMarker') ? `<span class="trail" style="background:${TYPES[t].color}"></span>` : ''}${i + 1}</button>`
        })
        .join('')
    : ''
  const col = `<nav class="rail-col">
    <button class="tile" data-a="rail:home" data-active="${!standalone && S.railSel === 'home'}" title="Home: all projects by attention">${ic('home', 's35')}${n.length ? '<span class="badge q"></span>' : ''}</button>
    <span class="rail-div"></span>${tiles}${marks ? `<span class="rail-div"></span>${marks}` : ''}
    ${standalone ? `<span style="flex:1"></span><button class="tile" data-a="uncompact" title="Expand sidebar">${ic('panel', 's35')}</button>` : ''}
  </nav>`
  return standalone
    ? `<aside class="sb" style="width:48px">${col.replace('<nav class="rail-col">', '<nav class="rail-col" style="flex:1">')}</aside>`
    : col
}
function renderRail() {
  let pane
  if (S.railSel === 'home') {
    pane = `<div class="topbar"><div class="search">${ic('search', 's35')}<span class="t">All projects</span><span class="kbd"><b>${MOD}</b><b>J</b></span></div></div>
      <div class="sb-scroll">${inboxSection()}${streamList('all')}</div>`
  } else {
    const p = proj(S.railSel)
    pane = `<div class="topbar"><div class="search">${ic('search', 's35')}<span class="t">Search ${esc(p.name)}</span></div></div>
      <div class="sb-scroll">${projectBlock(p, 'rail')}</div>`
  }
  return `<aside class="sb" style="width:${S.width + 48}px;flex-direction:row">${renderRailColumn(false)}<div class="pane">${pane}${footer()}</div></aside>`
}

// ---------- workbench + assistant ----------
function renderMain() {
  const w = wsById(S.current)
  if (!w) {
    return `<main class="main"><div class="wb-body">No Workspace open</div></main>`
  }
  const p = proj(w.projectId)
  const t = effType(w)
  const tabs = [...(w.agents || []).map((a) => a.who), 'README.md']
  return `<main class="main">
    <div class="wb-tabs">${tabs.map((t, i) => `<div class="wb-tab ${i === 0 ? 'on' : ''}">${esc(t)}</div>`).join('')}</div>
    <div class="wb-head">
      <h1>${esc(w.name)} ${t && f('typeMarker') ? `<span class="typebadge" style="color:${TYPES[t].color}">${ic(TYPES[t].icon, 's3')}${TYPES[t].label}</span>` : ''}</h1>
      <div class="sub">${esc(p.name)} · ${effectiveRoots(w)
        .map((r) => `${esc(r.label)} <span class="mono">${esc(r.branch)}</span>`)
        .join(' · ')}${w.linear?.length ? ` · ${w.linear.join(', ')}` : ''}</div>
    </div>
    <div class="wb-body"><div>Workspace content (editor, terminals, agent chat). Placeholder.<div class="lines"><i style="width:90%"></i><i style="width:70%"></i><i style="width:82%"></i><i style="width:40%"></i></div></div></div>
  </main>`
}
function renderAssistant() {
  if (!f('assistant') || !S.assistantOpen) {
    return ''
  }
  const n = needsYou()
  const unread = live().filter((w) => w.unread)
  const stale = live().filter((w) => isParked(w))
  return `<aside class="assistant"><div class="ah">${ic('sparkles', 's35')} Assistant <span style="flex:1"></span><button class="ibtn" data-a="assistant" title="Close">${ic('x', 's35')}</button></div>
    <div class="ab">
      <div style="color:var(--faint);font-size:11px">Future direction (plans/07). Reads the same data the sidebar shows.</div>
      ${n.length ? `<div class="card"><span class="k">Needs you</span>${n.map((w) => `<div><b>${esc(w.name)}</b>: ${esc(w.agents.find((a) => ['waiting', 'unverifiable'].includes(a.state)).ex)}</div>`).join('')}<div class="acts"><button data-a="open:${n[0].id}">Open</button></div></div>` : ''}
      ${unread.length ? `<div class="card"><span class="k">Finished since you left</span>${unread.map((w) => `<div><b>${esc(w.name)}</b> · ${esc(shortProj(proj(w.projectId)))}: ${esc(w.summary || '')}</div>`).join('')}</div>` : ''}
      ${f('inbox') ? `<div class="card"><span class="k">Inbox · ${S.model.inbox.length}</span><div>${S.model.inbox.length} captured items, 1 from Slack. Want to triage them?</div><div class="acts"><button>Triage</button></div></div>` : ''}
      ${stale.length ? `<div class="card"><span class="k">Parked</span><div>${stale.length} Workspaces idle for more than a week.</div><div class="acts"><button>Review</button></div></div>` : ''}
    </div><div class="compose">Ask about your work…</div></aside>`
}

// ---------- overlays ----------
function renderMenu() {
  const m = S.menu
  if (!m) {
    return ''
  }
  if (m.kind === 'project') {
    return `<div class="menu" style="left:${m.x}px;top:${m.y}px">
      <button class="mi" data-a="newws:${m.id}">${ic('plus')}<span class="grow">New Workspace</span></button>
      <button class="mi" data-a="rename-p:${m.id}">${ic('pencil')}<span class="grow">Rename Project</span></button>
      <button class="mi">${ic('folder')}<span class="grow">Edit Project roots…</span></button>
      <div class="msep"></div><button class="mi">${ic('archive')}<span class="grow">Archive Project</span></button></div>`
  }
  if (m.kind === 'filter') {
    return `<div class="menu" style="left:${m.x}px;top:${m.y}px">
      <button class="mi" data-a="setfilter:all"><span class="grow">All projects</span></button><div class="msep"></div>
      ${S.model.projects.map((p) => `<button class="mi" data-a="setfilter:${p.id}"><span class="grow">${esc(p.name)}</span></button>`).join('')}</div>`
  }
  const w = wsById(m.id)
  const t = effType(w)
  const mi = markIndex(w.id)
  const typeBtns = f('typeMarker')
    ? `<div class="ml">Type${t ? ` · ${TYPES[t].label}` : ''}</div><div class="types">${[
        'feature',
        'review',
        'plan',
        'fix',
        'chore'
      ]
        .map(
          (k) =>
            `<button aria-pressed="${t === k}" data-a="type:${w.id}:${k}" title="${TYPES[k].label}" style="color:${TYPES[k].color}">${ic(TYPES[k].icon, 's35')}</button>`
        )
        .join(
          ''
        )}<button aria-pressed="${!t}" data-a="type:${w.id}:none" title="No type" style="color:var(--faint)">${ic('x', 's35')}</button></div><div class="msep"></div>`
    : ''
  return `<div class="menu" style="left:${m.x}px;top:${m.y}px">
    ${typeBtns}
    ${w.id !== S.current ? `<button class="mi" data-a="open:${w.id}">${ic('move')}<span class="grow">Open</span></button>` : ''}
    <button class="mi" data-a="rename:${w.id}">${ic('pencil')}<span class="grow">Rename</span></button>
    <button class="mi" data-a="mark:${w.id}">${ic('bookmark')}<span class="grow">${mi >= 0 ? `Remove mark ${mi + 1}` : 'Add mark'}</span><span class="kbd"><b>${MOD}</b><b>${SHIFT}</b><b>H</b></span></button>
    <button class="mi" data-a="linear:${w.id}">${ic('link')}<span class="grow">Linear issues…</span>${w.linear?.length ? `<span class="kbd">${w.linear.length}</span>` : ''}</button>
    <button class="mi">${ic('branch')}<span class="grow">Edit checkouts…</span></button>
    <button class="mi" data-a="movedlg:${w.id}">${ic('folder')}<span class="grow">Move to Project…</span></button>
    <div class="msep"></div>
    <button class="mi danger" data-a="archive:${w.id}">${ic('archive')}<span class="grow">Archive</span><span class="kbd"><b>${MOD}</b><b>${SHIFT}</b><b>⌫</b></span></button>
  </div>`
}

function renderOverlay() {
  if (S.overlay === 'marks') {
    const slots = Array.from({ length: 9 }, (_, i) => S.model.marks[i] ?? null)
    return `<div class="scrim" data-a="close"><div class="dialog" data-stop>
      <div class="dh">${ic('bookmark', 's35')}<span class="grow">Marks</span><span class="hint">${MOD}1–9 from anywhere</span></div>
      <div class="dl">${slots
        .map((id, i) => {
          const w = id && wsById(id)
          return `<div class="di ${w ? '' : 'empty'}" data-sel="${S.selSlot === i}" data-a="slot:${i}"><span class="slot">${i + 1}</span>
            <span class="nm">${w ? esc(w.name) : 'Empty'}</span>${w ? `<span class="p">${esc(shortProj(proj(w.projectId)))}</span>` : ''}</div>`
        })
        .join('')}</div>
      <div class="df"><span>1–9 open</span><span>↑↓ select</span><span>${ALT}↑↓ reorder</span><span>A put current here</span><span>⌫ clear</span></div>
    </div></div>`
  }
  if (S.overlay?.kind === 'move') {
    const w = wsById(S.overlay.id)
    return `<div class="scrim" data-a="close"><div class="dialog" data-stop>
      <div class="dh">${ic('folder', 's35')}<span class="grow">Move “${esc(w.name)}” to…</span></div>
      <div class="dl">${S.model.projects
        .filter((p) => p.id !== w.projectId)
        .map((p) => {
          const v = verdict(w, p)
          return `<div class="di ${v.ok ? '' : 'disabled'}" ${v.ok ? `data-a="moveto:${w.id}:${p.id}"` : ''}><span class="nm">${esc(p.name)}</span><span class="p">${esc(v.text)}</span></div>`
        })
        .join('')}</div>
      <div class="df"><span>Only Projects that contain all of this Workspace’s roots accept it.</span></div></div></div>`
  }
  if (S.overlay === 'capture') {
    const cur = wsById(S.current)
    return `<div class="scrim" data-a="close"><div class="dialog" data-stop style="width:480px">
      <div class="dh">${ic('inbox', 's35')}<span class="grow">Capture to Inbox</span><span class="hint">Doesn’t touch the current chat</span></div>
      <input id="cap" placeholder="What came up?" value="${esc(S.captureText)}" autocomplete="off" />
      <div class="ctx">
        <label><input type="checkbox" checked /> From <b>${esc(cur?.name || '')}</b></label>
        <label><input type="checkbox" checked /> Active file <span class="mono">src/tools/google/drive.ts:40–62</span></label>
        <label><input type="checkbox" /> Last agent message</label>
      </div>
      <div class="df"><span>Enter save</span><span>${MOD}Enter save and start scratch</span><span>Esc close</span></div></div></div>`
  }
  return ''
}

function renderMru() {
  if (!S.mruOpen) {
    return ''
  }
  const list = mruList()
  return `<div class="mru"><div class="hint">Recent Workspaces · hold ${CTRL}, press \` to move, release to open</div>
    ${list
      .map(
        (w, i) =>
          `<div class="di" data-sel="${i === S.mruIdx}">${typeGlyph(w) || `<span style="width:12px"></span>`}<span class="nm">${esc(w.name)}</span><span class="p">${esc(shortProj(proj(w.projectId)))}</span>${isMarked(w.id) ? `<span class="mark">${markIndex(w.id) + 1}</span>` : ''}</div>`
      )
      .join('')}</div>`
}

function renderToast() {
  if (!S.toast) {
    return ''
  }
  return `<div class="toast"><div><div>${S.toast.title}</div>${S.toast.sub ? `<div class="s">${S.toast.sub}</div>` : ''}</div>${S.toast.undo ? '<button data-a="undo">Undo</button>' : ''}</div>`
}

// ---------- render ----------
const appEl = document.getElementById('app')
function render() {
  appEl.dataset.theme = S.theme
  appEl.classList.toggle('grayscale', S.grayscale)
  const side =
    S.concept === 'stream' ? renderStream() : S.concept === 'rail' ? renderRail() : renderDesk()
  const w = wsById(S.current)
  appEl.innerHTML = `<div class="titlebar"><div class="traffic"><span></span><span></span><span></span></div><div class="ttl">Ether — ${esc(w?.name || '')}</div><div style="width:80px"></div></div>
    <div class="body">${side}${renderMain()}${renderAssistant()}</div>
    ${renderMenu()}${renderOverlay()}${renderMru()}${renderToast()}<div id="hc"></div>`
  syncControls()
  renderNotes()
  const cap = document.getElementById('cap')
  if (cap) {
    cap.focus()
  }
}

// ---------- actions ----------
let undoSnap = null
let toastTimer = null
function toast(title, sub, undo) {
  S.toast = { title, sub, undo }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    S.toast = null
    render()
  }, 6000)
}
function snapshot() {
  undoSnap = { model: clone(S.model), current: S.current }
}
function activate(id) {
  const w = wsById(id)
  if (!w || w.archived) {
    return
  }
  S.current = id
  w.unread = false
  S.model.mru = [id, ...S.model.mru.filter((x) => x !== id)]
  if (S.concept === 'rail' && S.railSel !== 'home') {
    S.railSel = w.projectId
  }
}
const mruList = () =>
  S.model.mru
    .map(wsById)
    .filter((w) => w && !w.archived)
    .slice(0, 8)

function archive(id) {
  const w = wsById(id)
  snapshot()
  const running = (w.agents || []).filter(
    (a) => a.state === 'working' || a.state === 'waiting'
  ).length
  const doIt = () => {
    w.archived = true
    S.model.marks = S.model.marks.map((x) => (x === id ? null : x))
    if (S.current === id) {
      const next = mruList()[0] || live()[0]
      if (next) {
        activate(next.id)
      }
    }
    toast(
      `Archived ${esc(w.name)}`,
      running
        ? `${running} agent${running > 1 ? 's' : ''} still running`
        : 'Files, tabs, and sessions are kept',
      true
    )
    render()
  }
  const row = appEl.querySelector(`.ws[data-ws="${id}"]`)
  if (row) {
    row.classList.add('archiving')
    setTimeout(doIt, 150)
  } else {
    doIt()
  }
}

function toggleMark(id) {
  if (!f('marks')) {
    return
  }
  const i = S.model.marks.indexOf(id)
  const free = S.model.marks.indexOf(null)
  if (i !== -1) {
    S.model.marks[i] = null
    toast(`Removed mark ${i + 1} from ${esc(wsById(id).name)}`, 'Other marks keep their numbers')
  } else if (free !== -1) {
    S.model.marks[free] = id
    toast(`Marked ${esc(wsById(id).name)} as ${free + 1}`, `${MOD}${free + 1} jumps here`)
  }
}

function verdict(w, target) {
  const src = proj(w.projectId).roots.map((r) => r.path)
  const tgt = target.roots.map((r) => r.path)
  const missing = proj(w.projectId).roots.filter((r) => !tgt.includes(r.path))
  const extra = target.roots.filter((r) => !src.includes(r.path))
  if (missing.length) {
    return { ok: false, kind: 'invalid', text: `Missing ${missing.map((r) => r.label).join(', ')}` }
  }
  if (extra.length) {
    return {
      ok: true,
      kind: 'superset',
      text: `Move · adds ${extra.map((r) => r.label).join(', ')}`
    }
  }
  return { ok: true, kind: 'valid', text: 'Move here · same roots' }
}
function moveTo(id, pid) {
  snapshot()
  const w = wsById(id)
  const from = proj(w.projectId).name
  w.projectId = pid
  toast(`Moved ${esc(w.name)} to ${esc(proj(pid).name)}`, `from ${esc(from)}`, true)
}

function newWorkspace(pid) {
  if (f('scratch')) {
    const id = `w-new-${Date.now()}`
    S.model.workspaces.push({
      id,
      projectId: pid,
      name: 'New scratch',
      type: 'scratch',
      ago: 0,
      expiresIn: '24h',
      agents: []
    })
    activate(id)
    toast(
      'Scratch Workspace created',
      'Named from your first prompt · auto-archives after 24h idle unless you Keep it'
    )
  } else {
    toast('Opens the existing New Workspace composer')
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]')
  if (!el) {
    if (S.menu && !e.target.closest('.menu')) {
      S.menu = null
      render()
    }
    return
  }
  // Clicks inside a dialog bubble to the scrim's close action; ignore those.
  if (el.dataset.a === 'close' && e.target.closest('[data-stop]')) {
    return
  }
  const [a, x, y] = el.dataset.a.split(':')
  const rect = appEl.getBoundingClientRect()
  e.stopPropagation()
  const menuAt = (kind, id) => {
    const r = el.getBoundingClientRect()
    S.menu = {
      kind,
      id,
      x: Math.min(r.left - rect.left, rect.width - 240),
      y: Math.min(r.bottom - rect.top + 4, rect.height - 330)
    }
  }
  if (a !== 'more' && a !== 'pmore' && a !== 'filter') {
    S.menu = null
  }
  switch (a) {
    case 'open':
      activate(x)
      S.overlay = null
      break
    case 'more':
      menuAt('ws', x)
      break
    case 'pmore':
      menuAt('project', x)
      break
    case 'filter':
      menuAt('filter')
      break
    case 'setfilter':
      S.streamFilter = x
      break
    case 'toggle':
      if (e.target.closest('.hov')) {
        return
      }
      S.collapsed[x] = !S.collapsed[x]
      break
    case 'park':
      S.parkedOpen[x] = !S.parkedOpen[x]
      break
    case 'inbox':
      if (e.target.closest('.ibtn')) {
        return
      }
      S.inboxOpen = !S.inboxOpen
      break
    case 'needsmore':
      S.needsOpen = true
      break
    case 'order':
      S.projectOrder = S.projectOrder === 'recent' ? 'manual' : 'recent'
      break
    case 'type':
      wsById(x).type = y === 'none' ? null : y
      break
    case 'mark':
      toggleMark(x)
      break
    case 'archive':
      archive(x)
      return
    case 'undo':
      if (undoSnap) {
        S.model = undoSnap.model
        S.current = undoSnap.current
        undoSnap = null
      }
      S.toast = null
      break
    case 'rename': {
      const w = wsById(x)
      const n = prompt('Rename Workspace', w.name)
      if (n) {
        w.name = n
      }
      break
    }
    case 'rename-p': {
      const p = proj(x)
      const n = prompt('Rename Project', p.name)
      if (n) {
        p.name = n
      }
      break
    }
    case 'linear':
      toast(
        'Opens the existing Linear issues popover',
        'Moved off the always-visible row; also a Cmd+J action'
      )
      break
    case 'movedlg':
      S.overlay = { kind: 'move', id: x }
      break
    case 'moveto':
      moveTo(x, y)
      S.overlay = null
      break
    case 'keep': {
      const w = wsById(x)
      w.type = null
      delete w.expiresIn
      toast(`Kept ${esc(w.name)}`, 'Now a regular Workspace')
      break
    }
    case 'newws':
      newWorkspace(x)
      break
    case 'overlay':
      S.overlay = x
      S.selSlot = 0
      break
    case 'slot': {
      const id = S.model.marks[Number(x)]
      if (id) {
        activate(id)
        S.overlay = null
      } else {
        S.selSlot = Number(x)
      }
      break
    }
    case 'close':
      S.overlay = null
      break
    case 'capture':
      S.overlay = 'capture'
      S.captureText = ''
      break
    case 'start': {
      const it = S.model.inbox.find((i) => i.id === x)
      const pid = it.from ? wsById(it.from).projectId : proj(wsById(S.current).projectId).id
      const id = `w-${x}`
      S.model.workspaces.push({
        id,
        projectId: pid,
        name: it.title,
        type: f('scratch') ? 'scratch' : null,
        ago: 0,
        expiresIn: '24h',
        agents: []
      })
      S.model.inbox = S.model.inbox.filter((i) => i.id !== x)
      activate(id)
      toast(
        'Started scratch Workspace',
        `In ${esc(proj(pid).name)} · the captured context becomes the first prompt draft`
      )
      break
    }
    case 'rail':
      S.railSel = x
      if (S.concept === 'desk' && S.compact) {
        const w = live()
          .filter((w) => w.projectId === x)
          .sort((a, b) => a.ago - b.ago)[0]
        if (w) {
          activate(w.id)
        }
      }
      break
    case 'uncompact':
      S.compact = false
      break
    case 'assistant':
      S.assistantOpen = !S.assistantOpen
      break
  }
  render()
})

appEl.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-ws]')
  if (!row) {
    return
  }
  e.preventDefault()
  const rect = appEl.getBoundingClientRect()
  S.menu = {
    kind: 'ws',
    id: row.dataset.ws,
    x: Math.min(e.clientX - rect.left, rect.width - 240),
    y: Math.min(e.clientY - rect.top, rect.height - 330)
  }
  render()
})

// ---------- drag and drop ----------
let dragId = null
appEl.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.ws[draggable]')
  if (!row) {
    return
  }
  dragId = row.dataset.ws
  e.dataTransfer.setData('text/plain', dragId)
  e.dataTransfer.effectAllowed = 'move'
  row.classList.add('dragging')
  hideHover()
  const w = wsById(dragId)
  appEl.querySelectorAll('[data-pid]').forEach((el) => {
    const p = proj(el.dataset.pid)
    if (p.id === w.projectId) {
      return
    }
    const v = verdict(w, p)
    if (el.classList.contains('tile')) {
      el.classList.add(v.ok ? 'drop-ok' : 'drop-no')
      el.title = `${p.name}: ${v.text}`
    } else {
      el.dataset.verdict = v.kind
      const cap = el.querySelector('.drop-cap')
      if (cap) {
        cap.textContent = v.text
      }
    }
  })
})
appEl.addEventListener('dragover', (e) => {
  const t = e.target.closest('[data-pid]')
  if (!t || !dragId) {
    return
  }
  const ok = t.classList.contains('drop-ok') || ['valid', 'superset'].includes(t.dataset.verdict)
  if (ok) {
    e.preventDefault()
    t.classList.add('over')
  }
})
appEl.addEventListener('dragleave', (e) => {
  const t = e.target.closest('[data-pid]')
  if (t && !t.contains(e.relatedTarget)) {
    t.classList.remove('over')
  }
})
appEl.addEventListener('drop', (e) => {
  const t = e.target.closest('[data-pid]')
  if (!t || !dragId) {
    return
  }
  e.preventDefault()
  moveTo(dragId, t.dataset.pid)
  dragId = null
  render()
})
appEl.addEventListener('dragend', () => {
  dragId = null
  render()
})

// ---------- hover card ----------
let hoverTimer = null
function hideHover() {
  clearTimeout(hoverTimer)
  const hc = document.getElementById('hc')
  if (hc) {
    hc.innerHTML = ''
  }
}
appEl.addEventListener('mouseover', (e) => {
  if (!f('hovercard') || S.menu || S.overlay || dragId) {
    return
  }
  const row = e.target.closest('.ws, .ws2')
  if (!row || row.contains(e.relatedTarget)) {
    return
  }
  hideHover()
  hoverTimer = setTimeout(() => showHover(row), 700)
})
appEl.addEventListener('mouseout', (e) => {
  const row = e.target.closest('.ws, .ws2')
  if (row && !row.contains(e.relatedTarget)) {
    hideHover()
  }
})
function showHover(row) {
  const w = wsById(row.dataset.ws)
  if (!w) {
    return
  }
  const r = row.getBoundingClientRect()
  const a = appEl.getBoundingClientRect()
  const sb = appEl.querySelector('.sb').getBoundingClientRect()
  const top = Math.max(44, Math.min(r.top - a.top - 8, a.height - 300))
  const t = effType(w)
  const p = proj(w.projectId)
  document.getElementById('hc').innerHTML =
    `<div class="hovercard" style="left:${sb.right - a.left + 8}px;top:${top}px">
    <div class="hh">${t ? `<span style="color:${TYPES[t].color}">${ic(TYPES[t].icon, 's35')}</span>` : ''}${esc(w.name)}<span style="flex:1"></span><span style="font-weight:400;font-size:11px;color:var(--faint)">${ago(w.ago)}</span></div>
    <div><div class="k">${esc(p.name)}</div>${effectiveRoots(w)
      .map(
        (r) =>
          `<div class="row mono">${esc(r.label)} ${ic('branch', 's3')}<span class="b">${esc(r.branch)}</span>${r.dirty ? '<span class="dot" style="width:5px;height:5px;background:var(--modified)"></span>' : ''}${r.override ? '<span class="b">· override</span>' : ''}</div>`
      )
      .join('')}</div>
    ${(w.agents || []).length ? `<div><div class="k">Agents</div>${w.agents.map((ag) => `<div class="row">${agentGlyph(ag.kind)}<span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(ag.ex)}</span><span class="b mono">${ag.state}</span></div>`).join('')}</div>` : ''}
    ${w.linear?.length ? `<div><div class="k">Linear</div><div class="row mono">${w.linear.join(' · ')}</div></div>` : ''}
    ${w.summary ? `<div><div class="k">Where you left off · AI summary (P3)</div><div class="sum">${esc(w.summary)}</div></div>` : ''}
  </div>`
}

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'cap') {
    if (e.key === 'Escape') {
      S.overlay = null
      render()
    } else if (e.key === 'Enter') {
      const title = e.target.value.trim()
      if (title) {
        S.model.inbox.unshift({ id: `i${Date.now()}`, title, from: S.current, ago: 0 })
        S.overlay = null
        S.inboxOpen = true
        toast('Captured to Inbox', `Linked to ${esc(wsById(S.current).name)}`)
        render()
      }
    }
    return
  }
  const mod = (isMac ? e.metaKey : e.ctrlKey) || e.altKey
  // MRU: Ctrl+` (physical Backquote)
  if (e.ctrlKey && e.code === 'Backquote') {
    e.preventDefault()
    const n = mruList().length
    if (!S.mruOpen) {
      S.mruOpen = true
      S.mruIdx = e.shiftKey ? n - 1 : 1
    } else {
      S.mruIdx = (S.mruIdx + (e.shiftKey ? n - 1 : 1)) % n
    }
    render()
    return
  }
  if (S.overlay === 'marks') {
    const marks = S.model.marks
    if (/^Digit[1-9]$/.test(e.code)) {
      const id = marks[Number(e.code.slice(5)) - 1]
      if (id) {
        activate(id)
        S.overlay = null
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const d = e.key === 'ArrowDown' ? 1 : -1
      const to = Math.max(0, Math.min(8, S.selSlot + d))
      if (e.altKey) {
        ;[marks[S.selSlot], marks[to]] = [marks[to], marks[S.selSlot]]
      }
      S.selSlot = to
    } else if (e.key === 'Backspace') {
      marks[S.selSlot] = null
    } else if (e.key.toLowerCase() === 'a') {
      S.model.marks = marks.map((x, i) =>
        i === S.selSlot ? S.current : x === S.current ? null : x
      )
    } else if (e.key === 'Enter') {
      const id = marks[S.selSlot]
      if (id) {
        activate(id)
        S.overlay = null
      }
    } else if (e.key === 'Escape') {
      S.overlay = null
    } else {
      return
    }
    e.preventDefault()
    render()
    return
  }
  if (e.key === 'Escape') {
    S.menu = null
    S.overlay = null
    render()
    return
  }
  if (mod && /^Digit[1-9]$/.test(e.code) && f('marks')) {
    const id = S.model.marks[Number(e.code.slice(5)) - 1]
    if (id) {
      e.preventDefault()
      activate(id)
      render()
    }
    return
  }
  if (mod && e.shiftKey && e.code === 'KeyH') {
    e.preventDefault()
    toggleMark(S.current)
    render()
  } else if (mod && e.code === 'Semicolon' && f('marks')) {
    e.preventDefault()
    S.overlay = 'marks'
    S.selSlot = 0
    render()
  } else if (mod && e.shiftKey && e.code === 'KeyK' && f('inbox')) {
    e.preventDefault()
    S.overlay = 'capture'
    S.captureText = ''
    render()
  } else if (mod && e.shiftKey && e.code === 'Backspace') {
    e.preventDefault()
    archive(S.current)
  }
})
document.addEventListener('keyup', (e) => {
  if (S.mruOpen && (e.key === 'Control' || !e.ctrlKey)) {
    const w = mruList()[S.mruIdx]
    S.mruOpen = false
    if (w) {
      activate(w.id)
    }
    render()
  }
})

// ---------- page controls ----------
function syncControls() {
  document.querySelectorAll('[data-set]').forEach((b) => {
    const [k, v] = b.dataset.set.split(':')
    b.setAttribute('aria-pressed', String(String(S[k]) === v))
  })
  document.querySelectorAll('[data-check]').forEach((c) => (c.checked = !!S[c.dataset.check]))
  const wr = document.getElementById('width')
  if (wr) {
    wr.value = S.width
    document.getElementById('wv').textContent = `${S.width}px`
  }
  document.querySelectorAll('[data-scope-min]').forEach((el) => {
    el.style.opacity = SCOPE_RANK[S.scope] >= Number(el.dataset.scopeMin) ? 1 : 0.35
  })
}
document.querySelector('.controls').addEventListener('click', (e) => {
  const b = e.target.closest('[data-set]')
  if (b) {
    const [k, v] = b.dataset.set.split(':')
    S[k] = v === 'true' ? true : v === 'false' ? false : v
    S.menu = null
    render()
  }
  const t = e.target.closest('[data-trigger]')
  if (t) {
    trigger(t.dataset.trigger)
  }
})
document.querySelector('.controls').addEventListener('change', (e) => {
  if (e.target.dataset.check) {
    S[e.target.dataset.check] = e.target.checked
    render()
  }
})
document.getElementById('width').addEventListener('input', (e) => {
  S.width = Number(e.target.value)
  render()
})

function trigger(name) {
  if (name === 'reset') {
    S.model = clone(window.SEED)
    S.current = 'w-sidebar'
    S.toast = null
  } else if (name === 'agent-asks') {
    const w = wsById('w-review')
    w.agents[0] = {
      ...w.agents[0],
      state: 'waiting',
      ex: 'Post 3 blocking comments to PR #6012?',
      ago: 0
    }
    w.ago = 0
    toast(
      'Codex in “Review #6012” is waiting for you',
      'Shown in Needs you; the row gets an orange dot'
    )
  } else if (name === 'agent-done') {
    const w = wsById('w-gmcp')
    w.agents[0] = {
      ...w.agents[0],
      state: 'done',
      ex: 'Calendar tools added; 41 tests pass',
      ago: 0
    }
    w.unread = S.current !== 'w-gmcp'
    w.ago = 0
  } else if (name === 'marks') {
    S.overlay = 'marks'
    S.selSlot = 0
  } else if (name === 'mru') {
    S.mruOpen = true
    S.mruIdx = 1
    setTimeout(() => {
      const w = mruList()[S.mruIdx]
      S.mruOpen = false
      if (w) {
        activate(w.id)
      }
      render()
    }, 1600)
  } else if (name === 'capture') {
    S.overlay = 'capture'
    S.captureText = ''
  } else if (name === 'archive') {
    archive(S.current)
    return
  } else if (name === 'drag') {
    // Show drop verdicts as if dragging Google MCP.
    render()
    const w = wsById('w-gmcp')
    appEl.querySelector('.ws[data-ws="w-gmcp"]')?.classList.add('dragging')
    appEl.querySelectorAll('section.proj[data-pid], .tile[data-pid]').forEach((el) => {
      const p = proj(el.dataset.pid)
      if (p.id === w.projectId) {
        return
      }
      const v = verdict(w, p)
      if (el.classList.contains('tile')) {
        el.classList.add(v.ok ? 'drop-ok' : 'drop-no')
      } else {
        el.dataset.verdict = v.kind
        el.querySelector('.drop-cap').textContent = v.text
      }
      if (p.id === 'gwl') {
        el.classList.add('over')
        const sc = el.closest('.sb-scroll')
        if (sc) {
          sc.scrollTop = el.offsetTop - sc.offsetTop - 120
        }
      }
    })
    return
  }
  render()
}

// ---------- notes under the frame ----------
const NOTES = {
  desk: {
    title: 'Desk: attention on top, projects below (lead concept)',
    pitch:
      'Two kinds of order, each in its own place: things that need you (agent waiting, marks) are pinned at the top, and every Project keeps a stable place below. You order the Marks and the Projects; the app orders Workspaces inside each Project by recency and parks what has gone stale. Mark numbers never shift: removing mark 2 leaves slot 2 empty.',
    rows: [
      [
        '1 Cleanup',
        'No more “Link Linear issue” rows. Linked keys show inline only when they exist; linking lives in ⋯ and right-click (and becomes a Cmd+J action).'
      ],
      [
        '2 Distinction',
        'Size ladder: 11px uppercase section labels, 13px semibold projects, 13px workspaces, 12px agents. Hairlines only between top-level sections, whitespace between projects. Idle agents collapse into a count chip.'
      ],
      [
        '3 Switching',
        `Marks 1–9 (Harpoon). ${MOD}1–9 jump, ${MOD}${SHIFT}H marks or unmarks the current one, ${MOD}; opens the marks list. ${CTRL}\` toggles to the previous Workspace; hold it to step back through recent ones.`
      ],
      [
        '4 Recency',
        'Workspaces sort by last activity inside a stable Project order (switch Project order to Recent to compare). Rows show relative times, workspaces idle 7+ days fold into “Parked · n”, and Needs you lists agents waiting on you, capped at 3 rows.'
      ],
      [
        '5 Work type',
        'A 2px rail in the type color (Feature blue, Review pink, Plan teal; Fix and Chore neutral). Use the Type marker control to compare rail, glyph, or both.'
      ],
      [
        '6 Archive while open',
        `Archive is enabled for the open Workspace (${MOD}${SHIFT}⌫). Ether switches to the previous Workspace and shows an Undo toast; running agents are named, not stopped.`
      ],
      [
        '7 Roots',
        'Roots appear once, under the Project name, in mono. A row only shows what differs from the Project: an override branch with a dirty dot. The footer shows the open Workspace’s full scope.'
      ],
      [
        '8 Move',
        'Drag a row onto another Project. Projects with the same roots accept it, superset Projects accept it with “adds X”, and the rest dim with “Missing X”. Move to Project… in ⋯ does the same from the keyboard.'
      ]
    ]
  },
  stream: {
    title: 'Stream: one list ordered by attention and time',
    pitch:
      'No project tree at all. One flat list grouped Needs you / Today / This week / Older, with two-line rows that show the latest agent line. Projects become a filter. This is the most direct answer to “out of sight, out of mind”, at the cost of spatial memory.',
    rows: [
      ['1 Cleanup', 'Same as Desk.'],
      [
        '2 Distinction',
        'Time-bucket headers carry the structure; the second line on each row gives context without extra rows.'
      ],
      ['3 Switching', 'Marks show as chips only (no section). Same keymap.'],
      ['4 Recency', 'Strongest: the list itself is ordered by time and attention.'],
      [
        '5 Work type',
        'The colored type glyph leads every row, so type is the most visible attribute.'
      ],
      ['6 Archive', 'Same as Desk.'],
      ['7 Roots', 'Weakest: roots only appear in the footer and hover card.'],
      ['8 Move', 'Move to Project… only. There are no project targets to drag onto.']
    ]
  },
  rail: {
    title: 'Rail: Slack-style project column plus one project at a time',
    pitch:
      'A 48px column of project tiles (badges for needs-you and unread) and mark tiles. The pane shows one Project, or Home (all projects by attention). It handles roots, moving, and compact mode well, but it hides other Projects’ work.',
    rows: [
      ['1 Cleanup', 'Same as Desk.'],
      ['2 Distinction', 'Strongest separation: only one Project is visible at a time.'],
      ['3 Switching', 'Mark tiles sit permanently on the rail; one click or the keymap.'],
      ['4 Recency', 'Home gives a time-ordered list; project tiles badge activity.'],
      ['5 Work type', 'Rail colors appear on rows and mark tiles.'],
      ['6 Archive', 'Same as Desk.'],
      ['7 Roots', 'Roots get room under the single Project header.'],
      ['8 Move', 'Drag a row onto a Project tile. Invalid tiles dim.']
    ]
  }
}
function renderNotes() {
  const n = NOTES[S.concept]
  document.getElementById('notes').innerHTML = `
    <h2>Chosen defaults (2026-10-22)</h2>
    <p>Desk · P0 first · roots in the footer only · marked rows move to Marks · manual Project order · type marker: rail and glyph (P1). The footer moved into P0 because the roots choice depends on it.</p>
    <h2>${n.title}</h2><p>${n.pitch}</p>
    <table><tr><th style="width:150px">Concern</th><th>How this concept answers it</th></tr>${n.rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
    <h2>Try it</h2>
    <table>
      <tr><td style="width:240px"><kbd>${MOD}1</kbd>–<kbd>9</kbd> (or <kbd>${ALT}1</kbd>–<kbd>9</kbd> in a browser)</td><td>Jump to mark. Browsers reserve ${MOD}+digit, so use ${ALT}+digit here.</td></tr>
      <tr><td><kbd>${MOD}${SHIFT}H</kbd> / <kbd>${ALT}${SHIFT}H</kbd></td><td>Mark or unmark the open Workspace</td></tr>
      <tr><td><kbd>${MOD};</kbd> / <kbd>${ALT};</kbd></td><td>Marks list: digits open, ↑↓ select, ${ALT}↑↓ reorder, A puts the current Workspace in the selected slot, ⌫ clears it</td></tr>
      <tr><td><kbd>${CTRL}\`</kbd></td><td>Tap to toggle to the previous Workspace; hold ${CTRL} and press \` repeatedly to step back (${SHIFT} goes the other way)</td></tr>
      <tr><td><kbd>${MOD}${SHIFT}⌫</kbd> / <kbd>${ALT}${SHIFT}⌫</kbd></td><td>Archive the open Workspace (with Undo)</td></tr>
      <tr><td><kbd>${MOD}${SHIFT}K</kbd> / <kbd>${ALT}${SHIFT}K</kbd> <span class="tag">P2</span></td><td>Capture something that came up to the Inbox without touching the current chat</td></tr>
      <tr><td>Drag a row <span class="tag">P1</span></td><td>Onto another Project header (Desk) or tile (Rail). Try Google MCP: Gateway Ops accepts it (same roots), LLM Gateway / LiteLLM accepts it with “adds litellm”, Orca and Clio Manage refuse it.</td></tr>
      <tr><td>Right-click or ⋯</td><td>Type, Rename, Mark, Linear issues…, Edit checkouts…, Move to Project…, Archive</td></tr>
      <tr><td>Hover a row for 0.7s <span class="tag">P2</span></td><td>Resume card: roots and branches, agents, Linear issues, and a “where you left off” summary</td></tr>
    </table>
    <h2>Scope levels</h2>
    <p><b>P0</b> is cleanup plus switching: Linear row removed, size ladder, roots in the footer, recency sort, archive while open, marks, recent switcher. <b>P1</b> adds Needs you, auto-park, drag between Projects, and type color (all eight concerns). <b>P2+</b> previews where this is heading: Inbox capture, scratch Workspaces, resume hover card, compact rail, and the right-side assistant.</p>`
}

render()
