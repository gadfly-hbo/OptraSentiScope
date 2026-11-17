# 效果判断保存与准确读回 v0.1

2026-11-17，用户授权先完成该切片，然后盘点完整spec开发状态。依据产品过程§3.5/3.6、ArtifactRevision/DecisionAndOutcome、AC04/06。沿用前批164文件完整候选与全部WIP，BASELINE见`.local/archives/effect-assessments-v01-20261117/BASELINE.json`。fetch后HEAD与origin/main一致，分支codex/general-v01-build，不提交/推送/部署。

## 目标与阶段任务

- [x] F01 复用ArtifactStore的judgment不可变版本、CAS与请求幂等；增加可选结构化effect关联，准确plan、choice、execution、observation修订与实际范围、证据联系、竞争解释、限制，未知沿原unknowns保存。不另建判断或版本权威。
- [x] F02 主Agent经原publish_artifact/read_artifact保存/准确读回；核方案/选择/执行/观察属于同一关联，observation必须准确引用所选execution。读旧版本不换latest，来源新代完整重验，失权正文遮蔽，原件保留；worker不读写经营效果判断。普通成果契约保持。
- [x] F03 沿已确认结果页归因位置只读展示有限结论、准确关联与按需展开依据/解释/限制；按choice/plan分组，不污染一般当前研究判断或独立方案，无新表单/签收/自动采纳。原观察、选择和执行不改写。
- [x] F04 适用公共接缝TDD、真实官方SDK本地合成路径、实际浏览器与完整适用回归；完整固定候选非作者复核及四原则实证，原FAIL/UNKNOWN/NOT_RUN保留。R1完整267/267及10条实际SDK链通过，非作者限范围PASS，无待修发现；不代表真实因果质量或完整首版验收。
- [x] F05 完成本片后按产品CAP、搭建合同/AC与接入/运行V/R逐项盘点：已开发/部分开发/未开发，单列实现、工程证据、真实验证与缺口；形成阶段性盘点docs，不改历史已确认spec或追认全首版通过。独立盘点轴核9CAP/9合同/8AC/8V/6R、44个本地链接及历史状态，限范围通过。

## 最小契约及职责

judgment.content增加可选effect={plan:{artifactId,version},choiceId,execution:{id,revision},observation:{id,revision},scope,evidenceConnection,competingExplanations:string[],limitations:string[]}。summary是有限结论，unknowns沿原字段；不强制数值置信分、归因方法或固定竞争解释数量。未成熟/缺资料也可保存“尚不能判断”及理由，不从成熟性或改善自动计算效果。

同一effect事项不改挂其他plan/choice；原选中plan可被新建议替代，仍经OutcomeStore准确资格读回原执行/观察及全部来源，不切latest。跨来源代原件不直接回放，完整重验后追加当前资格回执；同代读取失败撤旧PASS，异步核验期间变更不提交/回放。Supplemental evidence用原ref/hash机制校验，依赖事实的失权同时使派生效果正文不可见。普通ArtifactStore.read/readForOutcome合同不放宽。

NativeResearchPort v0.1、owner/profile与已确认官方Harness0.2.2-rc.3/superagent固定提交/原锁不变；Host管版本、关联、资格与持久化，Agent自主解释证据和形成结论。经营行动仍由经营者决定执行，保存/读取效果判断不更新选择、执行、观察或正式规则。

本批不做反证驱动的自动认识修正、依赖建议重评、效果复查新增安排、经验运营/跨委托复用；版本能力可保存明确修订，不代表上述闭环已实现。计算OFF、Call后排，不安装、不调用真实模型、不接企业资料、不展开POC、不外发。合成工程验证不证明真实归因/经营质量。

沿已确认四项结果展示与原生details，填现有归因空态，不调整导航或新输入路径，复用原UI确认。测试接缝沿已授权业务持久化、Host HTTP、主Agent工具、原生会话与浏览器，不规定分析内部方法。允许src/artifacts.ts、src/research.ts、src/web/app.js、相应test/runtime/工程探针、package检查入口与本批docs/openspec；不修改SDK/锁/其他WIP。

四原则前置：Host只管环境与引用资格；Agent自主判断证据强度/限制/未知；复用现有官方Runtime和自有版本能力；经营者沿原来源与对话，无新增填写或签收。基本成功标准：准确保存/读回关联与历史版本，竞争解释/未知可见，不能混到其他选择或latest，保存不改变实际事实；来源失权、跨owner/worker/goal和迟到读写不产生正文或错误效果记录。
