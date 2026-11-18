'use strict';

// Browser state is a projection. All delegation records and commands belong to Host.
const $ = (selector) => document.querySelector(selector);
const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const tabs = [['progress', '进展'], ['plan', '方案与依据'], ['decisions', '待决事项'], ['results', '结果与学习'], ['sources', '资料'], ['conversation', '补充对话']];
const lifecycleLabels = { active: '进行中', pausing: '正在暂停', paused: '已暂停', resuming: '正在核对恢复资格', ending: '正在结束', ended: '已结束' };
const state = { delegations: [], runtime: null, detail: null, selectedId: null, tab: 'progress', filter: 'all', reminders: false, loaded: false, connected: false, busy: false, error: '', updatedAt: null, unresolved: null };
const drafts = new Map();
const decisionDrafts = new Map();
let opener = null;
let refreshing = false;
let refreshTimer;
let decisionNavigation = null;

function button(action, label, attributes = '') { return `<button data-action="${action}" ${attributes}>${label}</button>`; }
function badge(text, tone = '') { return `<span class="badge ${tone}">${escapeText(text)}</span>`; }
function title(item) { const line = item.goal.split('\n')[0]; return line.length > 26 ? `${line.slice(0, 26)}…` : line; }
function time(value) { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '时间未记录'; }
function canWrite() { return state.connected && !state.busy && !state.unresolved; }
function isEditable(item) { return ['active', 'paused'].includes(item.lifecycle); }
function records(name) { return Array.isArray(state.detail?.[name]) ? state.detail[name] : []; }
function pendingDecisions() { return state.delegations.flatMap((delegation) => (Array.isArray(delegation.pendingDecisions) ? delegation.pendingDecisions : []).map((entry) => ({ ...entry, delegationId: delegation.id }))); }
function choiceLabel(action) { return ({ adopt: '已采纳', partial: '已部分采纳', adjust: '已提出调整', reject: '已拒绝', defer: '已暂缓' })[action] || '明确选择已保存'; }
function notificationMatters(feed) {
  const latest = new Map();
  for (const item of Array.isArray(feed?.matters) ? feed.matters : []) if ([undefined, 'current'].includes(item.qualification) && (!latest.has(item.id) || Number(item.revision) > Number(latest.get(item.id).revision))) latest.set(item.id, item);
  return [...latest.values()];
}
function notificationContent(feed, item, overview = false) {
  if (!feed) return '<p class="alert-empty">尚无已保存的工作日简报或重要提醒。</p>';
  if (item.lifecycle !== 'active') return '<p class="secondary">当前生命周期不派发普通简报与提醒；记录保留，续作前核对当前资格。</p>';
  const matters = notificationMatters(feed);
  const matches = (ref) => matters.some((matter) => matter.id === ref.id && Number(matter.revision) === Number(ref.revision));
  const refs = (notice) => Array.isArray(notice.refs) ? notice.refs : Array.isArray(notice.matters) ? notice.matters : [];
  const notices = (Array.isArray(feed.notices) ? feed.notices : []).filter((notice) => [undefined, 'current'].includes(notice.qualification) && refs(notice).length && refs(notice).every(matches));
  const brief = (Array.isArray(feed.briefs) ? feed.briefs : []).slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
  const noChange = brief?.status === 'no_change' || feed.checkState?.status === 'no_change';
  const briefHeld = brief && (['historical', 'unavailable'].includes(brief.qualification) || ((brief.status === 'published' || brief.kind === 'brief') && (!refs(brief).length || !refs(brief).every(matches))));
  const held = (Array.isArray(feed.notices) ? feed.notices : []).some((notice) => ['historical', 'unavailable'].includes(notice.qualification)) || (Array.isArray(feed.matters) ? feed.matters : []).some((matter) => ['historical', 'unavailable'].includes(matter.qualification)) || (brief && (['historical', 'unavailable'].includes(brief.qualification) || ((brief.status === 'published' || brief.kind === 'brief') && (!refs(brief).length || !refs(brief).every(matches)))));
  const briefText = noChange ? '<p class="secondary">工作日核对已记录，暂无实质变化；未额外推送空简报。</p>' : brief && !briefHeld && (brief.status === 'published' || brief.kind === 'brief') ? `<div class="section-actions"><h3>工作日简报</h3><p class="record-body">${escapeText(brief.summary)}</p><p class="meta">${time(brief.createdAt)} · 无需逐条签收</p></div>` : '';
  const cards = matters.map((matter) => {
    const related = notices.filter((notice) => refs(notice).some((ref) => ref.id === matter.id && Number(ref.revision) === Number(matter.revision)));
    const reminder = related.some((notice) => notice.kind === 'reminder');
    const important = matter.urgency === 'immediate' || related.some((notice) => notice.kind === 'immediate');
    const kind = ({ inform: '只需告知', fact: '需补关键事实', decision: '经营者取舍' })[matter.kind] || '待关注事项';
    const links = overview ? button('open', '查看进展', `class="text-button" data-id="${escapeText(item.id)}"`) : `${matter.artifact ? button('artifact-open', `查看依据 v${escapeText(matter.artifact.version)}`, `class="text-button" data-artifact="${escapeText(matter.artifact.artifactId)}" data-plan-version="${escapeText(matter.artifact.version)}"`) : ''}${matter.decision ? button('decision-open', '查看对应取舍', `class="text-button" data-decision="${escapeText(matter.decision.id)}" data-decision-revision="${escapeText(matter.decision.revision)}"`) : ''}`;
    return `<article class="change-row" data-matter-id="${escapeText(matter.id)}" data-matter-revision="${escapeText(matter.revision)}"><div><div class="actions">${badge(kind)}${important ? badge('重要变化', 'warning') : ''}${reminder ? badge('决策窗口跟进', 'warning') : ''}</div><h3>${escapeText(matter.title)}</h3><p class="record-body">${escapeText(matter.summary)}</p>${Array.isArray(matter.changes) && matter.changes.length ? textList(matter.changes) : ''}${important && matter.immediateReason ? `<p class="record-body">及时关注的原因：${escapeText(matter.immediateReason)}</p>` : ''}${related.filter((notice) => notice.kind === 'reminder' && notice.reason).map((notice) => `<p class="record-body">${escapeText(notice.reason)}</p>`).join('')}<p class="meta">事项 r${escapeText(matter.revision)} · ${time(matter.createdAt)}${overview ? ` · ${escapeText(title(item))}` : ''}</p>${!overview ? `<details class="history-disclosure" data-disclosure="${disclosureKey('notification', matter.id, matter.revision)}"><summary>依据与合并说明</summary><p class="record-body">${escapeText(matter.mergeReason)}</p>${textList(matter.unknowns, '未列额外未知；不据此推定依据穷尽')}</details>` : ''}<div class="actions">${links}</div></div></article>`;
  }).join('');
  return `${briefText}${cards}${held ? '<p class="secondary">所引事项版本或资料资格已变化，原简报或事项正文当前不可用；请以当前获准依据为准。</p>' : ''}${!briefText && !cards && !held ? '<p class="alert-empty">尚无已保存的工作日简报或重要提醒。</p>' : ''}<p class="scope-line">站内展示不表示经营者已读或采纳；独立研究继续，实际选择另行记录。</p>`;
}
function notificationPanel(item) { return `<section class="subtle-panel" data-notification-feed><h2>简报与站内提醒</h2>${notificationContent(state.detail?.notificationFeed, item)}</section>`; }
function recordState(value) {
  return ({ pending: '等待执行', running: '执行中', ended: '已收束', progress: '继续研究', waiting: '等待信息', ready: '报告就绪', blocked: '受阻', failed: '失败', dropped: '无须继续', completed: '已完成', stopped: '已停止', saved: '已保存', recorded: '已记录', delivered: '已送达', unavailable: '不可用', revoked: '已撤权' })[value] || value || '尚未记录';
}
function latestArtifact() { return records('artifacts').filter((entry) => entry.qualification === 'current').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1); }
function disclosureKey(...parts) { return escapeText(parts.map((part) => encodeURIComponent(String(part))).join(':')); }
function isLatestRevision(entry) { return !records('artifactRevisions').some((other) => other.artifactId === entry.artifactId && Number(other.version) > Number(entry.version)); }
function latestRevision() { return records('artifactRevisions').filter((entry) => entry.qualification === 'current' && isLatestRevision(entry)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1); }
function currentJudgment() {
  const revision = latestRevision(); const report = latestArtifact(); const lifecycle = current()?.lifecycle;
  return `<section class="judgement"><div class="section-label">${revision ? `${lifecycle === 'ended' ? '最后交付 · ' : lifecycle !== 'active' ? '已保存 · ' : ''}${revision.kind === 'plan' ? '方案' : '判断'} v${escapeText(revision.version)}` : report ? '基础研究报告' : '当前判断'}</div><h2>${revision ? escapeText(revision.content.title) : report ? '已有基础研究记录' : '尚无当前可用的研究判断'}</h2><p class="record-body">${revision ? escapeText(revision.content.summary) : report ? escapeText(report.summary) : '研究判断以已保存报告和准确资料版本为依据；工单正在运行不代表已得出结论。'}</p>${revision ? `<p class="meta">${time(revision.createdAt)} · 委托 v${escapeText(revision.goalRevision)} · ${lifecycle === 'ended' ? '委托已结束，交付保留为历史；不表示经营效果已发生' : '建议不表示采纳、实际执行或经营效果'}</p>` : report ? `<p class="meta">${time(report.createdAt)} · 尚未形成当前版本化判断；基础报告不等于完整方案</p>` : ''}</section>`;
}
function textList(values, empty = '尚未记录') { return Array.isArray(values) && values.length ? `<ul class="plain-list">${values.map((value) => `<li class="record-body">${escapeText(value)}</li>`).join('')}</ul>` : `<p class="secondary">${escapeText(empty)}</p>`; }
function evidenceList(evidence) { return Array.isArray(evidence) && evidence.length ? `<ul>${evidence.map((item) => `<li><a href="#delegation/${encodeURIComponent(state.selectedId)}/sources">${escapeText(item.ref)}</a><code class="reference-value">SHA256 ${escapeText(item.hash)}</code></li>`).join('')}</ul>` : '<p class="meta">该版本没有保存来源引用；依据限制以交付内容为准。</p>'; }
function artifactCard(entry) {
  const content = entry.content; const latest = isLatestRevision(entry); const currentVersion = latest && entry.qualification === 'current'; const isPlan = entry.kind === 'plan'; const lifecycle = current()?.lifecycle;
  const label = currentVersion ? lifecycle === 'active' ? '当前版本' : lifecycle === 'ended' ? '最后交付版本 · 委托已结束' : '已保存最新版本' : latest ? '历史成果 · 资格已变化' : '历史版本';
  return `<li class="research-record" tabindex="-1" data-artifact-id="${escapeText(entry.artifactId)}" data-artifact-version="${escapeText(entry.version)}"><div class="record-heading"><h2>${escapeText(content.title)}</h2><div class="actions">${badge(`${isPlan ? '方案' : '判断'} v${entry.version}`)}${badge(label, currentVersion && lifecycle === 'active' ? 'accent' : 'warning')}</div></div><p class="record-body">${escapeText(content.summary)}</p><p class="meta">${time(entry.createdAt)} · 委托 v${escapeText(entry.goalRevision)}${entry.supersedes ? ` · 修订自 v${escapeText(entry.supersedes.version)}` : ''}</p><p class="record-body">修订依据：${escapeText(entry.reason)}</p>${isPlan ? `<div class="section-actions"><h3>建议</h3><p class="record-body">${escapeText(content.recommendation)}</p></div>` : ''}<details class="history-disclosure" data-disclosure="${disclosureKey('artifact', entry.artifactId, entry.version, 'basis')}"><summary>依据、假设与适用条件</summary><div class="report-evidence"><h3>准确依据版本</h3>${evidenceList(content.evidence)}</div><div class="section-actions"><h3>假设</h3>${textList(content.assumptions, '未列额外假设')}</div><div class="section-actions"><h3>仍未知</h3>${textList(content.unknowns, '未列额外未知；不据此推定依据穷尽')}</div><div class="section-actions"><h3>适用范围</h3><p class="record-body">${escapeText(content.applicability)}</p><h3>失效或重评条件</h3>${textList(content.invalidatedBy, '未列额外失效条件')}</div></details>${isPlan ? `<details class="history-disclosure" data-disclosure="${disclosureKey('artifact', entry.artifactId, entry.version, 'plan')}"><summary>备选、约束与观察安排</summary><div class="section-actions"><h3>备选及代价</h3><ul class="plain-list">${(Array.isArray(content.alternatives) ? content.alternatives : []).map((alternative) => `<li><p class="record-body">${escapeText(alternative.option)}</p><p class="record-body">代价：${escapeText(alternative.costs)}</p><p class="record-body">风险：${escapeText(alternative.risks)}</p></li>`).join('')}</ul><h3>约束</h3>${textList(content.constraints, '未列额外约束')}</div><dl class="definition-list section-actions">${[['baseline', '基线'], ['expectedChange', '预期变化'], ['measure', '评价口径'], ['window', '观察窗口'], ['source', '观察来源'], ['check', '检查安排']].map(([field, label]) => `<div><dt>${label}</dt><dd class="record-body">${escapeText(content.observation?.[field] || '尚未记录')}</dd></div>`).join('')}</dl></details>` : ''}<p class="scope-line">${currentVersion && lifecycle === 'active' ? '当前建议仍需核对适用条件，经营取舍由负责人决定。' : '保留当时交付及依据，不作为当前推荐或续作授权。'}</p></li>`;
}
function followupCard(entry, item) {
  const interrupted = item.lifecycle !== 'active'; const schedulingUnknown = ['unknown', 'creating'].includes(entry.schedule?.status); let label;
  if (item.lifecycle === 'ended') label = '历史安排 · 委托已结束';
  else if (item.lifecycle === 'paused') label = '安排保留 · 恢复前核资格';
  else if (item.lifecycle === 'resuming') label = '安排待恢复资格核对';
  else if (['pausing', 'ending'].includes(item.lifecycle)) label = '停止核对中 · 安排保留';
  else if (schedulingUnknown) label = '复查调度结果未确认 · UNKNOWN';
  else label = ({ waiting: entry.trigger?.kind === 'source_event' && !entry.trigger.reviewAt ? '观察中 · 等待来源事件' : entry.schedule?.status === 'active' ? '观察中 · 已安排复查' : '观察安排待核对', due: '复查条件已到 · 尚未记录检查', observed: '已记录本次检查', cancelled: '安排已收束', superseded: '已随版本或资格变化失效' })[entry.status] || '观察状态待核对';
  const version = records('artifactRevisions').find((revision) => revision.artifactId === entry.artifact?.artifactId && revision.version === entry.artifact?.version);
  const timing = entry.trigger?.kind === 'at' ? `${interrupted ? '原定' : ''}复查时点：${time(entry.trigger.at)}` : `来源事件：${(Array.isArray(entry.trigger?.sourceIds) ? entry.trigger.sourceIds : []).join('、')}${entry.trigger?.reviewAt ? `；${interrupted ? '原定' : ''}复查时点：${time(entry.trigger.reviewAt)}` : '；未设置固定复查时间'}`;
  return `<li><div class="record-heading"><strong>${escapeText(label)}</strong></div><p class="record-body">${escapeText(entry.reason)}</p><p class="meta">${escapeText(version?.content.title || '关联成果')} · v${escapeText(entry.artifact?.version)}<br>${escapeText(timing)}</p>${Array.isArray(entry.dependencies) && entry.dependencies.length ? `<p class="record-body">等待条件：${entry.dependencies.map(escapeText).join('；')}</p>` : ''}${schedulingUnknown ? '<p class="meta">调度回执未确认 · UNKNOWN；原安排和记录保留，等待 Host 核对实际状态。</p>' : entry.schedule?.status === 'stop_pending' ? '<p class="meta">原生定时停止回执尚待核对。</p>' : ''}${entry.observation ? `<p class="record-body">本次检查记录：${escapeText(entry.observation.summary)}</p><p class="meta">${time(entry.observation.at)} · 不据此推定采纳、实际执行或经营效果</p>` : ''}</li>`;
}
function followupList(item) {
  const entries = records('followups'); if (!entries.length) return '';
  const open = entries.filter((entry) => ['waiting', 'due'].includes(entry.status)); const historical = entries.filter((entry) => !['waiting', 'due'].includes(entry.status));
  return `<div class="section-actions"><h3>观察与复查安排</h3>${open.length ? `<ol class="timeline">${open.map((entry) => followupCard(entry, item)).join('')}</ol>` : '<p class="secondary">当前没有尚待检查的观察安排。</p>'}${historical.length ? `<details class="history-disclosure" data-disclosure="followup-history"><summary>历史跟进记录（${historical.length}）</summary><ol class="timeline">${historical.map((entry) => followupCard(entry, item)).join('')}</ol></details>` : ''}</div>`;
}
function sourceSummary() {
  const coverage = records('sources');
  if (!coverage.length) return '尚未接入';
  const ready = coverage.filter((entry) => entry.status === 'ready').length;
  return `${ready}/${coverage.length} 个来源上次核对就绪`;
}
function researchLabel(item) {
  if (item.pendingOperation?.outcome === 'unknown') return '运行控制结果未确认 · UNKNOWN';
  if (['pausing', 'ending'].includes(item.lifecycle)) return '停止核对中';
  if (item.lifecycle === 'resuming') return '待恢复资格核对';
  if (['paused', 'ended'].includes(item.lifecycle)) return '研究已停止';
  const status = item.research?.status;
  return ({ not_started: '等待运行资格', unconfigured: '等待研究运行资格', following: '持续跟进已启用', running: '研究执行中', researching: '研究执行中', waiting: '等待信息或研究资源', blocked: '研究受阻', failed: '研究失败', unknown: '研究状态未确认 · UNKNOWN', ready: '本轮研究报告就绪', observing: '有理由观察', idle: '持续跟进中' })[status] || (status ? `研究状态：${status}` : '运行状态待核实');
}
function announce(text) { $('#announcement').textContent = text; }
function current() { return state.detail?.delegation?.id === state.selectedId ? state.detail.delegation : null; }

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch {
    const error = new Error('未能连接 Host，保存或运行结果尚不能确认。');
    error.code = 'CONNECTION_UNCONFIRMED';
    throw error;
  }
  let body;
  try { body = await response.json(); } catch {
    const error = new Error('Host 返回的状态无法读取，结果尚不能确认。');
    error.code = 'RESPONSE_UNCONFIRMED';
    throw error;
  }
  if (!response.ok) {
    const error = new Error(body.error?.message || '这次请求未完成，请核对当前状态。');
    error.code = response.status >= 500 && options.method === 'POST' ? 'REQUEST_UNCONFIRMED' : body.error?.code || 'REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return body;
}

function render() {
  const focused = document.activeElement;
  const focusId = focused?.id;
  const focusRegion = focused?.closest('#screen,#mandate-nav');
  const focusContext = focusRegion?.dataset.context || '';
  const datasetIdentity = (element) => JSON.stringify(Object.entries(element.dataset).sort(([a], [b]) => a.localeCompare(b)));
  const focusDataset = focused instanceof HTMLElement ? datasetIdentity(focused) : '';
  const focusFormId = focused?.closest('form')?.id;
  const isSubmit = focused instanceof HTMLButtonElement || focused instanceof HTMLInputElement ? focused.type === 'submit' : false;
  const selection = focused instanceof HTMLTextAreaElement ? [focused.selectionStart, focused.selectionEnd] : null;
  const disclosureContext = JSON.stringify([state.selectedId, state.tab, state.reminders]);
  const sameDisclosureContext = $('#screen').dataset.disclosureContext === disclosureContext;
  const disclosureState = new Map(sameDisclosureContext ? Array.from($('#screen').querySelectorAll('details[data-disclosure]')).map((element) => [element.dataset.disclosure, element.open]) : []);
  const focusedDisclosure = focused?.tagName === 'SUMMARY' ? focused.closest('details[data-disclosure]')?.dataset.disclosure : null;
  const focusedOutcomeBefore = focusedDisclosure?.startsWith('outcome:') || focusedDisclosure?.startsWith('effect:') ? { key: focusedDisclosure, historyPrefix: focusedDisclosure.startsWith('effect:') ? 'effect-history:' : 'outcome-history:', historical: Boolean(focused.closest('details')?.parentElement?.closest('details')?.dataset.disclosure?.startsWith(focusedDisclosure.startsWith('effect:') ? 'effect-history:' : 'outcome-history:')) } : null;
  const focusedArtifact = focused?.dataset.artifactId && focused?.dataset.artifactVersion ? { artifactId: focused.dataset.artifactId, version: Number(focused.dataset.artifactVersion) } : null;
  const focusedCard = focused?.closest('[data-artifact-id][data-artifact-version]');
  const focusedCardBefore = focusedCard ? { artifactId: focusedCard.dataset.artifactId, version: focusedCard.dataset.artifactVersion, historical: focusedCard.closest('details[data-disclosure]')?.dataset.disclosure === 'artifact-history' } : null;
  const item = current();
  $('#overview-nav').classList.toggle('active', !state.selectedId && !state.reminders);
  $('#reminders-nav').classList.toggle('active', !state.selectedId && state.reminders);
  $('#reminder-count').textContent = String(pendingDecisions().length);
  $('#mandate-nav').innerHTML = state.delegations.length ? state.delegations.map((delegation) => button('open', escapeText(title(delegation)), `class="mandate-nav ${delegation.id === state.selectedId ? 'active' : ''}" data-id="${escapeText(delegation.id)}"`)).join('') : '<p class="meta">暂无委托</p>';
  $('#connection-status').textContent = state.connected ? `已连接 · ${time(state.updatedAt)}` : state.loaded ? '连接未确认' : '连接中';
  const runtimeMessage = state.runtime?.message || '研究运行环境尚未接通。';
  $('#service-status').textContent = state.connected ? runtimeMessage : state.loaded ? 'Host 暂时无法确认。下方保留最后可核实状态，尚未确认新的运行事实。' : '正在连接工作台…';
  $('#service-status').className = `service-status ${state.connected ? ['unconfigured', 'unavailable', 'failed'].includes(state.runtime?.status) ? 'warning' : '' : state.loaded ? 'danger' : ''}`;
  let content;
  if (!state.loaded) content = '<div class="empty-state"><h1>正在载入委托</h1><p>正在读取 Host 保存的当前状态。</p></div>';
  else if (state.selectedId && !item) content = `<div class="empty-state"><h1>委托暂时无法查看</h1><p>请刷新核对当前访问资格和保存状态。</p>${button('refresh', '重新读取', 'class="primary"')}${button('overview', '返回总览')}</div>`;
  else content = item ? detail(item) : overview();
  $('#screen').innerHTML = `${errorNotice()}${content}`;
  $('#screen').dataset.disclosureContext = disclosureContext;
  for (const element of $('#screen').querySelectorAll('details[data-disclosure]')) if (disclosureState.has(element.dataset.disclosure)) element.open = disclosureState.get(element.dataset.disclosure);
  $('#screen').dataset.context = state.selectedId ? JSON.stringify(['delegation', state.selectedId]) : state.reminders ? 'reminders' : 'overview';
  if (focusRegion && focused !== document.body && !focused.isConnected) {
    let replacement = null;
    if ((focusRegion.dataset.context || '') === focusContext) {
      const matches = (element) => element.tagName === focused.tagName && !element.disabled;
      if (focusId) {
        const candidate = document.getElementById(focusId);
        if (candidate && focusRegion.contains(candidate) && matches(candidate) && datasetIdentity(candidate) === focusDataset) replacement = candidate;
      } else if (focused.dataset.action) {
        const candidates = Array.from(focusRegion.querySelectorAll('[data-action]')).filter((element) => matches(element) && datasetIdentity(element) === focusDataset);
        if (candidates.length === 1) replacement = candidates[0];
      } else if (isSubmit && focusFormId) {
        const form = document.getElementById(focusFormId);
        const candidates = form && focusRegion.contains(form) ? Array.from(form.querySelectorAll('button,input')).filter((element) => matches(element) && element.type === 'submit') : [];
        if (candidates.length === 1) replacement = candidates[0];
      } else if (focusedDisclosure && sameDisclosureContext) {
        const disclosure = Array.from(focusRegion.querySelectorAll('details[data-disclosure]')).find((element) => element.dataset.disclosure === focusedDisclosure);
        const candidate = disclosure?.querySelector('summary');
        if (candidate && matches(candidate)) replacement = candidate;
      } else if (focusedArtifact && sameDisclosureContext) replacement = artifactElement(focusedArtifact);
    }
    let artifactRevealed = false;
    if ((focusedArtifact || focusedDisclosure) && replacement) for (let ancestor = replacement.tagName === 'SUMMARY' ? replacement.closest('details')?.parentElement?.closest('details') : replacement.closest('details'); ancestor; ancestor = ancestor.parentElement?.closest('details')) { if (!ancestor.open) artifactRevealed = true; ancestor.open = true; }
    const restoredCard = replacement?.closest('[data-artifact-id][data-artifact-version]');
    const artifactMoved = focusedCardBefore && !focusedCardBefore.historical && restoredCard?.dataset.artifactId === focusedCardBefore.artifactId && restoredCard?.dataset.artifactVersion === focusedCardBefore.version && restoredCard.closest('details[data-disclosure]')?.dataset.disclosure === 'artifact-history';
    const outcomeMoved = focusedOutcomeBefore && !focusedOutcomeBefore.historical && replacement?.closest('details')?.dataset.disclosure === focusedOutcomeBefore.key && replacement.closest('details')?.parentElement?.closest('details')?.dataset.disclosure?.startsWith(focusedOutcomeBefore.historyPrefix);
    (replacement || $('#main')).focus({ preventScroll: true });
    if (artifactRevealed || artifactMoved || outcomeMoved) { replacement.scrollIntoView({ block: 'start' }); window.scrollBy({ top: -$('#service-status').getBoundingClientRect().height }); }
    if (selection && replacement instanceof HTMLTextAreaElement) replacement.setSelectionRange(...selection);
  }
}

function errorNotice() {
  if (!state.error && !state.unresolved) return '';
  return `<div class="notice danger page-error" role="alert"><strong>${state.unresolved ? '这次保存结果尚未确认' : '需要核对当前状态'}</strong><p>${escapeText(state.error)}</p><div class="section-actions actions">${state.unresolved ? button('retry-save', '核对并重试同一次保存', `${state.busy ? 'disabled' : ''}`) : button('refresh', '重新读取当前状态', `${state.busy ? 'disabled' : ''}`)}</div>${state.unresolved ? '<p class="meta">保留原请求身份，不新增第二次操作；未确认前暂停其他写入。</p>' : ''}</div>`;
}

function overview() {
  const pending = pendingDecisions();
  const shown = state.delegations.filter((item) => state.reminders ? pending.some((entry) => entry.delegationId === item.id) || notificationMatters(item.notificationFeed).length > 0 : state.filter === 'all' || (state.filter === 'ended' ? item.lifecycle === 'ended' : item.lifecycle !== 'ended'));
  return `<div class="page-heading"><div><div class="heading-label">持续委托 / 工作空间</div><h1>${state.reminders ? '待决提醒' : '委托总览'}</h1><p>${state.reminders ? '知悉不代表决定，未回复不构成授权。' : '查看重要变化、当前判断，以及需要你作出的取舍。'}</p></div><div class="actions">${button('create', '＋ 新建委托', `class="primary" ${canWrite() ? '' : 'disabled'}`)}</div></div>
  ${state.delegations.length ? `<div class="attention"><section class="panel"><div class="panel-title"><h2>需要你的取舍</h2>${badge(`${pending.length} 项待决`)}</div>${pending.length ? pending.map((entry) => `<div class="attention-item"><div><h3>${escapeText(entry.title || entry.question)}</h3><p>方案 v${escapeText(entry.artifact?.version)} · 知悉不代表采纳</p></div>${button('reminder-open', '查看取舍', `class="text-button" data-id="${escapeText(entry.delegationId)}" data-decision="${escapeText(entry.id)}" data-decision-revision="${escapeText(entry.revision)}"`)}</div>`).join('') : '<p class="alert-empty">当前没有可核实的待决事项。研究判断与经营选择分别记录。</p>'}</section><section class="panel"><div class="panel-title"><h2>重要变化</h2>${badge('站内记录')}</div>${state.delegations.map((entry) => notificationContent(entry.notificationFeed, entry, true)).join('')}</section></div>` : ''}
  <section><div class="list-toolbar"><div class="section-heading"><h2>${state.reminders ? '待决相关委托' : '我的委托'}</h2><span class="meta">${shown.length} 个</span></div>${!state.reminders ? `<div class="filter-group" aria-label="委托筛选">${[['all', '全部'], ['active', '未结束'], ['ended', '已结束']].map(([value, label]) => button('filter', label, `data-value="${value}" class="${state.filter === value ? 'active' : ''}" aria-pressed="${state.filter === value}"`)).join('')}</div>` : ''}</div>
  ${shown.length ? `<div class="mandate-list"><div class="list-header"><span>委托与目标</span><span>生命周期</span><span>研究状态</span><span>最近变化</span></div>${shown.map((item) => `<div class="mandate-row"><div>${button('open', escapeText(title(item)), `class="mandate-title" data-id="${escapeText(item.id)}"`)}<p>${escapeText(item.goal)}</p></div><div>${badge(lifecycleLabels[item.lifecycle] || '状态待核实', item.lifecycle === 'active' ? 'accent' : '')}</div><div class="research-label">${escapeText(researchLabel(item))}</div><div class="last-update meta">${time(item.updatedAt)}</div></div>`).join('')}</div>` : `<div class="empty-state"><h2>${state.reminders ? '当前没有待决提醒' : state.delegations.length ? '这个视图下没有委托' : '从一个持续目标开始'}</h2><p>${state.reminders ? '负责人明确选择后才记录决定。当前没有可核实的待决事项。' : state.delegations.length ? '切换筛选可查看其他委托及历史成果。' : '用一段话表达目标，可选补充边界。委托会由 Host 保存，无需保持页面打开。'}</p>${state.reminders ? button('overview', '查看委托总览', 'class="primary"') : state.delegations.length ? button('filter-reset', '查看全部委托', 'class="primary"') : button('create', '新建委托', `class="primary" ${canWrite() ? '' : 'disabled'}`)}</div>`}</section>`;
}

function lifecycleNotice(item) {
  if (item.pendingOperation?.outcome === 'unknown') return '<div class="notice danger"><strong>运行控制结果未确认 · UNKNOWN</strong><p>原操作和已有记录保留。Host 需核对实际回执与资源状态，不盲目重放，也不将未确认的停止或恢复记为完成。</p></div>';
  if (item.lifecycle === 'pausing') return '<div class="notice warning"><strong>正在暂停 · 停止结果待核对</strong><p>后续派发已关闭，等待 Host 核对在途资源和停止回执。停止尚未确认前，不显示已暂停。</p></div>';
  if (item.lifecycle === 'ending') return '<div class="notice warning"><strong>正在结束 · 停止结果待核对</strong><p>后续派发已关闭。已有成果和历史保留，待决不会被记作采纳或拒绝。</p></div>';
  if (item.lifecycle === 'resuming') return '<div class="notice warning"><strong>正在核对恢复资格 · 尚未续作</strong><p>Host 将核对当前目标、资料权限、运行资源和已有回执。未具备资格的部分继续等待，无需反复点击恢复。</p></div>';
  if (item.lifecycle === 'paused') return '<div class="notice"><strong>委托已暂停</strong><p>已有目标、补充内容和历史保留。恢复前将重新核对当前资格。</p></div>';
  if (item.lifecycle === 'ended') return '<div class="notice"><strong>委托已结束 · 历史保留</strong><p>新信息不会自动重开，也不表示目标已达成或实际经营行动被撤销。</p></div>';
  const rawReason = state.detail?.researchStatus?.reason || item.research?.reason;
  const reason = ({budget_exhausted:'委托预算不足，已保存的成果保留；资源由Host管理员处理。',budget_expired:'委托资源授权已到期，尚未派发后续研究。',credential_unavailable:'模型凭据尚未就绪，由Host管理员处理。',credential_revoked:'模型凭据授权已撤回。',egress_denied:'当前资料出口未获授权。',egress_changed:'资料出口授权已变化，旧请求不能继续。',host_resource_unconfirmed:'部分资源结果尚未确认，未盲目重试。'})[rawReason] || rawReason;
  return `<div class="notice ${['not_started', 'unconfigured', 'blocked', 'failed', 'unknown'].includes(item.research?.status) ? 'warning' : ''}"><strong>${escapeText(researchLabel(item))}</strong><p>${escapeText(state.runtime?.message || '研究运行环境尚未接通。委托和已有记录已经保存，尚未开始研究。')}</p>${reason ? `<p class="meta">当前限制：${escapeText(reason)}</p>` : ''}</div>`;
}

function detail(item) {
  const writable = canWrite();
  const actions = isEditable(item) ? `${button('edit', '调整委托', writable ? '' : 'disabled')}${button(item.lifecycle === 'paused' ? 'resume' : 'pause', item.lifecycle === 'paused' ? '恢复' : '暂停', `${item.lifecycle === 'paused' ? 'class="primary"' : ''} ${writable ? '' : 'disabled'}`)}${button('end', '结束委托', `class="ghost danger" title="收束待决并保留历史，不记采纳或拒绝" ${writable ? '' : 'disabled'}`)}` : item.lifecycle === 'resuming' ? button('end', '结束委托', `class="ghost danger" title="收束待决并保留历史，不记采纳或拒绝" ${writable ? '' : 'disabled'}`) : item.lifecycle === 'ended' ? button('related', '新建关联委托', `class="primary" ${writable ? '' : 'disabled'}`) : '';
  return `${button('overview', '← 委托总览', 'class="text-button back-link"')}<div class="page-heading detail-heading"><div><div class="heading-label">持续委托 · 委托 v${escapeText(item.goalRevision)}</div><h1>${escapeText(title(item))}</h1>${badge(lifecycleLabels[item.lifecycle] || '状态待核实', item.lifecycle === 'active' ? 'accent' : '')}<p class="goal">${escapeText(item.goal)}</p></div><div class="actions">${actions}</div></div>
  <div class="state-strip"><span>研究<strong>${escapeText(researchLabel(item))}</strong></span><span>资料<strong>${escapeText(sourceSummary())}</strong></span><span class="call-note">Call <strong>待接入</strong></span></div>${lifecycleNotice(item)}
  <div class="tabs" role="tablist" aria-label="委托内容">${tabs.map(([id, label]) => `<button class="tab" id="tab-${id}" role="tab" aria-selected="${state.tab === id}" aria-controls="tabpanel" tabindex="${state.tab === id ? '0' : '-1'}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}</div>
  <section id="tabpanel" role="tabpanel" aria-labelledby="tab-${state.tab}" tabindex="0">${({ progress, plan, decisions, results, sources, conversation }[state.tab])(item)}</section>`;
}

function progress(item) {
  const tickets = records('research');
  const following = ['following', 'running', 'researching', 'waiting', 'idle', 'ready'].includes(item.research?.status);
  return `<div class="detail-grid"><div class="main-column">${currentJudgment()}${notificationPanel(item)}<section><div class="section-heading"><h2>当前研究重点</h2><span class="meta">方法与优先级由 Agent 自主决定</span></div>${tickets.length ? `<ol class="research-records">${tickets.map(ticket=>ticketCard(ticket,item)).join('')}</ol>` : `<div class="subtle-panel"><h3>${escapeText(researchLabel(item))}</h3><p>当前尚无可核实的研究工单；运行限制与业务资料缺口分别记录。</p></div>`}</section><section class="subtle-panel"><div class="section-heading"><h2>下一步</h2></div><p>${item.lifecycle === 'ended' ? '本委托已结束。继续工作时可新建关联委托，重新核对资料与授权。' : item.lifecycle === 'paused' ? '已有目标和记录保持可见。收到恢复意图后，Host 会先核对当前资格。' : item.lifecycle === 'resuming' ? '等待当前运行资格核对；尚未续作，不重放未知操作。' : ['pausing', 'ending'].includes(item.lifecycle) ? '等待 Host 核对停止事实，期间不派发新研究。' : following ? 'Host 已启用持续跟进；研究执行和判断以工单、报告记录为准。无需保持此页面打开，新进展会随保存的记录更新。' : '等待当前运行限制处理。已有目标和补充资料会保留，无需重复录入。'}</p>${followupList(item)}<p class="scope-line">委托边界：${escapeText(item.boundary || '未补充额外偏好；当前仅研究与建议，经营动作由负责人决定。')}</p></section>${versionHistory(item)}${technicalDetails()}</div><aside class="side-column"><section class="panel"><h2>资料覆盖</h2>${coverageMini()}<div class="source-mini"><div class="source-heading"><span>Call</span>${badge('待接入')}</div><p>只读接缝开发后排，当前未读取 Call 资产。</p></div></section><section class="panel"><h2>最近记录</h2>${activity(item)}</section></aside></div>`;
}

function ticketCard(ticket, item) {
  const assignment = Array.isArray(ticket.assignments) ? ticket.assignments.at(-1) : null;
  const report = assignment?.report;
  return `<li class="research-record"><div class="record-heading"><h3>${escapeText(ticket.title || '研究工单')}</h3>${badge(ticket.qualification === 'historical' ? '历史工单 · 当前目标未派发' : item.lifecycle === 'ended' ? '已停止 · 历史工单' : item.lifecycle === 'paused' ? '暂停 · 工单保留' : ['pausing','ending'].includes(item.lifecycle) ? '停止结果待核对' : item.lifecycle === 'resuming' ? '恢复资格待核对' : recordState(ticket.ended?.outcome || assignment?.state || 'pending'), ticket.qualification === 'historical' ? 'warning' : assignment?.state === 'running' && item.lifecycle === 'active' ? 'accent' : '')}</div><p class="meta">建立 ${time(ticket.createdAt)} · 最近变化 ${time(ticket.updatedAt)}</p>${report ? `<p class="record-body">${escapeText(report.summary)}</p><p class="meta">${ticket.reportQualification === 'historical' ? '历史工单报告 · 需重新核对依据' : '工单报告'} · ${escapeText(recordState(report.state))} · ${time(report.at)}</p>` : '<p class="secondary">尚无已保存的工单报告。</p>'}${ticket.attention?.question ? `<p class="notice warning record-body">待关注：${escapeText(ticket.attention.question)}</p>` : ''}${ticket.ended?.reason ? `<p class="meta">收束原因：${escapeText(ticket.ended.reason)}</p>` : ''}</li>`;
}
function coverageMini() {
  const coverage = records('sources');
  return coverage.length ? coverage.map((entry) => `<div class="source-mini"><div class="source-heading"><span>${escapeText(entry.sourceId)}</span>${badge(({ ready: '上次核对就绪', pending: '待核对', unavailable: '受阻', revoked: '已撤权' })[entry.status] || entry.status, entry.status === 'ready' ? 'accent' : 'warning')}</div><p>${entry.reason ? escapeText(entry.reason) : `授权修订 ${escapeText(entry.grantRevision)}`}</p></div>`).join('') : '<p class="alert-empty">尚无其他已接通来源。资料缺口与运行故障分别记录。</p>';
}
function technicalDetails() {
  const technical = records('technical'); const deliveries = records('deliveries');
  const resources = state.detail?.hostResources;
  if (!technical.length && !deliveries.length && !resources) return '';
  const budget=resources?.budget;
  const resourceSummary=resources ? `<p>计算环境尚未配置，计算保持关闭；不会回落到宿主机执行。</p><p class="meta">${budget?.config ? `模型请求：已计量 ${escapeText(budget.used.modelRequests)}，已预约 ${escapeText(budget.held.modelRequests)}，剩余额度 ${escapeText(budget.remaining.modelRequests)}；输出 token：已计量 ${escapeText(budget.used.outputTokens)}，已预约 ${escapeText(budget.held.outputTokens)}；未确认用量 ${escapeText(budget.unknownCount)} 项。当前在途请求 ${escapeText(resources.activeModelRequests)}。` : '委托预算尚未配置。'} 配额用于资源控制，不代表费用或研究结论。</p><p class="meta">外部研究、外发提醒、导出、遥测和备份出口均未启用；必要原生历史仅在本机保存。</p>` : ''; 
  const description = (entry) => typeof entry.detail === 'object' && entry.detail !== null ? ['reason', 'code', 'state', 'outcome'].filter((key) => typeof entry.detail[key] === 'string').map((key) => `${key}: ${entry.detail[key]}`).join(' · ') : '';
  return `<details class="runtime-details"><summary>运行与接收记录（${technical.length + deliveries.length}）</summary><p class="meta">仅显示保存的技术事实，不据此推定研究结论或经营效果。</p>${resourceSummary}<ol class="timeline">${technical.map((entry) => `<li><time>${time(entry.createdAt)}</time><strong>${escapeText(entry.kind)}</strong>${description(entry) ? `<p class="record-body">${escapeText(description(entry))}</p>` : ''}</li>`).join('')}${deliveries.map((entry) => `<li><time>${time(entry.createdAt || entry.at)}</time>${escapeText(entry.kind)} · ${escapeText(recordState(entry.state))}</li>`).join('')}</ol></details>`;
}

function versionHistory(item) {
  const history = state.detail.history || item.revisions || [];
  if (!history.length) return '';
  return `<details class="scope-history"><summary>委托版本历史</summary>${history.map((entry) => `<article><h3>${entry.revision ? `委托 v${escapeText(entry.revision)}` : '先前目标'}</h3><p>${escapeText(entry.goal)}</p><p class="meta">${escapeText(entry.boundary || '未补充额外边界')} · ${time(entry.at || entry.createdAt)}</p></article>`).join('')}</details>`;
}

function activity(item) {
  function label(entry) {
    const action = { pause: '暂停', resume: '恢复', end: '结束' }[entry.detail?.action] || '运行控制';
    const labels = {
      delegation_created: '委托已建立',
      delegation_adjusted: '目标与边界已调整，旧版本保留',
      lifecycle_requested: `已收到${action}意图，等待真实回执`,
      lifecycle_unknown: `${action}结果未确认，保留 UNKNOWN`,
      lifecycle_unavailable: '恢复资格尚未具备，委托保持暂停',
      lifecycle_completed: `${action}事实已核对并保存回执`,
      lifecycle_receipt_rejected: '不匹配回执已保留，未改变当前状态',
      message_recorded: '负责人补充背景已保存'
    };
    return labels[entry.kind] || '委托状态记录已保存';
  }
  if (!item.activity?.length) return '<p class="alert-empty">暂无额外记录。</p>';
  return `<ol class="timeline">${item.activity.slice(-8).reverse().map((entry) => `<li><time>${time(entry.createdAt)}</time>${escapeText(label(entry))}</li>`).join('')}</ol>`;
}
function plan() {
  const reports = records('artifacts').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const revisions = records('artifactRevisions').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || Number(b.version) - Number(a.version));
  if (!reports.length && !revisions.length) return '<div class="empty-state compact"><h2>尚未交付方案</h2><p>方案会保留建议、备选代价、依据、假设、未知及观察安排。当前没有可核实的研究交付。</p></div>';
  const currentVersions = revisions.filter((entry) => entry.qualification === 'current' && isLatestRevision(entry)); const history = revisions.filter((entry) => !currentVersions.includes(entry));
  const basicReports = reports.length ? `<section class="section-actions"><h2>基础研究报告</h2><p class="secondary">保留原报告；基础报告不等于完整方案。</p><ol class="research-records section-actions">${reports.map((entry) => `<li class="research-record"><div class="record-heading"><h3>研究报告</h3><div class="actions">${badge(recordState(entry.state))}${badge(entry.qualification === 'current' ? '当前资格' : '历史成果', entry.qualification === 'current' ? 'accent' : 'warning')}</div></div><p class="meta">${time(entry.createdAt)} · 委托 v${escapeText(entry.goalRevision)}</p><p class="record-body">${escapeText(entry.summary)}</p><div class="report-evidence"><h3>依据版本</h3>${evidenceList(entry.evidence)}</div></li>`).join('')}</ol></section>` : '';
  return `<div class="notice"><strong>判断、方案与准确依据</strong><p>每版保留当时建议与修订原因。交付不表示负责人采纳、实际执行或经营效果已发生。</p></div>${currentVersions.length ? `<ol class="research-records section-actions">${currentVersions.map(artifactCard).join('')}</ol>` : revisions.length ? '<p class="secondary section-actions">尚无当前可用的最新版本，已有成果在历史中保留。</p>' : ''}${history.length ? `<details class="history-disclosure" data-disclosure="artifact-history"><summary>历史判断与方案（${history.length}）</summary><ol class="research-records section-actions">${history.map(artifactCard).join('')}</ol></details>` : ''}${basicReports}`;
}
function decisionElementId(entry) { return `decision-${encodeURIComponent(entry.id)}-${Number(entry.revision)}`; }
function decisionAttributes(entry) { return `data-id="${escapeText(entry.id)}" data-revision="${escapeText(entry.revision)}" data-artifact="${escapeText(entry.artifact?.artifactId)}" data-plan-version="${escapeText(entry.artifact?.version)}"`; }
function decisionDraftKey(entry) { return JSON.stringify([entry.id, entry.revision, entry.artifact?.artifactId, entry.artifact?.version]); }
function decisionResponses(entry) { return Array.isArray(entry.responses) ? entry.responses : records('decisionResponses').filter((response) => (response.decisionId || response.id) === entry.id && response.revision === entry.revision); }
function decisionCard(entry, item) {
  const responses = decisionResponses(entry); const seen = entry.seenAt || responses.some((response) => response.action === 'acknowledge');
  const latest = !records('decisions').some((other) => other.id === entry.id && Number(other.revision) > Number(entry.revision));
  const eligible = latest && entry.qualification === 'current' && ['pending', 'deferred'].includes(entry.status) && item.lifecycle === 'active';
  const expired = entry.windowState === 'expired'; const writable = canWrite() && eligible; const recommendation = entry.options?.find((option) => option.id === entry.recommendation?.optionId);
  const status = entry.status === 'superseded' ? '历史待决 · 已被替代或资格变化' : entry.status === 'closed' || item.lifecycle === 'ended' ? '随委托结束收束 · 不推定选择' : entry.status === 'chosen' ? '已有明确选择' : entry.status === 'deferred' ? '已暂缓 · 仍待复看' : seen ? '已知悉 · 仍待决' : '待决定';
  const window = entry.window || {};
  const closure = ({ delegation_ending: '委托正在结束，待决收束；不记采纳或拒绝。', delegation_ended: '委托已结束，待决收束；不记采纳或拒绝。', decision_revised: '待决事项已有新修订，旧版保留为历史。', goal_changed: '目标已经调整，旧待决须重新核对适用性。', source_qualification_changed: '资料资格已变化，旧依据不能继续用于当前选择。', plan_superseded: '关联方案已有新版本，原选择不自动转移。' })[entry.closureReason];
  return `<article class="decision-card" id="${escapeText(decisionElementId(entry))}" tabindex="-1" data-decision-id="${escapeText(entry.id)}" data-decision-revision="${escapeText(entry.revision)}"><div class="record-heading">${badge(status, ['pending', 'deferred'].includes(entry.status) ? 'warning' : '')}<span class="meta">事项 r${escapeText(entry.revision)} · 方案 v${escapeText(entry.artifact?.version)}</span></div><h2>${escapeText(entry.title || entry.question)}</h2><p class="description record-body">${escapeText(entry.question)}</p><p class="meta">准确方案 ${escapeText(entry.artifact?.artifactId)} @ v${escapeText(entry.artifact?.version)}；选择仅绑定该版本和明确范围。</p><div class="decision-details"><dl class="definition-list"><div><dt>推荐与依据</dt><dd class="record-body">${recommendation ? `${escapeText(recommendation.label)}：` : ''}${escapeText(entry.recommendation?.reason || '推荐尚未记录')}</dd></div><div><dt>仍未知</dt><dd>${textList(entry.unknowns, '未列额外未知；不据此推定依据穷尽')}</dd></div><div><dt>暂不决定的影响</dt><dd class="record-body">${escapeText(entry.nondecisionImpact)}</dd></div></dl><dl class="definition-list"><div><dt>提醒时间</dt><dd>${window.remindAt ? time(window.remindAt) : '未另设提醒时间'}</dd></div><div><dt>最迟有效决定时间</dt><dd>${window.decideBy ? time(window.decideBy) : '暂无硬性截止'}</dd></div><div><dt>执行期限</dt><dd>${window.executeBy ? time(window.executeBy) : '未确定执行期限；不表示已执行'}</dd></div><div><dt>窗口依据与下次复查</dt><dd class="record-body">${escapeText(window.basis)}<br>${window.nextReviewAt ? time(window.nextReviewAt) : '复查安排尚未记录'}</dd></div></dl></div><details class="history-disclosure" data-disclosure="${disclosureKey('decision', entry.id, entry.revision, 'options')}"><summary>选择范围、代价和风险</summary><ul class="plain-list">${(Array.isArray(entry.options) ? entry.options : []).map((option) => `<li><strong>${escapeText(option.label)}</strong><p class="record-body">范围：${escapeText(option.scope)}</p><p class="record-body">代价：${escapeText(option.costs)}</p><p class="record-body">风险：${escapeText(option.risks)}</p></li>`).join('')}</ul></details><div class="section-actions"><h3>Agent 接下来会做什么</h3>${textList(entry.nextActions)}</div><div class="actions section-actions">${button('artifact-open', `查看方案 v${escapeText(entry.artifact?.version)} 与依据`, `class="text-button" data-artifact="${escapeText(entry.artifact?.artifactId)}" data-plan-version="${escapeText(entry.artifact?.version)}"`)}${button('decision-acknowledge', seen ? '已知悉，仍需独立决定' : '知悉此事项', `${decisionAttributes(entry)} ${writable && !seen ? '' : 'disabled'}`)}</div>${expired ? '<div class="notice warning section-actions"><strong>决策窗口已过，等待适用性核对</strong><p>可以保存你的回应；Agent 核对当前方案、范围和窗口后再记录有效选择。</p></div>' : ''}<div class="decision-options section-actions">${button('decision-adopt', `采纳推荐范围<span>${escapeText(recommendation?.scope || '尚无明确推荐范围')}；只记录选择，不自动执行</span>`, `class="option-button" ${decisionAttributes(entry)} ${writable && !expired && recommendation ? '' : 'disabled'}`)}${button('decision-defer', '暂缓此事项<span>保留待决与复看影响</span>', `class="option-button" ${decisionAttributes(entry)} ${writable && !expired ? '' : 'disabled'}`)}${button('decision-reply', '调整或说明选择<span>一句话说明采纳范围、调整、拒绝或暂缓</span>', `class="option-button" ${decisionAttributes(entry)} ${writable ? '' : 'disabled'}`)}</div><p class="scope-line">${item.lifecycle !== 'active' ? '当前生命周期不接受新的业务选择；已有选择与历史保留。' : !eligible ? closure || '此事项保留为历史，不能把旧版选择转移到新方案。' : '已读与沉默不表示采纳；未回复只等待相关取舍，独立研究继续。'}</p>${responses.filter((response) => response.action === 'reply').length ? `<div class="section-actions"><h3>已保存的回应</h3>${responses.filter((response) => response.action === 'reply').map((response) => `<p class="record-body">${escapeText(response.text)}</p><p class="meta">${time(response.createdAt)} · 原话已保存，明确选择以独立记录为准</p>`).join('')}</div>` : ''}</article>`;
}
function decisions(item) {
  const entries = records('decisions'); const choices = records('operatorChoices');
  if (!entries.length && !choices.length) return '<div class="empty-state compact"><h2>当前没有待决事项</h2><p>研究判断与负责人选择分别保存。沉默、已读或暂停均不记作采纳。</p></div>';
  const currentEntries = entries.filter((entry) => entry.qualification === 'current' && !entries.some((other) => other.id === entry.id && Number(other.revision) > Number(entry.revision))); const historical = entries.filter((entry) => !currentEntries.includes(entry));
  return `${currentEntries.map((entry) => decisionCard(entry, item)).join('')}${historical.length ? `<details class="history-disclosure" data-disclosure="decision-history"><summary>历史待决事项（${historical.length}）</summary>${historical.map((entry) => decisionCard(entry, item)).join('')}</details>` : ''}<section class="decision-history"><div class="section-heading"><h2>选择记录</h2>${button('tab', '查看结果四项 →', 'class="text-button" data-tab="results"')}</div>${choices.length ? choices.map((choice) => `<div class="history-row"><div><strong>${escapeText(choiceLabel(choice.action))}</strong><p class="record-body">${escapeText(choice.text)}</p><p class="record-body">范围：${escapeText(choice.scope || '以明确回应记录为准')}</p><span class="meta">方案 v${escapeText(choice.artifact?.version)} · 事项 r${escapeText(choice.revision)} · 不等于实际执行或新增授权</span></div><span class="meta">${time(choice.createdAt)}</span></div>`).join('') : '<p class="alert-empty">尚无明确经营选择。已读、沉默、暂停均不记作采纳。</p>'}</section>`;
}
function outcomeSources(entry) {
  const evidence = Array.isArray(entry.evidence) ? entry.evidence : []; const statements = Array.isArray(entry.statementIds) ? entry.statementIds : [];
  return `${evidence.length ? `<p class="meta">准确资料引用；记录来源不等于效果已获证明。</p>${evidenceList(evidence)}` : ''}${statements.length ? `<ul class="plain-list">${statements.map((id) => { const statement = Array.isArray(entry.statements) ? entry.statements.find((item) => item.messageId === id && item.kind === 'operator_statement') : null; return `<li><a href="#delegation/${encodeURIComponent(state.selectedId)}/conversation">负责人原始陈述 ${escapeText(id)}</a>${statement ? `<p class="record-body">原话：${escapeText(statement.text)}</p><p class="meta">${time(statement.createdAt)}</p>` : ''}<p class="meta">陈述未经系统独立核实。</p></li>`; }).join('')}</ul>` : ''}${!evidence.length && !statements.length ? '<p class="meta">尚无可核对来源，缺口与未知单独保留。</p>' : ''}`;
}
function outcomeRecord(entry, kind) {
  const execution = kind === 'execution'; const label = execution ? ({ not_started: '未执行', partial: '部分执行', completed: '已完成执行', unknown: '执行情况未知' })[entry.status] || '执行状态未确认' : ({ mature: '观察已成熟', immature: '观察未成熟', missing_data: '观察缺资料' })[entry.maturity] || '观察成熟性未确认';
  return `<div class="section-actions" data-outcome-kind="${kind}" data-outcome-id="${escapeText(entry.id)}" data-outcome-revision="${escapeText(entry.revision)}"><strong>${escapeText(label)}</strong><p class="record-body">${escapeText(execution ? entry.extent : entry.result)}</p><p class="record-body">实际范围：${escapeText(entry.scope)}</p><p class="meta">${execution ? `执行事实 r${escapeText(entry.revision)} · 截至 ${time(entry.asOf)}${entry.startedAt ? ` · 开始 ${time(entry.startedAt)}` : ''}${entry.endedAt ? ` · 结束 ${time(entry.endedAt)}` : ''}` : `观察 r${escapeText(entry.revision)} · 观察于 ${time(entry.observedAt)}<br>期间 ${time(entry.period?.from)} — ${time(entry.period?.to)}<br>对应执行 ${escapeText(entry.execution?.id)} @ r${escapeText(entry.execution?.revision)}`}</p><details class="history-disclosure" data-disclosure="${disclosureKey('outcome', kind, entry.id, entry.revision)}"><summary>${execution ? '执行依据与未知' : '观察口径、依据与缺口'}</summary>${!execution ? `<dl class="definition-list"><div><dt>基线</dt><dd class="record-body">${escapeText(entry.baseline)}</dd></div><div><dt>评价口径</dt><dd class="record-body">${escapeText(entry.measure)}</dd></div><div><dt>可比性与限制</dt><dd class="record-body">${escapeText(entry.comparability)}</dd></div></dl><div class="section-actions">${textList(entry.gaps, '未列额外资料缺口；不据此推定证据完整')}</div>` : ''}<div class="section-actions">${outcomeSources(entry)}</div><div class="section-actions">${textList(entry.unknowns, '未列额外未知；不据此推定已证实')}</div><p class="record-body">修订依据：${escapeText(entry.reason)}</p><p class="meta">记录 ${escapeText(entry.id)} @ r${escapeText(entry.revision)} · ${time(entry.createdAt)}</p></details></div>`;
}
function effectRecord(entry) {
  const content = entry.content; const effect = content.effect;
  return `<div class="section-actions" data-effect-id="${escapeText(entry.artifactId)}" data-effect-version="${escapeText(entry.version)}"><strong>${escapeText(content.title)}</strong>${badge(`效果判断 v${entry.version}`)}<p class="record-body">${escapeText(content.summary)}</p><p class="record-body">判断范围：${escapeText(effect.scope)}</p><p class="meta">执行 ${escapeText(effect.execution.id)} @ r${escapeText(effect.execution.revision)}<br>观察 ${escapeText(effect.observation.id)} @ r${escapeText(effect.observation.revision)}</p><details class="history-disclosure" data-disclosure="${disclosureKey('effect', entry.artifactId, entry.version)}"><summary>归因依据、竞争解释与限制</summary><div class="section-actions"><h4>证据与结论的联系</h4><p class="record-body">${escapeText(effect.evidenceConnection)}</p>${evidenceList(content.evidence)}</div><div class="section-actions"><h4>竞争解释</h4>${textList(effect.competingExplanations, '未列其他竞争解释；不据此推定已排除')}</div><div class="section-actions"><h4>限制</h4>${textList(effect.limitations, '未列额外限制；不据此推定效果已证实')}</div><div class="section-actions"><h4>仍未知</h4>${textList(content.unknowns, '未列额外未知；不据此推定依据穷尽')}</div><p class="record-body">修订依据：${escapeText(entry.reason)}</p><p class="meta">效果判断 ${escapeText(entry.artifactId)} @ v${escapeText(entry.version)} · ${time(entry.createdAt)}<br>准确方案 ${escapeText(effect.plan.artifactId)} @ v${escapeText(effect.plan.version)} · 选择 ${escapeText(effect.choiceId)}</p></details><p class="scope-line">有限归因保留竞争解释与未知，不自动采纳经验或执行经营动作。</p></div>`;
}
function cognitionCorrections() {
  const cognition = state.detail?.cognition || {}; const supports = Array.isArray(cognition.supportRelations) ? cognition.supportRelations : []; const reviews = Array.isArray(cognition.reviews) ? cognition.reviews : []; const tasks = Array.isArray(cognition.reevaluations) ? cognition.reevaluations : [];
  if (!supports.length && !reviews.length && !tasks.length) return '';
  const pending = tasks.filter((entry) => entry.status === 'pending' && entry.qualification !== 'unavailable');
  const completed = tasks.filter((entry) => entry.status !== 'pending' && entry.qualification !== 'unavailable');
  const currentReviews = reviews.filter((entry) => entry.qualification !== 'unavailable');
  const currentSupports = supports.filter((entry) => entry.qualification !== 'unavailable');
  const unavailable = [...supports, ...reviews, ...tasks].filter((entry) => entry.qualification === 'unavailable');
  const reference = (entry) => `${escapeText(entry?.artifactId)} @ v${escapeText(entry?.version)}`;
  const reviewHtml = currentReviews.map((entry) => `<li class="research-record"><div class="record-heading"><h3>认识修正</h3><div class="actions">${badge(({ maintained: '维持', limited: '限缩', revised: '修订', withdrawn: '撤回', unknown: '证据不足' })[entry.conclusion] || entry.conclusion)}</div></div><p class="record-body">${escapeText(entry.summary)}</p><p class="meta">原判断 ${reference(entry.judgment)}${entry.resultJudgment ? ` → 新判断 ${reference(entry.resultJudgment)}` : ''}<br>触发 ${escapeText(({ source_event: '来源事件', execution: '执行修订', observation: '观察修订', followup: '原生复查' })[entry.trigger?.kind] || entry.trigger?.kind || 'unknown')}</p><div class="report-evidence"><h3>变化、限制与后续</h3>${textList(entry.changes, '本次未记录明确变化')}<p class="secondary">限制：${escapeText(entry.limitations?.join('；') || '未列额外限制')}</p><p class="secondary">后续条件：${escapeText(entry.nextReview?.condition || '未记录')}</p></div></li>`).join('');
  const taskHtml = [...pending.map((entry) => ({ entry, pending: true })), ...completed.map((entry) => ({ entry, pending: false }))].map(({ entry, pending }) => `<li class="research-record"><div class="record-heading"><h3>${pending ? '待重评建议' : '建议重评'}</h3><div class="actions">${badge(pending ? '待处理' : ({ completed: '已重评', blocked: '证据不足', superseded: '目标已变化', closed: '随委托收束' })[entry.status] || entry.status, pending ? 'warning' : 'accent')}</div></div><p class="meta">准确建议 ${reference(entry.plan)} · 支持判断 ${reference(entry.judgment)}</p>${entry.result ? `<p class="record-body">${escapeText(entry.result.reason)}</p><p class="secondary">结论：${escapeText(({ maintain: '维持', adjust: '调整', limit: '限缩', withdraw: '撤回', unknown: '证据不足' })[entry.result.conclusion] || entry.result.conclusion)}；下一步：${escapeText(entry.result.nextSteps?.join('；') || '未记录')}</p>` : '<p class="secondary">等待当前资格下的独立复核。</p>'}</li>`).join('');
  const supportHtml = currentSupports.length ? `<details class="history-disclosure" data-disclosure="cognition-supports"><summary>显式支持关系（${currentSupports.length}）</summary><ul class="plain-list">${currentSupports.map((entry) => `<li class="meta">${reference(entry.judgment)} → ${reference(entry.plan)} · ${escapeText(entry.scope)}<br>${escapeText(entry.why)}</li>`).join('')}</ul></details>` : '';
  return `<section class="section-actions"><div class="section-heading"><h2>反证与建议重评</h2><span class="meta">同一委托内修正</span></div><p class="secondary">证据变化、认识修正和建议重评分别记录；旧采纳、执行和观察不迁移到新建议。</p>${pending.length ? `<p class="scope-line">待重评建议（${pending.length}）：${pending.map((entry) => reference(entry.plan)).join('、')}</p>` : ''}${reviewHtml || taskHtml ? `<ol class="research-records section-actions">${reviewHtml}${taskHtml}</ol>` : ''}${supportHtml}${unavailable.length ? `<details class="history-disclosure" data-disclosure="cognition-unavailable"><summary>资格已变化的认识记录（${unavailable.length}）</summary><p class="secondary">只保留准确版本索引；旧判断、理由和依赖说明不回放。</p><ul class="plain-list">${unavailable.map((entry) => `<li class="meta">${entry.plan ? `建议 ${reference(entry.plan)}` : entry.judgment ? `判断 ${reference(entry.judgment)}` : `记录 ${escapeText(entry.id)}`}</li>`).join('')}</ul></details>` : ''}</section>`;
}
function results() {
  const feed = state.detail?.outcomeFeed || {}; const executions = Array.isArray(feed.executions) ? feed.executions : []; const observations = Array.isArray(feed.observations) ? feed.observations : [];
  const choices = (Array.isArray(feed.choices) ? feed.choices : []).filter((choice) => choice.qualification === 'current');
  const qualified = [...executions, ...observations].filter((entry) => entry.qualification === 'current');
  const groups = new Map(choices.map((choice) => [JSON.stringify([choice.id, choice.artifact?.artifactId, choice.artifact?.version]), { choice, artifact: choice.artifact }]));
  for (const entry of qualified) { const key = JSON.stringify([entry.choiceId, entry.artifact?.artifactId, entry.artifact?.version]); if (!groups.has(key) && entry.choice) groups.set(key, { choice: entry.choice, artifact: entry.artifact }); }
  const groupHtml = Array.from(groups.values()).map(({ choice, artifact }) => {
    const matches = (entry) => entry.qualification === 'current' && entry.choiceId === choice.id && entry.artifact?.artifactId === artifact?.artifactId && entry.artifact?.version === artifact?.version;
    const actual = executions.filter(matches); const observed = observations.filter(matches); const history = [...actual.filter((entry) => !entry.latest).map((entry) => ({ entry, kind: 'execution' })), ...observed.filter((entry) => !entry.latest).map((entry) => ({ entry, kind: 'observation' }))];
    const effects = records('effectAssessments').filter((entry) => entry.qualification === 'current' && entry.kind === 'judgment' && entry.content?.effect?.choiceId === choice.id && entry.content.effect.plan.artifactId === artifact?.artifactId && entry.content.effect.plan.version === artifact?.version);
    const isLatestEffect = (entry) => !records('effectAssessments').some((other) => other.artifactId === entry.artifactId && Number(other.version) > Number(entry.version));
    const latestEffects = effects.filter(isLatestEffect); const effectHistory = effects.filter((entry) => !isLatestEffect(entry));
    const attribution = `${latestEffects.length ? latestEffects.map(effectRecord).join('') : '<strong>尚无归因判断</strong><p>改善不自动证明方案造成效果。</p>'}${effectHistory.length ? `<details class="history-disclosure" data-disclosure="${disclosureKey('effect-history', choice.id, artifact?.artifactId, artifact?.version)}"><summary>历史效果判断（${effectHistory.length}）</summary>${effectHistory.map(effectRecord).join('')}</details>` : ''}`;
    return `<section class="section-actions" data-outcome-choice="${escapeText(choice.id)}" data-outcome-artifact="${escapeText(artifact?.artifactId)}" data-outcome-plan-version="${escapeText(artifact?.version)}"><div class="section-heading"><h2>方案 v${escapeText(artifact?.version)} 的结果</h2>${button('artifact-open', `查看方案 v${escapeText(artifact?.version)} 与依据`, `class="text-button" data-artifact="${escapeText(artifact?.artifactId)}" data-plan-version="${escapeText(artifact?.version)}"`)}</div><p class="meta">准确方案 ${escapeText(artifact?.artifactId)} @ v${escapeText(artifact?.version)} · 选择 ${escapeText(choice.id)}；后续方案不会转移这些记录。</p><div class="outcome-grid section-actions"><div class="outcome-cell"><h3>01 / 选择</h3><strong>${escapeText(choiceLabel(choice.action))}</strong><p class="record-body">选择范围：${escapeText(choice.scope)}</p><p class="meta">${time(choice.createdAt)} · 不等于实际执行。</p></div><div class="outcome-cell"><h3>02 / 执行</h3>${actual.some((entry) => entry.latest) ? actual.filter((entry) => entry.latest).map((entry) => outcomeRecord(entry, 'execution')).join('') : '<strong>尚无执行反馈</strong><p>实际执行依据独立保存，不由采纳推定。</p>'}</div><div class="outcome-cell"><h3>03 / 观察</h3>${observed.some((entry) => entry.latest) ? observed.filter((entry) => entry.latest).map((entry) => outcomeRecord(entry, 'observation')).join('') : '<strong>尚无观察结果</strong><p>观察反馈及其范围、时间分别记录。</p>'}</div><div class="outcome-cell"><h3>04 / 归因</h3>${attribution}</div></div>${history.length ? `<details class="history-disclosure" data-disclosure="${disclosureKey('outcome-history', choice.id, artifact?.artifactId, artifact?.version)}"><summary>历史执行与观察修订（${history.length}）</summary>${history.map(({ entry, kind }) => outcomeRecord(entry, kind)).join('')}</details>` : ''}</section>`;
  }).join('');
  const unavailable = [...executions, ...observations].filter((entry) => entry.qualification !== 'current');
  const unavailableEffects = records('effectAssessments').filter((entry) => entry.qualification !== 'current');
  const effectIndex = unavailableEffects.length ? `<details class="history-disclosure section-actions" data-disclosure="effect-unavailable"><summary>资格已变化的效果判断（${unavailableEffects.length}）</summary><p class="secondary">只保留准确版本索引；旧结论、范围、解释及来源当前不可用，重新核对前不回放。</p><ul class="plain-list">${unavailableEffects.map((entry) => `<li class="meta">效果判断 ${escapeText(entry.artifactId)} @ v${escapeText(entry.version)} · ${time(entry.createdAt)}</li>`).join('')}</ul></details>` : '';
  return `<div class="section-heading"><h2>选择、执行、观察、归因</h2><span class="meta">四项独立记录</span></div>${groupHtml || '<div class="empty-state compact"><h2>尚无当前可展示的结果记录</h2><p>负责人明确选择、实际执行、经营观察与效果归因分别保存。</p></div>'}${unavailable.length ? `<details class="history-disclosure section-actions" data-disclosure="outcome-unavailable"><summary>资格已变化的结果记录（${unavailable.length}）</summary><p class="secondary">只保留准确记录索引，旧范围、正文和来源不在当前投影回放。</p><ul class="plain-list">${unavailable.map((entry) => `<li class="meta">${entry.kind === 'execution' ? '执行' : '观察'} ${escapeText(entry.id)} @ r${escapeText(entry.revision)} · 方案 ${escapeText(entry.artifact?.artifactId)} @ v${escapeText(entry.artifact?.version)} · ${time(entry.createdAt)}</li>`).join('')}</ul></details>` : ''}${effectIndex}${cognitionCorrections()}<div class="empty-state compact"><h2>尚无可复用经验</h2><p>经验需要相称证据、适用条件和限制。反证与原判断将保留，不因采纳或重复报告证明正确。</p></div>`;
}
function sources() {
  const coverage = records('sources'); const refs = records('sourceReferences');
  return `<div class="section-heading"><h2>来源与获准范围</h2>${badge(sourceSummary())}</div><p class="secondary">${coverage.length ? '状态反映 Host 上次核对事实；版本引用不等于当前读取授权。撤权、失联或准确版本缺失时，不以最新内容替换旧版。' : '当前没有已接通的资料来源，不读取示例内容或以缓存替代当前授权。'}</p><div class="table-scroll section-actions"><table class="source-table"><thead><tr><th>来源</th><th>核对状态</th><th>范围与影响</th><th>最近核对</th></tr></thead><tbody>${coverage.map((entry) => `<tr><td><strong>${escapeText(entry.sourceId)}</strong></td><td>${badge(({ ready: '就绪', pending: '待核对', unavailable: '受阻', revoked: '已撤权' })[entry.status] || entry.status, entry.status === 'ready' ? 'accent' : 'warning')}</td><td>授权修订 ${escapeText(entry.grantRevision)}${entry.reason ? `<p>${escapeText(entry.reason)}</p>` : ''}</td><td>${time(entry.lastCheckedAt)}</td></tr>`).join('')}<tr><td><strong>Call</strong></td><td>${badge('待接入')}</td><td>受限只读接缝开发后排<p>资料复用和版本／撤回验证尚未完成。</p></td><td><span class="meta">暂无可用引用</span></td></tr></tbody></table></div><section class="section-actions"><div class="section-heading"><h2>已观察资料版本</h2><span class="meta">${refs.length} 项引用</span></div>${refs.length ? `<ol class="research-records">${refs.map((entry) => `<li class="research-record"><h3>${escapeText(entry.relativePath)}</h3><p class="meta">来源 ${escapeText(entry.sourceId)} · ${escapeText(entry.bytes)} bytes · 原记录授权修订 ${escapeText(entry.grantRevision)}</p><code class="reference-value">引用 ${escapeText(entry.ref)}</code><code class="reference-value">SHA256 ${escapeText(entry.hash)}</code><p class="meta">来源文件时间 ${time(entry.sourceModifiedAt)}<br>Host 获取时间 ${time(entry.observedAt)}</p></li>`).join('')}</ol>` : '<p class="alert-empty">尚无已保存的资料版本引用。</p>'}</section>`;
}
function conversation(item) {
  const editable = canWrite() && item.lifecycle !== 'ended';
  const messages = state.detail.messages || item.messages || [];
  const initialGoal = item.revisions.find((revision) => revision.revision === 1)?.goal;
  return `<div class="chat-intro"><h2>补充背景，或纠正当前理解</h2><p>补充内容会随委托保存，由持续研究跟进；原目标和历史仍保留。Agent 的研究报告在“进展”和“方案与依据”中查看。</p></div><div class="conversation"><article class="message system"><header>建立时的目标</header><p class="record-body">${escapeText(initialGoal ?? '建立时的目标暂未取得')}</p></article>${messages.map((message) => `<article class="message"><header>你 · 补充背景 · ${time(message.createdAt)}</header><p class="record-body">${escapeText(message.text)}</p></article>`).join('')}</div><form id="conversation-form" class="chat-form" data-version="${escapeText(item.version)}"><div class="field"><label for="message-input">补充内容</label><textarea id="message-input" name="text" aria-describedby="message-help message-error" placeholder="补充重要背景、偏好或纠正当前理解。" ${editable ? '' : 'disabled'}>${escapeText(drafts.get(item.id) || '')}</textarea><span class="helper" id="message-help">${item.lifecycle === 'ended' ? '委托已结束，可新建关联委托继续。' : '保存补充不会自动改变业务选择、实际执行或效果归因。'}</span><span class="error" id="message-error"></span></div><div class="actions"><button class="primary" type="submit" ${editable ? '' : 'disabled'}>${state.busy ? '正在保存…' : '保存补充'}</button></div></form>`;
}

function artifactElement(ref) { return Array.from($('#screen').querySelectorAll('[data-artifact-id][data-artifact-version]')).find((element) => element.dataset.artifactId === ref.artifactId && Number(element.dataset.artifactVersion) === ref.version); }
function openExactArtifact(ref) {
  decisionNavigation = null;
  if (!records('artifactRevisions').some((entry) => entry.artifactId === ref.artifactId && entry.version === ref.version)) { state.error = '未找到该准确成果版本，不能改为展示其他方案。'; render(); announce(state.error); return; }
  state.tab = 'plan'; history.replaceState(null, '', `#delegation/${encodeURIComponent(state.selectedId)}/plan`); render();
  const card = artifactElement(ref); if (!card) return;
  for (let ancestor = card.closest('details'); ancestor; ancestor = ancestor.parentElement?.closest('details')) ancestor.open = true;
  for (const details of card.querySelectorAll('details')) details.open = true;
  card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'start' });
  window.scrollBy({ top: -$('#service-status').getBoundingClientRect().height });
}
function openExactDecision(ref) {
  decisionNavigation = null;
  const entry = records('decisions').find((value) => value.id === ref.id && Number(value.revision) === Number(ref.revision));
  if (!entry || entry.qualification !== 'current') { state.error = '对应待决事项的准确版本当前不可用，请核对当前资格；没有替换为其他版本。'; render(); announce(state.error); return; }
  state.tab = 'decisions'; history.replaceState(null, '', `#delegation/${encodeURIComponent(state.selectedId)}/decisions`); render();
  const card = document.getElementById(decisionElementId(ref)); if (!card) return;
  for (let ancestor = card.closest('details'); ancestor; ancestor = ancestor.parentElement?.closest('details')) ancestor.open = true;
  card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'start' }); window.scrollBy({ top: -$('#service-status').getBoundingClientRect().height });
}

function navigate(id = null, tab = 'progress', reminders = false, decisionRef = null) {
  decisionNavigation = decisionRef ? { delegationId: id, id: decisionRef.id, revision: decisionRef.revision } : null;
  state.selectedId = id; state.tab = tab; state.reminders = reminders; state.filter = 'all';
  const hash = id ? `#delegation/${encodeURIComponent(id)}/${tab}` : reminders ? '#reminders' : '#overview';
  if (location.hash !== hash) history.replaceState(null, '', hash);
  render();
  void refresh();
  window.scrollTo({ top: 0 });
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  let refreshedId = null;
  const requestedTarget = decisionNavigation;
  try {
    const list = await request('/api/delegations');
    state.delegations = list.delegations;
    state.runtime = list.runtime;
    if (state.selectedId) {
      const id = state.selectedId;
      const detail = await request(`/api/delegations/${encodeURIComponent(id)}`);
      if (state.selectedId === id) { state.detail = detail; state.runtime = detail.runtime; refreshedId = id; }
    }
    state.connected = true; state.updatedAt = new Date().toISOString();
  } catch (error) {
    state.connected = false;
    if (!state.loaded || !['CONNECTION_UNCONFIRMED', 'RESPONSE_UNCONFIRMED', 'REQUEST_UNCONFIRMED'].includes(error.code)) state.error = error.message;
  } finally {
    refreshing = false; state.loaded = true; render();
    const target = decisionNavigation;
    if (target && target.delegationId === state.selectedId && state.tab === 'decisions' && state.connected) {
      if (refreshedId === target.delegationId && requestedTarget === target) {
        decisionNavigation = null;
        if (current()?.id === target.delegationId) openExactDecision(target);
        else { state.error = '当前委托详情未能准确匹配，未打开其他待决事项。'; render(); announce(state.error); }
      } else void refresh();
    }
  }
}

function openDialog(content) {
  opener = document.activeElement;
  $('#dialog-content').innerHTML = content;
  $('#modal').showModal();
  ($('#modal [autofocus]') || $('#modal button')).focus();
}
function closeDialog() { $('#modal').close(); }
function dialogHeading(label, help) { return `<div class="dialog-header"><div><h2 id="dialog-title">${label}</h2><p>${help}</p></div>${button('close-dialog', '×', 'type="button" class="icon-button" aria-label="关闭弹窗"')}</div>`; }
function createDialog(related = false) {
  const item = related ? current() : null;
  openDialog(`${dialogHeading(item ? '新建关联委托' : '新建委托', '用自然语言表达持续目标，一次建立后由 Host 保存。')}<form id="create-form" data-related="${escapeText(item?.id || '')}"><div class="dialog-body">${item ? '<div class="notice">保留旧委托及历史；新委托重新核对当前资料和运行资格。</div>' : ''}<div class="field"><label for="goal-input">你希望持续关注什么？ <span class="muted">必填</span></label><textarea name="goal" id="goal-input" aria-describedby="goal-help goal-error" autofocus>${escapeText(item?.goal || '')}</textarea><span class="helper" id="goal-help">无需填写研究步骤或方法。</span><span class="error" id="goal-error"></span></div><div class="field"><label for="boundary-input">边界与偏好 <span class="muted">可选</span></label><textarea name="boundary" id="boundary-input" rows="2">${escapeText(item?.boundary || '')}</textarea></div><div class="subtle-panel"><h3>当前资料与运行范围</h3><p>Call 尚未接入。${escapeText(state.runtime?.message || '研究运行环境待核对。')} 目标和补充内容会保存，资料覆盖与研究进展以委托内记录为准。</p></div><p class="error" id="save-error" role="alert"></p></div><div class="dialog-footer">${button('close-dialog', '取消', 'type="button"')}<button class="primary" type="submit">创建并进入委托</button></div></form>`);
}
function editDialog() {
  const item = current();
  openDialog(`${dialogHeading('调整委托', `当前目标 v${escapeText(item.goalRevision)}；旧目标与历史保留。`)}<form id="edit-form" data-version="${escapeText(item.version)}"><div class="dialog-body"><div class="field"><label for="edit-goal">持续目标</label><textarea id="edit-goal" name="goal" aria-describedby="edit-error" autofocus>${escapeText(item.goal)}</textarea><span class="error" id="edit-error"></span></div><div class="field"><label for="edit-boundary">边界与偏好</label><textarea id="edit-boundary" name="boundary">${escapeText(item.boundary || '')}</textarea></div><p class="meta">调整不会改变原方案选择、执行或归因记录。</p><p class="error" id="save-error" role="alert"></p></div><div class="dialog-footer">${button('close-dialog', '取消', 'type="button"')}<button class="primary" type="submit">保存调整</button></div></form>`);
}
function decisionDialog(entry) {
  const key = decisionDraftKey(entry);
  openDialog(`${dialogHeading(`回应方案 v${escapeText(entry.artifact.version)} 的待决事项`, '一句话说明你的选择及范围。原话会保存，明确的意思和范围不要求重复确认。')}<form id="decision-reply-form" ${decisionAttributes(entry)} data-draft-key="${escapeText(key)}"><div class="dialog-body"><p class="record-body">${escapeText(entry.question)}</p><div class="field"><label for="decision-note">你的选择或调整意见</label><textarea id="decision-note" name="text" aria-describedby="decision-help decision-error" autofocus>${escapeText(decisionDrafts.get(key) || '')}</textarea><span class="helper" id="decision-help">例如：只采纳其中一部分并说明范围，或说明调整、拒绝、暂缓。知悉不表示采纳，选择不自动执行。</span><span class="error" id="decision-error" role="alert"></span></div><p class="error" id="save-error" role="alert"></p></div><div class="dialog-footer">${button('close-dialog', '取消', 'type="button"')}<button class="primary" type="submit">保存回应</button></div></form>`);
}

async function mutate(path, payload, purpose, retry = false) {
  if (state.busy || (!retry && !canWrite())) return;
  state.busy = true; state.error = ''; render();
  const form = $('#modal[open] form');
  if (form) for (const control of form.querySelectorAll('button,textarea')) control.disabled = true;
  try {
    const result = await request(path, { method: 'POST', body: JSON.stringify(payload) });
    state.unresolved = null; state.detail = result; state.selectedId = result.delegation.id; state.runtime = result.runtime;
    if (purpose === 'message') drafts.delete(result.delegation.id);
    if (purpose === 'decision-reply') decisionDrafts.delete(decisionDraftKey(payload));
    if ($('#modal').open) closeDialog();
    state.connected = true; state.updatedAt = new Date().toISOString();
    const index = state.delegations.findIndex((item) => item.id === result.delegation.id);
    if (index < 0) state.delegations.unshift(result.delegation); else state.delegations[index] = result.delegation;
    if (purpose === 'create') { state.tab = 'progress'; history.replaceState(null, '', `#delegation/${encodeURIComponent(result.delegation.id)}/progress`); $('#main').focus({ preventScroll: true }); }
    announce(purpose === 'message' ? '补充内容已保存，后续进展以研究记录为准。' : purpose === 'decision-acknowledge' ? '已知悉，仍待独立决定。' : purpose === 'decision-reply' ? '回应原话已保存；明确选择以独立记录为准。' : purpose === 'decision' ? '明确选择已保存，不表示实际执行。' : '委托变更已由 Host 保存。');
  } catch (error) {
    state.error = error.message;
    if (['CONNECTION_UNCONFIRMED', 'RESPONSE_UNCONFIRMED', 'REQUEST_UNCONFIRMED'].includes(error.code)) {
      state.unresolved = { path, payload, purpose };
      state.connected = false;
      if ($('#modal').open) closeDialog();
    } else {
      state.unresolved = null;
      const target = $('#save-error') || $('#message-error');
      if (target) target.textContent = error.message;
      if (error.status === 409) { state.error = `当前记录已变化，请核对后重新提交。${error.message}`; if ($('#modal').open) closeDialog(); await refresh(); }
    }
    announce(state.error);
  } finally {
    state.busy = false;
    if (form?.isConnected) for (const control of form.querySelectorAll('button,textarea')) control.disabled = false;
    render();
  }
}
function command(kind, additions = {}, version = current()?.version) {
  const item = current(); if (!item) return;
  void mutate(`/api/delegations/${encodeURIComponent(item.id)}/commands`, { kind, expectedVersion: version, idempotencyKey: crypto.randomUUID(), ...additions }, kind);
}
function decisionFromControl(control) {
  return records('decisions').find((entry) => entry.id === control.dataset.id && entry.revision === Number(control.dataset.revision) && entry.artifact?.artifactId === control.dataset.artifact && entry.artifact.version === Number(control.dataset.planVersion));
}
function respondToDecision(entry, action, additions = {}) {
  const item = current(); if (!item) return;
  const payload = { kind: 'decision_response', id: entry.id, revision: entry.revision, artifact: { ...entry.artifact }, action, requestId: crypto.randomUUID(), ...additions };
  void mutate(`/api/delegations/${encodeURIComponent(item.id)}/commands`, payload, action === 'reply' ? 'decision-reply' : action === 'acknowledge' ? 'decision-acknowledge' : 'decision');
}

$('#modal').addEventListener('close', () => {
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  else { const action = opener?.dataset.action; const equivalent = action ? Array.from(document.querySelectorAll('[data-action]')).find((element) => !element.disabled && Object.entries(opener.dataset).every(([key, value]) => element.dataset[key] === value)) : null; (equivalent || $('#main')).focus({ preventScroll: true }); }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'message-input' && current()) drafts.set(current().id, event.target.value);
  if (event.target.id === 'decision-note') decisionDrafts.set(event.target.closest('form').dataset.draftKey, event.target.value);
});
document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]'); if (!control || control.disabled) return;
  event.preventDefault(); const action = control.dataset.action;
  if (action === 'theme') { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); return; }
  if (action === 'close-dialog') { closeDialog(); return; }
  if (action === 'refresh') { state.error = ''; void refresh(); return; }
  if (action === 'retry-save' && state.unresolved) { const pending = state.unresolved; void mutate(pending.path, pending.payload, pending.purpose, true); return; }
  if (action === 'overview' || action === 'reminders') { navigate(null, 'progress', action === 'reminders'); return; }
  if (action === 'open' || action === 'reminder-open') { navigate(control.dataset.id, action === 'reminder-open' ? 'decisions' : 'progress', false, action === 'reminder-open' ? { id: control.dataset.decision, revision: Number(control.dataset.decisionRevision) } : null); return; }
  if (action === 'artifact-open') { openExactArtifact({ artifactId: control.dataset.artifact, version: Number(control.dataset.planVersion) }); return; }
  if (action === 'decision-open') { openExactDecision({ id: control.dataset.decision, revision: Number(control.dataset.decisionRevision) }); return; }
  if (action === 'filter' || action === 'filter-reset') { state.filter = control.dataset.value || 'all'; render(); return; }
  if (action === 'tab') { decisionNavigation = null; state.tab = control.dataset.tab; history.replaceState(null, '', `#delegation/${encodeURIComponent(state.selectedId)}/${state.tab}`); render(); $(`#tab-${state.tab}`).focus({ preventScroll: true }); return; }
  if (!canWrite()) return;
  if (action === 'create' || action === 'related') { createDialog(action === 'related'); return; }
  if (action === 'edit') { editDialog(); return; }
  if (action.startsWith('decision-')) {
    const entry = decisionFromControl(control); if (!entry) return;
    if (action === 'decision-reply') { decisionDialog(entry); return; }
    if (action === 'decision-acknowledge') { respondToDecision(entry, 'acknowledge', { text: '知悉此事项' }); return; }
    if (action === 'decision-defer') { respondToDecision(entry, 'defer', { text: '暂缓此待决事项，保留复查安排' }); return; }
    const option = entry.options?.find((candidate) => candidate.id === entry.recommendation?.optionId);
    if (action === 'decision-adopt' && option) respondToDecision(entry, 'adopt', { optionId: option.id, scope: option.scope, text: `采纳「${option.label}」，范围：${option.scope}` });
    return;
  }
  if (['pause', 'resume', 'end'].includes(action)) command(action);
});
document.addEventListener('submit', (event) => {
  if (!['create-form', 'edit-form', 'conversation-form', 'decision-reply-form'].includes(event.target.id)) return;
  event.preventDefault(); if (!canWrite()) return;
  const form = event.target; const data = new FormData(form);
  if (form.id === 'decision-reply-form') {
    const text = String(data.get('text') || '').trim();
    if (!text) { $('#decision-error').textContent = '请说明你的选择或希望调整的条件。'; $('#decision-note').setAttribute('aria-invalid', 'true'); $('#decision-note').focus(); return; }
    const entry = decisionFromControl(form); if (!entry) { state.error = '待决事项已变化，请核对当前版本后回应。'; closeDialog(); render(); return; }
    respondToDecision(entry, 'reply', { text }); return;
  }
  if (form.id === 'conversation-form') {
    const text = String(data.get('text') || '').trim();
    if (!text) { $('#message-error').textContent = '请先填写补充内容。'; $('#message-input').setAttribute('aria-invalid', 'true'); $('#message-input').focus(); return; }
    command('message', { text }, Number(form.dataset.version)); return;
  }
  const goal = String(data.get('goal') || '').trim();
  if (!goal) { const input = form.querySelector('[name="goal"]'); const error = form.querySelector('.error'); error.textContent = '请写下一段非空的持续目标。'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
  const boundary = String(data.get('boundary') || '').trim();
  if (form.id === 'create-form') void mutate('/api/delegations', { goal, boundary, ...(form.dataset.related ? { relatedTo: form.dataset.related } : {}), idempotencyKey: crypto.randomUUID() }, 'create');
  else command('adjust', { goal, boundary }, Number(form.dataset.version));
});
document.addEventListener('keydown', (event) => {
  if (!event.target.closest('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const index = tabs.findIndex(([id]) => id === state.tab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  state.tab = tabs[next][0]; history.replaceState(null, '', `#delegation/${encodeURIComponent(state.selectedId)}/${state.tab}`); render(); $(`#tab-${state.tab}`).focus({ preventScroll: true });
});
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme-toggle').textContent = theme === 'light' ? '☾' : '☀';
  $('#theme-toggle').setAttribute('aria-label', `切换为${theme === 'light' ? '暗' : '亮'}色主题`);
  try { localStorage.setItem('sentiscope-theme', theme); } catch { /* Theme preference is optional. */ }
}
try { const preference = localStorage.getItem('sentiscope-theme'); if (['light', 'dark'].includes(preference)) applyTheme(preference); } catch { /* Storage restrictions do not block product use. */ }
function readLocation() {
  decisionNavigation = null;
  const parts = location.hash.slice(1).split('/');
  if (parts[0] === 'delegation' && parts[1]) { try { state.selectedId = decodeURIComponent(parts[1]); } catch { state.selectedId = null; } state.tab = tabs.some(([id]) => id === parts[2]) ? parts[2] : 'progress'; }
  else { state.selectedId = null; state.reminders = parts[0] === 'reminders'; }
}
window.addEventListener('hashchange', () => { readLocation(); render(); void refresh(); });
async function pollProjection() {
  if (!document.hidden && !$('#modal').open && !state.busy) await refresh();
  refreshTimer = setTimeout(pollProjection, 5000);
}
window.addEventListener('pagehide', () => clearTimeout(refreshTimer));
window.addEventListener('pageshow', () => { clearTimeout(refreshTimer); void pollProjection(); });
readLocation(); void refresh();
