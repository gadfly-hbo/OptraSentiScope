# DSH 技术架构 v0.2：确认与四原则复核记录

记录日期：2026-11-16（Asia/Shanghai）。

## 1. 当前结论与适用范围

用户已于2026-11-16确认技术架构 v0.2，并要求将方案及复核结果固化到 docs。正式入口为[DSH 技术架构方案 v0.2](DSH_技术架构方案_v0.2.md)。

当前状态分别记录：

| 事项 | 状态 |
| --- | --- |
| DSH 技术架构 v0.2 | 用户已确认的设计基线 |
| F1–F4 设计空缺 | DESIGN_CLOSED |
| 两名非作者的四原则设计复核 | DESIGN_PASS |
| SDK 精确发行组合、原包消费及实际适配 | NOT_RUN／待实施验证 |
| 产品实现、UI、工程验收与产品验收 | NOT_RUN |
| 真实模型、企业资料连接、POC、业务价值验证 | NOT_RUN |
| 依赖安装、运行采用与部署 | 未由设计确认自动授权 |
| 本次 Git 提交、推送及合并 | 未执行 |

本记录保存已取得的设计结论，不把设计确认或文档固化升级为实现成功、运行可靠性、产品验收或业务收益。原有四原则、官方组件原实现保护、统一接入与授权约束继续适用；工程规范中“如采用 Pi”的专属规则保持条件适用，不代表当前改回 Pi 路线。

## 2. 已确认原件与仓库版本的身份

已确认原件是本地 `.local/design/dsh-tech-architecture-v0.2.md`，SHA-256：

`cc3887e21dec1fd79f58908313da9146e162e2bf3bad519bbf90a3a1a248be2b`

本次 docs 架构文件 SHA-256：

`6824003f097c09041fbdd2cf4eb4959057df0e042c5c0ff1e87b6e66f96f0b02`

两个文件字节不同的原因仅为五处归档文本转换：日期／确认状态说明、v0.2确认说明、历史原件与规则导航、当前复核／归档入口、第9节既有复核状态说明。技术第2–8节逐字一致；第9节仅将“另行复核”状态更新为已有结论及可用入口，未改变技术要求。

原非作者结论对应上述已确认原件。docs 文件通过可逆的文本转换与原件建立对应；本次只核对归档等价性、引用及保全，不声称重新运行或重新验证了 SDK 接入。

本地转换清单：`.local/archives/dsh-v0.2-docs-freeze-20261116/ARCHIVE-TRANSFORMATIONS.json`。它记录每一项旧文／新文及两端哈希，便于持有原件者核对。

## 3. 原设计复核过程与结果

原记录日期为2026-11-11。两个未参与候选创作的复核者使用全新上下文，分别核对工程规则、v0.1发现和固定上游源码，对固定 v0.2 进行设计复核，均给出 DESIGN_PASS。作者负责修订和汇总，不作为独立复核者。

ROUND1 候选 SHA-256 为 `8874a8e74d913c6c03ff045202d899be79911e7ae81e321220a0091cbab68cc8`。之后仅更正头部过期“等待复核”状态文字；逆替换后精确回到 ROUND1 哈希，技术正文未变。两位复核者再次核对最终原件身份，均维持 DESIGN_PASS。

| 原发现 | v0.2 设计安排 | 设计复核结论 |
| --- | --- | --- |
| F1：core 内编码恢复指令 | 原始恢复输入留存，经公开 Executor 构造可追溯研究上下文；不修改 SDK 或静默改写业务原件 | DESIGN_CLOSED |
| F2：失败与自主恢复 | 错误分类、真实失败保全、实际恢复后的 waiting＋新事实 note；同事务身份核对、幂等及旧输入补读 | DESIGN_CLOSED |
| F3：自动事件双路 | 保留真实身份、工单扇出＋委托 Eval；Agent 判断研究价值与新增问题，Host 仅做技术去重 | DESIGN_CLOSED |
| F4：最简用户路径 | 正常、异常及调整／暂停／恢复／结束的必要动作明确，技术身份和普通维护由系统完成 | DESIGN_CLOSED |

| 四原则 | 原复核结果 | 适用限制 |
| --- | --- | --- |
| Host 管环境 | DESIGN_PASS | 实际权限、隔离、资源和取消尚未验证 |
| Agent 自主执行 | DESIGN_PASS | 实际模型输入、专业判断与研究行为尚未验证 |
| 优先复用获准官方 SDK 已有能力 | DESIGN_PASS | 精确版本组合、原包消费及公开适配尚未运行 |
| 减少人的操作 | DESIGN_PASS | 已审文字路径；可点击 UI、真实默认路径和操作数量尚未验证 |

## 4. 原始证据保全

以下是仓库根目录下的本地证据位置及哈希标识，**不是随 Git 分发的文件链接**。原稿、各轮审核、旧待补结论、研究记录和原始检查保持原样；docs 只保存方案、确认及结果摘要，不复制私有运行日志或凭据。

| 原始文件（仓库根目录相对位置） | SHA-256 |
| --- | --- |
| `.local/design/dsh-tech-architecture-v0.2.md` | `cc3887e21dec1fd79f58908313da9146e162e2bf3bad519bbf90a3a1a248be2b` |
| `.local/reviews/dsh-four-principles-v0.2/RESULT.json` | `8edec500c7033237b7fe343a1b84f170091188640759f9dab8486b413ee7b409` |
| `.local/reviews/dsh-four-principles-v0.2/REVIEW.md` | `0248b402a8b8672a20e4cf8c450e620b1e40058af6bc4972ea03b67c7be504e0` |
| `.local/reviews/dsh-four-principles-v0.2/independent/ROUND1.md` | `f16e09dab4afdf15448003f2ad097858bcd48f55a721f96dfc64f9ddd2db5482` |
| `.local/reviews/dsh-four-principles-v0.2/independent/FINAL.md` | `4104f0be72fbe0bce7d3218366a2b07a444c088b9079d20b6d12004158193bd5` |
| `.local/reviews/dsh-four-principles-v0.2/independent-contracts/ROUND1.md` | `ab8b3e7792a0fbb9aa7958f8460c58f159a2fa086adab7bd46475cf811479468` |
| `.local/reviews/dsh-four-principles-v0.2/independent-contracts/FINAL.md` | `d2838dacfc9504a3510d3104a2b38165217035fea8b3846bcb761063d2201dc9` |

v0.1 原方案、原审核未完整通过／待补结果、其独立复核和 v0.2 各轮原件继续保留。v0.2 的设计通过不追溯改写旧结果。

本次固化前，对 `.local/design/`、`.local/research/` 及两版四原则复核目录共18份原始文件建立哈希清单：`.local/archives/dsh-v0.2-docs-freeze-20261116/SOURCE-MANIFEST.json`。固化后按同一清单核对。原证据不在公开仓库分发，单凭 docs 摘要不表示另一台设备已取得完整原始证据。

## 5. 后续阶段与未验证条件

下一步讨论通用产品首版范围、产品入口、完整使用过程与关键交互。技术架构确认不代表独立工作台、聊天主入口、具体客户端或通知渠道等产品建议已经确认。

后续实际搭建仍需按[工程规范](engineering-workflow.md)确认适用规格／UI Demo、目标清单、官方组件精确版本与权限。尤其须验证原包消费、同步事务与崩溃窗口、原生消息实际读取、当前授权／取消／恢复、隔离与资料出口。入队、claim、idle、读取与业务解决分别核对。

具体 POC 的目标值、业务口径、资料包与完整验证安排继续按[蓝图 v0.4](OptraSentiScope_产品蓝图讨论稿_v0.4.md)后置。研究、方案建议和结果跟踪仍为当前自主范围，经营动作由负责人决定并执行。

本次归档范围、相称检查及非作者归档复核记录在[固化规格与结果](../openspec/changes/freeze-dsh-architecture-v02/spec.md)。旧设计审核与本次文档归档核对分别记录。

