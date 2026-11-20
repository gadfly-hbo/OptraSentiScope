# Call 只读接入与 superagent 官方源码消费方案 v0.1

日期：2026-11-16（Asia/Shanghai）。状态：用户已确认的接入设计及候选组合，尚未开发、安装、构建或运行验证。

## 1. 范围、依据与排期

本方案承接[通用产品首版基线](通用产品首版范围与完整使用过程_v0.1.md)、[DSH 技术架构 v0.2](DSH_技术架构方案_v0.2.md)及[工程规范](engineering-workflow.md)。原始核对、方案认可与证据见[确认与待验证记录](接入方案_v0.1_确认与待验证记录.md)。

已确认两项选择：

1. Call 在现有 Host 内增加受限只读接缝，由 Call 继续管理资产与来源治理。
2. superagent 固定官方完整源码、按原锁构建，经 Harness 官方 profile 解析机制，仅消费公开 Engine／ports。

**用户本轮明确：Call 该项开发延期，开发计划靠后安排。** 保留接入合同与后续验收依赖，当前状态是“方案已确认、实现后排”，不代表已有跨产品读取能力。SentiScope 可先推进不依赖 Call 实现的部分，保留这个接缝；合同替身、演示资料或人工投递只证明各自覆盖范围，不能记为 Call 已接通。

本指令调整开发顺序，不自动删减首版中 Call 复用的必需能力。Call 接缝未完成前，该项据实保持待完成，不能宣称已满足完整首版接入标准。旧产品／技术基线保留原文，新增排期以本记录为准。

本稿不确定具体主机、首发部署、凭据系统或计算隔离产品；这些属于随后运行形态讨论，不能据此安装或部署。

## 2. Call 现状与复用边界

核对基线是 Call 本地及远端 main：`3ebaa01d2fd6d81a6605f408f9f414a4b8bd7a19`。静态存在 SAP 指标／方法、RAP、Case／项目／任务、企业资料、个人留存及反馈的 Store、准确读取逻辑和本机 HTTP 路径；这些不是已建成的 SentiScope 授权服务。

Call 本机入口核 Host／Origin／客户端标记，部分路由还核项目／任务归属。内部 Agent port 绑定真实 owner、当前执行资格及 Agent 使用规则，和人类管理／历史读取不同。新接缝复用原来源治理，不直接导出全权 UI API，也不借用某任务资格。

优先复用已运行 Call Host 所持 Store 的受限读面。读请求不得另建／初始化 Store、迁移、修复或写入资产；缺库、旧格式或 Host 未就绪时返回不可用。企业资料显式使用只读入口；现有内部函数命名为 read/get 不构成整条调用链无写入的证明。

依据：[owner 绑定 port](https://github.com/gadfly-hbo/OptraCall/blob/3ebaa01d2fd6d81a6605f408f9f414a4b8bd7a19/src/host/semantic-context-port.ts#L30-L45)、[本机 HTTP 边界](https://github.com/gadfly-hbo/OptraCall/blob/3ebaa01d2fd6d81a6605f408f9f414a4b8bd7a19/src/host/server.ts#L955-L965)、[企业资料只读加载](https://github.com/gadfly-hbo/OptraCall/blob/3ebaa01d2fd6d81a6605f408f9f414a4b8bd7a19/src/host/enterprise-materials-store.ts#L140-L158)。

## 3. Call 身份、权限与来源映射

首版采用服务身份与范围授权，不先建设通用 IAM。

| 对象 | 已确认设计 |
| --- | --- |
| 服务身份 | 为 SentiScope Host 实例登记身份并绑定企业域；凭据由 Host 保管，不进入模型上下文 |
| Call 授权 | Call 管允许读取的企业、来源项目、资产类型及必要的具体资产，附用途、有效期和授权版本 |
| SentiScope owner | 企业授权域＋委托，使用既有授权子集；Call 可保存委托标识用于绑定／审计，不复制委托生命周期 |
| 来源身份 | 保留 Call 真实企业、Project、Case、Task、资产及修订；不创建桥接任务、不伪造 Call owner |

实际可用范围取 Call 当前授权及来源准入，与 SentiScope 当前委托资格的交集。工具由 Host 绑定 owner，Agent 不能自行替换企业、委托或任意路径。Call 核本地来源归属与准入；SentiScope 核委托状态、版本、资源和工具资格，两侧各守其权威。

管理者一次配置范围；既有授权内建立委托及普通读取不再逐项确认。个人留存与原生会话另明范围，不因企业资料可读而自动纳入。正式资产的来源权威不转移，读取不授予发布、停用、写文件、启动 Call 会话、数据库执行或模型调用资格。

涉及项目文件、任务反馈等来源时，引用真实来源身份并核范围；它们是被读取资产的归属，不是 SentiScope 的运行 owner。用独立只读合同复用底层 source readers，避免伪装普通分析或需求会话。

## 4. 只读合同、版本和响应

拟议合同名为 `Call Asset Read Contract v1`。下列操作语义获确认，尚未实现；HTTP 路径、编码、分页字段及类型待适用接口规格确定，不能当成现成 API。

| 拟议操作 | 语义 |
| --- | --- |
| capabilities | 返回协议版本、服务身份、授权版本、可读资产类型及限制 |
| list | 在授权范围内列目录，返回准确引用、版本、哈希、当前治理状态和分页 |
| readExact | 按准确引用和预期哈希读取；冲突、缺失或失权明确失败，不换最新版本 |
| checkCurrent | 批量重验授权、来源状态及依赖条件，不返回正文 |

响应分开表达：

- 内容身份：原生引用、内容版本／修订、格式版本、哈希。
- 当前资格：能否用于当前研究、能否历史回读、检查时间及授权版本。

内容哈希未变不代表仍获当前准入；旧回执不是今天继续使用的授权票据。协议版本、资产格式版本与内容修订各自表达，不统一改写原有资产身份。

每次准确读取仍须独立鉴权及来源核对，完成读取后检查本次资格是否仍有效。`checkCurrent`只证明检查时刻，不能缓存为长期授权。缺失或冲突不自行修复、切换 latest 或补造来源。

首版优先同机或受控内网；跨机仅开放新的受限服务入口，保留现有 UI 边界。具体位置和通信部署尚未确定。

## 5. 更新、撤回、失联与历史

首版采用**目录检查＋准确版本读取＋使用前重验**：

1. 通过 Harness 原生 Schedule 执行检查安排，比较授权目录的版本、治理状态和摘要。
2. 新版本按需读取，保存准确引用及接收事实，再进入研究事件处理。
3. Agent 研判内容变化的研究影响；权限撤回由 Host 停止相关资料供给。
4. 当前建议可更新，历史报告继续绑定当时版本和准入回执。

目录摘要与分页只是发现机制，不伪装成完整、可重放变更流，不承诺捕获两次检查之间全部瞬时变化。更新／撤回时效按实际窗口和资源条件明确约定，再决定是否需要通知机制，不提前建统一 Registry 或 changefeed。

撤回处理覆盖工具读取、缓存、摘要、旧会话恢复和上下文重放。旧正文再次提供给模型仍属新使用；含失权正文的会话不能直接续跑，必要时保留历史、使用原生新会话承接同一委托，只带当前获准内容。

模型输入前还核 SentiScope 当前委托资格。失联时准入为未知，暂停该来源新供给，其他获准研究继续。发现撤回后停止相关新供给并按运行接口处理在途工作，不能承诺跨 Host 零延迟撤回，也不能追回已交付字节。Call 已变更与消费者何时观察到变更分别保留。

默认保存引用、哈希和回执；正文缓存、历史回读依明确授权。历史保留当时合法读取事实与如今可用状态，不用旧回执延长当前权限；已有来源失效不能改写旧报告当时实际用了什么。

## 6. superagent 官方源码消费

固定官方完整源码：`8c32a9dc5d72c033816c6a8110b37f40cf94fba4`。原包为私有应用声明，当前核对没有独立 core npm 发行元数据；本方案是未修改官方源码的消费候选，不声称已有独立 Engine SDK 发行包。

保留原 package.json、原 lockfile、完整包资源，以及按原锁生成的官方构建产物。产品仅从公开根入口导入 Engine／ports；不深导 src/core，不复制裁剪 core，不修改导出、依赖声明、overrides 或官方 loader。

根入口会静态加载 Runtime 模块及随包资源，官方构建保持 DSH 等为外部依赖；必须保留完整目录，不能只搬一个 JS 文件。普通根 import 不等于调用 apply，但它也不是零副作用或纯类型导入。

依据：[原包声明](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/package.json)、[公开根入口](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/src/index.ts)、[官方构建配置](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/tsdown.config.ts)。

## 7. profile 布局及构建／运行解析

布局名称仅示意，尚未创建目录或配置：

```text
官方 Harness Host
└─ 产品 profile
   ├─ SentiScope 产品插件
   ├─ direct link → 固定 superagent 完整构建目录
   └─ 激活 bundles：官方必要组合＋SentiScope
                        不含 superagent 原应用
```

superagent 必须成为 profile 记录的直接外部 link，产品插件解析到同一个真实目录；不能认为仅有传递软链也等价。

官方 resolver 对记录的 linked roots 中声明且 Host runtime table 有对应项的 peer，按祖先目录规则使用 Host 提供的运行包；peer 版本范围不另作 resolver 过滤。原锁固定编译基线，运行身份由官方 profile 规则决定。更近的实体候选、遗漏 runtime entry、realpath 不在记录根或显式绕过的解析均须实际核对，不能仅凭磁盘旧依赖树保证运行仍用 alpha，也不能先声称已消除所有双版本风险。

profile 只激活显式选中 bundles。superagent 不加入激活 bundles、不注册原应用 Loader、不调用 apply，也不由产品间接启动其 Runtime／UI。以上使用官方机制，不私有改写解析器。

依据：[官方解析规则](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.md)、[resolver](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/boot/app-boot/src/profile-resolution/resolver.ts#L636-L674)、[显式 bundle 加载](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/boot/app-boot/src/profile.ts#L678-L707)。

## 8. 候选依赖组合与采用条件

| 层面 | 已确认候选及边界 |
| --- | --- |
| Harness | dsh-v0.2.2-rc.3，提交38a6a5c965aa99ab525161efb7cc5cf1fe62fced；预发布，不称稳定发行 |
| 所需DSH组件 | 与Host同一0.2.2-rc.3版本组，不分别跟随各包latest |
| 候选核对集合 | @deepseek-ai/dsh、dsh-sdk-client、dsh-agent、dsh-schedule、dsh-base、dsh-sdk-app（后五者同@deepseek-ai作用域）；不是必须全部作为直接依赖安装 |
| Host Cordis／Schemastery | rc.3声明范围分别为~4.1.0／~3.19.0；后续核定并锁定实际精确闭包与来源，不据此假定所有传递版本已冻结 |
| superagent | 固定8c32a9dc…完整源码及原lock；原alpha编译依赖保持原样，运行peer按官方profile解析 |
| 工单端口 | 只传业务对象；Harness Context、AgentHandle、Session操作保留在产品插件内部 |

原型原声明使用 pnpm11.7.0、Node ^22.19.0或>=24.0.0，开发依赖含DSH0.2.1-alpha.2、Cordis4.0.5-alpha.1、Schemastery3.18.5-alpha.1。Harness rc.3的Node声明为>=24.9.0。这些是核对到的声明，不是本机安装／采用收据。相关npm元数据证明版本曾发布，未下载重算产物，不能据此证明包体与源码字节一致。

来源：[rc.3 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3)、[CLI元数据](https://registry.npmjs.org/@deepseek-ai%2Fdsh/0.2.2-rc.3)、[SDK元数据](https://registry.npmjs.org/@deepseek-ai%2Fdsh-sdk-client/0.2.2-rc.3)、[superagent原锁](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/pnpm-lock.yaml)。

官方解析允许绑定不等于行为或类型兼容。后续验证原锁构建、根入口加载、实际模块身份、类型契约、无原应用启动及同步事务端口；事务内保存意图，提交后调用Harness，继续沿用v0.2的权限、恢复及回执关系。

主路径失败时保留失败并暂停该组合采用；较旧官方部署组合只能另列候选、重核所需能力，不能自动降级。多进程Engine会改变命令／回执／同步事务边界，不作为默认退路。不能通过改官方组件、复制core或造影子状态机掩盖缺口。

候选方案确认不自动撤销本轮禁止开发／安装／运行的停止线，实际采用依后续实施授权及验证结果进行。

## 9. 待验证项

下列全部未运行，Call相关实现同时标记排期后置；它们是后续验证义务，不是当前失败测试或具体POC安排。

| 标识 | 待验证内容 |
| --- | --- |
| V01 | 服务身份、企业／项目／资产范围、用途／有效期／授权版本与委托资格交集，不能伪造owner或扩范围 |
| V02 | 只读读面不初始化／迁移／修复、不导出写或执行能力；准确版本、hash、缺失及人类／Agent规则 |
| V03 | 目录分页与变化检查、准确读取和接收持久化；失联／撤回／缓存及历史重放，明确发现时延与不可追回边界 |
| V04 | 官方源码／lock／构建工具链／完整产物身份，公开root与随包资源可消费，无私有拆包或改写 |
| V05 | 实际direct-link与realpath参与边界、Host peer解析及模块身份，类型／schema／根加载副作用；不启动原Runtime／UI |
| V06 | 实际精确依赖闭包、官方包来源与完整性；metadata、源码符号存在不代替组合兼容 |
| V07 | Engine同步事务、提交后派发、投影／消息／回执关系、失败／UNKNOWN保全、迟到和崩溃恢复 |
| V08 | 原生取消／恢复／子工作收束、Schedule重复投递、当前权限／资源／资料出口及额外会话日志关闭 |

## 10. 四原则与当前结论

Host 管身份、资源、来源准入、持久化、运行控制和出口；Agent 自主判断研究价值、工单归属、方法及修订；第三方只用官方原实现和公开机制；管理配置一次完成，普通读取与研究不逐项审批。

本稿固化的是已确认设计及候选。没有SDK组合、实际UI／运行／工程／产品／POC验收通过。Call实现后排、SentiScope先期解耦安排与当前停止线均继续有效；后续运行形态建议另行讨论。
