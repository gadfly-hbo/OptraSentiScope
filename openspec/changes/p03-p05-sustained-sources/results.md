# P03–P05 结果记录

2026-11-21 开工并完成本轮交付。P03–P05 合成工程范围经多轮非作者独立复核（R6 PASS，R2–R5 发现全部关闭）；R02 修正版 UI Demo 获用户确认后实施本机登录/角色。后续补充默认关闭的 `syntheticTrial` 本机合成试用模式与首次落盘前重启锁死修复（独立复核 R1/R2，F1 经真实锁死现场回放确认 RESOLVED）。已交付 PR #4/#5/#6/#7/#8、各自 CI 与 main CI、squash 合并，并切换本机 `127.0.0.1:8766` 独立试用实例至 main `44760bd9bb4a2295a53894ee1fe06246309fa478`，完成用户入口演练。历史 PASS 只按原范围引用，不代替本候选证据。产品体验验收仍待用户确认；真实模型/企业资料/Call/生产项继续 NOT_RUN。

## 基线事实

- Git：`main`/`origin/main` 为 `32b4e00450d069cd254fb33fe0710cf3f0925b86`，已建立 `qoder/p03-p05-sustained-sources`。
- 基线检查：`npm test` 295/295 与 `npm run typecheck` PASS；R2/R3 修复与 R02 实施后当前完整单测为 316/316 PASS，类型检查 PASS。
- 试用服务：开工时 `127.0.0.1:8766` 无监听，未发现匹配产品进程；`.local/service-trial-20261120/host.json` 指定 owner `local-trial/local-operator` 和独立数据目录。旧 `service-proof.json` 只证明 2026-11-20 的 `6ec330d` 运行，不代表当前状态。
- 官方组件：保持 Harness `0.2.2-rc.3` 与 superagent `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`，未升级或改包。`npm run check:sdk` PASS：`.local/sdk-checks/run-1795231934530-3e53e2b1-3528-4ba4-ba58-eda867c8e7c5/result.json`。

## 执行清单状态

| 项目 | 状态 | 当前证据 / 下一步 |
| --- | --- | --- |
| 基线与 OpenSpec | PASS | 规格、基线和实际服务状态已固定 |
| P03 委托、共享来源、去重与恢复 | PASS（合成工程范围） | 官方链 `.local/shared-source-checks/run-1795230466078/runner-result.json`；`runtime/shared-sources.test.mjs`、`test/sources.test.ts` |
| P03 失联、恢复、单方撤权与遮蔽 | PASS（合成工程范围） | 同一 `collectionId` 分发、独立 eventId、失联/恢复补读、单方撤权后另一方 version four 继续；旧会话不回放新正文 |
| P04 在途收束、UNKNOWN、恢复/结束摘要 | PASS（合成工程范围） | 同一官方链含暂停采集中断、采集继续、恢复摘要、原生定时结束和迟到不复活；`runtime/lifecycle-summaries.test.mjs` 另覆盖主/worker/无关方向及方案/选择/执行/观察 |
| P04 U01–U12 浏览器 | PASS（工程 UI 范围，待用户产品体验） | 见下方 U 矩阵；真实外部浏览器、HTTP 与 SQLite，窄屏/键盘/断连分别留证 |
| P05 owner/凭据/出口/计算 OFF/SDK | PASS（本机合成边界；生产项 NOT_RUN） | `.local/host-controls-checks/run-1795245935638-260f0873-e4ba-4576-a205-3d34c06f8929/runner-result.json`；含实际官方 Engine worker 的 `run_compute` 拒绝。R02 本机登录/角色见 `test/server-auth.test.ts` 与 `.local/auth-ui-checks/run-8TpADq` |
| P05 跨版本恢复与长流 | PASS（本机隔离范围） | 崩溃后备份恢复 `.local/recovery-checks/run-1795231389680-d4fbd51a-734f-4aae-bccf-f70002e4486c/result.json`；长流 `.local/longstream-checks/run-1795231877280/runner-result.json` |
| 完整检查与审计 | PASS（最终候选前） | `npm run check` 全部通过，持久日志 `.local/p03-p05-candidate/full-check-r5.log`；316/316 tests；`npm audit --audit-level=high` PASS，0 vulnerabilities；真实浏览器 U01–U12、登录与撤权路径分别 PASS |
| 独立复核与四原则最终检查 | PASS | R6 Spec／Standards 均 PASS：`.local/independent/p03-p05-spec-r6/REPORT.md`、`.local/independent/p03-p05-standards-r6/REPORT.md`；R2–R5 发现全部关闭 |
| PR、两次 CI、合并与试用切换 | PASS | PR #4（阶段交付）/#5（长流诊断）/#6（syntheticTrial＋重启修复）/#7（长流取样＋移动网格）/#8（长引用移动溢出）均 CI PASS 后 squash 合并；main CI 最终 PASS（run 44900522411，head `44760bd`）。试用实例切换至 `44760bd`，proof `.local/service-trial-20261120/service-proof.json`，演练 `.local/service-trial-20261120/drill-t2FxWw/result.json` PASS |

## AC 结果（本阶段合成工程范围）

| 验收 | 状态 | 证据与边界 |
| --- | --- | --- |
| AC01 一句话建立、背景与局部等待 | PASS | 正常 HTTP 建两个委托；Agent 保存结构化摘要和 `blockingScopes:['evaluation']`，独立研究仍建单并读回 version one。 |
| AC02 关页/重启继续与读回 | PASS | 原生 recurring Schedule 驱动更新；真实浏览器离开/返回；SIGKILL 后恢复原 Session/Schedule 并继续到期研究。 |
| AC03 双结果、去重与接收失败 | PASS | 同一更新补充 baseline 并建立 Independent source question；重复扫描无新事件/工单；多记录接收失败全事务回滚，冷重放一次。 |
| AC04 准确版本与缺失限制 | PASS | 原文件时间/Host 获取时间/hash 可读；缺旧版或无缓存权限拒绝，不替换 latest；共享采集仍逐委托核来源根锚点。 |
| AC05 选择与独立工作 | PASS（已有能力回归） | 决策 UI 与运行时回归通过；知悉不采纳、局部待决不阻断独立研究，暂停/结束保留待决。 |
| AC06 选择/执行/观察分记 | PASS（已有能力＋结束摘要） | 结果 UI 通过；结束摘要准确保留 plan/choice/execution/observation 各一项，迟到发布拒绝且摘要字节不变。 |
| AC07 学习与反证 | PARTIAL / 不关闭完整验收 | P01/P02 与 effect/experience 回归通过；真实模型研究质量、业务有效性和完整 AC07 不在本阶段关闭。 |
| AC08 暂停/撤权/结束/UNKNOWN | PASS（R2 修复后，待独立重验） | 主任务中断、worker 收束、无关方向继续；正常 HTTP 撤权正文投影与真实浏览器遮蔽、恢复摘要、定时结束、UNKNOWN 和迟到不复活均有反例。 |

## U01–U12 真实浏览器矩阵

| 路径 | 状态 | 真实浏览器证据 |
| --- | --- | --- |
| U01 一句话建立／空态 | PASS | `.local/ui-checks/run-R0RlGn`、`.local/general-ui-checks/run-SR7yaq`；正常 HTTP 建立与摘要。 |
| U02 离开返回／持续推进 | PASS | `.local/lifecycle-ui-checks/run-hpjGr4`：关闭并重开浏览器读回摘要；官方链另证原生 Schedule。 |
| U03 新信息／重复投递 | PASS | 上述生命周期 UI＋官方共享来源链：双工单、同一采集 ID、重复检查无新事件。 |
| U04 依据与有限判断 | PASS | `.local/operator-decision-ui-checks/run-Nbhl59`：准确历史版本、依据、未知与键盘焦点。 |
| U05 决策及未回复 | PASS | 同上：知悉仍待决、部分/明确采纳、准确版本和窗口。 |
| U06 结果事实 | PASS | `.local/outcome-ui-checks/run-1S2AuF`：选择/执行/观察分离、UNKNOWN、缺资料与撤回。 |
| U07 学习与反证 | PASS（工程展示，不证明业务学习质量） | `.local/effect-ui-checks/run-n0xNP5`：反证、认识修正、效果判断、经验限制和撤回。 |
| U08 调整／暂停／恢复／结束 | PASS | `.local/lifecycle-ui-checks/run-hpjGr4`＋官方链：暂停/恢复摘要、原生定时结束、迟到不复活。 |
| U09 来源失联／撤回 | PASS（R2 修复后，待独立重验） | 官方链失联/恢复/单方撤权；`.local/revocation-ui-checks/run-JUbaxN` 证明进展/方案/资料页均不渲染失权 marker，390px 与浏览器错误检查通过。 |
| U10 故障／UNKNOWN | PASS | 生命周期 UI 的 UNKNOWN 与断连最后可核实状态；官方恢复链保留 claimed/unknown。 |
| U11 Call 未接通 | PASS | 工作台持续显示待接入；无 Call 数据或替身接入宣称。 |
| U12 演示／运行边界 | PASS | 生命周期 UI 显示合成证据、计算 OFF、外部研究/提醒/导出/遥测/备份出口未启用；生产隔离仍 NOT_RUN。 |

提醒与偏好补充：`.local/notification-ui-checks/run-CH8o7A` 验证合并事项仍直达独立决定与窗口；`.local/lifecycle-ui-checks/run-hpjGr4` 验证真实 HTTP 保存偏好、轮询保留编辑、浏览器重开及 SQLite 重开读回 `09:00:00`／周六／revision 2。

## R01–R06 本机分项

| 运行项 | 状态 | 证据与未运行边界 |
| --- | --- | --- |
| R01 维护、备份与恢复 | PASS（R2 修复后，待独立重验）；企业 Linux NOT_RUN | 现行 SIGKILL 恢复见上；实际旧提交 `6ec330d` 生成数据后经当前版本恢复：`.local/recovery-checks/run-1795244921305-ddb0b75c-0a00-445a-8ba6-89dca370db9b/result.json`，读回 SQLite、原 Session、Schedule、游标和 claimed 回执。 |
| R02 owner 与权限 | PASS（本机登录/角色，待独立重验）；生产 SSO/HTTPS/管理面 NOT_RUN | 用户确认修正版 Demo 后实施：Host 仅存 token/session SHA256，HttpOnly/SameSite=Strict 会话，operator 建单/维护 403，maintainer 只读维护/业务 403，logout 撤销、重启读回、限流和明文不落库由 `test/server-auth.test.ts` 覆盖；真实浏览器 `.local/auth-ui-checks/run-8TpADq` PASS。 |
| R03 凭据与组件 | PASS（合成凭据和精确官方包） | CredentialLocal 读取/轮换/撤回、错误脱敏、模型/HTTP/SQLite 扫描通过；SDK 锁、实际模块与 peer 身份通过。真实企业凭据设施 NOT_RUN。 |
| R04 计算关闭 | PASS（主 Agent＋官方 Engine worker）；真实隔离 NOT_RUN | 原生 `run_compute` 返回 `compute_unavailable/dispatched:false`，Host marker 不存在；主/worker 均无 Host 回退。当前 profile 未提供独立 subagent 工具，不能宣称已验证原生子 Agent 树；容器/VM、文件/进程/网络/配额隔离继续 NOT_RUN。 |
| R05 四类出口 | PASS（本机配置与合成模型路径）；真实端点 NOT_RUN | 模型精确 route 允许/拒绝、历史资格、撤回零 adapter 调用；外部研究/连接器、外发提醒/导出、遥测/外部备份无 sender 且保持 disabled，额外会话上传未配置。真实外部启用路径不在本机合成范围。 |
| R06 常驻、异常与长流 | PASS（R3 写放大修复后，待独立重验）；生产常驻 NOT_RUN | 关页、SIGKILL、重开、UNKNOWN 对账通过。已确认停止的旧 Schedule 通过官方公开 delete 退役并先保存业务回执，任务表不再随事件累积。`.local/longstream-checks/run-1795245937905/runner-result.json`：storage 每事件固定 9992 bytes，总写入 R² `0.9999932`、storage R² `0.99999996`；30 次前缀不变检查、无失败写；32 个物化 Session、1443 条原生事件及 16 个 marker/hash 各恰好一份原生报告完整读回。 |

## 独立复核 R2 与修复状态

- 固定候选 `11e6fb560d909d6f41480a06e9eb7840c16fdd51` 的两名非作者复核均为 FAIL：`.local/independent/p03-p05-spec-r2/REPORT.md`、`.local/independent/p03-p05-standards-r2/REPORT.md`。第一次 Agent 启动因 429 未执行，恢复后 R2 实际完成；不以作者自检代替独立结论。
- 已修复并留永久反例：撤权派生正文投影、旧快照后提交回写、路径别名共享 ID、pending assessment 摘要、stale CAS 原生副作用、缺失 interrupt 静默 following。真实浏览器和 `runtime/source-adversarial.test.mjs`、`runtime/lifecycle-adversarial.test.mjs`、`runtime/revocation-projection.test.mjs` 覆盖。
- 已重做证据：真实 FileHandle 写入字节、Session 前缀/append flag、16 个 marker/hash 逐项读回；实际旧提交 `6ec330d` 数据恢复。R02 按 UI 门禁另交差异 spec＋Demo，待用户决定后重验。

## 独立复核 R3 preflight 与后续修复

- Spec preflight：`.local/independent/p03-p05-spec-r3-preflight/REPORT.md` 判 F01/F04 RESOLVED、F03 NOT_RESOLVED；真实 meter 揭示 Schedule JSON 任务表随事件累积并全量重写，storage 呈二次增长。
- Standards preflight：`.local/independent/p03-p05-standards-r3-preflight/REPORT.md` 确认 R2 六项原始反例关闭，但新增 schedule/pause 并发重复 open 与 interrupt UNKNOWN 后重复派发两项 FAIL。
- 后续修复：生命周期 schedule/pause/sync 统一串行、open singleflight、lifecycle-only 打开不投递研究上下文、暂停/UNKNOWN 不新建普通研究资源；官方 Schedule 确认停止后 delete 并保存 `schedule_retired` 安全回执。永久反例见 `runtime/lifecycle-race.test.mjs`；长流新增 storage 分量线性与每事件字节不放大断言。
- R02：用户确认修正版 Demo 后实施本机登录/角色；见 `local-auth-spec.md`、`test/server-auth.test.ts`、`.local/auth-ui-checks/run-8TpADq`。
- 旧版兼容补充：旧运行记录没有 heartbeat/context 标记，首次恢复曾重复创建心跳；现从原生 Schedule 与已保存 context 消息推断旧事实，实际 `6ec330d` 恢复重跑 PASS，未重复派发。
- 调度退役时序：存活句柄上提前 delete 曾导致 Host-controls 停止/续派失败；现存活期间只 pause，dispose 确认后再 delete 并保存回执。过程中临时诊断自身引入的 `ReferenceError` 已移除，Host-controls 与长流重跑 PASS。
- artifact-followup 探针曾要求无历史缓存权限时重开仍回放 v1 正文；按遮蔽契约改为断言安全旧版索引，官方链重跑 PASS，未放宽产品权限。
- PR #4 首轮 CI FAIL：Ubuntu 没有本机 ignored 的 `legacy-6ec330d` worktree，`check:legacy-recovery` 无法复制旧探针。该检查保留为本机专项并从统一 CI 链移出；现行恢复与长流仍在 CI，旧版恢复以本机固定证据单独报告。

## 独立复核 R4 与修复

- Standards R4：`.local/independent/p03-p05-standards-r4/REPORT.md` PASS，R2/R3 与 R02 全部关闭，无新阻断。
- Spec R4：`.local/independent/p03-p05-spec-r4/REPORT.md` PASS_WITH_FINDINGS；F-R4-01 为零证据派生正文撤权后投影 fail-open，F-R4-02 为长流数值标注错配。
- 修复：历史派生正文只有在当前资格或存在可回放准确证据引用时返回；空证据历史记录默认遮蔽。新增 `runtime/revocation-projection.test.mjs` 零证据反例，先复现 FAIL 后转 GREEN。F-R4-02 已按所引 run 更正为 storage 9992 bytes/event、总 R² 0.9999932。

## 独立复核 R5 与修复

- Standards R5：`.local/independent/p03-p05-standards-r5/REPORT.md` PASS，R4 修复无权限/并发/持久化回归。
- Spec R5：`.local/independent/p03-p05-spec-r5/REPORT.md` 确认 F-R4-01/02 RESOLVED，但发现遮蔽 followup 依据后 `app.js` 少一层可选链导致默认进展页崩溃，以及测试计数标注滞后。
- 修复：`version?.content?.title`；撤权浏览器反例扩展为零证据＋followup，零证据单元反例也加入 followup；计数更正为 316/316。待定向重验。

## 独立复核 R6 最终结论

- Spec R6：`.local/independent/p03-p05-spec-r6/REPORT.md` PASS；含 followup 的零证据撤权在 active/paused/ended 真实浏览器均通过，默认进展页与六页签可用、marker 缺席、安全元数据渲染；旧代码 shadow 仍 RED；计数与日志一致。
- Standards R6：`.local/independent/p03-p05-standards-r6/REPORT.md` PASS；R5 后差异无权限/并发/持久化回归，typecheck、115 测试、26 项独立反例与真实浏览器通过。
- 四原则专项最终检查随上述独立复核通过：Host 管环境/权限/持久化，Agent 自主研究，官方 SDK 原实现与唯一 Runtime/Schedule 权威保持，新增人工作业仅必要登录/退出。

## 本轮 RED、修复与 fixture 失败留痕

- **真实产品 RED：** 共享采集缺少统一 acquisition 身份与双委托分发；全局暂停会被后续方向操作缩小；暂停重复对账重复中断主 Session；HTTP `expectedVersion` 未归一化导致暂停无效；备份遗漏现行 `sessions/`、`storage/`。均已最小修复并由对应反例转 GREEN。
- **官方恢复首次 FAIL：** fixture 强制要求一个从未创建的 private 目录；改为仅在实际存在时要求恢复，随后完整链 PASS，未改产品断言。
- **长流首次 FAIL：** 合成 Provider 在同一 worker Session 对同一证据重复报告，修正为每会话每 hash 一次；完整读回另区分从未物化的运行意图与已有 `native_created/native_resumed` 事实的 Session。最终 PASS，未删来源去重或完整读回断言。
- **浏览器首次 FAIL：** 决策夹具仍输出旧 `outcomes` 字段，修正为当前 `outcomeFeed` 后单独重验 PASS；不是通过放宽 UI 断言制造成功。
- **共享来源探针过程失败：** 保留间隔配置、合成 Agent 分支、旧摘要待重核断言和诊断 SQL 的 fixture 修正记录；最终官方链为 `run-1795230466078`，早期 FAIL 不改写。

## 四原则检查（当前候选自检，非独立复核）

- Host 只做 owner/grant、共享采集、技术去重、资格、生命周期、出口、持久化、备份和事实摘要；Agent 仍通过官方 `note_ticket`/`decide_event` 自主决定业务归属和研究方法。
- 官方 Engine/Session/Schedule 保持唯一工单与原生生命周期权威；新增 `interrupt` 只调用现有官方 Agent cancel 并等待 idle，不建第二 Runtime/计时器；恢复/结束摘要不是 Agent 分析流程。
- 官方 SDK 版本和原实现不变，无深导、补丁或 monkey patch；共享快照按物理采集键复用且逐委托重核根与授权。
- 正常用户仍只表达目标、补关键事实和使用既有生命周期控件；新增摘要为只读渐进披露，无新增机器配置、读取审批或确认步骤。

完整 `npm run check` 已通过（最终 321/321 tests、17 条官方/工程链 PASS、`npm audit --audit-level=high` 0 vulnerabilities）；独立复核、PR/CI、合并和实际试用服务结果见下方回执。产品体验验收仍待用户确认。

## syntheticTrial 与重启修复独立复核（R1/R2）

- 背景：合并版 `b831227` 后为完成派单授权的本机合成演练，补充默认关闭的 `syntheticTrial` Host 开关（固定 in-process `sentiscope-synthetic-trial/synthetic` adapter，仍强制本机 auth，不开外部传输/计算），并修复既有首次落盘前重启锁死。契约见 [spec.md](spec.md) “本机合成试用模式（syntheticTrial）契约”。
- R1：`.local/independent/p03-p05-synthetic-r1/REPORT.md` PASS_WITH_FINDINGS。F1 HIGH（既有锁死）、F2 MEDIUM（SDD 记录）、F3–F6 LOW、F7–F10 INFO。
- 修复：`src/research.ts` `start()` 按委托隔离启动对账；`#openEnsure`/`#retireRecorded` 对 `SessionPersistenceNotFoundError` 且无原生 Schedule 的运行标记 retired 并新建/收束，有 Schedule 或其他错误仍 fail-closed 隔离。永久回归 `runtime/restart-missing-session.test.mjs`（3 例，含 R1 真实现场：缺失会话＋心跳 Schedule 保持隔离不盲新建）、`scripts/runtime/start-config.test.mjs`（start.mjs 解析负例）。`check:synthetic-trial` 增永久负例（非固定模型拒绝、无 auth 拒绝）并改恢复后自动对账（去显式 sync）。
- R2：`.local/independent/p03-p05-synthetic-r2/REPORT.md` PASS_WITH_FINDINGS。F1 经 R1 保留的真实锁死现场在候选代码下回放确认 RESOLVED（宿主成功启动、委托 fail-closed 隔离、二次启动正常）；F2–F6 已处理；残留 F-R2-01（回归强度，已补强第 3 例）、F-R2-02/03（措辞/results，已更新）、F6（start.mjs 路径，已补 start-config 测试）。四原则通过，IN01–IN05 通过。
- 最终本地完整检查：`.local/p03-p05-candidate/full-check-css-r2.log`（321/321、17 PASS）。

## 本轮 Git/CI/合并与试用切换回执

- 阶段 PR #4 https://github.com/gadfly-hbo/OptraSentiScope/pull/4 ：最终 head `b0280ca4b6b02443548af8aba67d664859096338`，CI run 44887593477 PASS，squash merge `07233aa1eaef9bea82686ec8299f20a22252e2cb`。main 首轮 CI run 44888080631 长流 FAIL（同代码 PR CI PASS）。
- 诊断 PR #5 https://github.com/gadfly-hbo/OptraSentiScope/pull/5 ：head `f289bdf`，CI run 44888476819 PASS，merge `b831227a0412bd797713041ce7947a3ff9df0b41`；main CI run 44888928949 PASS。
- syntheticTrial PR #6 https://github.com/gadfly-hbo/OptraSentiScope/pull/6 ：head `1ccaf2354f07531113632b550daaf1387d10725f`，CI run 44897285147 PASS，merge `8052d2a57a3fb1fc3e74247fff0acd32466d3477`。main CI run 44897792529 长流首批计量 FAIL（CI 慢时序把引导写算进首批）。
- 长流取样＋移动网格 PR #7 https://github.com/gadfly-hbo/OptraSentiScope/pull/7 ：head `7d8386aeb9e7e6e3152cf46ac0fd03d8d49ecc21`，CI PASS，merge `f5fffdfec71b11a6a1e51c889449b1d74a4074a9`；main CI run 44899209116 PASS（长流取样稳定修复在 CI 生效）。
- 长引用移动溢出 PR #8 https://github.com/gadfly-hbo/OptraSentiScope/pull/8 ：head `d221b9f9f30755ce1c3b6452e0b25799a86889be`，CI PASS，merge `44760bd9bb4a2295a53894ee1fe06246309fa478`；main CI run 44900522411 PASS。
- 长流根因修复：`scripts/runtime/longstream-probe.mjs` 取样前等待异步 storage 写落盘稳定（`settleStorage`），避免一次性引导写被误算进首批；本地每事件 storage 恒定 9992 bytes（批次 1/2/4/8），storage R² 0.99999996。非盲重跑。
- 移动溢出根因修复：`src/web/styles.css` 移动 `detail-grid` 与内层 `main-column/side-column` 用 `minmax(0,1fr)`＋子项 `min-width:0`，body 继承 `overflow-wrap:anywhere`，长事实/会话标识不再撑宽页面；390px 页宽 390/390。

### 试用实例切换

- 目标：`127.0.0.1:8766`，launchd `gui/501/dev.optrasentiscope.trial`，配置/数据 `.local/service-trial-20261120/`。切换前实例未加载、无监听；旧 proof 仅证明 2026-11-20 `6ec330d` 未配置态。
- 备份：`.local/service-trial-backup-20261121-190436/`（旧 data＋host.json＋plist＋旧 proof）。回退条件：若新版本健康/登录/读回失败，bootout 新 job，恢复备份 host.json（无 auth/syntheticTrial）与数据，bootstrap 旧 plist 回到 `6ec330d` 未配置态。
- 配置：私有 `host.json` 增 `syntheticTrial:true` 与 operator/maintainer token SHA256（会话 86400s），owner 仍 `local-trial/local-operator`，数据目录不变；原 token 仅存 `.local/service-trial-20261120/credentials.txt`（mode 600，不进公开仓库/日志）。合成来源目录 `/Users/huangbo/.local/share/optrasentiscope-synthetic-source`（仓库外，仅合成事实）。
- 运行版本：`44760bd9bb4a2295a53894ee1fe06246309fa478`；`/api/health` status ok、runtime configured、call not_connected；监听 node pid 见 proof；资产 hash 见 proof。
- 分权核实：匿名业务 401；operator 登录 200；maintainer 业务 403、维护 200。
- 用户入口演练（真实浏览器 agent-browser，`.local/service-trial-20261120/drill-t2FxWw/result.json` PASS）：operator UI 登录→UI 新建委托→Host 绑定合成 grant 并重开→来源 v1 报告渲染→UI 暂停按钮阻断派发→UI 恢复按钮自动补读 v2→服务重启后 v2 持久读回→390px 无横向溢出→无浏览器错误。截图 01–06 存于该目录。
- 边界：合成来源/合成 Provider/计算 OFF/Call not_connected；不表述为真实模型质量、真实企业资料或生产安全验收。默认合成预算 1 小时到期或 maxTokens>1e6 会停摆（短演练设计）；官方 harness 插件激活失败可能 exit 0 并打印 warning，运维须读输出。

## 范围外 / NOT_RUN / UNKNOWN

- 真实模型、企业资料、真实来源更新/撤权时限、Call/P06、经营 POC、完整 AC07 与首版产品验收。
- 企业 Linux、生产 HTTPS/SSO/维护者管理面、真实外部端点与出口、真实计算容器或 VM 隔离。
- 当前没有未披露的 UNKNOWN；若后续完整检查、独立复核或服务切换出现失败/UNKNOWN，将逐项追加而不改为 PASS。
