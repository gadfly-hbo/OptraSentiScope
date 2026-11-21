# P03–P05 合成来源、经营者收束与本机恢复

2026-11-21 · 分支 `qoder/p03-p05-sustained-sources` · 开工基线 `32b4e00450d069cd254fb33fe0710cf3f0925b86`（产品代码来自 `6ec330d`）。依据为用户已确认的 [P03–P05 计划](../../../docs/P03-P05_下一阶段开发计划.md)、派单、首版 AC01–AC08/U01–U12、首发 R01–R06 与工程规范。

## 目标与执行清单

- [x] **基线与规格。** 核对 main、官方组件、现有实现和 `dev.optrasentiscope.trial`；保留旧证据，记录真实缺口及本轮检查选择。完成条件：实际基线、服务状态、接口版本、授权和范围可追溯。
- [x] **P03 正常委托与共享合成来源。** 从正常 HTTP 工作台建立一句话委托，由官方 Runtime 中的 Agent 保存可修订摘要和局部等待；Host 在获准目录采集并技术去重，Agent 决定补充既有研究或另立问题。完成条件：一条更新同时产生两类结果，重复页/投递不重复生效，写失败不推进游标，中途重开不漏不重，准确版本缺失不回落 latest。（AC01–AC04、U01–U04）
- [x] **P03 失联、恢复与单方撤权。** 两个不同授权委托复用同一采集事实，分别核权；覆盖、新鲜度和缺口在现有进展页可读。完成条件：失联/恢复有补读，单方撤权遮蔽正文、缓存和恢复会话，另一委托继续。（AC08、U09）
- [x] **P04 暂停、恢复与结束。** 覆盖在途主任务、worker/子工作和无关方向；先关新派发，再核实际停止，未确认保持处理中或 UNKNOWN。默认暂停专属主动采集，共享采集按其他委托授权继续。完成条件：恢复摘要列出期间变化、空白、资格、继续和等待；结束摘要保留方案、选择、执行、观察、失败、未决与 UNKNOWN，迟到结果不复活。（AC05、AC06、AC08、U05/U06/U08–U10）
- [x] **P04 工作台。** 提醒合并仍可直达独立决定与窗口，简报偏好保存、轮询和重开一致；真实浏览器核对 U01–U12、窄屏、键盘及错误状态。完成条件：工程证据与待用户体验分别记录，U07/U11/U12 不越界宣称。
- [x] **P05 身份、出口与计算。** 从首个 P03 切片持续核 owner、Host 凭据和模型/连接器/提醒导出/日志备份出口；关闭路径零发送，额外会话上传关闭。主/worker/可用子 Agent 计算入口拒绝且 Host 无执行产物；官方 Harness/superagent 原实现、锁和实际加载身份不变。（R02–R05）
- [x] **P05 备份恢复与长流。** 旧版及本期隔离数据备份到新位置，读回 SQLite、原生 sessions/storage、Schedule、游标和未决回执；覆盖关页、异常退出、写失败、重开及 UNKNOWN 对账。递增事件量记录累计写入字节，验证随证据体积线性增长并完整读回。（R01、R06）
- [ ] **固定候选与独立复核。** 运行 `npm run check`、受影响真实浏览器、`npm audit --audit-level=high` 和官方合成链；非作者全新上下文按 AC/U/R 与四原则复核，修复并重验。
- [ ] **Git、CI 与试用切换。** 集中一个 PR，核最终 head CI，squash 合并后核 main CI；备份并切换原 `127.0.0.1:8766` 独立实例，读回版本、健康、工作台与持久数据，演练建委托→来源更新→暂停/恢复→重开。

## 可观察结果与关键边界

1. 来源正文只由 Host 在明确 grant 下读取；来源事件、接收事实和游标同一 SQLite 事务提交，任何接收失败整体回滚。共享采集只有一项采集权威，每个委托有独立授权与业务接收事实；技术去重不代替 Agent 的 `note_ticket` / `decide_event` 业务判断。
2. 暂停/结束只由 Host 保存业务意图并调用既有统一 `NativeResearchPort`；官方 Session/Schedule 保持原生权威。UNKNOWN 不自动重放、换模型或补写成功。
3. 恢复/结束摘要是已有持久事实的一次性 Host 投影，不发明 Agent 分析流程或业务结论；结束摘要生成后不被迟到结果改写。
4. 长流只追加原始故障、差量和证据，不逐事件重写完整历史；计量真实持久化写入，完整读回核对内容身份。
5. 浏览器只能使用 Host 绑定 owner，不能提交身份、密钥、任意目录或 Provider。合成资料、合成 Provider 与本机回环服务不表述为真实企业来源、真实模型质量或生产安全验收。

## 接口与四原则前置检查（IN01–IN07）

- **Interface/owner/profile：** 沿用 `runtime/index.ts` 的 `NativeResearchPort`、`RunBinding` 与统一 open/admit/beforeWake/Schedule 契约；owner 由 `scripts/runtime/start.mjs` 私有 Host JSON 绑定，运行时 profile 由同一启动器生成。本轮只做兼容的持久事实与 detail 投影扩展，不新建 Runtime、Session、Schedule、Ticket 或全局业务队列。
- **官方组件：** Harness `0.2.2-rc.3`，superagent `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`；不升级、不改包、不新增内部导入例外。SDK 私有安装复用已批准版本。
- **Host：** 环境、owner/grant、采集与游标、权限/资源/出口、取消、持久化、备份和事实投影。
- **Agent：** 自主读取获准背景、集中澄清、选择研究方法、判断事件归属、形成摘要/方案/经验与纠错；Host 不硬编码专业结论。
- **复用：** 官方 Engine 负责评估/工单，Harness 负责 Session/工具/Schedule，现有 Store 负责业务事实；仅对共享采集、摘要和备份/计量中已确认的缺口作最小适配。
- **减少人的操作：** 正常路径仍是一句话目标、必要补充和生命周期动作；不新增来源目录配置、机器身份、逐条读取审批或摘要确认步骤。管理员的私有 Host grant 属于环境配置。

## UI 开工确认

P03/P04 的来源覆盖/缺口及恢复/结束摘要复用已获批工作台的现有进展与事实展示，暂停/恢复/结束和简报偏好沿用现有控件，不另出 Demo。独立复核 F02 要求补齐本机登录/维护者角色，属于新增关键交互；已按门禁提交 [本机登录差异 spec](local-auth-spec.md) 和直接复用正式 `styles.css`／shell 的[修正版可点击 Demo](../../../docs/prototypes/p03-p05-local-auth/index.html)。用户于 2026-11-21 明确选择“同意修正版（推荐）”，随后才实施正式登录 UI。生产 SSO/HTTPS/管理面不在本确认范围。

## 允许修改路径与范围外

允许修改 `src/`、`runtime/`、`scripts/`、`test/`、根 `package.json`、本 OpenSpec 目录及必要的本机 `.local/` 证据/试用配置；只有实际关键交互变化且获确认时才修改 `src/web/` 的交互结构或新增 Demo。公开仓库只提交合成资料和工程证据摘要，不提交私有数据、凭据或日志正文。

不做：真实企业资料、真实模型调用、Call/P06、企业 Linux/HTTPS/SSO/生产部署、经营 POC、真实计算载体或隔离验收、SDK 升级。完整 AC07 与首版整体验收不在本轮关闭。

## 检查选择与证据

本变更涉及运行时、权限、持久化、备份和公共投影，采用完整 `npm run check`，不能定向降级；真实浏览器脚本另跑，CI 不代替浏览器或本机服务证据。原始结果写入 `.local/p03-p05-*`，重要结论、命令、PASS/FAIL/UNKNOWN/NOT_RUN 及未决项回写 `results.md`。独立复核只读固定候选，临时输出进入独立 `.local/independent/` 目录。

## 本机合成试用模式（syntheticTrial）契约

为完成派单授权的本机合成演练（建委托→合成来源更新→暂停/恢复→重开核对），在合并版 `b831227` 之后补充默认关闭的 Host 治理开关。Interface 版本沿用 `NativeResearchPort`/`RunBinding`，不新建 Runtime。

- **Config 键：** `runtime/plugin.ts` `Config.syntheticTrial?:boolean`；`scripts/runtime/start.mjs` 私有 Host JSON 同名布尔键。缺省时所有新增分支不激活，profile 与行为同合并版逐字等价；显式 `false` 行为等价，但 config 多一个 false 键使 profile digest 不同（预期）。
- **固定 Provider：** 开启后模型选择强制为 `sentiscope-synthetic-trial/synthetic`（`runtime/synthetic.ts` 导出 `SYNTHETIC_TRIAL_PROVIDER`）。适配器经官方公开 `ctx.llm.registerAdapter`/`LlmAdapter` 注册，仅脚本化合成响应，无 fetch/http/child_process/fs 写入，输出明示 “not research quality evidence”。非固定模型引用在启动时 fail-closed。
- **路由与资源默认：** 开启时 `localModelRoutes` 恰为该单一固定对；`runtime/controls.ts` 路由闸门与 `src/egress.ts` provider/model 匹配双重拒绝外部派发。合成默认预算 `{modelRequests:5000,outputTokens:1000000,computeMilliseconds:0,durationMs:3600000}`、egress `{enabled:true,provider:固定,model:'synthetic',maxTokens:128}` 仅在用户未显式配置时补缺；计算端口恒关闭。默认预算面向短演练，1 小时到期或 maxTokens>1e6 会停摆，须按演练需要显式配置。
- **auth 强制：** `allowUnauthenticated` 仍只看 engineering 参数，不看 syntheticTrial；产品 JSON 无法注入 engineering 路由。无 auth 开启 syntheticTrial 启动失败 `auth_configuration_required`。operator/maintainer 分权不变。
- **export 与检查链：** `runtime/package.json` 仅增 `"./synthetic"` export，peerDependencies/锁/原包不变，无新增运行依赖。新增 `check:synthetic-trial`（`scripts/check-synthetic-trial.mjs` + `scripts/runtime/synthetic-trial-probe.mjs`）并入统一 `check`，覆盖永久负例（非固定模型拒绝、无 auth 拒绝）、登录分权、来源更新、暂停阻断、恢复自动对账处理待处理更新。`scripts/runtime/start-config.test.mjs` 永久覆盖 start.mjs 解析路径（非布尔 flag 在启动 harness 前拒绝、help 文案）。
- **重启恢复修复（独立复核 F1）：** 修复既有缺陷——运行行已提交但会话 JSONL 首次落盘前中断会导致重启持久锁死。`src/research.ts` `start()` 按委托隔离启动对账失败（记录 `reconcile_failed`，不阻断其余委托）；`#openEnsure`/`#retireRecorded` 对 `SessionPersistenceNotFoundError` 且无原生 Schedule 的运行记录 `native_session_missing`/`native_session_missing_retire` 并标记 retired，随后新建会话而非锁死。有 Schedule 或其他错误仍 fail-closed 隔离。永久回归 `runtime/restart-missing-session.test.mjs`：首次落盘前崩溃自动恢复、缺失会话＋心跳 Schedule 保持 fail-closed 隔离且不盲新建、启动按委托隔离（其余委托照常启动）。
- **边界与交付说明：** 仅本机回环合成试用，不表述为真实模型质量、真实企业来源或生产安全验收；不接 Call/真实计算。官方 harness 对插件激活失败可能 exit 0 并打印 warning（既有行为），运维须读输出而非仅退出码；合成链本身不含跨进程重开，重开由通用 `check:recovery`、`restart-missing-session` 回归与演练规程覆盖。独立复核 R1/R2（`.local/independent/p03-p05-synthetic-r1/`、`r2/`）：F1 经真实锁死现场回放确认 RESOLVED，F2–F6 已处理，残留 LOW/INFO 如实记录于 results.md。
