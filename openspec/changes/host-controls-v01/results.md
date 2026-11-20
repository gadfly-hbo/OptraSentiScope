# Host控制接缝结果与证据索引

日期2026-11-17，分支`codex/general-v01-build`，HEAD `96388c88791ed484ce3013756beca701a79568b9`。本轮开始fetch并核对main无领先/落后；未提交、推送、合并或部署。原有已跟踪与未跟踪WIP均保留。产品合同见[Host运行控制接缝](../../../docs/Host_运行控制接缝_v0.1.md)，范围见本目录spec。

原始证据根`.local/archives/host-controls-v01-20261117/`（下称证据根）。`authorization-user.jsonl`保留本轮指令及用户“先完成接缝，计算保持关闭”的原始答复；`authorization-original.jsonl`是较宽匹配，不能当作全部为用户消息。开工前102份可见文件原件在`before/`及`BEFORE.json`，未覆盖。

## 交付内容与阶段边界

| 目标 | 实际结果 |
| --- | --- |
| H01 R2同步 | 核对旧候选SHA与102文件，采用原非作者R2-REVIEW-ADDENDUM，PASS_LIMITED_SCOPE（E01–E07）；同步旧results/DELIVERY-STATUS，旧等待状态另存。新代码不沿用旧R2身份。 |
| H02 凭据 | 复用官方stored-record精确读取/轮换，业务库仅授权Ref；主/worker按当前资格使用，撤权取消、环境回退拒绝、异常固定去敏。官方LocalCredentialProvider及实际注册合成Adapter已验证。 |
| H03 预算 | SQLite委托共享预约/结算，实际llm/stream及原生重试前准入；最后合法预约可完成，未知留占用，冷恢复不清账；修订截止重arm官方deadline，迟到用量只结旧预约。 |
| H04 计算 | ComputePort已接通并明确unavailable，实际原生工具返回未派发，无Host进程回落。真实容器/VM进程、网络和资源隔离NOT_RUN，按用户选择关闭。 |
| H05 出口 | 精确模型路由与准确输入资格复验；真实Provider及外部研究、提醒/导出、遥测/备份发送均未启用。出口账本不是OS防火墙；未验证真实端点。 |
| H06 工程链 | 官方Engine、业务SQLite、原生Session与新增控制接线；独立私有profile内仅本地合成Provider/凭据。工作台原技术详情展示资源，不新增配置表单。 |

## 实际检查

- `check-final-01.txt`：`npm run check`完成，**116/116永久测试通过**、类型/公开入口与绕过反例/语法通过；下列四条实际官方SDK工程链均PASS。测试总数不包括独立复核者自有反例。
- 原生链`.local/native-checks/run-1794886069291/runner-result.json`：工具循环、拒绝、不把claimed当read、原生到期、取消/dispose/Session续接等原断言保留。
- 持续研究`.local/research-checks/run-1794886071103/runner-result.json`：官方Engine主/worker、无新信息继续、资料更新进工单、报告/生命周期/撤权；默认资源接线后原断言保留。
- 冷恢复`.local/recovery-checks/run-1794886135004-70e04147-9390-47f5-873c-17bcb089da9a/result.json`：独立进程真实异常终止/重开、Session及Schedule资格；新增预算配置及used不重置断言。
- Host控制`.local/host-controls-checks/run-1794886198446-7c31724e-6197-4c39-a68d-1deaf4bb0c29/runner-result.json`：7项检查、8次纯本地合成Adapter调用；最后合法请求、关闭计算工具、官方record轮换后实际使用、撤权/错路由、UNKNOWN、无chunk截止修订中止与迟到计量、同step原生重试前预算拒绝/terminal failure去敏。前后产品字节一致，已知合成key未进入业务库/原生历史/结果或日志；private官方vault允许包含合成key，不冒充物理擦除。
- `ui-focus-final.txt`、`.local/ui-checks/run-zpqZCc/result.json`：`npm run check:ui` PASS，原焦点/草稿/刷新/窄屏回归。`browser/result-r2.json`与desktop/mobile截图：真实官方minimal Host上实际创建委托，默认10次请求预算自动生效，用量0、计算关闭、出口未启用，390宽无横向溢出且无浏览器错误。截图仅合成资料；作者实际查看。首轮`browser/result.json`的创建后等待超时原样保留，沿用原脚本scroll-before-click后完成，不当作已复现产品缺陷或产品RED。补充脚本及逐命令输出在browser目录。
- `SDK-NEW-CONSUMPTION.json`：新增消费credentials/credentials-local/timeout三包44文件逐一比对原获准包清单，均为0.2.2-rc.3。`runtime/locks/identity.json`仅增加这些公开入口的核验身份；SDK源码、官方锁及版本未变。非作者另核13个相关包552文件。
- `audit-final.json`：根package-lock-only审计exit0，0 vulnerabilities；不代表对官方整棵依赖的安全审计。没有依赖安装/升级。

作者分模块RED/GREEN/类型与接口互查分别在`credentials/`、`budget/`、`compute/`及根输出；非作者证据另存，二者不相互替代。凭据与预算hot path使用标量scope，不逐token展开历史；原流式日志仍增量追加。

## 固定候选与非作者复核

证据根`CANDIDATE-R1.json`、`candidates/R1/`固定完整可见候选（含源/永久测试/脚本/锁/文档），`PRESERVATION-R1.json`记录相对开工前102文件的变化与原件保全。忽略目录中的私有profile、凭据、运行数据与独立夹具不进入产品候选。

非作者复核者未参与候选任何部分创作，以全新聚焦上下文只读检查，最终报告位置为`independent/FINAL-REVIEW.md` / `FINAL-REVIEW.json`。**实际结论以其原报告及匹配的候选SHA为准，此索引不由作者预填独立PASS。** 本轮机器交付状态、最终哈希复验与仅关闭自有UI夹具的记录在证据根`DELIVERY-STATUS.json`及`FINAL-IDENTITY.json`/`SHUTDOWN.json`。不把本轮接缝通过提升为完整首版或Product Acceptance。

非作者发现的迟到usage丢计、在途截止未重新arm、共享已知超额未中止其他活动流、finish.error原始诊断进入原生历史、UNKNOWN被waiting遮盖均先保留失败，再修实现并加入由作者独立编写的永久回归。非作者自有五项反例和46项定向测试重验通过；`independent/backend-retest-identity.json`固定该次11份后端源码身份。另有非作者实际SDK错误去敏与deadline/迟到usage探针，原始进程退出及日志保留。最终完整候选仍须核对这一身份与新增测试/UI/文档。

## 四原则复核

- Host管环境：凭据映射、预算、出口、输入资格、关闭计算与停止事实均在Host；预算不足不伪装为研究结论，UNKNOWN不伪装已停止。
- Agent自主执行：仍由官方原生会话/循环/调度和Engine执行，Host不规定研究方法或取舍，不另造研究循环/重试。
- 优先复用官方SDK：复用Credential records/Local、llm/stream/usage、deadline和原生hook cancel；只写自有业务接缝，不改SDK、不升级版本、不引入替代Secret Store。
- 减少人的操作：Host一次默认资源策略自动应用新委托，累计账与撤权不覆盖；负责人无须逐调用审批、填写机器身份或手工推动后续研究。当前缺失计算载体是明确关闭，不要求反复操作。

## 保留失败与未验证

- 原官方完整check **1196/1197 FAIL**及Git语言诊断原样保留；原锁build另为PASS。早期Store RED过程不合格与原11/12构建产物表述差异不追溯改写。
- 本轮修正的五项安全/状态缺口、早期类型/fixture/编辑命令错误及UI夹具超时原始输出均保留；错误类别分别记载，不把脚本失败充产品行为RED，不以绿色重跑抹掉历史。
- 真实模型/真实Provider认证头、真实凭据与企业资料、容器/VM隔离、外部连接器/订阅/通知出口、Call只读接缝、fresh完整网络安装、Linux/Node25.9实际GitHub CI、完整方案/经营结果/学习、具体POC、部署与Git交付均未进行或未完成。
- 凭据watch:false，授权与轮换走官方API；没有任意外部文件编辑即时推送或物理secret擦除声明。预算没有精确输入token/金额硬上限；SDK stream调度次数不是HTTP包数。Provider不合作时保留UNKNOWN，不声称已物理中止。
