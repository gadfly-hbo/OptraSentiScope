'use strict';

// Throwaway interaction model only. No runtime, network, persistence or SDK.
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const tabs = [['progress', '进展'], ['plan', '方案与依据'], ['decisions', '待决事项'], ['results', '结果与学习'], ['sources', '资料'], ['conversation', '补充对话']];
const lifeLabels = { active: '进行中', pausing: '正在暂停', paused: '已暂停', resuming: '正在核对恢复资格', ending: '正在结束', ended: '已结束' };
const taskLabels = { research: '研究中（演示）', observe: '观察等待', blocked: '资料受阻', unknown: 'UNKNOWN', stopped: '已停止', stopping: '停止中', resuming: '待恢复资格核对' };
let serial = 2;
let state;
let returnFocus;

function makeMandate(id, title, goal, boundary, observing = false, day = 1) {
  return {
    id, title, goal, boundary, version: 1, lifecycle: 'active', day,
    source: 'current', sourceVersion: 1, sourceTimes: { 1: 1 }, fault: false, planVersion: 1,
    decision: { status: 'pending', acknowledged: false, windowDay: day + 2 }, decisions: [],
    execution: false, observation: false, learning: 'conditional',
    events: [], queued: [], lastEvent: '', revisions: [], messages: [],
    tasks: [{ id: 'Q1', title: '交接理解为何出现差异', state: observing ? 'observe' : 'research', detail: observing ? '等待下一轮示例观察，不重复生成同一结论。演示第 3 日复看。' : '对照虚构反馈与说明版本，区分信息缺口和其他可能解释。' }, { id: 'Q0', title: '是否还有其他可能解释', state: observing ? 'observe' : 'research', detail: '基于独立示例说明 B 保留替代解释；不依赖来源 A，也不等待业务选择。' }],
    timeline: [{ day, text: '建立委托 v1；示例资料范围可用，Call 待接入。' }]
  };
}

function initialState() {
  return { page: 'overview', selectedId: null, tab: 'progress', filter: 'all', reminders: false, day: 1, scenarioMessage: '选择一个委托，可模拟新信息、结果和生命周期。', mandates: [
    makeMandate('A', '经营改善委托 A', '持续关注经营协作中的变化，找出值得优先改善的问题，并提出有依据的建议。', '只研究与建议；经营行动由负责人另行决定。'),
    makeMandate('B', '经营改善委托 B', '观察当前协作方式是否形成更一致的理解，在出现重要变化时提醒我。', '保留不同解释，资料不足时明确未知。', true)
  ] };
}

function current() { return state.mandates.find((item) => item.id === state.selectedId); }
function button(action, text, options = '') { return `<button data-action="${action}" ${options}>${text}</button>`; }
function badge(text, tone = '') { return `<span class="badge ${tone}">${esc(text)}</span>`; }
function stamp(item) { return `演示第 ${item.day} 日`; }
function pending(item) { return item.lifecycle !== 'ended' && ['pending', 'deferred'].includes(item.decision.status); }
function isActive(item) { return item.lifecycle === 'active'; }
function log(item, text) { item.day = state.day; item.timeline.unshift({ day: state.day, text }); }
function announce(text) { $('#announcement').textContent = text; }
function sourceLabel(item) { return { current: `示例 v${item.sourceVersion} 可用`, lost: '示例来源失联', revoked: '示例来源已撤权' }[item.source]; }
function researchSummary(item) {
  if (['pausing', 'ending'].includes(item.lifecycle)) return '停止中 · 等待模拟回执';
  if (item.lifecycle === 'resuming') return '核对中 · 尚未续作';
  if (['paused', 'ended'].includes(item.lifecycle)) return '研究已停止（演示回执）';
  if (item.fault) return '部分 UNKNOWN · 未重放';
  if (item.source !== 'current') return '局部受阻 · 其余保留';
  return item.tasks.every((task) => task.state === 'observe') ? '观察等待 · 已有复看安排' : '研究中（演示）';
}

function render() {
  const item = current();
  $('#demo-clock').textContent = `演示第 ${state.day} 日`;
  $('#reminder-count').textContent = state.mandates.filter(pending).length;
  $('#overview-nav').classList.toggle('active', state.page === 'overview' && !state.reminders);
  $('#reminders-nav').classList.toggle('active', state.page === 'overview' && state.reminders);
  $('#mandate-nav').innerHTML = state.mandates.length ? state.mandates.map((mandate) => button('open', esc(mandate.title), `class="mandate-nav ${mandate.id === state.selectedId && state.page === 'detail' ? 'active' : ''}" data-id="${mandate.id}"`)).join('') : '<p class="meta">暂无委托</p>';
  $('#screen').innerHTML = state.page === 'detail' && item ? detail(item) : overview();
  $('#scenario-content').innerHTML = scenarios(item);
}

function overview() {
  const needs = state.mandates.filter(pending);
  const shown = state.mandates.filter((item) => (state.reminders ? pending(item) : true) && (state.filter === 'all' || (state.filter === 'ended' ? item.lifecycle === 'ended' : item.lifecycle !== 'ended')));
  return `<div class="page-heading"><div><div class="heading-label">持续委托 / 工作空间</div><h1>${state.reminders ? '待决提醒' : '委托总览'}</h1><p>${state.reminders ? '知悉不代表决定，提醒直接定位到需要取舍的事项。' : '查看重要变化、当前判断，以及需要你作出的取舍。'}</p></div><div class="actions">${button('create', '＋ 新建委托', 'class="primary"')}</div></div>
  ${state.mandates.length ? `<div class="attention"><section class="panel"><div class="panel-title"><h2>需要你的取舍</h2>${badge(`${needs.length} 项待决`, needs.length ? 'warning' : '')}</div>${needs.length ? needs.slice(0, 2).map((item) => `<div class="attention-item"><div><h3>${esc(item.title)}</h3><p>是否采用「先澄清交接说明」方案 v${item.planVersion}？</p><div class="meta">${item.decision.acknowledged ? '已知悉 · 仍待决定' : '待决定'} · 演示第 ${item.decision.windowDay} 日前复看${item.lifecycle !== 'active' ? ` · 委托${lifeLabels[item.lifecycle]}` : ''}</div></div><div class="actions">${button('reminder-open', '查看待决 →', `data-id="${item.id}"`)}</div></div>`).join('') : '<p class="alert-empty">当前没有待决事项。独立研究的状态仍可在委托内查看。</p>'}</section><section class="panel"><div class="panel-title"><h2>重要变化</h2>${badge('虚构示例')}</div><div class="change-row"><span class="change-number">↳</span><div><h3>${esc(state.mandates[0].title)}</h3><p>${esc(state.mandates[0].timeline[0].text)}</p><div class="meta">${stamp(state.mandates[0])} · ${button('open', '查看进展', `class="text-button" data-id="${state.mandates[0].id}"`)}</div></div></div></section></div>` : ''}
  <section><div class="list-toolbar"><div class="section-heading"><h2>${state.reminders ? '待决相关委托' : '我的委托'}</h2><span class="meta">${shown.length} 个</span></div><div class="filter-group" aria-label="委托筛选">${[['all', '全部'], ['active', '未结束'], ['ended', '已结束']].map(([value, label]) => button('filter', label, `data-value="${value}" class="${state.filter === value ? 'active' : ''}" aria-pressed="${state.filter === value}"`)).join('')}</div></div>
  ${shown.length ? `<div class="mandate-list"><div class="list-header"><span>委托与目标</span><span>生命周期</span><span>研究状态</span><span>最近变化</span></div>${shown.map((item) => `<div class="mandate-row"><div>${button('open', esc(item.title), `class="mandate-title" data-id="${item.id}"`)}<p>${esc(item.goal)}</p></div><div>${badge(lifeLabels[item.lifecycle], item.lifecycle === 'active' ? 'accent' : '')}</div><div class="research-label">${esc(researchSummary(item))}</div><div class="last-update meta">${stamp(item)}</div></div>`).join('')}</div>` : `<div class="empty-state"><h2>${state.mandates.length ? '这个视图下没有委托' : '从一个持续目标开始'}</h2><p>${state.mandates.length ? '可以切换筛选，查看其他委托及其历史成果。' : '用一段话表达目标，可选补充边界。示例资料范围已给定，无需重复填写整张表。'}</p>${button(state.mandates.length ? 'filter-reset' : 'create', state.mandates.length ? '查看全部委托' : '新建委托', 'class="primary"')}</div>`}</section>`;
}

function detail(item) {
  const stopping = ['pausing', 'ending'].includes(item.lifecycle);
  let lifecycleActions = '';
  if (item.lifecycle === 'active') lifecycleActions = `${button('edit', '调整委托')}${button('pause', '暂停')}${button('end', '结束委托', 'class="ghost danger" title="收束待决并保留历史，不记采纳或拒绝"')}`;
  if (item.lifecycle === 'paused') lifecycleActions = `${button('resume', '恢复', 'class="primary"')}${button('edit', '调整委托')}${button('end', '结束委托', 'class="ghost danger" title="收束待决并保留历史，不记采纳或拒绝"')}`;
  if (item.lifecycle === 'ended') lifecycleActions = button('related', '新建关联委托', 'class="primary"');
  return `${button('overview', '← 委托总览', 'class="text-button back-link"')}<div class="page-heading detail-heading"><div><div class="heading-label">持续委托 · DEMO-${esc(item.id)} · 委托 v${item.version}</div><h1>${esc(item.title)}</h1>${badge(lifeLabels[item.lifecycle], item.lifecycle === 'active' ? 'accent' : stopping ? 'warning' : '')}<p class="goal">${esc(item.goal)}</p></div><div class="actions">${lifecycleActions}</div></div>
  <div class="state-strip"><span>研究<strong>${esc(researchSummary(item))}</strong></span><span>资料<strong>${esc(sourceLabel(item))}</strong></span><span class="call-note">Call <strong>待接入</strong></span></div>
  ${lifecycleNotice(item)}
  <div class="tabs" role="tablist" aria-label="委托内容">${tabs.map(([id, label]) => `<button class="tab" id="tab-${id}" role="tab" aria-selected="${state.tab === id}" aria-controls="tabpanel" tabindex="${state.tab === id ? '0' : '-1'}" data-action="tab" data-tab="${id}">${label}${id === 'decisions' && pending(item) ? ' · 1' : ''}</button>`).join('')}</div>
  <section id="tabpanel" role="tabpanel" aria-labelledby="tab-${state.tab}" tabindex="0">${({ progress, plan, decisions, results, sources, conversation }[state.tab])(item)}</section>`;
}

function lifecycleNotice(item) {
  if (item.lifecycle === 'pausing') return '<div class="notice warning"><strong>正在暂停 · 停止中</strong>暂停意图已记录，尚未收到停止回执。请在「演示情境」点击模拟停止回执，观察收尾状态；这不是实际资源已停止的证明。</div>';
  if (item.lifecycle === 'ending') return '<div class="notice warning"><strong>正在结束 · 停止中</strong>停止结果尚未确认。模拟回执到达后收束待决，保留成果和未决历史，不记作采纳或拒绝。</div>';
  if (item.lifecycle === 'resuming') return '<div class="notice warning"><strong>正在核对恢复资格</strong>尚未续作。模拟恢复回执会重新核对当前示例来源资格；失联或撤权部分仍受阻，不重放 UNKNOWN 操作。</div>';
  if (item.lifecycle === 'paused') return '<div class="notice"><strong>已暂停 · 由明确的模拟停止回执收尾</strong>历史成果可查看。新信息只记入待复核记录；恢复时先重核当前资格，不能据此宣称真实后台已停止。</div>';
  if (item.lifecycle === 'ended') return `<div class="notice"><strong>委托已结束 · 历史保留</strong>结束不等于目标达成，也不撤销实际经营行动。新资料不会自动重开本委托。<div class="ended-links">${button('related', '以当前背景新建关联委托 →', 'class="text-button"')}</div></div>`;
  if (item.fault) return '<div class="notice danger"><strong>部分研究结果 UNKNOWN</strong>演示故障使最后一次操作结果不可确认。未自动重放、未换模型；其他不受影响研究保留。未验证真实故障恢复。</div>';
  if (item.source !== 'current') return `<div class="notice warning"><strong>${item.source === 'revoked' ? '示例来源 A 已撤权' : '示例来源 A 失联'} · 局部受阻</strong>依赖该来源的研究暂停使用其内容。示例说明 B 的独立研究保留；来源状态与委托生命周期分别记录。</div>`;
  return '';
}

function judgement(item) {
  if (item.source === 'revoked') return '当前依据访问资格已变化，依赖示例资料 A 的建议需要重评。';
  if (item.source === 'lost') return '已保留历史判断，但缺少示例资料 A 的新鲜信息，暂不扩大结论。';
  if (item.learning === 'withdrawn') return '反证已撤回原经验的适用，依赖它的建议需要重评，原判断保留。';
  if (item.learning === 'limited') return '新增反证收窄了原经验的适用范围，当前方案须带上这一限制重新审视。';
  if (item.sourceVersion > 1) return '新的示例反馈支持先澄清交接说明，但改善还不能归因于这一动作。';
  return '先澄清交接说明可能更有帮助，现有依据尚不足以支持更大范围调整。';
}

function progress(item) {
  const next = item.lifecycle === 'ended' ? '本委托不再派发研究。若需继续，建立关联新委托并重新核对背景与授权。' : item.lifecycle !== 'active' ? '等待生命周期回执或恢复资格；已有成果与未知结果保留。' : item.source !== 'current' ? '等待来源资格恢复；同时保留示例说明 B 的独立分析，不以人工搬运资料作为默认补救。' : item.fault ? '先核对 UNKNOWN 操作的事实状态；不盲目重放。其余研究按现有边界继续。' : '继续比较其他可能解释，等待下一轮示例观察；仅在出现重要变化或真实取舍时提醒。';
  return `<div class="detail-grid"><div class="main-column"><section class="judgement"><div class="section-label">当前判断 · 方案 v${item.planVersion}</div><h2>${judgement(item)}</h2><p>这是可修正的有限判断。它来自虚构说明与反馈，不代表已完成真实研究或效果验证。</p><div class="reference-line">${button('evidence', `依据 DEMO-SRC-A@v${item.sourceVersion} ↗`, `class="text-button" data-version="${item.sourceVersion}"`)}<span>·</span><span class="muted">假设：记录可比；未知：其他同期影响</span></div></section>
  <section><div class="section-heading"><h2>当前研究重点</h2><span class="meta">方法与优先级由 Agent 自主决定</span></div>${item.tasks.map((task) => `<div class="research-item"><div class="row-head"><h3>${esc(task.title)}</h3>${badge(taskLabels[displayTaskState(item, task)], ['blocked', 'unknown', 'stopping'].includes(displayTaskState(item, task)) ? 'warning' : '')}</div><p>${esc(task.detail)}</p><div class="meta">DEMO-${esc(item.id)}-${task.id} · ${task.id === 'Q1' ? `示例资料 A v${item.sourceVersion}` : '示例说明 B v1'}</div></div>`).join('')}</section>
  <section class="subtle-panel"><div class="section-heading"><h2>下一步</h2>${button('tab', '查看方案 →', 'class="text-button" data-tab="plan"')}</div><p>${next}</p><p class="scope-line">委托边界：${esc(item.boundary || '沿示例范围研究与建议，不执行经营行动。')}</p></section>${item.revisions.length ? `<details class="scope-history"><summary>委托版本历史 · ${item.revisions.length} 个旧版本</summary>${item.revisions.map((revision) => `<article><h3>委托 v${revision.version}</h3><p>${esc(revision.goal)}</p><p class="meta">边界：${esc(revision.boundary || '未另行补充')}</p></article>`).join('')}</details>` : ''}</div>
  <aside class="side-column"><section class="panel"><div class="section-heading"><h2>资料新鲜度</h2>${button('tab', '全部', 'class="text-button" data-tab="sources"')}</div><div class="source-mini"><div class="source-heading"><span>示例资料 A</span>${badge(item.source === 'current' ? `v${item.sourceVersion}` : item.source === 'lost' ? '失联' : '已撤权', item.source !== 'current' ? 'warning' : '')}</div><p>${item.source === 'current' ? `演示第 ${item.sourceTimes[item.sourceVersion]} 日 · 仅示例资料，可查看版本原文` : '当前不可继续读取；历史引用与现时资格分开'}</p></div><div class="source-mini"><div class="source-heading"><span>示例说明 B</span>${badge('v1')}</div><p>演示第 1 日 · 独立示例依据保留</p></div><div class="source-mini"><div class="source-heading"><span>Call</span>${badge('待接入')}</div><p>未读取、未连接；首版必需接缝尚未实现</p></div></section><section class="panel"><div class="section-heading"><h2>最近变化</h2></div>${timeline(item, 5)}</section></aside></div>`;
}

function displayTaskState(item, task) {
  if (['pausing', 'ending'].includes(item.lifecycle)) return 'stopping';
  if (['paused', 'ended'].includes(item.lifecycle)) return 'stopped';
  if (item.lifecycle === 'resuming') return 'resuming';
  return task.state;
}

function plan(item) {
  return `<div class="plan-lead"><div class="section-label">方案 v${item.planVersion} · 虚构建议</div><h2>先澄清交接说明，再观察是否形成更一致的理解</h2><p>先使用范围较小、可回看的调整，保留现行做法作为对照背景。方案只提出建议，采纳后也不会自动执行。</p></div><div class="two-column"><section class="panel"><h2>建议及备选</h2><ul class="plain-list"><li>建议：先统一关键交接说明，在下一观察窗口回看反馈。</li><li>备选：暂维持现状，继续补充背景；代价是问题可能延续。</li><li>更大范围调整：现有依据不足，暂不建议扩大。</li></ul></section><section class="panel"><h2>依据与仍未知的部分</h2><ul class="plain-list"><li>${button('evidence', `DEMO-SRC-A@v${item.sourceVersion} · 虚构反馈原文 ↗`, `class="text-button" data-version="${item.sourceVersion}"`)}</li><li>${button('evidence-b', 'DEMO-SRC-B@v1 · 虚构说明原文 ↗', 'class="text-button"')}</li><li>假设：前后记录表达的含义可比。</li><li>未知：其他同期变化、实际执行程度、独立影响。</li></ul></section><section class="panel"><h2>适用与失效条件</h2><p class="secondary">仅适用于示例中的交接说明分歧。若反证显示主要问题来自其他条件，或当前资料资格变化，需重评依赖建议。</p><div class="reference-line">${badge('不构成经营执行授权')}</div></section><section class="panel"><h2>观察安排</h2><p class="secondary">保留调整前背景，收集后续反馈与执行说明，并核对同期其他变化。观察改善与因果归因分开。</p><p class="scope-line">演示第 ${item.decision.windowDay} 日复看；这不是现实期限。</p></section></div><div class="actions" style="margin-top:24px">${button('tab', pending(item) ? '查看待决事项 →' : '查看选择记录 →', 'class="primary" data-tab="decisions"')}${button('tab', '结果与学习', 'data-tab="results"')}</div><details class="history-disclosure"><summary>版本与历史判断</summary><p>方案 v1：优先澄清交接说明，证据有限。${item.planVersion > 1 ? '方案 v2：演示新信息到达后修订，保留无法归因的限制。原选择记录仍绑定当时版本。' : '尚无新方案版本。'}</p></details>`;
}

function decisions(item) {
  const active = isActive(item);
  const statusText = { pending: item.decision.acknowledged ? '已知悉 · 仍待决' : '待决定', adopted: '已采纳', deferred: '已暂缓 · 待复看', adjusted: '已提出调整', closed: '随委托结束收束 · 未作选择' }[item.decision.status];
  return `<div class="decision-card" id="decision-focus">${badge(statusText, pending(item) ? 'warning' : '')}<h2>是否采用「先澄清交接说明」？</h2><p class="description">此决定只绑定方案 v${item.planVersion}。知悉与已读不会替你采纳，未回复也不构成授权。</p><div class="decision-details"><dl class="definition-list"><div><dt>为什么现在需要你</dt><dd>研究可以自主继续；是否改变经营协作方式，需要负责人作出取舍。</dd></div><div><dt>选择依据</dt><dd>${button('evidence', `查看 DEMO-SRC-A@v${item.sourceVersion} 与限制 ↗`, `class="text-button" data-version="${item.sourceVersion}"`)}</dd></div></dl><dl class="definition-list"><div><dt>复看窗口（演示时钟）</dt><dd>演示第 ${item.decision.windowDay} 日前。没有真实截止时间。</dd></div><div><dt>暂缓的影响</dt><dd>维持当前做法；依赖选择的建议等待，其他独立研究保留。</dd></div></dl></div>${item.lifecycle === 'ended' ? '<div class="notice">待决已随委托结束收束，不记作拒绝、采纳或执行。</div>' : `${button('acknowledge', item.decision.acknowledged ? '已知悉，仍需独立决定' : '知悉此事项', `class="ghost" ${!active || item.decision.acknowledged ? 'disabled' : ''}`)}<div class="decision-options" style="margin-top:16px">${button('adopt', `采纳方案 v${item.planVersion}<span>只记录选择，不自动执行</span>`, `class="option-button" ${!active ? 'disabled' : ''}`)}${button('defer', `暂缓方案 v${item.planVersion}<span>保留待决与复看影响</span>`, `class="option-button" ${!active ? 'disabled' : ''}`)}${button('adjust-plan', `提出调整<span>说明希望修改的条件</span>`, `class="option-button" ${!active ? 'disabled' : ''}`)}</div>`}<p class="scope-line">${!active && item.lifecycle !== 'ended' ? '当前生命周期不接受新的业务选择；已有选择与历史保留。' : '不要求逐项审批研究。这里仅保留不可替代的业务取舍。'}</p></div><section class="decision-history"><div class="section-heading"><h2>选择记录</h2>${button('tab', '查看结果四项 →', 'class="text-button" data-tab="results"')}</div>${item.decisions.length ? item.decisions.map((entry) => `<div class="history-row"><div>${esc(entry.text)}<span class="meta">绑定方案 v${entry.planVersion} · ${entry.note ? esc(entry.note) : '未改变执行与归因记录'}</span></div><span class="meta">演示第 ${entry.day} 日</span></div>`).join('') : '<p class="alert-empty">尚无业务选择。已读、沉默、暂停均不记作采纳。</p>'}</section>`;
}

function results(item) {
  const chosen = item.decisions.find((entry) => entry.type === 'adopted');
  const learningText = { conditional: '当交接说明存在理解差异时，先统一关键说明可能有助于后续协作。', limited: '新增反证使适用范围收窄：仅在确认主要分歧来自说明本身时参考。', withdrawn: '当前反证不支持原经验继续用于建议；已撤回适用，保留原判断与依赖关系。' }[item.learning];
  return `<div class="section-heading"><h2>选择、执行、观察、归因</h2><span class="meta">四项独立记录</span></div><div class="outcome-grid"><div class="outcome-cell"><h3>01 / 选择</h3><strong>${chosen ? `已采纳方案 v${chosen.planVersion}` : '尚无采纳记录'}</strong><p>来自负责人明确选择；不等于已执行。</p></div><div class="outcome-cell"><h3>02 / 执行</h3><strong>${item.execution ? '收到虚构执行反馈' : '尚无执行反馈'}</strong><p>${item.execution ? '演示反馈称发生过调整；不据此推定采纳方案。' : '点击采纳不会更新这一项。'}</p></div><div class="outcome-cell"><h3>03 / 观察</h3><strong>${item.observation ? '虚构反馈趋于一致' : '尚无成熟观察'}</strong><p>${item.observation ? '模拟观察变化；同期还有其他可能影响。' : '等待反馈与适当观察窗口。'}</p></div><div class="outcome-cell"><h3>04 / 归因</h3><strong>UNKNOWN · 归因未知</strong><p>执行反馈或改善均不能单独证明方案造成效果。</p></div></div><section class="panel learning-panel"><div class="section-heading"><span class="section-label">条件化经验 · DEMO-LEARN-1</span>${badge({ conditional: '有条件参考', limited: '适用范围受限', withdrawn: '已撤回适用' }[item.learning], item.learning === 'conditional' ? '' : 'warning')}</div><h2>${learningText}</h2><p>来源于示例研究中的有限判断，尚非已验证的一般规律。</p><div class="learning-conditions"><dl class="definition-list"><div><dt>适用范围</dt><dd>示例协作场景；记录可比且说明分歧确实存在。</dd></div><div><dt>来源</dt><dd>${button('evidence', 'DEMO-SRC-A@v1 · 原始判断依据 ↗', 'class="text-button" data-version="1"')}</dd></div></dl><dl class="definition-list"><div><dt>限制与未知</dt><dd>尚无独立因果识别；不能推广到其他委托或替代当前授权核对。</dd></div><div><dt>对后续研究的影响</dt><dd>${item.learning === 'withdrawn' ? '已标记依赖建议需要重评；不再将原经验作为当前支持。' : item.learning === 'limited' ? '后续引用必须带上新限制；依赖建议待复核。' : '仅作问题线索引用，不当作新的独立证据。'}</dd></div></dl></div>${item.learning !== 'conditional' ? `<div class="learning-history"><h3>原判断与当前变化</h3><p>原判断：统一交接说明可能有助于后续协作。</p><p>反证（虚构）：不同背景下仍出现理解差异，说明之外的条件可能更重要。${item.learning === 'withdrawn' ? '进一步模拟反证后，原经验已撤回适用。历史没有删除。' : '当前从「有条件参考」改为「适用范围受限」。'}</p>${button('counter-evidence', '查看反证原文与版本 ↗', 'class="text-button"')}</div>` : ''}</section>`;
}

function sources(item) {
  return `<div class="section-heading"><h2>来源与获准范围</h2>${badge('全部为虚构资料')}</div><p class="secondary" style="margin-bottom:20px">本页不提供真实账号、授权或文件上传。示例资料只是内存中的文本，Call 接缝未实现。</p><div class="table-scroll"><table class="source-table"><thead><tr><th>来源</th><th>状态与新鲜度</th><th>范围与影响</th><th>追溯</th></tr></thead><tbody><tr><td><strong>示例资料 A</strong><p>DEMO-SRC-A</p></td><td>${badge(sourceLabel(item), item.source !== 'current' ? 'warning' : '')}<p>演示第 ${item.sourceTimes[item.sourceVersion]} 日 · 虚构版本</p></td><td>获准示例反馈与交接摘要<p>${item.source === 'current' ? '支持相关研究；不代表真实来源已连接。' : '依赖该来源部分受阻；不改写历史引用。'}</p></td><td>${button('evidence', `查看 v${item.sourceVersion} 原文 ↗`, `class="text-button" data-version="${item.sourceVersion}"`)}</td></tr><tr><td><strong>示例说明 B</strong><p>DEMO-SRC-B</p></td><td>${badge('示例 v1 可用')}<p>演示第 1 日</p></td><td>独立的虚构说明<p>不依赖来源 A 的研究保留。</p></td><td>${button('evidence-b', '查看 v1 原文 ↗', 'class="text-button"')}</td></tr><tr><td><strong>Call</strong><p>首版必需接缝</p></td><td>${badge('待接入')}<p>未读取、未连接</p></td><td>接缝实现后排<p>示例不能代替真实 Call 复用与验收。</p></td><td><span class="meta">暂无可用引用</span></td></tr></tbody></table></div><div class="notice" style="margin-top:20px"><strong>原始资料与研究产物分开</strong>方案、对话和条件化经验是研究产物，不作为新的外部事实反复唤醒研究。演示重复投递同一资料事件，不新增研究工单。</div>`;
}

function conversation(item) {
  const editable = item.lifecycle !== 'ended';
  return `<div class="chat-intro"><h2>补充背景，或纠正当前理解</h2><p style="margin-top:8px">对话是委托内的补充入口。当前判断、方案与结果仍在对应页面保留；此处没有模型回应。</p></div><div class="conversation"><article class="message system"><header>演示回执 · 建立时的目标</header><p>${esc(item.goal)}</p></article>${item.messages.map((message) => `<article class="message ${message.system ? 'system' : ''}"><header>${message.system ? '演示回执 · 未调用模型' : '你 · 补充背景'} · 演示第 ${message.day} 日</header><p>${esc(message.text)}</p></article>`).join('')}</div><form id="conversation-form" class="chat-form"><div class="field"><label for="message-input">补充内容</label><textarea id="message-input" name="message" placeholder="例如：请保留另一种可能解释，后续观察再判断。" aria-describedby="message-help message-error" ${editable ? '' : 'disabled'}></textarea><span id="message-help" class="helper">仅保存在当前页面内存，不读取文件、不调用模型。</span><span id="message-error" class="error"></span></div><div class="actions"><button class="primary" type="submit" ${editable ? '' : 'disabled'}>记录补充</button><span class="meta">${editable ? '不会自动改变业务选择、执行或归因。' : '委托已结束；可新建关联委托继续。'}</span></div></form>`;
}

function timeline(item, limit) { return `<ol class="timeline">${item.timeline.slice(0, limit).map((entry) => `<li><time>演示第 ${entry.day} 日</time>${esc(entry.text)}</li>`).join('')}</ol>`; }

function scenarios(item) {
  const usable = item && state.page === 'detail';
  const disabled = !usable ? 'disabled' : '';
  const activeDisabled = !usable || !isActive(item) ? 'disabled' : '';
  const receiptDisabled = !usable || !['pausing', 'resuming', 'ending'].includes(item.lifecycle) ? 'disabled' : '';
  return `<div class="scenario-status" role="status">${esc(state.scenarioMessage)}</div><div class="scenario-grid"><section class="scenario-group"><h3>信息与研究 / ${usable ? esc(item.title) : '先进入一个委托'}</h3><div class="actions">${button('advance', '推进演示时间', disabled)}${button('new-info', '模拟新信息 · 原研究更新', disabled)}${button('independent', '模拟新独立问题', disabled)}${button('repeat', '重复投递上一事件', disabled)}${button('observe', '模拟观察等待', activeDisabled)}</div><p>演示时钟与事件完全由你推进。页面打开或关闭均不代表真实后台持续运行。</p></section><section class="scenario-group"><h3>结果与反证</h3><div class="actions">${button('execution', '模拟执行反馈', activeDisabled)}${button('observation', '模拟结果变化', activeDisabled)}${button('falsify', '模拟反证', activeDisabled)}</div><p>选择、执行、观察、归因分别变化；反证先限制经验，再撤回适用，保留历史。</p></section><section class="scenario-group"><h3>来源、故障与生命周期回执</h3><div class="actions">${button('source-lost', '模拟来源失联', disabled)}${button('source-revoked', '模拟来源撤权', disabled)}${button('source-current', '模拟来源恢复', disabled)}${button('fault', '模拟技术故障 / UNKNOWN', activeDisabled)}${button('fault-clear', '模拟故障解除', activeDisabled)}${button('receipt', usable && item.lifecycle === 'resuming' ? '模拟恢复资格回执' : '模拟停止回执', receiptDisabled)}</div><p>Call 始终待接入。停止回执只改变演示记录，不证明真实资源停止或安全隔离已生效。</p></section><section class="scenario-group"><h3>演示管理</h3><div class="actions">${button('clear', '清空委托 · 查看空态', 'class="danger"')}${button('reset', '重置全部演示')}</div><p>全部输入仅存内存；清空与重置会丢弃本页演示记录，不触及实际文件。刷新也会重置。</p></section></div>`;
}

function openModal(content, evidence = false) {
  returnFocus = document.activeElement;
  $('#modal').classList.toggle('evidence-dialog', evidence);
  $('#dialog-content').innerHTML = content;
  $('#modal').showModal();
  const focus = $('#modal [autofocus]') || $('#modal input') || $('#modal textarea') || $('#modal button');
  if (focus) focus.focus();
}

function closeModal() { $('#modal').close(); }
function dialogHeader(title, helper) { return `<div class="dialog-header"><div><h2 id="dialog-title">${title}</h2><p>${helper}</p></div>${button('close-modal', '×', 'class="icon-button" aria-label="关闭弹窗"')}</div>`; }

function createDialog(related = false) {
  const item = current();
  const goal = related && item ? item.goal : '';
  openModal(`${dialogHeader(related ? '新建关联委托' : '新建委托', '表达持续目标，完整时一次创建即进入委托。')}<form id="create-form" data-related="${related && item ? item.id : ''}"><div class="dialog-body">${related ? `<div class="notice">关联 DEMO-${esc(item.id)}；旧委托保持结束。复用背景是候选，示例资料资格按新委托重新核对。</div>` : ''}<div class="field"><label for="goal-input">你希望持续关注什么？ <span class="muted">必填</span></label><textarea name="goal" id="goal-input" aria-describedby="goal-help goal-error" placeholder="例如：持续关注协作中的变化，找出值得改善的问题，有重要取舍时提醒我。" autofocus>${esc(goal)}</textarea><span id="goal-help" class="helper">用自然语言表达目标，无需填写研究步骤或方法。</span><span id="goal-error" class="error"></span></div><div class="field"><label for="boundary-input">边界与偏好 <span class="muted">可选</span></label><textarea name="boundary" id="boundary-input" rows="2" placeholder="例如：只做研究与建议，经营行动由我决定。" style="min-height:76px"></textarea></div><div class="subtle-panel"><h3>本次示例资料范围</h3><p>虚构资料 A、示例说明 B；只用于此交互演示。Call 待接入，不读取真实资料。</p></div></div><div class="dialog-footer">${button('close-modal', '取消', 'type="button"')}<button class="primary" type="submit">创建并进入委托</button></div></form>`);
}

function evidenceDialog(kind = 'a', version = 1, keepFocus = false) {
  const item = current();
  const revoked = kind === 'a' && item && item.source === 'revoked';
  const id = kind === 'a' ? 'A' : kind === 'b' ? 'B' : 'COUNTER';
  const original = kind === 'counter' ? '进一步记录中，说明更新后仍出现理解差异。不同背景条件可能影响反馈，原先解释不能覆盖这些情况。' : kind === 'b' ? '交接说明中存在多个表达方式；当前资料没有说明哪些差异会影响后续协作。' : version === 2 ? '交接说明更新后，反馈中的理解趋于一致；同一时期也发生其他变化，不能据此确定原因。' : '部分反馈对交接含义的理解不同，尚未形成一致记录；现有说明可能存在歧义。';
  const content = `${dialogHeader('依据与版本', '全部为虚构文本；引用版本不随当前资料静默替换。')}<div class="dialog-body">${kind === 'a' ? `<div class="version-switch" aria-label="依据版本">${button('evidence-version', 'v1 · 原始版本', `class="${version === 1 ? 'active' : ''}" data-version="1"`)}${button('evidence-version', 'v2 · 更新版本', `class="${version === 2 ? 'active' : ''}" data-version="2" ${item && item.sourceVersion > 1 ? '' : 'disabled'}`)}</div>` : ''}<dl class="definition-list"><div><dt>准确示例引用</dt><dd>DEMO-SRC-${id}@v${version}</dd></div><div><dt>资料时间 / 演示接收时间</dt><dd>演示第 ${kind === 'a' && item ? item.sourceTimes[version] || state.day : kind === 'counter' ? state.day : 1} 日 09:00 / 09:05（均非真实时间）</dd></div><div><dt>原文 · ${revoked ? '当前资格已撤回' : '虚构资料'}</dt><dd>${revoked ? '<div class="notice warning">当前示例资格已撤回，不继续展示来源正文。原引用身份与历史研究记录保留，不把历史可见等同当前可读。</div>' : `<blockquote class="quote">${original}</blockquote>`}</dd></div><div><dt>资料类型</dt><dd>原始示例文本；方案、摘要、对话均是研究产物，不作为新外部事实循环使用。</dd></div><div><dt>假设</dt><dd>反馈含义与前后背景基本可比；这一假设可能不成立。</dd></div><div><dt>仍未知</dt><dd>实际执行程度、同期其他变化与因果贡献。此演示没有计算或真实验证结果。</dd></div></dl></div><div class="dialog-footer">${button('close-modal', '关闭', 'class="primary"')}</div>`;
  if (keepFocus) {
    $('#dialog-content').innerHTML = content;
    $(`#modal [data-action="evidence-version"][data-version="${version}"]`).focus();
  } else openModal(content, true);
}

function editDialog() {
  const item = current();
  openModal(`${dialogHeader('调整委托', `当前委托 v${item.version}；保留旧目标与历史成果。`)}<form id="edit-form"><div class="dialog-body"><div class="field"><label for="edit-goal">持续目标</label><textarea id="edit-goal" name="goal" aria-describedby="edit-error" autofocus>${esc(item.goal)}</textarea><span class="error" id="edit-error"></span></div><div class="field"><label for="edit-boundary">边界与偏好</label><textarea id="edit-boundary" name="boundary">${esc(item.boundary)}</textarea></div><p class="meta">调整委托不等于采纳新方案，不改变既有执行与归因记录。原版本会保留。</p></div><div class="dialog-footer">${button('close-modal', '取消', 'type="button"')}<button class="primary" type="submit">保存为委托 v${item.version + 1}</button></div></form>`);
}

function decision(type, note = '') {
  const item = current();
  if (!item || !isActive(item)) return;
  const text = { adopted: '采纳', deferred: '暂缓', adjusted: '提出调整' }[type];
  item.decision.status = type;
  if (type === 'deferred') item.decision.windowDay = state.day + 2;
  item.decisions.unshift({ type, text: `${text}方案 v${item.planVersion}`, planVersion: item.planVersion, day: state.day, note });
  log(item, `${text}方案 v${item.planVersion}；选择、执行、观察、归因仍分别记录。`);
  render(); announce(`${text}已记录，绑定方案 v${item.planVersion}，未自动执行。`);
}

function applyEvent(item, eventId) {
  if (eventId === 'DEMO-EVENT-A-v2') {
    item.sourceVersion = 2; item.sourceTimes[2] = state.day; item.planVersion = 2;
    item.decision = { status: 'pending', acknowledged: false, windowDay: state.day + 2 };
    item.tasks[0].detail = '同一研究问题已关联示例资料 v2；新反馈改变判断，不另建重复问题。仍需核对其他可能解释。';
    log(item, '示例资料 A v2 更新原问题与方案 v2；没有重复建单。');
  } else if (!item.tasks.some((task) => task.id === 'Q2')) {
    item.tasks.push({ id: 'Q2', title: '另一类反馈是否需要独立解释', state: 'research', detail: '来自独立示例说明 B 的问题，不依赖来源 A；继续保留不同解释。' });
    log(item, '示例说明 B 形成新独立问题 Q2，与原研究分开。');
  }
}

function reviewQueued(item) {
  const remaining = [];
  for (const eventId of item.queued) {
    if (eventId === 'DEMO-EVENT-A-v2' && item.source !== 'current') remaining.push(eventId);
    else applyEvent(item, eventId);
  }
  item.queued = remaining;
}

function simulate(action) {
  const item = current();
  if (!item || state.page !== 'detail') return;
  const canAct = isActive(item);
  if (action === 'advance') { state.day += 1; item.day = state.day; state.scenarioMessage = `演示时间推进到第 ${state.day} 日。没有实际后台运行；状态按本次显式操作更新。`; log(item, '演示时钟推进；既有待决与观察安排保留。'); }
  if (['new-info', 'independent', 'repeat'].includes(action)) {
    const eventId = action === 'repeat' ? item.lastEvent : action === 'new-info' ? 'DEMO-EVENT-A-v2' : 'DEMO-EVENT-B-v1';
    if (!eventId) { state.scenarioMessage = '尚无上一个模拟事件。请先模拟新信息或独立问题。'; }
    else if (item.events.includes(eventId)) { state.scenarioMessage = `重复事件 ${eventId} 已识别：没有重复建单。当前仍为 ${item.tasks.length} 个研究问题。`; log(item, `重复投递 ${eventId}；未重复建单。`); }
    else {
      item.events.push(eventId); item.lastEvent = eventId;
      if (item.lifecycle !== 'active') {
        if (item.lifecycle !== 'ended') item.queued.push(eventId);
        state.scenarioMessage = item.lifecycle === 'ended' ? '新信息仅记入结束后的历史，不重开研究；可新建关联委托。' : '新信息只记入待复核记录，没有绕过暂停或在途停止。恢复时重核资格。';
        log(item, `收到 ${eventId}；${item.lifecycle === 'ended' ? '结束后不重开' : '生命周期限制，待恢复复核'}。`);
      } else if (action === 'new-info' || eventId === 'DEMO-EVENT-A-v2') {
        if (item.source !== 'current') { item.queued.push(eventId); state.scenarioMessage = '来源 A 当前不可用。记录事件身份，未读取新正文、未更新方案或新增工单；资格恢复后复核。'; log(item, '来源 A 更新事件到达，但当前资格不可读，待复核。'); }
        else {
          applyEvent(item, eventId);
          state.scenarioMessage = `原问题 DEMO-${item.id}-Q1 已更新为示例 v2；方案 v2 待决。旧版本与原选择保留。`;
        }
      } else {
        applyEvent(item, eventId);
        state.scenarioMessage = `建立独立研究问题 DEMO-${item.id}-Q2，共 ${item.tasks.length} 个；它不依赖来源 A。`;
      }
    }
  }
  if (action === 'observe' && canAct) { for (const task of item.tasks) { if (task.state === 'research' || task.state === 'observe') { task.state = 'observe'; task.detail = `当前证据不足以扩大判断，等待下一轮示例反馈；演示第 ${state.day + 2} 日复看。`; } } state.scenarioMessage = '可继续研究的部分进入有理由的观察等待，保留复看安排；受阻或 UNKNOWN 部分不被覆盖。'; log(item, '可继续研究部分转为观察等待；受阻与 UNKNOWN 保留。'); }
  if (action === 'execution' && canAct) { item.execution = true; state.scenarioMessage = '仅执行项更新为“收到虚构执行反馈”；无论是否已有选择，都不据此推定采纳，观察与归因未自动改变。'; log(item, '收到虚构执行反馈；不推定采纳，归因仍 UNKNOWN。'); }
  if (action === 'observation' && canAct) { item.observation = true; state.scenarioMessage = '观察项出现定性变化；即使已有执行反馈，归因仍保持 UNKNOWN。'; log(item, '虚构观察趋于一致；其他同期影响未知，未认定归因。'); }
  if (action === 'falsify' && canAct) { item.learning = item.learning === 'conditional' ? 'limited' : 'withdrawn'; state.scenarioMessage = item.learning === 'limited' ? '反证使经验适用范围受限，原判断保留，依赖建议需重评。' : '进一步反证撤回经验适用；历史与原依据均保留。'; log(item, item.learning === 'limited' ? '示例反证限制经验适用，标记依赖建议重评。' : '示例进一步反证撤回经验适用，保留历史。'); }
  if (action.startsWith('source-')) {
    item.source = { 'source-lost': 'lost', 'source-revoked': 'revoked', 'source-current': 'current' }[action];
    if (canAct) item.tasks[0].state = item.source === 'current' ? item.fault ? 'unknown' : 'research' : 'blocked';
    if (canAct && item.source === 'current') reviewQueued(item);
    state.scenarioMessage = item.source === 'current' ? '示例来源资格恢复；仅活动委托可继续，结束委托不会被重开。UNKNOWN 记录未自动重放。' : `来源 A ${item.source === 'lost' ? '失联' : '已撤权'}，只阻断依赖部分；委托生命周期不变，独立研究与历史保留。`;
    log(item, `示例来源 A 状态：${sourceLabel(item)}；生命周期未被来源事件改写。`);
  }
  if (action === 'fault' && canAct) { item.fault = true; item.tasks[0].state = 'unknown'; state.scenarioMessage = '模拟最后一次技术操作结果 UNKNOWN。未自动重放；独立研究保留，不伪报一切正常。'; log(item, '技术故障：原问题最后操作 UNKNOWN，未重放。'); }
  if (action === 'fault-clear' && canAct) { item.fault = false; item.tasks[0].state = item.source === 'current' ? 'observe' : 'blocked'; state.scenarioMessage = '模拟环境故障解除，原 UNKNOWN 历史保留。进入观察/受阻状态，未重放旧操作。'; log(item, '示例故障解除；UNKNOWN 原操作保留，未重放。'); }
  if (action === 'receipt') {
    if (item.lifecycle === 'pausing') { item.lifecycle = 'paused'; state.scenarioMessage = '模拟停止回执已到达：由“正在暂停”变为“已暂停”。这仅是演示状态。'; log(item, '收到显式模拟停止回执，委托已暂停。'); }
    else if (item.lifecycle === 'ending') { item.lifecycle = 'ended'; if (pendingBeforeEnd(item)) { item.decisions.unshift({ type: 'closed', text: '随委托结束收束待决，未作业务选择', planVersion: item.planVersion, day: state.day, note: '不记采纳、不记拒绝，也不改变执行事实' }); } item.decision.status = 'closed'; state.scenarioMessage = '模拟停止回执已到达：委托结束，待决收束、历史保留。后续新信息不会重开。'; log(item, '模拟停止回执后结束；待决收束未记作采纳或拒绝。'); }
    else if (item.lifecycle === 'resuming') { item.lifecycle = 'active'; item.tasks[0].state = item.source !== 'current' ? 'blocked' : item.fault ? 'unknown' : 'observe'; reviewQueued(item); state.scenarioMessage = `模拟恢复资格已重核：来源 A ${sourceLabel(item)}，说明 B 仍在示例范围。${item.source !== 'current' ? '依赖 A 部分继续受阻。' : '期间事件已复核并更新相应研究。'}未重放 UNKNOWN。`; log(item, '显式模拟恢复回执：重核来源资格与期间事件后续作，UNKNOWN 未重放。'); }
  }
  render(); announce(state.scenarioMessage);
}

function pendingBeforeEnd(item) { return ['pending', 'deferred'].includes(item.decision.status); }

document.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  event.preventDefault();
  const action = control.dataset.action;
  const item = current();
  if (action === 'theme') { const light = document.documentElement.dataset.theme !== 'light'; document.documentElement.dataset.theme = light ? 'light' : 'dark'; control.textContent = light ? '☾' : '☀'; control.setAttribute('aria-label', `切换为${light ? '暗' : '亮'}色主题`); return; }
  if (action === 'close-modal') { closeModal(); return; }
  if (action === 'evidence-version') { evidenceDialog('a', Number(control.dataset.version), true); return; }
  if (action === 'evidence') { evidenceDialog('a', Number(control.dataset.version || 1)); return; }
  if (action === 'evidence-b') { evidenceDialog('b'); return; }
  if (action === 'counter-evidence') { evidenceDialog('counter'); return; }
  if (action === 'create' || action === 'related') { createDialog(action === 'related'); return; }
  if (action === 'edit' && item && ['active', 'paused'].includes(item.lifecycle)) { editDialog(); return; }
  if (action === 'overview' || action === 'reminders') { state.page = 'overview'; state.selectedId = null; state.reminders = action === 'reminders'; state.filter = 'all'; render(); return; }
  if (action === 'open' || action === 'reminder-open') { state.page = 'detail'; state.selectedId = control.dataset.id; state.tab = action === 'reminder-open' ? 'decisions' : 'progress'; render(); if (action === 'reminder-open') { $('#decision-focus').classList.add('reminder-highlight'); $('#tabpanel').focus({ preventScroll: true }); } window.scrollTo({ top: 0 }); return; }
  if (action === 'filter' || action === 'filter-reset') { state.filter = control.dataset.value || 'all'; render(); return; }
  if (action === 'tab') { state.tab = control.dataset.tab; render(); $(`#tab-${state.tab}`).focus({ preventScroll: true }); return; }
  if (action === 'acknowledge' && item && isActive(item)) { item.decision.acknowledged = true; log(item, '已知悉待决事项；仍待独立决定。'); render(); announce('已知悉，仍待决定。'); return; }
  if (action === 'adopt' || action === 'defer') { decision(action === 'adopt' ? 'adopted' : 'deferred'); return; }
  if (action === 'adjust-plan' && item && isActive(item)) { openModal(`${dialogHeader(`提出方案 v${item.planVersion} 的调整`, '保留原选择与方案版本，不自动执行。')}<form id="adjust-plan-form"><div class="dialog-body"><div class="field"><label for="adjust-note">你希望调整什么条件？</label><textarea id="adjust-note" name="note" aria-describedby="adjust-error" autofocus></textarea><span class="error" id="adjust-error"></span></div></div><div class="dialog-footer">${button('close-modal', '取消', 'type="button"')}<button class="primary" type="submit">记录调整意见</button></div></form>`); return; }
  if (action === 'pause' && item && isActive(item)) { item.lifecycle = 'pausing'; log(item, '收到一次暂停意图；正在停止，尚无停止回执。'); state.scenarioMessage = '暂停意图已记录。请点击“模拟停止回执”，观察从正在暂停到已暂停。'; render(); announce('正在暂停，停止结果尚未确认。'); return; }
  if (action === 'resume' && item && item.lifecycle === 'paused') { item.lifecycle = 'resuming'; log(item, '收到恢复意图；先重核当前资格，尚未续作。'); state.scenarioMessage = '恢复资格正在核对；点击“模拟恢复资格回执”完成示例核对。'; render(); return; }
  if (action === 'end' && item && ['active', 'paused'].includes(item.lifecycle)) { item.lifecycle = 'ending'; log(item, '收到一次结束意图；正在停止，等待明确回执。'); state.scenarioMessage = '正在结束；请模拟停止回执，之后待决收束，不记采纳或拒绝。成果与历史保留。'; render(); announce('正在结束，历史保留；停止结果尚未确认。'); return; }
  if (action === 'clear' || action === 'reset') { state = action === 'reset' ? initialState() : { ...initialState(), mandates: [], scenarioMessage: '演示委托已清空。可从空态创建，或重置全部演示。' }; serial = 2; render(); announce(action === 'clear' ? '已清空演示委托。' : '已重置全部演示。'); return; }
  simulate(action);
});

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const item = current();
  if (form.id === 'create-form' || form.id === 'edit-form') {
    const goal = String(data.get('goal') || '').trim();
    if (!goal) { const input = form.querySelector('[name="goal"]'); input.setAttribute('aria-invalid', 'true'); form.querySelector('.error').textContent = '请写下一段非空的持续目标。'; input.focus(); return; }
    const boundary = String(data.get('boundary') || '').trim();
    if (form.id === 'create-form') {
      serial += 1;
      const created = makeMandate(`N${serial}`, `经营改善委托 ${String.fromCharCode(64 + Math.min(serial, 26))}`, goal, boundary, false, state.day);
      if (form.dataset.related) log(created, `关联旧委托 DEMO-${form.dataset.related}；背景为候选，示例范围重新核对，Call 待接入。`);
      state.mandates.unshift(created); state.selectedId = created.id; state.page = 'detail'; state.tab = 'progress'; state.scenarioMessage = '新委托已一次创建并进入详情。所有研究与资料均为虚构示例，Call 待接入。';
    } else if (item) { item.revisions.push({ version: item.version, goal: item.goal, boundary: item.boundary }); item.version += 1; item.goal = goal; item.boundary = boundary; log(item, `委托调整为 v${item.version}，旧目标与成果保留；不改变方案选择。`); }
    closeModal(); render(); $('#main').focus({ preventScroll: true }); announce('委托已保存，直接进入进展。');
  }
  if (form.id === 'adjust-plan-form') {
    const note = String(data.get('note') || '').trim();
    if (!note) { $('#adjust-error').textContent = '请说明希望调整的条件。'; $('#adjust-note').setAttribute('aria-invalid', 'true'); $('#adjust-note').focus(); return; }
    closeModal(); decision('adjusted', note);
  }
  if (form.id === 'conversation-form' && item && item.lifecycle !== 'ended') {
    const message = String(data.get('message') || '').trim();
    if (!message) { $('#message-error').textContent = '请先填写补充内容。'; $('#message-input').setAttribute('aria-invalid', 'true'); $('#message-input').focus(); return; }
    item.messages.push({ text: message, day: state.day }, { text: '补充已记录（演示）。未调用模型；业务选择、执行与归因均未自动改变。', day: state.day, system: true });
    log(item, '负责人补充背景；原方案与选择记录保留。'); render(); $('#message-input').focus({ preventScroll: true }); announce('补充已记录，未调用模型。');
  }
});

document.addEventListener('keydown', (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = tabs.findIndex(([id]) => id === state.tab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  state.tab = tabs[next][0]; render(); $(`#tab-${state.tab}`).focus({ preventScroll: true });
});

$('#modal').addEventListener('close', () => {
  // Rendering may replace the opener. Restore an equivalent control if needed.
  if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  else {
    const action = returnFocus?.dataset.action;
    const equivalent = action ? document.querySelector(`[data-action="${action}"]`) : null;
    (equivalent || $('#main')).focus({ preventScroll: true });
  }
});

state = initialState();
render();
