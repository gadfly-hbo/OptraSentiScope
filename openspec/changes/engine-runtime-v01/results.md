# 本切片结果与证据索引

证据根：`.local/archives/engine-runtime-v01-20261116/`。用户指令原件 `approval.jsonl` / `APPROVAL.json`；开工前71份文件原件 `before/` / `BEFORE.json`。Git分支 `codex/general-v01-build`，既有工作保留；未提交、推送或部署。

## 实际验证

- `check-final-01.txt`：`npm run check` exit0；62项永久测试、类型、公开SDK入口边界/反例、语法及下述三个真实SDK工程链全PASS。最后工作台状态提示文字改为用户语言后，`check-final-02.txt` 记录对最终冻结产品字节的统一检查；以该原始退出及各runner结果为准。
- `.local/native-checks/run-1794843716076/`：真实工具循环、工具拒绝、pre-step拒绝不记read、原生一次到期、合成AUTH原失败、活动取消、dispose及同Session续接；仅本地合成Provider。
- `.local/research-checks/run-1794843717869/`：HTTP建立→官方Engine→主Agent/worker→准确版本报告；没有新资料时原生循环到期继续；文件更新自动进已有工单；历史保留；暂停/恢复/撤权/结束共7项检查PASS，37次本地合成请求。未用人工对话点击推动后续研究。
- `.local/recovery-checks/run-1794843781741-976a599f-da18-48c6-b147-2ca443abf535/`：首次工程Host SIGKILL（不是正常退出）；独立新进程恢复原主/worker Session并递增generation；原工单/报告/授权存续；技术claimed未知意图无再次准入；原生60秒循环实际到期；暂停/结束后无新请求，已知Schedule暂停。
- `ui-01.txt` 及 `.local/ui-checks/`：原公开真实浏览器焦点/输入/390窄屏回归PASS。`browser-final/result.json`：将真实研究产生且已结束的SQLite记录复制到隔离Host，浏览器实际展示工单、两版报告、准确依据hash、历史/撤权及Call待接入；390宽无溢出、无浏览器错误。截图仅合成工程内容。
- `launch.stdout` / `launch.stderr`：新官方CLI minimal Host真实启动，HTTP health显示无模型、未派发研究；旧8766用户入口及数据未接管。
- `audit-final.txt`：根项目 npm audit 0 vulnerabilities；不代表官方SDK整个传递依赖安全审计。

作者分模块 RED/GREEN、types、接口互查及冻结身份分别在 `engine/`、`sources/`、`harness/`、`workbench/`。原生会话的作者接口验证与最后非作者独立复核分开。

## 独立复核及候选

最终 `CANDIDATE-R2.json` / `candidates/R2/` 固定完整可见候选；原R1清单/原件/报告保留。`PRESERVATION-R2.json` 区分本轮所改既有文件与新文件，保护原设计/证据。非作者从全新上下文只读复核，最终结论在 `independent/R2-REVIEW-ADDENDUM.md` 及其机器结果，不由作者预填。独立原始复现、4项协调器反例和实际native检查一并保留；复核若需修正，在新固定候选重验，不覆盖本轮历史。

## 保留失败及未验证

- 原官方完整check **1196/1197 FAIL**：Git语言差异；原锁build另为PASS。没有改SDK/test/Git配置或把单项通过写成全套成功。
- 本轮第一循环定时配置1秒被官方最小60秒拒绝；工具输出含undefined被原生工具校验拒绝；创建中资格变化的回收处理缺口；claimed误读、修订停滞、旧备注跨epoch、未读输入恢复和未知timer停止误报等，原始输出与中间字节均保留，最终修正加入永久回归。测试脚本缺peer、定位/导入或语法错误单列为环境/夹具失败，不计行为RED。
- 原生事件、技术投递、业务报告、采纳/执行/观察/归因分别保存；合成Provider从未进入产品默认配置。实际Provider调用/凭据/企业资料/专业研究质量未验证。
- fresh SDK完整网络安装、Node25.9 Linux实际GitHub CI、生产认证/计算隔离/出口、更多系统来源与Call接缝、完整方案/经营结果/学习、具体POC、部署、Git交付均未完成或未运行。
- 第一片Store历史不合格RED与原11/12构建产物计数差异不追溯改写。此切片不把B05/B06或完整首版整体记完成。

## R2 测试基础设施补充

R1独立复核后，最后的freshcwd检查发现旧Store测试依赖历史core-intake父目录；同一隔离新cwd中R1有3项ENOENT。R2仅让Store夹具自行创建.local/tests目录并使用其临时子目录，不改任何断言或产品代码。fresh-tests/保留完整RED（基础设施错误，不计产品RED）和GREEN；tests-R2.txt的62项、types-R2.txt分别exit0。所有src/runtime产品、锁、脚本与R1原件字节一致，沿用check-final-02及真实SDK证据；只补充受测试目录变化影响的检查，不重复无关慢链。独立R2补充报告核对全量新身份、产品不变与同cwd重验，R1报告原样保留。fresh网络SDK安装与GitHub CI仍未运行。

## R2复核结果同步（2026-11-17）

已收到原非作者复核者的 R2-REVIEW-ADDENDUM.md/JSON，结论PASS_LIMITED_SCOPE，继承R1的E01–E07工程切片及原限制；102份当前/原件一致，R2恰两项差异、产品与SDK消费字节不变，freshcwd 3项路径失败→10/10通过，类型检查通过。当前采用这份已执行、有候选SHA的独立补充；未收到的重复复核路径不冒充已完成。DELIVERY-STATUS.json已从等待报告同步为限本切片通过，旧等待状态快照随下一变更保留。完整首版、GitHub CI、真实模型、企业资料、隔离载体、Call与POC仍未验收。本次仅同步索引，冻结R1/R2原件与原报告不改。
