# 待决事项切片：执行与证据

2026-11-17，本批实现及限范围本地工程验证完成。证据根`.local/archives/operator-decisions-v01-20261117/`。基线分支`codex/general-v01-build`，HEAD `96388c88791ed484ce3013756beca701a79568b9`，保留既有tracked/untracked WIP，不提交、推送或部署。原132文件候选及原件保留位置、SHA与本批差异见证据根`BASELINE.json`。

任务及验收见[spec](spec.md)，实现合同见[接线说明](../../../docs/经营者取舍与持续跟进_v0.1.md)。前批成果／观察复核和原官方1196/1197 FAIL保留，不能用于宣称本批通过。

## 目标与实际检查

| 项 | 状态与范围 |
| --- | --- |
| D01 | 已实现不可变待决修订、准确当前方案、范围/选项/依据限制、CAS/请求幂等；20项业务存储回归覆盖双SQLite连接及重开。 |
| D02 | Host绑定经营者、原始回应与选择分开；typed知悉不能升为采纳，部分选择保留准确范围，解释引用已保存responseId；没有执行/新增权限副作用。 |
| D03 | 三类真实时间及依据/复查点，非法日期/矛盾顺序拒绝；迟到/暂停回应保留但需重新核适用性；旧版/失权拒生效，结束收束原因保留。没有实现自动提醒派发。 |
| D04 | 主Agent工具与既有Engine/Session接通；回应仅以准确ID进入原生输入，当前资格读回正文；原生at唤醒时在未回复状态交付独立判断。未把待决接入观察等待门。 |
| D05 | 已确认Demo卡片、按钮、调整原话弹窗、真实待决数和选择历史接线；当前在前、旧版折叠只读；poll保留draft/focus，亮暗/390实际浏览器通过。 |
| D06 | 最终201/201测试、类型/边界与浏览器检查通过；非作者R5 PASS_LIMITED_SCOPE、四原则同结论、无未关闭P1/P2。R2完整检查7条SDK链仅映射字节未变后端；不宣称完整首版或产品验收。 |

## 原始证据索引

- `http-red-01.txt`为真实入口400不支持回应的行为RED，`http-green-01.txt`为接线后通过。`coordinator-red-01.txt`为缺主Agent工具的行为RED；`coordinator-green-01.txt`保留首次接线后未独立唤醒的FAIL，`coordinator-green-02.txt`在回应使用独立技术输入线程后通过。没有新增研究工单或Runtime，是否另建问题仍由Agent判断。
- `author-store/RED.log`/`GREEN.log`保存首个待决保存RED与17项最终回归。首个保存行为有修前RED；其他边界回归不追认每项均有独立修前RED。`author-ui/RED.log`/`GREEN-current-first.log`为2项新UI行为反例及5项目标回归。
- `tests-integration-01.txt`为187/187模块/HTTP/协调器及既有回归；首轮完整检查`check-final-01.txt` exit0（187项及7条SDK链）；修正期间的`check-final-02.txt`退出1，cold runner明确INCONCLUSIVE_CANDIDATE_CHANGED（test/decisions.test.ts在运行期间新增），该轮不作为最终候选PASS。最终检查与退出结果另在作者检查索引记录。
- `.local/operator-decisions-checks/run-1794898269400-6e5ff94f-3a9a-4633-a0f6-2f455ebb3f26/runner-result.json`：首次实际官方SDK合成链PASS，7项检查、29次本地请求、前后产品字节一致。准确来源方案v1→知悉仍待决→原生一次唤醒独立判断→原话准确读回/部分选择→v2不继承/旧页409→正常重开保事实→撤权拒读旧正文，计算拒派发。原生夹具Schedule按准确ID关闭；这是工程夹具，不是产品另建提醒计时器。
- `.local/operator-decision-ui-checks/run-ol9GMY/result.json`及`business-proof.json`：最终真实浏览器/HTTP/SQLite通过；已读零choice、原话跨5500ms输入/焦点保留、部分选择和推荐范围按钮、历史只读、亮暗/390无溢出和浏览器错误。该UI检查中的解释是明确合成替身；实际原生工具解释由上条独立SDK链证明。截图原件`desktop-light.png`/`desktop-dark.png`/`mobile-dark.png`已查看。
- 原UI检查器`run-NNLpu5/result.json` FAIL保留：错误假定初始主题为亮色，改为先读实际主题再切换，不改产品换取通过。中间`run-8qERUg` PASS保留，最终以`run-ol9GMY`为准。

## 固定候选、独立复核和四原则

R1完整候选为`CANDIDATE-R1.json`，142份文件，SHA256 `847450afda4a7650e3b54f47d157b6e9a5a56bb19920c6d8a38316d4f8d3c00f`。非作者R1原报告`independent/review-r1.md`保留，不通过及后续重验分记；最终源候选R5为`CANDIDATE-R5.json`，142文件，SHA256 `b3461cb004dda9bf908d5151eb00985f67dc5dbbd4c3765100ff634cb0d040cb`。非作者原报告`independent/FINAL-REVIEW.md`/`.json`实际结论PASS_LIMITED_SCOPE，四原则同结论，未关闭P1/P2为空。最终文档完成后的完整身份以`CANDIDATE-FINAL.json`和非作者文档差量复核为准，不能把HEAD当作包含未提交文件。

四项P2属于本批验收内修正：作者发现暂缓/拒绝缺省范围错误写成整份方案，`scope-red-01.txt`复现；默认改为已选选项范围或仅此待决事项，`scope-green-01.txt`通过。非作者独立发现只给executeBy时过期仍直接采纳，原snapshot公开方法反例在`independent/adversarial-r1.*`；永久`execution-window-red-01.txt`复现、green通过，decideBy缺失时执行期限经过仍须核适用性，提醒/复查本身不变成硬截止。非作者另发现查看准确方案链接只切通用页签，不能定位历史/并行方案；携准确ref展开并聚焦修正后通过。UI作者随后发现新版到达会将正在读的卡片移入关闭历史，非作者补出summary/原已展开history的同路径反例；最终按真实DOM中的准确卡片及当前→历史区迁移恢复可见位置，与祖先开关分开判断。用户关闭的依据保持关闭，普通poll不滚动。原R4两项真实FAIL保留；最终16项UI回归与8个组合全部通过。

独立R1初次scoped检查恰逢作者新增范围测试，混合候选FAIL按实际记录；改从R1snapshot运行时runtime测试缺SDK包解析，属于环境失败。两者与独立窗口行为RED分别保留，不追认为当前固定候选全量结论。作者自检不代替独立复核，不把旧批PASS沿用为本批通过。

Host管资格/版本/身份/持久化与回执，Agent判断待决与后续研究；复用官方Engine/Agent/Session/Schedule，没有新的模型循环、重试器或调度器。经营者只需必要取舍或一句明确回复，不重复确认整案；初始Demo已批准，当前路径沿用原确认。

真实模型/Provider认证线路、企业资料和语言理解/判断质量、计算容器/VM及进程网络隔离（始终关闭，无Host回落）、Call（后排）、自动汇总/提醒/外发/导出、实际执行/经营效果与归因、生产登录/运维/备份、实际GitHub CI、POC、部署与完整首版产品验收仍未验证或未完成。原官方1196/1197 FAIL、旧过程缺口及本批所有原失败保留。没有安装依赖、修改官方SDK、使用真实模型或企业资料。


## 最终检查与证据映射

`AUTHOR-CHECKS.json`索引实际命令、退出、runner原件和SHA；先前R4作者索引保留为`AUTHOR-CHECKS-R4.json`。`check-final-03.txt`是R2的完整npm run check（191项、类型/边界及7条官方SDK链全部exit0）；R2到最终R5仅`src/web/app.js`、`test/web-disclosure.test.ts`、`scripts/check-decision-ui.mjs`三个UI文件变化。后端/runtime/契约/锁和SDK检查脚本逐字未变，按工程规范“已知消费者且影响闭合”保留后端SDK证据映射。**没有把R2完整检查说成在R5执行。**

最终R5实际执行：`tests-final-03.txt`为201/201；`typecheck-final-03.txt`无诊断exit0；`ui-regression-04.txt`为原浏览器焦点/输入/390回归PASS；Node语法及20文件Runtime导入边界检查PASS。`.local/operator-decision-ui-checks/run-2J3wCA/result.json`实际90个浏览器命令全部通过，包含历史/并行准确ref、新版到达的卡片与summary迁移、history原开/关、closed依据状态保留及sticky/viewport几何；亮暗/390无溢出。最终截图已实际查看。未单独宣称390宽下所有迁移几何均已验证。

非作者独立执行R2实际SDK合成链7项/29请求，结果`independent/actual-sdk/run-1794899225385-91065284-ee1e-47e0-80f0-00a0eddaba5f/runner-result.json`PASS、前后字节一致；R2 scoped29/29、R4 scoped31/31；最终R5 UI含独立反例24/24。最终四原则及闭合意见由原报告给出，作者自检不代替。

独立旧DOM替身首次retarget到R5为22/24 FAIL，因为缺正常Element.closest selector支持；补标准DOM能力后24/24，同一替身对R4仍6/8 FAIL，证明没有弱化行为断言。原件`ui-r5-tests.txt`/`ui-r5-tests-dom-compat.txt`/`open-history-dom-compat-r4.txt`及归因保留。其他保留项包括UI首轮主题假设、精确链接测试替身类型检查、浏览器检查脚本引号语法故障、混合候选/依赖解析环境失败、R1与R4实际产品反例，以及原官方1196/1197 FAIL；不把检查器故障当产品RED，也不追认每项均严格修前TDD。

本批完成仅指本地代码及所列工程接缝。分支和WIP保留，未提交/推送/合并/部署，未更新用户在用服务；实际GitHub CI与产品验收没有发生。自动汇总和提醒属于下一切片，本批只保存/展示窗口并让Agent在既有研究入口继续跟进。
