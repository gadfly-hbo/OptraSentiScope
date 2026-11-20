# 自动汇总与站内提醒：执行与证据

2026-11-17，本批N01–N07在授权的本地实现和受影响接缝范围内完成，非作者结论为`PASS_SCOPED_ENGINEERING_REVIEW`，无未关闭P1/P2。分支`codex/general-v01-build`，HEAD `96388c88791ed484ce3013756beca701a79568b9`；这是含既有WIP的文件清单候选，不是新Git提交。保留原142文件候选及全部WIP；本批证据根`.local/archives/notifications-v01-20261117/`。任务见[spec](spec.md)。前批201/201/原SDK链和原官方1196/1197 FAIL保留，不能当本批通过。

真实模型/语义及经营质量、企业资料、计算隔离、Call、外发、POC、生产运行/CI/部署和完整首版验收均未由本批证明。


## 已实现与当前检查

合同见[实现说明](../../../docs/自动汇总与站内提醒_v0.1.md)。已实现原生weekly工作日简报、Agent判定同事项合并与重要变化、原生at准确窗口核对、当前资格下的站内投影及准确待决入口。默认Host时区17:00、周一至周五，有效偏好继续复用；无变化只留核对事实，不推空简报。提醒不生成经营者选择，未回复不阻塞独立研究。

| 实际检查 | 结果与证据（相对本批证据根） |
| --- | --- |
| R2完整`npm run check` | `check-final-03.txt`退出0：226/226测试、类型/运行边界及8条实际官方SDK合成链PASS（native、research、强制进程恢复、Host控制、成果跟进、成果冷重开、经营者取舍、notifications）。准确runner路径和SHA见`AUTHOR-CHECKS.json`。 |
| R3受影响检查 | `tests-final-01.txt` 230/230 PASS，含NotificationStore14、NotificationSchedules7、UI23；`typecheck-final-01.txt` PASS；JS语法及22文件运行边界检查PASS；`ui-regression-01.txt`既有真实浏览器回归PASS。 |
| R3新增真实浏览器 | `.local/notification-ui-checks/run-nGy8x6/result.json` PASS66命令：准确第二待决、旧引用不转到新版本、刷新阅读/焦点、亮暗与390px、零选择和人类写命令。 |
| 独立目标回归 | `independent/targets-r3-result.json` 59/59 PASS，含复核者独立写的四类准确窗口及错方案/撤权反例。 |
| 独立实际官方SDK | `independent/native-copy-checks/run-1794903049662-df1459bc-08e5-40c3-8419-c459f963de54/runner-result.json` PASS7项/45本地合成请求，准确源码副本与官方依赖前后不变；`native-copy-adaptation.json`只记录runner路径适配。 |
| 独立真实浏览器 | `independent/ui/VERDICT-R3.json`：原runner66命令，加独立59命令/15项验收PASS；准确事项、跨刷新、草稿/ESC、v2不转v3、移动屏与零选择均实际检查。 |

R2→R3准确变动仅`src/web/app.js`、`test/web-disclosure.test.ts`、`scripts/check-notification-ui.mjs`。后端、原生端口、官方SDK和依赖字节未变；完整检查在R2执行，R3完成上述受影响检查，非作者认可影响闭合。**不宣称R3重新执行了整条`npm run check`**。独立实际SDK使用R1准确源码副本，R1→R2仅原恢复工程夹具变动，R2→R3仅三项UI变动，适用性分别核对。

## 固定候选与独立复核

- 原142文件基线：`../operator-decisions-v01-20261117/CANDIDATE-FINAL.json`，SHA256 `364ecc3f2fd2e3279b5a16fa4cbf3fa64dbad90f1924fbf2e7564dc8760dc09b`。
- R1/R2/R3完整153文件清单及不可变副本均保留。复核源码候选`CANDIDATE-R3.json` SHA256 `f9bdc6974f49aa2e72da3c92c3220d3d5539f0ed7f33593a4e4f4b0c853b6e7b`；独立复核前后153份当前文件及snapshot一致。
- 非作者先从确认规格导出`independent/expectations.md`，再检查源码；第二位全新上下文非作者独立检查UI。报告`independent/FINAL-REVIEW.md` SHA256 `315da4de9c5be579ee50d15526f890f846a731f7d14ea25e7da51f52a776e806`；机器结果`FINAL-REVIEW.json`。
- R1独立发现P2：同委托两个独立待决的首页入口只带委托ID，点第二个不能准确定位。属于既有行为且直接阻塞N06；R3带准确id/revision，等待匹配委托的新详情后消费导航意图，旧在途刷新不抢用，离开取消，失效引用明确不可用。`independent/ui/ISSUE-001-R1.md`保留RED，`ui/FINAL-R3.md`独立实际浏览器关闭，无其他未关闭P1/P2。
- 文档收尾后完整候选为`CANDIDATE-FINAL.json`、`candidates/FINAL/`；与R3的差异仅本批spec/results/实现说明，最终身份与非作者文档差异核对见`independent/FINAL-DOCS-REVIEW.json`及`DELIVERY-STATUS.json`。源码检查与文档收尾的适用性分别记录，不将文档核对充作新运行证据。

原142文件在前批不可变`CANDIDATE-FINAL.json`及snapshot保全，SHA/位置见证据根BASELINE.json。作者并行开始UI编辑早于current-byte保全检查，原检查失败和当时两文件差异在BASELINE-PREFLIGHT.json；没有回退或覆盖WIP，不伪称开工前已全部当前字节一致。

## 原件索引与失败归因

- author-store/ 保存14项公共业务接缝、每片RED/GREEN和并发简报请求身份竞态修正；旧摘要/重复提醒回执不返回失权正文。
- schedules-red/green-01/02为偏好复用、先记creating/UNKNOWN不重建；03为owner属性顺序导致重复命名空间和已停止ID重复回执误拒，修正后精确一致；04为暂停创建期间迟到ID错误抛弃业务责任，保留pending/真实停止后恢复，7项通过。其他日期/资格/目标/偏好/到期检查回归按实际补充检查列证，不追认所有项均有独立修前RED。
- coordinator-red-01.txt 原无weekly的行为RED；coordinator-green-01.txt 实际接口通过：duebrief绕过观察等待、空检查后安静、重要事项精确一次且无选择事实。
- tests-integration-01.txt 219/221，原观察故障夹具依赖全局Schedule序号，新weekly占该序号使注入打错资源；改为按观察title注入，原断言不弱化，EXISTING-CONSUMER-ADAPTATION.json记录。既有6份工程探针显式使用未来UTC简报时间，维持“无通知工作到期”前提；新feature的due/default行为由独立新检查覆盖。tests-integration-02.txt 221/221；后续7项schedule回归已加入最终检查。
- .local/notifications-checks/run-1794902191642-7e176d04-bfbc-49f7-a74d-fdfa2c5b4533/runner-result.json 首次实际SDK FAIL：自然weekly/源更新/合并/重要提醒已过，夹具后续普通人类消息正确路由到已有worker，而脚本错误等待main创建待决。修为main在同一原生工具续接中自主提出后续取舍，移除人工phasekick，未弱化at/窗口断言。
- .local/notifications-checks/run-1794902429063-ddaa9105-1914-4cf4-bd3c-1cd320749c69/runner-result.json PASS7项/45次纯本地请求、产品与SDK字节不变。原生weekly真实回执→简报；合格新来源→安全旧matterID关联→同事项v2+重要变化；原生at→一次窗口提醒且仍待决；已检查后无重复催提醒；正常重开保留身份；撤权不回放旧摘要；另一真实weekly空检查无通知。默认MonFri/周末滚动另有模块/公开SDK日历契约，不能与当前日自定义工程偏好混为同一证据。
- .local/notification-ui-checks/run-l4ICEU/result.json 与business-proof.json 为首页P2修正前作者UI PASS46命令，实际HTTP/SQLite/浏览器；准确matter/decision/artifact、no_change不推空正文、新通知feed撤权遮蔽、跨5500ms阅读、亮暗/390无溢出、零选择/写操作。首次run-M85pZr因启动时list未接feed超时，与中间PASS run-KJC9H6均保留。R3最终作者run-nGy8x6为66命令；新增run-0nTUCJ因夹具把nextReviewAt设为当前时间而被合同正确拒绝，移至未来，不改产品与断言。首页准确引用修正RED、在途刷新负对照及中间UI夹具失败均保留。
- check-final-01.txt FAIL：原恢复探针假设原生Schedule全局只有1个，新增weekly后应为1个every心跳+1个weekly。check-final-02.txt FAIL：严格time断言遗漏官方规范化的`.000`。R2仅修原工程夹具：准确要求两类各一个、UTC/23:59:59.000/MonFri，心跳按kind定位，原Session、代、ID及UNKNOWN不重放断言保留。第三次完整检查PASS；不改官方SDK，不削弱恢复断言。
- independent/native-checks/run-1794902948692-8c7f0875-fd8f-44b0-ac46-c5ef4104a838/ 首次独立SDK FAIL：临时合成来源落在原项目受保护`.local`内被正确拒为source_escape，夹具等待来源直到耗尽有界合成预算。native-first-failure-analysis.json留因；改为准确产品副本与其保护子目录外的临时来源，原产品/SDK/资格/断言不改，后续独立PASS不覆盖原FAIL。

## 四原则专项最终复核与限制

| 原则 | 本批结论与实际依据 |
| --- | --- |
| Host管环境 | 本批接缝通过：owner/目标/当前资格/准确版本、偏好、持久投递事实与原生ID映射由Host治理；创建前记creating，未知不重建，暂停/迟到ID/冷重开及撤权有检查。 |
| Agent自主执行 | 实现边界通过：Agent决定事项关系、重要性、摘要与到期是否提醒；Host不替人采纳/执行、不编排分析步骤，due工作能绕过安静观察等待。合成测试不证明Agent判断质量。 |
| 优先复用官方SDK | 本批变更接缝通过：Harness原生weekly/at计时与投递，沿用Engine/Agent/Session，无平行计时器/模型循环。Harness0.2.2-rc.3、superagent固定提交`8c32a9dc5d72c033816c6a8110b37f40cf94fba4`及原锁不变，未安装或修改SDK；原官方1196/1197 FAIL未关闭。 |
| 减少人操作 | 实查UI通过：默认有效时间/工作日、同事项当前视图、无变化不推空提醒、准确进入对应待决，无新增必填技术表单/签收。经营取舍仍须经营者明确回应。 |

以上为本批实际代码与受影响路径的复核，不扩大为所有既有实现或完整产品合规声明。UI撤权夹具仅证明**新增notification feed**正文遮蔽，因为夹具自行提供artifact qualification；不能据此宣称所有历史成果/待决UI权限已验证。实际SDK另证明来源新代的模型输入和准确notification读回保护。

实际weekly自然投递使用当前日自定义工程偏好；默认MonFri/周末滚动由模块与`sdk-calendar-contract.json`另证，无企业节假日/调休声明。通知正常Host重开不等于新增通知数据的OS崩溃/备份恢复；既有强制进程恢复链按其原范围单列。真实模型/Provider认证线路、语义/合并/优先级与经营质量、企业资料、计算隔离、Call、外发/导出、实际经营执行/效果归因、POC、生产身份/运维/备份、实际GitHub CI、Git交付/部署及完整首版/用户产品验收仍未验证或未执行。计算保持关闭，Call继续后排。
