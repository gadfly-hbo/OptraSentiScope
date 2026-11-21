# P03–P05 结果记录

2026-11-21 开工。当前为完整检查候选，尚未经过最终独立复核、PR/CI、合并或试用切换。历史 PASS 只按原范围引用，不代替本候选证据。

## 基线事实

- Git：`main`/`origin/main` 为 `32b4e00450d069cd254fb33fe0710cf3f0925b86`，已建立 `qoder/p03-p05-sustained-sources`。
- 基线检查：`npm test` 295/295 与 `npm run typecheck` PASS；本轮当前完整单测为 303/303 PASS，类型检查 PASS。
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
| P05 owner/凭据/出口/计算 OFF/SDK | PASS（本机合成边界；生产项 NOT_RUN） | `.local/host-controls-checks/run-1795232007281-a25e4dd4-6bd9-4aea-8bea-cf4cfc68c925/runner-result.json`；含实际官方 Engine worker 的 `run_compute` 拒绝 |
| P05 跨版本恢复与长流 | PASS（本机隔离范围） | 崩溃后备份恢复 `.local/recovery-checks/run-1795231389680-d4fbd51a-734f-4aae-bccf-f70002e4486c/result.json`；长流 `.local/longstream-checks/run-1795231877280/runner-result.json` |
| 完整检查与审计 | PASS | `npm run check` 全部通过，持久日志 `.local/p03-p05-candidate/full-check.log`；303/303 tests；`npm audit --audit-level=high` PASS，0 vulnerabilities |
| 独立复核与四原则最终检查 | NOT_RUN | 固定候选后由全新上下文非作者执行 |
| PR、两次 CI、合并与试用切换 | NOT_RUN | 已获本轮授权，独立复核后执行 |

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
| AC08 暂停/撤权/结束/UNKNOWN | PASS（合成本机范围） | 主任务中断、worker 收束、无关方向继续；撤权遮蔽、恢复摘要、定时结束、UNKNOWN 和迟到不复活均有反例。 |

## U01–U12 真实浏览器矩阵

| 路径 | 状态 | 真实浏览器证据 |
| --- | --- | --- |
| U01 一句话建立／空态 | PASS | `.local/ui-checks/run-g475d9`、`.local/general-ui-checks/run-5qh1b5`；正常 HTTP 建立与摘要。 |
| U02 离开返回／持续推进 | PASS | `.local/lifecycle-ui-checks/run-5x97yP`：关闭并重开浏览器读回摘要；官方链另证原生 Schedule。 |
| U03 新信息／重复投递 | PASS | 上述生命周期 UI＋官方共享来源链：双工单、同一采集 ID、重复检查无新事件。 |
| U04 依据与有限判断 | PASS | `.local/operator-decision-ui-checks/run-qm0Nij`：准确历史版本、依据、未知与键盘焦点。 |
| U05 决策及未回复 | PASS | 同上：知悉仍待决、部分/明确采纳、准确版本和窗口。 |
| U06 结果事实 | PASS | `.local/outcome-ui-checks/run-pgy5Jp`：选择/执行/观察分离、UNKNOWN、缺资料与撤回。 |
| U07 学习与反证 | PASS（工程展示，不证明业务学习质量） | `.local/effect-ui-checks/run-RsYlRJ`：反证、认识修正、效果判断、经验限制和撤回。 |
| U08 调整／暂停／恢复／结束 | PASS | `.local/lifecycle-ui-checks/run-5x97yP`＋官方链：暂停/恢复摘要、原生定时结束、迟到不复活。 |
| U09 来源失联／撤回 | PASS | 官方链失联/恢复/单方撤权；生命周期 UI 显示一方 revoked、另一方 ready。 |
| U10 故障／UNKNOWN | PASS | 生命周期 UI 的 UNKNOWN 与断连最后可核实状态；官方恢复链保留 claimed/unknown。 |
| U11 Call 未接通 | PASS | 工作台持续显示待接入；无 Call 数据或替身接入宣称。 |
| U12 演示／运行边界 | PASS | 生命周期 UI 显示合成证据、计算 OFF、外部研究/提醒/导出/遥测/备份出口未启用；生产隔离仍 NOT_RUN。 |

提醒与偏好补充：`.local/notification-ui-checks/run-ENL9U3` 验证合并事项仍直达独立决定与窗口；`.local/lifecycle-ui-checks/run-5x97yP` 验证真实 HTTP 保存偏好、轮询保留编辑、浏览器重开及 SQLite 重开读回 `09:00:00`／周六／revision 2。

## R01–R06 本机分项

| 运行项 | 状态 | 证据与未运行边界 |
| --- | --- | --- |
| R01 维护、备份与恢复 | PASS（本机隔离）；企业 Linux NOT_RUN | SIGKILL 后 `VACUUM INTO`＋manifest 校验并恢复现行 sessions/storage；官方新进程读回 SQLite、原 Session、Schedule、游标和 claimed 回执。旧 `native/` 布局及私有凭据文件由 `test/runtime-backup.test.ts` 覆盖。 |
| R02 owner 与权限 | PASS（本机 Host 绑定）；SSO/HTTPS/管理面 NOT_RUN | Host 固定 `local-trial/local-operator`；既有 server 反例确认浏览器不能替换 owner。生产登录与维护者角色未实现、未宣称。 |
| R03 凭据与组件 | PASS（合成凭据和精确官方包） | CredentialLocal 读取/轮换/撤回、错误脱敏、模型/HTTP/SQLite 扫描通过；SDK 锁、实际模块与 peer 身份通过。真实企业凭据设施 NOT_RUN。 |
| R04 计算关闭 | PASS（主 Agent＋官方 Engine worker）；真实隔离 NOT_RUN | 原生 `run_compute` 返回 `compute_unavailable/dispatched:false`，Host marker 不存在；主/worker 均无 Host 回退。当前 profile 未提供独立 subagent 工具，不能宣称已验证原生子 Agent 树；容器/VM、文件/进程/网络/配额隔离继续 NOT_RUN。 |
| R05 四类出口 | PASS（本机配置与合成模型路径）；真实端点 NOT_RUN | 模型精确 route 允许/拒绝、历史资格、撤回零 adapter 调用；外部研究/连接器、外发提醒/导出、遥测/外部备份无 sender 且保持 disabled，额外会话上传未配置。真实外部启用路径不在本机合成范围。 |
| R06 常驻、异常与长流 | PASS（本机合成）；生产常驻 NOT_RUN | 关页、SIGKILL、重开、UNKNOWN 对账通过。1/2/4/8 事件批次下 evidence/native bytes 为 `(1202,98404)`、`(2404,196142)`、`(4809,392284)`、`(9624,784568)`，斜率 81.48、R² `0.999999911`；32 个物化 Session、1441 条原生事件、16 个来源文档事件和 16 份报告完整读回。 |

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

完整 `npm run check` 已通过；独立复核、PR/CI、合并和实际试用服务结果仍待写入，本节不替代这些交付门禁。

## 范围外 / NOT_RUN / UNKNOWN

- 真实模型、企业资料、真实来源更新/撤权时限、Call/P06、经营 POC、完整 AC07 与首版产品验收。
- 企业 Linux、生产 HTTPS/SSO/维护者管理面、真实外部端点与出口、真实计算容器或 VM 隔离。
- 当前没有未披露的 UNKNOWN；若后续完整检查、独立复核或服务切换出现失败/UNKNOWN，将逐项追加而不改为 PASS。
