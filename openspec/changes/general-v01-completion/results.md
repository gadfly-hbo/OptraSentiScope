# 通用首版剩余工作一次性完成 v0.1 结果记录

2026-11-19开工，2026-11-20完成独立复核修复。对象为分支 `codex/general-v01-build`、开工基线 `a63b780e87691fa5a8e74d24dcc2d3ca1cfa6155` 之后的完整工作区候选。本记录只描述本地工程实现与隔离验证，不宣称真实研究质量、业务价值、AC07、完整首版产品验收、部署或运行采用。

## 阶段状态

| 阶段 | 状态 | 结果 |
| --- | --- | --- |
| P01 认识修正接收差异 | PASS（本地工程范围，Standards R3重验通过） | 主 Agent 可经 `read_artifact` 准确读回跨来源 epoch 的普通 judgment/plan 原件；依赖只沿显式 J→J/J→P 业务支持边展开，并保留同一 plan 的多条简单路径及路径关系；同一建议事项 P1→P2 以准确关系修订、CAS 和新 plan 版本收束；请求重放返回原回执。自然路径为组合证据：认知链由原生 recurring Schedule 自然到期扫描来源变化，后续 one-shot 以官方 public run 确定性解析；elapsed wall clock 另由 native Schedule 链覆盖。重开、撤权遮蔽与结束后迟到不复活均有目标测试和官方合成链证据。 |
| P02 条件经验闭环 | PASS（本地工程范围，Standards R3重验通过） | 新增不可变经验版本、来源/依据/条件/时效/限制/反例/复验条件、跨同企业委托发现与读取、实际调用/拒用留痕、来源撤权遮蔽；经验 v2 限缩后，合成 Agent 在正常工具路径记录 experience 触发的认识复核，并只沿显式依赖生成受影响建议重评。本证据不证明脱离 Agent 的 Host 自动调度触发。经验使用记录不是独立证据，不能自激。 |
| P03 委托入口与自动来源 | PARTIAL | 已完成一句话委托的结构化 intake、可修订一页摘要、集中关键澄清、`blockingScopes` 局部等待、进展页摘要面板、reusable experience 准确版本校验和经验失权后摘要正文遮蔽。有限来源自动发现/查取/订阅、游标与失联恢复、共享采集和来源缺口盘点仍未完成。 |
| P04 生命周期与经营者工作台 | PARTIAL | 已完成全部/方向级暂停、精确方向匹配、暂停时获准采集继续、方向独立恢复、原生 Schedule 约定恢复/结束、结束后不复活、控制回执跨修订与重开幂等、HTTP `research_control` 与 `notification_preferences`、研究控制对话框和简报偏好表单。共享来源、在途/子工作收束摘要、恢复/结束摘要及 U01–U12 全量路径仍未完成。 |
| P05 常驻运行与保护 | PARTIAL | 已完成优雅关闭后的 SQLite `VACUUM INTO` 备份、原生 sessions/storage 精确复制、manifest SHA256、安全路径与实际文件闭集校验、清单外/篡改/路径逃逸拒绝恢复、逐清单文件恢复、恢复目标不可覆盖、恢复后重开读回；并修复 Host closing 队列不再写已关闭库。真实 Linux 主机、HTTPS、生产身份、管理面、运维责任、长流与真实隔离仍未验证。 |
| P06 Call 只读接入 | NOT_RUN / DEFERRED | 未接真实 Call 提供方，未访问跨仓库或企业资料，未展开 POC。CAP03/V01–V03 保持未完成。 |
| P07 最终集成与回执 | IN_PROGRESS | 本地完整检查、真实浏览器、审计与官方 SDK 链已通过；仍需固定最终候选、全新非作者独立复核、实际 GitHub CI 对最终提交运行、以及最终回执写回。不能因本表 P01/P02 PASS 宣称首版完成。 |

## 主要实现与接口

- `src/cognition.ts`：`ArtifactStore.reassessment` 所需的普通 judgment/plan 准确重评读回、显式 J→J/J→P 业务支持关系、有限简单路径展开、准确关系修订 CAS、同一建议事项合法调整与原回执重放。
- `src/experiences.ts` / `src/research.ts`：Agent 工具 `publish_experience`、`find_experiences`、`read_experience`、`record_experience_use`；经验版本、跨委托来源资格、来源/目标委托作用域化请求回执、实际使用/拒用、Agent 正常工具路径的经验触发认识复核与逐项建议重评。
- `src/intake.ts` / `src/research.ts` / `src/web/app.js`：Agent 工具 `save_intake_summary`、`research_context` 与 detail 的 intake 投影、进展页委托摘要与局部等待展示；引用经验必须当前准确可用，经验失权后只给安全元数据。
- `src/lifecycle-controls.ts` / `src/server.ts` / `src/web/app.js`：Host 命令 `research_control` 与 `notification_preferences`；Agent 研究调度只受 Host 状态约束，不新增第二调度器；成功控制请求保存原始回执，后续修订或重开后重放不变。
- `src/backup.ts`、`runtime/backup.ts`：业务库与原生持久化目录的备份/校验/恢复出口；manifest 安全路径、重复项、实际文件闭集与字节校验，恢复只复制已核清单文件，失败清理本次新建目标。
- `src/sources.ts`：当前引用只保留 grant enabled 且 ready/unavailable 的来源；revoked 不再作为当前引用，unavailable 保留安全索引供恢复核对。

官方组合保持 Harness `0.2.2-rc.3` 与 superagent `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`。未修改官方 SDK、私有安装、锁或 monkey patch；未新增第二 Runtime、调度器、工单权威或全局队列；计算保持 OFF。

## 本地验证

| 检查 | 结果与证据 |
| --- | --- |
| `npm test` | PASS：289/289 tests，覆盖新增 P1、经验请求作用域、intake 经验资格、生命周期精确作用域、备份闭集校验、服务器命令与 Web 投影回归。 |
| `npm run check` | PASS：准备检查、29 个产品文件 public SDK roots 边界与 3 个绕过反例、typecheck、289 tests、native/research/recovery/host-controls/artifact-followup/artifact-cold/operator-decisions/notifications/outcomes/effect-assessments/cognition-reassessment/experiences 官方或隔离链。最新证据见下表。 |
| `npm run check:general-ui` | PASS：`.local/general-ui-checks/run-Bbux7T/result.json`。真实外部浏览器驱动本地合成 Host 投影，验证委托摘要、局部等待、研究控制、偏好持久化、390px 无横向滚动和浏览器错误为空；result 记录 Node、干净代码提交 `6cd286c99faf01ff324d7fc6c4d2efdc3b9ba964`、`sourceDirty:false` 与 5 个关键产品文件 SHA256。该脚本依赖本机外部 `agent-browser`，CI Ubuntu 不安装该工具；因此沿用仓库既有浏览器检查单独执行模式，不纳入 CI 的 `npm run check`，不把 CI 结果表述为浏览器验证。 |
| `npm audit --audit-level=high` | PASS：`found 0 vulnerabilities`。未新增运行依赖。 |

最新完整链关键证据：

- native：`.local/native-checks/run-1795069156723/runner-result.json`
- research：`.local/research-checks/run-1795069158711/runner-result.json`
- recovery：`.local/recovery-checks/run-1795069222928-e0bdc875-764c-4461-871d-cd058416d9c6/result.json`
- host controls：`.local/host-controls-checks/run-1795069286514-d1a7eabc-f344-42de-9fa8-4a4068cb0564/runner-result.json`
- artifact followup：`.local/artifact-followup-checks/run-1795069288958-447ea4be-c390-48f8-98f2-9e7519609d31/runner-result.json`
- artifact cold reopen：`.local/artifact-cold-checks/run-1795069296486-70cbbd31-9053-4bc9-b8e6-41e7cdff59ab/runner-result.json`
- operator decisions：`.local/operator-decisions-checks/run-1795069301394-b3c993db-6c0c-483b-8ab9-623c74f3cc61/runner-result.json`
- notifications：`.local/notifications-checks/run-1795069306270-32cf36e4-d34d-43a0-8c45-0a683b76d541/runner-result.json`
- outcomes：`.local/outcomes-checks/run-1795069327418-e0132770-befd-427a-9f1d-0629b52f06c1/runner-result.json`
- effect assessments：`.local/effect-assessments-checks/run-1795069336214-9b224375-c3b3-42bd-8146-258d27b954d7/runner-result.json`
- cognition reassessment：`.local/cognition-reassessment-checks/run-1795069338959-fd72610c-8563-45b3-ac8e-c5e26b995cf3/runner-result.json`
- experiences 综合链：`.local/experiences-checks/run-1795069406012-04390c5e-17cd-489a-8706-6ecbe719b6a1/runner-result.json`

本轮过程失败保留：首轮完整链在 artifact-followup 撤权读回断言超时，原因是检查脚本假设官方 SDK 会在 tool error 后再调用模型；实际官方行为是保留 `isError:true` 工具结果并结束 blocked turn。另两轮修正检查谓词错过被后续 main session 替换的固定证据。最终脚本按撤权阶段实际发起 `read_artifact` 的官方 session 历史逐个核对，PASS 且产品字节不变。此前历史 FAIL/UNKNOWN/NOT_RUN 不改写。

首轮固定候选 `5fb6ed02d7c06e81018f02ac1342842e639fd858` 的独立 Standards review 为 FAIL，保留三项阻塞发现：备份非闭集校验、依赖 DAG 备用路径丢失、经验请求回执跨委托误重放；另保留 intake 经验引用未校验和方向 substring 过阻塞两项非阻塞发现。作者修复后新增 5 个目标反例并完成 289/289 全量与完整链复验。

## 独立复核、CI 与固定候选

- 状态：复核修复与受影响重验已完成。首轮独立报告：Spec R2 `PASS_WITH_FINDINGS`，见 `.local/independent/general-v01-completion-spec-r2/REPORT.md`；Standards R2 `FAIL`，见 `.local/independent/general-v01-completion-standards-r2/REPORT.md`。
- 修复重验：Standards R3 `PASS`，F01–F05全部 RESOLVED，见 `.local/independent/general-v01-completion-standards-r2/REVIEW-R3.md`；Spec R3 `PASS_WITH_FINDINGS`，F-01/F-02/F-03 RESOLVED，F-04由本节自然 Schedule 组合说明修正，见 `.local/independent/general-v01-completion-spec-r2/REVIEW-R3.md`。随后 Spec R4 因11-20盘点一句状态过期判 `FAIL`；作者修正后 Spec R5 `PASS`，见同目录 `REVIEW-R4.md` / `REVIEW-R5.md`。
- 代码修复固定于 `6cd286c99faf01ff324d7fc6c4d2efdc3b9ba964`；本结果记录更新只涉及交付说明，不改变已重验产品字节。
- 待完成：对包含本回执的最终 Git head 运行实际 GitHub CI，并记录平台结果；本地检查不表述为 CI PASS。
- CI 说明：workflow 仅 PR、main push 和手动 dispatch 触发；普通工作分支 push 不触发。最终提交需 PR 或手动 dispatch 后核对实际 head 的 Check 结果。本地 `npm run check` 不表述为 CI PASS。

## 仍未完成 / 阻塞

- 真实 Provider/模型质量、专业自主性与真实研究效果。
- 企业资料、真实来源授权、更新时效、撤回和历史重放。
- Call 实际提供方、身份、范围、分页、变化与双方留证；CAP03/V01–V03。
- 真实 Linux 主机、HTTPS、生产身份、管理面、备份位置、恢复时效与运维责任。
- 计算载体与真实隔离；当前计算 OFF，只验证默认拒绝和 marker 不落盘。
- 真实端点/出口网络、部署、运行采用、业务 POC 和用户产品验收。
- P03/P04/P05 列出的剩余产品能力，以及完整 AC07 / 首版全部 AC 验收。
