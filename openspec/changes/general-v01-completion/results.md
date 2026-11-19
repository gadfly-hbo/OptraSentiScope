# 通用首版剩余工作一次性完成 v0.1 结果记录

2026-11-19。对象为分支 `codex/general-v01-build`、开工基线 `a63b780e87691fa5a8e74d24dcc2d3ca1cfa6155` 之后的完整工作区候选。本记录只描述本地工程实现与隔离验证，不宣称真实研究质量、业务价值、AC07、完整首版产品验收、部署或运行采用。

## 阶段状态

| 阶段 | 状态 | 结果 |
| --- | --- | --- |
| P01 认识修正接收差异 | PASS（本地工程范围） | 主 Agent 可经 `read_artifact` 准确读回跨来源 epoch 的普通 judgment/plan 原件；依赖只沿显式业务支持边展开；同一建议事项 P1→P2 以准确关系修订、CAS 和新 plan 版本收束；请求重放返回原回执；自然到期、重开、撤权遮蔽与结束后迟到不复活均已由目标测试和官方 SDK 合成链覆盖。 |
| P02 条件经验闭环 | PASS（本地工程范围） | 新增不可变经验版本、来源/依据/条件/时效/限制/反例/复验条件、跨同企业委托发现与读取、实际调用/拒用留痕、来源撤权遮蔽、经验 v2 限缩后仅触发受影响建议重评。经验使用记录不是独立证据，不能自激。 |
| P03 委托入口与自动来源 | PARTIAL | 已完成一句话委托的结构化 intake、可修订一页摘要、集中关键澄清、`blockingScopes` 局部等待、进展页摘要面板和旧摘要失权安全投影。有限来源自动发现/查取/订阅、游标与失联恢复、共享采集和来源缺口盘点仍未完成。 |
| P04 生命周期与经营者工作台 | PARTIAL | 已完成全部/方向级暂停、暂停时获准采集继续、方向独立恢复、原生 Schedule 约定恢复/结束、结束后不复活、控制回执跨修订与重开幂等、HTTP `research_control` 与 `notification_preferences`、研究控制对话框和简报偏好表单。共享来源、在途/子工作收束摘要、恢复/结束摘要及 U01–U12 全量路径仍未完成。 |
| P05 常驻运行与保护 | PARTIAL | 已完成优雅关闭后的 SQLite `VACUUM INTO` 备份、原生 sessions/storage 精确复制、manifest SHA256、校验失败拒绝恢复、恢复目标不可覆盖、恢复后重开读回；并修复 Host closing 队列不再写已关闭库。真实 Linux 主机、HTTPS、生产身份、管理面、运维责任、长流与真实隔离仍未验证。 |
| P06 Call 只读接入 | NOT_RUN / DEFERRED | 未接真实 Call 提供方，未访问跨仓库或企业资料，未展开 POC。CAP03/V01–V03 保持未完成。 |
| P07 最终集成与回执 | IN_PROGRESS | 本地完整检查、真实浏览器、审计与官方 SDK 链已通过；仍需固定最终候选、全新非作者独立复核、实际 GitHub CI 对最终提交运行、以及最终回执写回。不能因本表 P01/P02 PASS 宣称首版完成。 |

## 主要实现与接口

- `src/cognition.ts`：`ArtifactStore.reassessment` 所需的普通 judgment/plan 准确重评读回、显式 J→P/P→P 业务支持关系、有限可达展开、准确关系修订 CAS、同一建议事项合法调整与原回执重放。
- `src/experiences.ts` / `src/research.ts`：Agent 工具 `publish_experience`、`find_experiences`、`read_experience`、`record_experience_use`；经验版本、跨委托来源资格、实际使用/拒用、经验限缩触发认识复核与逐项建议重评。
- `src/intake.ts` / `src/research.ts` / `src/web/app.js`：Agent 工具 `save_intake_summary`、`research_context` 与 detail 的 intake 投影、进展页委托摘要与局部等待展示。
- `src/lifecycle-controls.ts` / `src/server.ts` / `src/web/app.js`：Host 命令 `research_control` 与 `notification_preferences`；Agent 研究调度只受 Host 状态约束，不新增第二调度器；成功控制请求保存原始回执，后续修订或重开后重放不变。
- `src/backup.ts`、`runtime/backup.ts`：业务库与原生持久化目录的备份/校验/恢复出口；恢复失败不覆盖目标。
- `src/sources.ts`：当前引用只保留 grant enabled 且 ready/unavailable 的来源；revoked 不再作为当前引用，unavailable 保留安全索引供恢复核对。

官方组合保持 Harness `0.2.2-rc.3` 与 superagent `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`。未修改官方 SDK、私有安装、锁或 monkey patch；未新增第二 Runtime、调度器、工单权威或全局队列；计算保持 OFF。

## 本地验证

| 检查 | 结果与证据 |
| --- | --- |
| `npm test` | PASS：287/287 tests，覆盖新增 P1、经验、intake、生命周期、备份、服务器命令与 Web 投影回归。 |
| `npm run check` | PASS：准备检查、29 个产品文件 public SDK roots 边界与 3 个绕过反例、typecheck、287 tests、native/research/recovery/host-controls/artifact-followup/artifact-cold/operator-decisions/notifications/outcomes/effect-assessments/cognition-reassessment/experiences 官方或隔离链。最新证据见下表。 |
| `npm run check:general-ui` | PASS：`.local/general-ui-checks/run-umyS7u/result.json`。真实浏览器验证委托摘要、局部等待、研究控制、偏好持久化、390px 无横向滚动和浏览器错误为空。该脚本依赖本机外部 `agent-browser`，而 CI Ubuntu 环境不安装该工具；因此沿用仓库既有浏览器检查单独执行模式，不纳入 CI 的 `npm run check`，不把 CI 结果表述为浏览器验证。 |
| `npm audit --audit-level=high` | PASS：`found 0 vulnerabilities`。未新增运行依赖。 |

最新完整链关键证据：

- native：`.local/native-checks/run-1795065878319/runner-result.json`
- research：`.local/research-checks/run-1795065880310/runner-result.json`
- recovery：`.local/recovery-checks/run-1795065944527-1bc18847-3a3a-406b-9da1-5f9af0474f33/result.json`
- host controls：`.local/host-controls-checks/run-1795066008043-0d017b29-ffbd-4113-b632-ea241ee882bd/runner-result.json`
- artifact followup：`.local/artifact-followup-checks/run-1795066010388-39f3c365-fd94-4bad-a319-c29fa85feece/runner-result.json`
- artifact cold reopen：`.local/artifact-cold-checks/run-1795066017880-f0c2aaf2-5dd2-4714-8f4b-1a51d09915a8/runner-result.json`
- operator decisions：`.local/operator-decisions-checks/run-1795066022826-f6f87835-9e18-4d95-9c59-7832b0959cb1/runner-result.json`
- notifications：`.local/notifications-checks/run-1795066027751-4c5361bb-39f6-4048-804c-0cdf1fa8dfc0/runner-result.json`
- outcomes：`.local/outcomes-checks/run-1795066049413-891ff682-d4f7-42c1-ada8-c5887c27b3a1/runner-result.json`
- effect assessments：`.local/effect-assessments-checks/run-1795066058212-e74238e7-08fa-4248-8d8d-835c0a568625/runner-result.json`
- cognition reassessment：`.local/cognition-reassessment-checks/run-1795066061020-8d3a9872-7dd9-462f-86b6-55de9e9d21af/runner-result.json`
- experiences 综合链：`.local/experiences-checks/run-1795066127891-4a2f3ee0-b8e8-4bbf-8202-b4f256a8161c/runner-result.json`

本轮过程失败保留：首轮完整链在 artifact-followup 撤权读回断言超时，原因是检查脚本假设官方 SDK 会在 tool error 后再调用模型；实际官方行为是保留 `isError:true` 工具结果并结束 blocked turn。另两轮修正检查谓词错过被后续 main session 替换的固定证据。最终脚本按撤权阶段实际发起 `read_artifact` 的官方 session 历史逐个核对，PASS 且产品字节不变。此前历史 FAIL/UNKNOWN/NOT_RUN 不改写。

## 独立复核、CI 与固定候选

- 状态：未完成。本文写入时作者自检与本地验证已完成，但尚未固定最终提交、尚未进行全新非作者复核，也未对最终提交运行 GitHub CI。
- 要求：固定候选后由未参与创作的独立上下文按 Spec、Standards/四点原则、安全遮蔽、官方 SDK 接缝、UI 证据和 P01–P07 状态复核；作者修复后重验受影响范围。
- CI 说明：workflow 仅 PR、main push 和手动 dispatch 触发；普通工作分支 push 不触发。最终提交需 PR 或手动 dispatch 后核对实际 head 的 Check 结果。本地 `npm run check` 不表述为 CI PASS。

## 仍未完成 / 阻塞

- 真实 Provider/模型质量、专业自主性与真实研究效果。
- 企业资料、真实来源授权、更新时效、撤回和历史重放。
- Call 实际提供方、身份、范围、分页、变化与双方留证；CAP03/V01–V03。
- 真实 Linux 主机、HTTPS、生产身份、管理面、备份位置、恢复时效与运维责任。
- 计算载体与真实隔离；当前计算 OFF，只验证默认拒绝和 marker 不落盘。
- 真实端点/出口网络、部署、运行采用、业务 POC 和用户产品验收。
- P03/P04/P05 列出的剩余产品能力，以及完整 AC07 / 首版全部 AC 验收。
