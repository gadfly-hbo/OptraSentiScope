# 经营者独立持续委托与案例包｜结果记录

2026-11-21 开工。当前为实施中记录；历史结果只作基线，不代替本候选验证。

## 基线与实际复现

- Git：`main`/`origin/main` 为 `a4c2da208df0a110e89dfa7dc1d59581eb2b5b9b`，工作区干净；派单基线 `6a01fd1` 后只有两份交接文档。建立 `qoder/independent-delegation`。另有既有 `.local/legacy-6ec330d` 工作树，未改动。
- 服务：`127.0.0.1:8766` 由 launchd `gui/501/dev.optrasentiscope.trial` 运行，配置/数据在 `.local/service-trial-20261120/`；健康为 ok，syntheticTrial=true、Call not_connected、计算 OFF。运行产品代码与 `44760bd` 相同，HEAD 的后续提交均为文档。
- 配置只读核对：仅旧委托 `f0089715-02c9-486c-b61f-916471fab7b1` 有静态 grant；无新委托来源默认策略。令牌未写入本记录、公开源码或新证据命令。
- 真实浏览器（Playwright CLI，经营者 UI）：登录→新建委托→输入一句话目标和合成边界→创建成功。新委托 ID `2940f520-ba9c-4b2e-8125-697a1467e886`。未改 Host、未绑定来源、未重启、未显式 sync。
- 实际 RED：页面“资料 尚未接入”，基础报告为 `No currently authorized synthetic evidence.`，经营者无法看到获准来源的事实依据。截图：`.local/independent-delegation-20261121/baseline-browser/01-operator-overview.png`、`02-no-auto-source.png`。
- 上一轮普通路径复核：`.local/service-trial-20261120/trial-drill.mjs` 在建单后由维护者改写 `host.grants[id]` 并重启，随后才有 v1；来源更新、暂停/恢复、服务重启读回已有旧 PASS，但人工绑定步骤不满足本轮起点。
- 操作者记录：经营者负责登录、输入目标/边界、创建和生命周期控件；维护者旧路径负责逐单目录 grant 和首次重启；Host/Agent 后续负责采集、研究和保存。本轮只删除维护者逐单动作，不把授权配置转嫁给经营者。

## 范围外观察

- 登录页存在既有 inline style CSP 控制台告警和匿名 `/api/session` 的预期 401；未阻塞登录或建单。与本轮独立授权/状态契约无直接关系，保留记录，不纳入顺手修复。
- 旧演练结果文件含历史命令参数，继续留在私有 `.local/`，不得复制到公开案例、PR 或交付摘要。

## A 线 RED → GREEN 与实现记录

- 定向 RED：`.local/independent-delegation-20261121/red-unit-config.log`（7 项中 5 项失败：配置帮助/校验、自然预算到期、插件未就绪）；官方合成链 RED：`.local/synthetic-trial-checks/run-1795268407786/runner-result.json`，新建匹配委托 `sources.length` 为 0。
- 最小 GREEN：`resourceDefaults.sources` 只在普通 operator 建单时按固定目标范围物化独立 grant；显式逐 ID 配置优先。持久配置与当前默认策略准确一致才跨重启保留，单方撤权不复活。复用既有首次 after-commit reconciliation，无新增 Runtime/Schedule/人工 sync。
- 状态修复：实际 `budget.expired` 映射 `budget_expired`；官方 `llm.listProviders()` 缺失所选适配器时映射 `runtime_plugin_unready`，资源门禁停止原生创建和模型派发。SDK 版本和原包未改。
- 定向 GREEN：`.local/independent-delegation-20261121/green-unit-config-1.log` 7/7；官方合成链 `.local/synthetic-trial-checks/run-1795268631196/runner-result.json` PASS，覆盖双匹配委托、范围不匹配、单方撤权、重启、暂停/恢复、自然到期和插件缺失。`check:sources` 另在 `.local/shared-source-checks/run-1795269120805/runner-result.json` PASS。
- 全量单测首轮 324/325：既有 `test/sources.test.ts` 用全文搜索 `1234` 检查正文泄漏，随机 hash 偶发包含该串。改为确定性断言事件和记录均无 `text` 正文字段，覆盖不放宽；第二轮 325/325 PASS，日志 `.local/independent-delegation-20261121/unit-run-2.log`。
- 浏览器首轮：建单自动来源、准确证据、暂停/恢复 v2 已成功；关闭整个测试浏览器后 cookie 消失，等待 v2 超时，现场 `.local/independent-delegation-ui-checks/run-l91W0A/`。这是测试会话边界，不是产品持久化 FAIL；改为关闭并重开同一真实浏览器中的工作台标签，保留正常 cookie，再继续实际服务重启。
- 浏览器第二/三轮：分别遇 `agent-browser` 不允许关闭最后标签、位置索引不为稳定标签 ID；先用独立空白页确认标签从 `t1` 起，再固定“新标签读回→关闭旧 `t1`”脚本。第二轮现场 `run-zX0Qd1`、第三轮 `run-xXAQF6`，不改产品断言。
- 官方 SDK：`check:sdk` PASS，`.local/sdk-checks/run-1795269351346-a40ee45d-44c2-4e76-8554-f4030c739680/result.json`；Harness/superagent 精确组合和原包保持。`npm audit --audit-level=high` 0 vulnerabilities，日志 `.local/independent-delegation-20261121/npm-audit-1.log`。
- 完整检查：`npm run check` PASS，日志 `.local/independent-delegation-20261121/full-check-1.log`；325/325 单测，runtime preparation、公开 SDK 边界及 15 条官方/工程链全部 PASS。最终固定候选仍须在全部材料与浏览器修正纳入后重验，不把本次结果提前绑定后续变化。
- 浏览器第四轮 fixture 修正：失联恢复后的 v3 已产生，但断言误停在资料页等待进展正文；改为打开进展页后核对，产品断言不变。现场 `run-Umk4Ux`。
- 真实浏览器最终 PASS：`.local/independent-delegation-ui-checks/run-oOQRNw/result.json`，委托 `5fbedecb-c8e7-435a-9bb3-f46e2c616285`。覆盖自动建单及 v1、准确 ref/hash、暂停期间 v2 不派发、恢复自动补读、工作台标签关闭/重开、实际服务重启、失联/恢复 v3、自然预算到期、插件未就绪、390px 和无 page error；截图 01–10 同目录。审查截图确认故障原因、影响和恢复条件可读，失权/失联只保留安全元数据。

## 独立预审 R1 与修复重验

- 非作者预审 FAIL：`.local/independent/independent-delegation-a-preflight/review.md`。HIGH-1 策略收窄仍采集、HIGH-2 调整后创建幂等重放新增授权、MEDIUM-1 插件状态遮盖持久 UNKNOWN；LOW-1 浏览器 1.2 秒暂停断言弱于 60 秒调度间隔。此前 PASS 不覆盖这些反例，不能用于交付。
- 永久反例：`.local/independent-delegation-20261121/review-r1-red.log` 三项失败。修复后默认授权只在真实新建 `goalRevision=1` 判定；目标调整/创建重放不新增；当前目标或重启策略失配按单调修订撤回，重新匹配不复活；显式逐 ID 授权不走默认范围规则。持久 `host_resource_unconfirmed` 优先为 UNKNOWN。浏览器暂停等待 65 秒后再断言无 v2。
- 修复验证：`.local/independent-delegation-20261121/review-r1-green-1.log` 6/6；全量 328/328（`review-r1-unit.log`）；官方合成链 `.local/synthetic-trial-checks/run-1795270661711/runner-result.json` PASS，并加强撤权后 v1/v2 正文与引用均不可回放的断言。独立重验与浏览器/完整检查另记，不以作者结果替代复核。
- R1 完整检查：`.local/independent-delegation-20261121/review-r1-full-check.log` PASS，328/328、runtime preparation、公开边界及 15 条官方/工程链全部通过。
- R1 浏览器：`agent-browser wait 65000` 命令自身失败（`run-coIvTD`，未执行断言），改由 Node 计时器等待同样 65 秒；最终 `.local/independent-delegation-ui-checks/run-HqXVmT/result.json` PASS，委托 `6c085e03-7cb9-42e1-9dfb-c19d5a0bfefb`。暂停观察跨过一次 60 秒 Schedule，后续恢复、重开、服务重启、失联恢复、预算到期和插件缺失全链通过。
- 全部修订后的候选检查：`.local/independent-delegation-20261121/final-candidate-check-1.log` PASS，328/328、runtime preparation、公开 SDK 边界和 15 条官方/工程链全部通过；B 材料修订与浏览器脚本修正已纳入。最终独立复核另行判定，不由作者全绿替代。

## 独立重验 R2 与创建／默认身份修复

- R1 独立重验仍为 FAIL：`.local/independent/independent-delegation-a-r1-recheck/REPORT.md`。新反例证明：部分默认撤权后整组全等检查漏撤其余来源；revision 1 创建在重启策略改为匹配后的幂等读回仍新增 grant。UNKNOWN 与暂停代码层问题已关闭，但不能解除授权 FAIL。
- 新永久反例：`review-r2-red-valid.log` 两项 FAIL；其中首个 fixture 缺 `policyChanged` 的过程错误另记且不计产品 RED。随后以 `createWithOutcome.created` 明确区分实际插入与读回，server 仅对真实新建调用默认授权。
- 来源库新增 `source_default_grants` 逐项身份，与 grant 变更同事务提交。未改变的默认项才受当前目标/策略管理；部分撤权、手动变更或撤权不会被整组判断吞掉，失配默认项逐项撤回，显式授权不被默认规则误撤。
- 定向 GREEN：`review-r2-green-1.log` 8/8；全量 330/330（`review-r2-unit.log`）；官方合成链 `.local/synthetic-trial-checks/run-1795272161867/runner-result.json` 与共享来源 `.local/shared-source-checks/run-1795272167554/runner-result.json` PASS。R2 独立重验、完整检查和浏览器结果分别保留。
- R2 真实浏览器：`.local/independent-delegation-ui-checks/run-XLCWFt/result.json` PASS；自动建单、暂停 65 秒、恢复、重开、服务重启及三类故障路径均通过。
- R2 完整检查：`.local/independent-delegation-20261121/review-r2-full-check.log` PASS，330/330、runtime preparation、公开 SDK 边界及 15 条官方/工程链全部通过。

## 完整候选 R1 与策略移除修复

- R2 独立重验：`.local/independent/independent-delegation-a-r2-recheck/REPORT.md` PASS，两个残余 HIGH、UNKNOWN、生命周期及组合边界均关闭；快速定向复核 `.local/independent/independent-delegation-a-r2-quick/REPORT.md` 亦 PASS。
- 完整候选独立 R1：`.local/independent/independent-delegation-final-r1/REPORT.md` FAIL。新 MEDIUM 为默认策略移除后重启误撤手动显式 grant；LOW 为 results 状态矛盾和候选清单漂移。原 HIGH／UNKNOWN／暂停项均关闭，但不能合并。
- 永久反例：`final-r1-policy-removal-red.log`。新增 `source_default_scopes` 持久记录默认策略使用史；策略移除只撤回仍登记的默认项，已手动变更的显式 grant 保留，无默认使用史的旧路径不变。`final-r1-policy-removal-green.log` 9/9 PASS。最终完整检查与独立重验另行执行。
- 最新完整检查：`.local/independent-delegation-20261121/final-policy-removal-check.log` PASS，331/331、runtime preparation、公开 SDK 边界及 15 条官方/工程链全部通过。最新浏览器 `.local/independent-delegation-ui-checks/run-tTAZgQ/result.json` PASS。
- 最终独立 R2：`.local/independent/independent-delegation-final-r2/REPORT.md` **PASS**，原 MEDIUM 与两项 LOW 全部 RESOLVED，无新增发现；永久测试 9/9、授权与 UNKNOWN 11/11、旧行为 1/1，候选 33/33 文件哈希一致。四原则专项均 PASS。最终完整检查与浏览器由上方实际回执分别闭合，不由复核者假定。

## B 线固定材料

- 案例包：`docs/poc/conditional-experience-reassessment-v0.1/`，packageId `POC-CONDITIONAL-EXPERIENCE-REASSESSMENT-001`，版本 0.1，UTC，全部合成，计算 OFF。
- 分离交付：`inputs/00–05`、`release-plan.json`、仅供评阅的 `reference/`；README 明确 reference/README/release-plan/manifest 不得给被评 Agent。初始、新证据、反证和两个后续委托均有稳定 ID、版本、effective/available 时间。
- 评阅：16 项覆盖未来泄漏、准确引用、判断保留/修正、两条关联建议逐项重评、无关建议、旧版/FAILED/UNKNOWN、F1 采用、C2 拒用及实际影响；接受有依据的不同业务结论。运行模板预留完整模型配置、耗时、token 和三类费用证据，真实模型与质量评分均 NOT_RUN。
- 主工作树复核：12 个非 manifest 文件 bytes/SHA-256 全部匹配，全部 JSON 可解析；随后完成非作者离线试读。
- 非作者试读 R1：`.local/independent/independent-delegation-materials-r1/REPORT.md`，PASS_WITH_FINDINGS。M-01 两个后续委托共用运行字段，无法分别记录耗时/token/费用；L-01 R-BADGE 的 review-only 与依赖重评有措辞歧义。真实模型运行及评分仍 NOT_RUN。
- 材料修订：run-record 已拆成 F1/C2 两个独立批次对象，各自保留释放、耗时、配置、token、费用和输出身份；ledger 明确 NEW-02 只做不受影响复看，反证批不创建访客建议依赖重评。已重冻 12 文件 manifest 并验证全部 JSON，随后完成 R2 独立复验。
- 非作者复验 R2：`.local/independent/independent-delegation-materials-r2/REPORT.md` **PASS**，M-01/L-01 均 RESOLVED，无剩余发现；12 文件 bytes/SHA-256、文件集合、JSON 与重复键检查通过，16 个评阅项全部 NOT_RUN。结论仅表示材料就绪，不代表真实模型质量或完整 AC07。

## Git、CI 与本机切换回执

- 工作分支 `qoder/independent-delegation` 提交 `d687a7d14d46ff1d23a84f4b31870cc14962f20b`；集中 PR #11 https://github.com/gadfly-hbo/OptraSentiScope/pull/11 。实际 head CI run `44918373092` PASS（check 6m3s），随后 squash 合并提交 `9070adad06532727e2356a4e6e6840d7764c7906`（2026-11-21T15:23:57Z）。合并后 main CI run `44918974429` PASS（check 5m46s），本地 `main` 已安全快进。
- 切换前备份：`.local/service-trial-backup-20261121-153048/`。`createRuntimeBackup` 产物 90 个文件校验 `ok`，同时保留原 `host.json`、launchd plist、旧 proof、私有凭据、runtime、合成来源目录和 `switch-context.json`；恢复工作树 `.local/service-trial-recovery-44760bd` 固定旧运行提交 `44760bd`。
- 切换配置仅在私有 `host.json` 增加默认来源范围 `goalIncludes:"合成来源"`；原静态 grant、owner、数据目录和 auth 不变。目标服务 `127.0.0.1:8766` 现运行合并版 `9070ada`，健康 ok、runtime configured、Call not_connected、syntheticTrial true；证明 `.local/service-trial-20261120/service-proof.json`。
- 原实例演练首轮 FAIL 为脚本等待进展页旁栏文案，而资料页实际显示“当前没有已接通的资料来源”；现场 `.local/service-trial-20261120/independent-Hnv4iv/` 保留。修正后 `.local/service-trial-20261120/independent-SQqQ8B/result.json` PASS：委托 `3455ca61-07d9-4250-93ad-40778ff24afa` 一句话自动获源并展示准确 v1 证据；不匹配委托 `14a1210a-3acc-4d8b-bb64-e1e269576bc8` 零来源；暂停期间 v2 不派发、恢复自动补读；工作台重开与实际服务重启读回 v2；策略前旧委托仍零来源，旧静态 grant 保持 ready；390px 无溢出、无浏览器 page error。
- 经营者本人产品体验验收仍待用户确认；工程切换、演练和回执不替代该验收。

## 当前验收状态

| 项目 | 状态 | 证据 / 下一步 |
| --- | --- | --- |
| 基线与 OpenSpec | PASS | 实际基线、服务、配置、真实浏览器 RED 和本规格已固定 |
| A1 一次配置独立建委托 | PASS（工程＋独立复核） | 真实插入/幂等、角色范围、自动来源与首个依据均通过；最终 R2 无剩余发现 |
| A2 持续跟进、权限与读回 | PASS（工程＋独立复核） | 共享来源、部分/全部撤权、策略变化/移除、暂停恢复、重开和重启读回均通过 |
| A3 失联、预算到期、插件未就绪 | PASS（工程＋独立复核） | 原因/影响/恢复条件与实际行为一致，UNKNOWN 优先，无自动续期/扩权/盲重放 |
| B 案例包与评阅表 | PASS（材料就绪） | 固定包、使用说明、释放计划、评阅表与 NOT_RUN 模板齐全；非作者 R2 PASS，无剩余发现 |
| 真实模型运行与评分 | NOT_RUN | 本轮明确禁止，不因合成 Provider 结果改变 |
| 完整检查 | PASS | 最新 331/331、runtime preparation、公开 SDK 边界与 15 条链全部通过 |
| 独立复核 | PASS | 最终 R2 无剩余发现，四原则专项通过；B 材料 R2 PASS |
| Git/PR/CI/合并/服务切换 | PASS | PR #11 两次 CI PASS 后合并；备份、恢复点、实际运行版本与原实例演练均留证 |
| 用户产品体验验收 | PENDING | 经营者按上述入口亲自确认；工程证据不替代体验结论 |
