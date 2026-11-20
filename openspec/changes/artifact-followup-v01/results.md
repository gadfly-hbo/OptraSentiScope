# 版本化研究交付与自主跟进：结果和证据索引

2026-11-17，`codex/general-v01-build`，HEAD `96388c88791ed484ce3013756beca701a79568b9`。本轮fetch main后领先/落后0/0，开工前119份可见文件原件、哈希和原始用户指令在`.local/archives/artifact-followup-v01-20261117/`（下称证据根）。原有WIP保留，无提交、推送、合并或部署。

本批是已确认E3第一片，实际合同见[接线记录](../../../docs/版本化研究交付与自主跟进_v0.1.md)。不把本批工程通过提升为完整E3、完整首版或经营效果验收。

## 实现与验收对应

| 项 | 实际实现与核对 |
| --- | --- |
| A01 成果版本 | ArtifactStore保存不可变判断/完整方案，CAS/精确request幂等、修订关系、原依据/假设/未知/观察安排；15项模块检查及原生工具交付路径。 |
| A02 当前资格读回 | Agent列表安全元数据，准确旧version与基础报告有明确读取入口；准确依据前后重验并登记模型准入。跨goal/epoch拒正文，旧版历史保全；不存在不换latest。 |
| A03/A04 自主观察 | 主Agent安排时间/来源事件及理由/依赖，Host保存原生映射。真实one-shot到期后准确read v1、显式记录检查、追加v2；event-only不变heartbeat零新增模型调用；来源变化进入fresh资格v3。 |
| A05 生命周期 | 暂停恢复保留意图/原映射并核资格；新成果或资格使旧安排失效；迟到保原版关联，不成为新版本授权；未知创建不重建/不假报停止，准确已知ID取得停止回执可解原不确认。 |
| A06 工作台 | 原当前判断/方案依据/下一步接真实版本和跟进字段；最新与历史、due与已检查、停止未知分别呈现。沿原布局/样式，无新增配置表单或用户审批。 |
| A07 运行验证 | 本批实际SDK合成链、原有五链相关回归、工作台真实浏览器及冷恢复检查分别留证；最终结果以固定候选匹配的命令/runner和非作者报告为准。 |

判断/方案的结构完整不证明专业正确；研究观察记录不是经营结果、采纳、实际执行或效果归因。经营者选择/汇总/反馈/经验运营仍属后续批次。

## 作者实际检查与工程证据

- `check-final-01.txt`：首个集成实现统一检查exit0，154/154永久测试、类型/边界及五条官方SDK链通过。随后UI折叠修复和冷启动恢复发生变化，不能将这个旧身份当作最终完整候选；最终检查入口为`check-final-02.txt`及`AUTHOR-CHECKS.json`，实际退出/数量/各runner见其原件。
- `.local/artifact-followup-checks/run-1794893960089-e99c2c5d-60ce-4703-b483-7ab30f20fbb4/runner-result.json`：本批首个稳定集成实现6项检查、40次纯本地合成请求，前后产品字节一致。原生到期→准确读v1→显式观察→v2；无变化heartbeat零模型；来源更新→新资格v3；正常Host重开→准确v3；撤权不泄旧正文；结束/旧Schedule不复活，计算拒派发。最后新增恢复适配后受影响路径以最终统一检查再次验证。
- 原生/持续研究/冷OS恢复/Host控制原有实际SDK路径在最终统一检查复验。普通Host重开不等于SIGKILL、全套备份恢复或生产可靠性；新增成果SQLite/coordinator冷重开与真实原生进程恢复分别报告。
- `.local/artifact-cold-checks/run-1794895995401-94180c4b-7e72-4164-8c62-3f7f5ce0c84a/runner-result.json`：新增永久实际冷恢复检查已PASS，74份前后身份一致，8次本地合成请求。first仅在准确版本/观察/原生Session/账已持久后SIGKILL；停机至原one-shot过期，再启动独立OS进程，无夹具调度改动或续作提示，自然投递→准确v1→显式检查→v2，同ID/at/Session、generation递增、无替代定时、预算不清账、计算关闭。最终统一检查重复执行该公开入口；独立双定时都过期的更长停机另列。
- `artifacts/`保存15项成果公共接缝RED/GREEN及冻结身份；`followup/`保存13项持久意图/资格/原子来源接收/未知/停止/重开检查及官方Schedule契约；root协调器/Native准入反例日志在证据根。测试通过公共接口观察结果，不把模块导入错误充作行为RED。
- `ui/projection-result.json`：8项整app入口HTTP投影语义检查；`ui/disclosure-red-01.txt`及green：真实刷新折叠故障对应的永久HTTP投影回归。`ui-focus-01.txt`及后续UI日志为既有跨刷新焦点/输入/390宽回归。
- `browser/result.json`保留首次真实阅读FAIL；`browser/result-r2.json`通过，展开历史/依据/备选后实际跨5500ms刷新仍可读，亮暗/390无横向溢出且无浏览器错误。截图使用实际完成的SDK合成记录SQLite副本，只读重放已结束历史，无native/model派发，无状态重标或企业内容。作者实际查看截图；源工程库哈希未变，自有Host关闭见`browser/host-stopped.json`，现有8766用户服务未改。

`check:artifact-followup`与`check:artifact-cold`为可重复的工程入口；具体目录、命令退出和固定文件身份由`AUTHOR-CHECKS.json`索引，不把一次脚本stdout中的PASS单独当完整候选通过。

## 发现、修正及保留失败

- SDK Schedule创建无业务幂等键、失败不自动重试、resolver只有Session标识、消息source只有schedule；本批通过自有业务意图和原生准入适配，无SDK修改。
- 首轮夹具连续run同heartbeat受官方60秒delivery floor，未执行预期环境检查；原超时保留。改用夹具自己持有的独立原生一次环境检查，按精确ID关闭，不把它当产品新增计时器或停止证明。
- 随后实际SDK暴露重入死锁：resolver等待beforeWake完整sync，而sync等待同Schedule服务edit。原80秒超时、SIGKILL和诊断保留；修为只await扫描/同事务接收，异步协调旧资源。`schedule-reentrant-red/green`永久反例及实际SDK修后路径留存。
- 同次扫描先出现其他来源变化，可能丢后发匹配来源的观察触发原因。`multi-source-red/green`保留；扫描回调使用同事务起始资格快照，只保存因果，不复活旧正文。
- 已知Schedule原停止不确认后来不能清除的缺口以`known-stop-red/green-02`修正；idless未知仍不重建。第一轮修后夹具一次性故障被排队的协调先消费，原“必须reject”断言不成立，改为显式阻挡至权威停止恢复，原失败保留。
- 真实浏览器发现每5秒刷新折叠新增历史/依据。以稳定的委托/页签/成果版本disclosure键恢复开闭及summary焦点，3项永久回归覆盖新版本/跨页不串，实际browser复测通过。
- 非作者SIGKILL后双定时过期实测发现：同Session恢复后active却无自然投递。原`independent/contract-check/REPORT-R1.md`、attempt-3及前两次夹具setup失败留存。对应最小恢复适配：当前主handle发布后，通过公开Schedule.view/带revision CAS的同prompt edit重新驱动原ID；不create/run、不改时点、不启用paused/ended、不清pendingDelivery。实际修后冷启动以新原件重验，不覆盖R1。
- 第一版恢复适配已让原生真正投递，但可能因配置edit与投递更新的CAS竞争而使Host启动失败；独立R2与作者两个原始冷FAIL保留。`schedule_refresh_failure.type=NativeScheduleRefreshConflict`提供实际结构化冲突诊断，不仅凭时序推论。修为冲突后仅一读准确ID，核静态配置、原时点/合法向前及新的本Session权威投递回执，证据充分才接受已提交进展，不重复写入。Native公开接缝12项正反测试和实际短OS冷PASS分别留证，独立长停机以新label复验。

同goal/epoch的v1检查在并发v2发布后才完成，可以保留绑定v1的历史观察事实；不得成为v2当前观察、覆盖v2或授权新安排。非作者初始“必须丢弃/拒绝”的更严格断言FAIL与修正归因保留，不改写为已确认产品缺陷。

过程限制：原UI首次fakeDOM RED因未等HTTP异步为空，属于夹具错误；之后对冻结原app的因果验证发生在实现后，不能追认为初始UI TDD完整。新披露修复则有修前真实行为RED。早期at_iso类型错误、browser夹具模块解析错误、独立subset清单误当全集等分别保存，不充当产品行为RED。

## 固定候选与独立结论

完整候选在证据根`CANDIDATE-R2.json`/`candidates/R2/`，保全记录`PRESERVATION-R2.json`；早审70文件`BACKEND-CANDIDATE-R1.json`和50文件恢复组件`BACKEND-CANDIDATE-R2.json`及原件保留。后端/新UI变化使早审对应项失效，非作者核新身份并重验受影响部分。

最终非作者原报告为`independent/FINAL-REVIEW.md`及JSON；**实际结论由原报告及匹配的候选SHA决定，不由作者预填PASS。** 实际非作者执行、作者证据核对、各SDK/profile/场景及限制分记；机器交付状态与最终哈希复验在`DELIVERY-STATUS.json`/`FINAL-IDENTITY.json`。没有等待另一位重复本轮的复核链。

## 四原则与仍未验证

Host管理当前资格、持久版本、资源和原生映射；Agent自主形成判断、选择研究方法及观察安排。复用官方Engine/Agent/Session/Schedule及已有凭据/预算，SDK原实现/版本/原锁不变，无平行模型循环、压缩/重试/计时系统。负责人无需反复“继续”或逐调用审批，新增历史展开不增加必填操作。

原官方完整check1196/1197 FAIL及Git语言原因、原锁build PASS、历史Store RED过程缺口及11/12叙述差异均保留。SDK包身份按原锁/清单核对，未安装/升级依赖；自有检查通过不抹掉原失败。

仍未验证或未完成：真实模型/Provider认证线路/企业资料及专业质量，计算容器/VM/进程网络隔离（始终关闭，无Host fallback），Call（后排），外部连接器/通知/导出/遥测/备份，产品登录/管理面与生产运维，fresh完整网络安装、实际GitHub CI、完整E3/首版产品验收、具体POC、部署与Git交付。跨epoch旧正文当前不可读，没有全量provenance重新资格化声明；真实经营效果不由合成工程机制证明。
