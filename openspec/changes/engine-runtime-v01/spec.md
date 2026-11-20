# Engine / SQLite / Harness 连续研究接线 v0.1

输入：用户已确认《通用首版搭建规格 v0.1》及 UI；本轮指令见 `.local/archives/engine-runtime-v01-20261116/approval.jsonl`。沿用原分支与已有改动，不提交/推送。原结果与 FAIL 不覆盖。

## 可观察目标与范围

- E01：官方 superagent Engine 是 Trigger / Thread / Ticket / Assignment 唯一状态权威；业务 SQLite 保存其公开聚合、业务报告、绑定与事务性副作用意图。端口在提交后投递，不在 SQLite 同步事务内调用模型。
- E02：官方 Harness 原生会话负责主 Agent 评估、工单 worker 工具循环、Schedule 定时唤醒及取消。Agent 自主决定接受、忽略、研究方法及报告；Host 只作环境准入与技术路由。
- E03：已授权目录中的版本化资料自动扫描为来源事件；收据、Engine.receive 与游标同事务。自动来源不伪装人类输入；资料正文只经当前授权引用读取，不注入任意文件/全局工具。
- E04：没有新数据时由原生 Schedule 继续唤醒；有新数据时官方 Thread 订阅分发及主 Agent 判断是否新建/关联工单；委托始终独立于对话与单个工单的完成。
- E05：生命周期、目标修订、来源资格、代次每次派发/工具/回调再查；停止先拒新准入，再取消、等待、禁用已绑定 Schedule。旧资格结果不能覆盖新成果。撤回/丢失/更新来源后不把旧会话正文重放到模型。
- E06：投递 admitted / native read / native turn / Agent report 分开保存。中断 claimed/unknown 不盲重放。历史报告追加，原失败保留；可确定未准入才 dropped。
- E07：已批准工作台原布局内显示真实工单、报告、来源与技术状态；无模型配置真实显示未配置，不生成合成业务答案。

允许路径：`src/`, `runtime/`（自有适配与公开契约）、`test/`, `scripts/`, 根依赖声明与锁、README、当前规格。官方 SDK 源码与原锁只读。Call 接缝后排，不接真实企业资料，不调用真实 Provider，不展开 POC，不部署。工程合成 Provider 仅测试用。

统一接入 SentiScope NativeResearchPort v0.1：owner=(enterpriseId,principalId)，profile=项目私有 minimal Harness；RunBinding 含 delegation / goalRevision / role / assignment / source epoch / generation。实际官方版本 Harness 0.2.2-rc.3，superagent 8c32a9dc5d72c033816c6a8110b37f40cf94fba4；只用公开根导入。完整 superagent 官方源码按原锁消费；不加载原编码 agent / git / dashboard / 来源插件；复用 Engine + 原生 Harness 服务。

## 四原则与界面前置核对

Host 管 SQLite、授权来源、绑定、准入与证据；Agent 决定业务评估和研究。复用 Engine 核心事务、官方 Session/Agent/tool executor/Schedule；适配仅替换公开同步 repository/assessor/executor/outbox，补业务报告和来源权限缺口。负责人仍只建立目标/边界、补充资料与决策；不要求维护工单、机器身份或逐次点击研究。既有已批准工作台的空区域接真实数据，不改布局/导航/关键操作；沿用原 UI 确认，无新增 Demo 门槛。

## 阶段与验证

- [x] 核对工作区/远端、保留 71 个既有文件与精确授权。
- [x] 公开 SDK 契约核对；原生 active tool / due / cancel 工程验证，保留首轮 FAIL。
- [x] SQLite repository + intent / 授权来源的行为 RED→GREEN。
- [x] 产品协调器与 Host plugin：真实 Engine→native main→worker→report；Schedule→scan→Engine 自动流。
- [x] 生命周期、资格更新、迟到回调、重复来源、重开 UNKNOWN 与无真实 Provider 回归。
- [x] 原工作台数据投影与真实浏览器点验。
- [x] 完整候选固定并交非作者新上下文独立复核；结论与关闭记录以结果索引指向的独立报告为准，不预填PASS。

完成本切片不等于通用首版全部验收，不等于研究专业质量或经营效果验收。模型/凭据配置、更多来源、方案采纳/执行/效果及学习等后续范围如实列出。原官方1196/1197 FAIL、早期 Store 不合格 RED 历史保持原样。

## 接入修正与结果指针

目标修订按新Thread及policyChanged转移，旧mandate不执行新目标；来源派生note/text按创建epoch投影，旧内容不跨epoch准入。已确认准入但未进入模型请求面的输入，仅在确认原资源dispose后以carry续接；UNKNOWN不按该路径重放。原生读取事实用持久user/message，claimed单独保留原证据。官方循环Schedule最小60秒，未改官方限制。

62项永久检查、实际原生工具/定时/取消/冷进程恢复、HTTP与浏览器的逐项记录及限制见[results](results.md)。四原则实际复核见[工程接线记录](../../../docs/Engine_Harness_持续研究接线_v0.1.md)。最终候选和独立报告存于本轮私有原始证据根；冻结后不改产品，复核修正另立新候选，不覆盖原件。
