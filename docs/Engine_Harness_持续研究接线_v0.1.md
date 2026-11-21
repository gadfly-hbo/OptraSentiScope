# Engine / SQLite / Harness 持续研究接线 v0.1

本记录承接已确认的《通用首版搭建规格 v0.1》，对应 `openspec/changes/engine-runtime-v01/`。本切片接通持续研究与受限自动信息流；完整首版、研究专业质量和经营结果尚未验收。

## 实际消费与分工

- 官方 Harness **0.2.2-rc.3**：原生 Agent / Session、工具执行、持久化、Schedule、取消与续接。不加载默认 base、shell、文件、凭据或日志上传 bundle。
- 官方 superagent **8c32a9dc5d72c033816c6a8110b37f40cf94fba4**：完整官方源码按原锁构建，消费公开根 `dsh-superagent` 的 Engine。Trigger / Thread / Decision / Ticket / Assignment 由 Engine 唯一管理。不接原编码 worker、Git workspace、来源插件、面板及全应用 Loader。
- SentiScope：SQLite repository 与同步端口意图、委托权限/目标修订、来源引用、业务报告、工作台投影。公开端口在同步事务内记录意图，提交后才调用原生会话。
- 自有 `NativeResearchPort v0.1` 统一接入（`runtime/index.ts` / `native.ts`）；Host 绑定 owner、delegation、goalRevision、role、assignment、source epoch、generation。前端不能传入身份、原生句柄或回执。

完整官方源码与消费包、profile 均 direct-link；SDK 文件不改、原锁不改，不做加载替换或第三方原型改写。类型检查的 paths 只指向已安装公开声明，不承担运行时替包。

## 实际信息与研究链

1. 负责人从工作台建立委托。原目标、边界、修订及补充文字进入业务 SQLite，形成明确标记为人的事件；委托独立于对话和单个工单。
2. Host 显式授予某委托一个只读来源目录。不提供任意路径工具；默认没有来源、正文缓存或历史内容使用授权。首批支持 UTF-8 的 txt/md/json/csv，默认每来源最多100文件、累计256KiB；硬上限1000文件/1MiB。项目 `.local`、SDK、runtime、Git 与运行数据目录受保护。
3. 原生 Schedule 到期前核对来源。新增、更新、删除、撤权、失联及恢复只形成技术事件与准确版本引用；事件收据、Engine.receive 与来源游标同一个 SQLite 事务。自动事件保持 `human=false`，重扫不重复接收。
4. 官方 Thread 订阅将新事实交给已有工单；主 Agent 判断忽略、关联或建立新的研究工单。Host 不按数据变化替 Agent 作价值判断或选择研究方法。
5. 主 Agent 使用 `research_context`、`decide_event`、`note_ticket`；worker 使用 `list_sources`、`read_source`、`report_research`。只读准确 ref/hash；正文是数据，不能授权工具或经营动作。Agent 自主选择研究方法、进展/等待/收敛和判断。
6. 原生 Schedule 在没有新资料、没有新的用户对话时仍继续唤醒主 Agent。默认5分钟；官方循环 Schedule 最短60秒，产品不绕过此约束。具体业务研究节奏及更完整的 Agent 自主安排能力继续迭代。
7. 显式报告追加保存，保留准确证据引用和资格。`ready` 收束工单，不自动结束持续委托。报告不表示方案已采纳、实际执行、效果出现或完成因果归因。

## 收据、停止与恢复

- `sent` 只表示原生持久收件箱准入；持久 `user/message` 表示输入已进入经过 pre-step 的模型请求面。`agent/inbox/claimed` 发生在 pre-step 之前，不能当成已读。
- 原生 `turn/end` 的 completed / blocked / error / aborted 单列保存；不据此生成业务报告或成功结论。报告只能由当前资格的 Agent 工具明确提交。
- 意图 claimed/unknown 不重置 pending、不盲重放；新进程保留原记录。原会话续接沿官方公开接口，历史业务回调不重播。
- 暂停/结束先撤新准入，再取消、等待、禁用所持 Schedule、dispose；创建或停止回执未知时保留 UNKNOWN，不显示已停止。缺失/未知资源仅可作管理性恢复，不能进入模型或执行工具。
- 已确认准入、确实未进入模型请求面且已完成原资源 dispose 的输入，可在新会话以明确 carry 记录续接；未知准入不按此路径重放。已读输入另有逻辑回执，避免重复 carry。
- 来源资格变化会撤销旧代次，使用新的原生历史；旧来源派生的备注/恢复文字不因此变成当前授权。正文在下一步前重新核对资格，旧证据和原始输入仍保存。
- 目标修订以新的 Thread identity 接收新目标，并调用官方 policyChanged；旧 mandate 不继续执行新目标。旧工单/报告保留并标历史，新 Agent 可据当前目标和获准来源建立新研究。
- 单进程本机 lease 继续防双 Host 派发。这里证明逻辑隔离；进程/容器级计算隔离、企业身份系统及远端部署尚未完成。

## 工程入口

```sh
npm run setup:sdk     # 仅缺失时按已批准精确锁/提交私有安装构建；冲突拒覆盖
npm run start:runtime # 官方 minimal Harness Host + 浏览器工作台；默认无模型、无来源
npm run check        # 准备核验、边界、类型、单测及真实 SDK 工程链
npm run check:ui
```

`npm start` 保留原无研究能力的离线工作台，独立于新入口；不自动迁移或接管已运行的8766实例。新入口默认8766，可用 `--config .local/host.json` 指定本机端口及私有数据目录。已有 profile 不覆盖；配置变化生成新的具名 profile。DSH_HOME、存储及依赖均在项目私有目录，不继承个人 DSH 插件/凭据。

Host JSON 支持 `dataDirectory`、`owner {enterpriseId,principalId}`、`port`、可选非敏感 `model {provider,model,maxTokens}`、`intervalSeconds >= 60`、`grants {委托ID: SourceGrant[]}`，以及 `resourceDefaults.sources={goalIncludes,grants}` 的建单预授权。授权目录和范围短语只由 Host 显式指定；浏览器和 Agent 不能扩大授权，范围不匹配的新委托不自动获权。未配置 Provider 或实际适配器未注册时保留全部既有记录但不派发模型。当前 launcher 不安装或读取任何真实 Provider/凭据；生产接入与授权另行完成。

首次 CI 通过准备入口安装同一已批准精确组合，普通本地 check 只验证现存安装。保留原继承 CI job，不把缺私有SDK时跳过测试当通过。完整 fresh 网络安装与实际 GitHub CI 仍未运行。

## 验证、历史与限制

原始证据：`.local/archives/engine-runtime-v01-20261116/`；实际三条原生工程链分别写入 `.local/native-checks/`、`.local/research-checks/`、`.local/recovery-checks/` 的独立目录。最终命令/退出码与候选身份见本变更 results；非作者独立报告存于证据根 `independent/`，以其固定候选及实际结论为准。

本轮修正了原生循环间隔测试配置、工具输出含 undefined、创建期间资格变化的回收、claimed误作已读、修订后旧订阅吞目标、旧备注跨epoch、已准入未读输入丢失、未知定时创建却误报已停止等问题。保留每次原始 FAIL；模块/fixture 导入错误不计产品行为 RED。独立复现转为永久回归；它的 native 替身检查与真正原生 SDK 工程验证分开报告。

已验证范围仅工程闭环，不证明 Agent 的经营研究质量；合成 Provider 只在测试夹具中，产品没有合成默认模型或示例研究结果。Call 接缝、BI/邮件等连接器、完整决策窗口/提醒、方案采纳/执行/观察/归因/学习、生产认证/凭据/隔离/出口与真实模型验收继续未完成。未开发或展开具体 POC。

上一阶段官方完整检查 **1196/1197 FAIL**、初始 Store RED 的过程缺口、11/12构建产物叙述差异及所有 NOT_RUN 原样保留。本切片通过不能追溯改写它们。

## 四原则复核

| 原则 | 本切片行为与证据界限 |
| --- | --- |
| Host 管环境 | owner/来源授权、版本资格、取消、SQLite/日志/展示；无经营系统写工具。逻辑隔离不冒充进程隔离。 |
| Agent 自主执行 | 工单评估/关联、方法、进展与收敛由 Agent 工具请求；Host 仅技术路由和格式/权限校验。合成结果不证明专业自主性。 |
| 复用获准 SDK | Engine 核心与 Harness Agent/Session/工具/Schedule/恢复均调用官方公开契约；不改原包，不另建模型循环或定时器。 |
| 减少人的操作 | 建立委托后正常研究/事件接收不需要逐次发送对话、维护工单或点击下一步。异常 UNKNOWN 保留，必要 Host 授权配置不藏入普通使用步骤。 |

## 后续Host控制接线（2026-11-17）

前一固定切片与失败保持历史。后续已加入[Host凭据/预算/出口及关闭的计算接缝](Host_运行控制接缝_v0.1.md)。安装Host模型守卫时，持久user/message先进入请求面，只有通过资源/出口准入并进入原生模型调度后才发布对应业务read；被Host拒绝的请求不据此误记已读。原生和业务回执仍不等于研究完成。计算按本轮明确选择保持关闭，真实模型/物理隔离/企业资料/Call等仍未验收。
