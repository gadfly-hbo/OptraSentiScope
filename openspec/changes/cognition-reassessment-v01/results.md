# 反证认识修正与依赖建议重评 v0.1 结果记录

2026-11-17。对象为分支 `codex/general-v01-build`、基线 `3149b56c8d8737c7a4562b72f0e9e50e0d9498f4` 之后的当前完整工作区候选。本记录只覆盖同一委托内认识修正/依赖建议重评工程切片，不宣称 AC07、完整首版、真实研究质量或用户产品验收。

## 实施结果

- [x] C01 `ArtifactStore.reassessment` 按同目标+当前主Agent资格+准确版本完整重验普通 judgment/plan 原依据，区分访问/当前使用/待重核；失败只给安全元数据与UNKNOWN，并追加 unavailable 回执。普通 `read` 跨epoch拒绝行为保留，effect 仍走专用路径。
- [x] C02 `CognitionStore.saveSupport` 保存显式 J→P 支持：准确判断/建议版本、scope、why、reason、状态、request幂等、CAS修订和supersedes/supportHistory；普通引用或被评估关系不自动连边。
- [x] C03 主Agent工具 `record_cognition_review` 保存触发事实、原判断、可选新判断、结论/变化/限制/未知/后续条件。来源事件、执行/观察和 followup 触发均先异步准确核验，并在业务事务内同步复核；维持/证据不足不产生空判断版本，同一准确触发+原判断不因换requestId重复生成检查/责任。
- [x] C04 变化认识从仍激活、建议仍最新的支持关系生成逐项重评责任；`record_plan_reassessment` 强制准确 relation revision CAS，独立完成/阻塞/失效，重复请求幂等，目标或关系变化时旧结果不能关闭当前责任。
- [x] C05 复用官方主Agent工具链、Followup与原生Schedule；`research_context`提供安全 cognition/来源事件投影，pending责任允许 scheduled-only唤醒，工作台结果区展示待重评/检查/结果/后续条件并在失权时仅保留索引。
- [x] C06 目标TDD、完整检查、真实浏览器与官方SDK合成链已运行；原FAIL/UNKNOWN/NOT_RUN保留。最终非作者复核见下节。

## 实际检查与证据

原始RED、脚本化官方探针失败过程和本地候选清单在 `.local/archives/cognition-reassessment-v01-20261117/`。首轮目标RED 4/4 FAIL（缺 `reassessment` 与 Agent工具）；官方探针保留1次沙箱EPERM和多次合成脚本/夹具失败，未改产品或SDK字节。

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 最终 exit 0：typecheck、275/275产品测试、24产品文件运行边界与3绕过反例、11条官方SDK合成链全部PASS。新增链为 `.local/cognition-reassessment-checks/run-1794967876818-40866f37-dd2d-4302-bbf1-e31c1ede9198/runner-result.json`（40本地合成请求，产品/SDK字节不变）。 |
| 新增SDK链 | 6项检查：显式J1→P1/P2；自然来源wake→J1准确读回→J2→认识检查→P1完成/P2待恢复；Host重开恢复P2；同一原生Schedule后续观察；撤权安全投影/请求；结束后迟到调度0新请求。 |
| 真实浏览器 | `npm run check:effect-ui` PASS：`.local/effect-ui-checks/run-xvUkLc`（结果页反证/待重评/失权遮蔽、亮暗/窄屏/截图）；`npm run check:ui` PASS：`.local/ui-checks/run-cBUEX4`（既有键盘/刷新/窄屏路径）。 |
| 依赖安全 | `npm audit --audit-level=high` exit 0，0 vulnerabilities；未新增依赖或修改官方SDK/锁。 |

官方SDK链为确定性本地合成Provider/文件。其一-shot Schedule由官方 public run API 在到期后解析；自然 elapsed firing由既有 native Schedule探针证明，本新增链不重复声称该范围。

## 独立复核

首轮非作者 Standards review 结论 **FAIL**，发现：完整重评CAS未比较caller expected revision；异步触发核验后事务内缺少同步复核；复核期间作者追加 `scripts/check-effect-ui.mjs` 使15文件候选清单失效；当时本results文件尚不存在。作者已修复并新增 `test/cognition-store.test.ts` 两个反例（事务内触发失效与CAS错误），重跑完整检查。另一个并行Spec review会话长时间未返回，已停止；其未完成输出不作为结论。

最终固定候选与非作者重验：

- Standards/边界 R2：`independent/FINAL-STANDARDS-R2.md`，结论 **PASS**；确认18文件清单、CAS、事务内触发复核、重复触发、官方SDK复用、计算OFF与无第二Runtime/Scheduler/工单权威，无阻塞发现。
- Spec轴 R1：`independent/FINAL-SPEC-R1.md`，结论 **PASS_WITH_FINDINGS**；两项非阻塞发现分别为结果记录待写回、重复触发身份建议补goal/epoch。作者随后已将重复身份限定在同一goal/epoch并新增275/275中的跨epoch反例，本结果记录即写回最终复核结论。

## 边界与剩余

计算OFF、Call DEFERRED；未安装/升级依赖，未调用真实模型，未接企业资料/生产资源，未外发/部署/合并main，未展开POC。旧选择/方案/执行/观察/effect原字节与关联保留，新建议不迁移旧采纳或执行。

条件经验形成、适用/限制/撤回、后续实际调用、跨委托复用、真实反证识别质量、真实Provider研究质量、经营有效性和用户产品验收仍未完成；原官方1196/1197 FAIL及全部历史FAIL/UNKNOWN/NOT_RUN保留。
