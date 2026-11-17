# 执行事实与结果观察：执行及证据

2026-11-17，O01–O06本批实现与适用本地工程验证完成，固定R2非作者复核PASS，无未关闭的本批缺陷。用户授权及目标见[spec](spec.md)，接口见[实现说明](../../../docs/执行事实与结果观察_v0.1.md)。证据根`.local/archives/outcomes-v01-20261117/`。上一批153份原快照及开工当前字节均一致，`BASELINE.json`记录SHA256；本次fetch后HEAD与origin/main同为96388c88791ed484ce3013756beca701a79568b9，保留全部WIP，无Git交付/部署。以下区分阶段检查与当前完整候选，不能用旧PASS改写失败。

## 已有切片与当前检查

- FollowupStore增加可选准确execution/observation ref，结果复查可沿原选中plan继续，普通研究跟进仍按原latest资格；`followup-red-01.txt`保存旧输入不支持该准确结果的失败，`followup-green-01.txt`公共接缝及原回归14/14。
- 本批直接阻塞：原FollowupStore在创建定时期间暂停，迟到ID被停止同时误将业务责任superseded。`followup-pause-red-01.txt`复现waiting→superseded；最小修正只保留真实暂停中的同目标责任，准确晚到ID仍stop_pending并核停。`followup-pause-green-01.txt` 15/15，原UNKNOWN/失效/结束边界保留。
- ArtifactStore.readForOutcome为同目标准确原plan重验全部当前来源，普通read仍拒旧epoch。`artifact-access-red-01.txt`是夹具alternatives为空被合同拒绝，非产品行为RED；修夹具后`artifact-access-red-02.txt`为新接口未建立的TypeError，不追认为已执行来源边界的行为RED。`artifact-access-green-01.txt`新准版本核对与原15回归共16/16，后续实际结果路径另证。
- `coordinator-red-01.txt`为原主Agent缺record_execution_fact能力；接线后`coordinator-green-01.txt`通过，准确选择→陈述来源partial执行→immature观察→复用原生at映射→新plan不搬旧结果。该回归使用实际官方Engine及原生port替身，真实Harness自然唤醒由新增实际SDK链另证。
- `author-store/`保存业务public API逐片RED/GREEN、不可变修订、原始陈述性质、准版本/当前资格回执；`author-ui/`保存结果投影与当前转历史披露位置迁移的行为RED/GREEN。后补边界回归不追认各项都有独立初始RED。
- `typecheck-integration-01.txt` FAIL：root新增followup测试对pendingOperation缺非空收窄；补明确assert收窄后`typecheck-integration-02/03.txt` PASS，未改业务断言。

- `statement-red-01.txt`/green：research_context原来未给负责人原话准确ID；增加安全messageId/时间及main只读read_operator_statement后通过，不把原话自动转成执行。
- `followup-stale-red-01.txt`/green：准确execution修订被替代后，直接公共observe未核结果资格；新增仅outcome跟进的资格校验，旧普通研究并发历史合同不变。新跟进/原13项/协调器共17/17通过。
- `author-store/RESULT.json`：13/13公共业务检查及typecheck PASS，含跨epoch重核、同epoch失败失权、旧plan/迟到旧execution关联、双SQLite CAS及重开；最后字段顺序规范化有真实RED/GREEN。
- `tests-integration-01.txt` 251/251为中间集成检查，后续增加跟进反例/修正，最终统一检查另列，不把旧数量冒作最终全量。
- `author-native/RESULT.json`：最终`.local/outcomes-checks/run-1794919126376-fbffa3e1-71da-4920-ba02-9985ae7a410f/runner-result.json` PASS8项/39本地合成请求，exit0，产品与SDK字节不变。先明示选择仍零执行；获准资料partial执行/immature与missing_data；发布plan v2后旧v1的原生at自然到期复查→独立mature观察r2；新增独立来源自动使epoch3→4，新main只获安全结果元数据，准确重核旧原件，再据新source追加观察r3，仍原plan v1/choice/execution r1，原epoch不改。正常Host重开及撤权fresh输入/准确读回保护另列。首轮同8/39 PASS保留，两轮唯一变化为runner边界说明external outcomes→external notifications，不改产品/断言。
- `author-ui/UI-RESULT.json`与后续最终source复验：`.local/outcome-ui-checks/run-2yAN34/result.json` PASS44命令，7受测文件前后字节一致，0经营者写命令；准确旧plan、独立选择、旧execution观察、未成熟/缺资料、当前到历史阅读、亮暗/390和新结果投影撤权遮蔽。原第一轮run-6nhDpa同44 PASS保留；UI新增5项加原23项共28/28。截图均目视；该fixture只证明本批outcomeFeed，不扩大为所有历史artifact/decision权限证明。

## R1完整检查与独立发现

R1完整164文件候选`CANDIDATE-R1.json` SHA256 b532a23807f062e9c7173ba67b955ab0ce96a4548eb256f967732353e92f98b6，snapshot保留。`check-final-01.txt`实际exit0：253/253、类型/23文件边界/3负对照及9条实际官方SDK合成链全部PASS；`AUTHOR-CHECKS.json`索引准确runner身份。原工作台真实浏览器`ui-regression-01.txt` PASS。以上不能替代独立复核。

非作者先从确认输入导出EXPECTATIONS，后核current/snapshot164字节并检查。R1独立原生SDK8项/40本地合成请求PASS（实际请求数不同于作者39，分开记录），73/73公共目标、8项真实SourceStore oracle和另一位来源/生命周期复核者5/5通过；独立夹具初始scan回调遗漏及复用旧binding的FAIL分别保留，不算产品RED。

R1独立结论FAIL一项P2：execution r1→observation r1→以obs安排复查后，execution r2到达，旧安排仍current/due且可记检查。原件`independent/R1-REVIEW.md`、`independent/R1-FINDINGS.json`、`independent/boundary/repro-observation-review-r1.ts/.log`保留。作者`review-context-red-01.txt`复现；修复将旧观察准确execution关联与本次复查的当前执行上下文分记，旧安排在执行更新后失效，Agent可为原观察带新已核上下文主动重排，不改写原事实。

`review-context-green-01.txt`为29/30 FAIL：原公共测试沿早期设计断言旧obs无需新上下文也可复查。依据独立P2改为断言无新上下文false、准确新上下文true，并保留原exec1读回/投影准确关联、增加执行再更新使新安排再失效的协调器反例；没有删除历史准读回覆盖。`review-context-green-02.txt` 30/30 PASS，`review-context-types-01.txt` PASS。R1通过证据不追认为修后全量；R2完整检查及独立重验另记录。

## 当前固定候选与最终证据

R2完整164文件候选`CANDIDATE-R2.json` SHA256 `dc25151badd1ba0b1e928caa9094b99f6901645425fd69d89cf3c77bfc6ae1f2`，当前及snapshot逐文件相符。R1→R2准确差异为3份本批文档、runtime/outcomes.test.mjs、src/followup.ts、src/outcomes.ts、src/research.ts、test/outcomes.test.ts，无新增/删除；SDK/锁/原生Runtime接入实现与UI源/测试/runner未改。原件`R1-TO-R2.json`。

| 检查 | 当前结论与原件 |
| --- | --- |
| R2完整`npm run check` | `check-final-02.txt` exit0：253/253、typecheck、23文件运行边界/3绕过负对照，9条实际官方SDK合成链全部PASS。`AUTHOR-CHECKS-R2.json`逐runner路径/SHA；所有164源字节前后仍符。R1索引AUTHOR-CHECKS.json单独保留。 |
| 9条实际官方SDK链 | native、持续研究、强制进程恢复、Host控制、成果跟进、成果冷重开、经营者取舍、简报提醒、执行/观察。R2 outcomes最终`.local/outcomes-checks/run-1794920063479-7638963b-21db-45bb-932a-6915b79b0454/runner-result.json` PASS8项/39合成请求，不改产品或SDK。 |
| 独立目标回归 | `independent/SCOPED-TESTS-R2.txt` 73/73 PASS；全新边界复核者`independent/boundary/R2-boundary-checks.log` 10/10 PASS，含context错id/旧/未来/畸形、原P2拒绝、再次更新失效、来源/角色/生命周期与普通跟进/UNKNOWN。 |
| 独立扩展实际SDK | `independent/native-r2-targeted/run-1794920051576-ce6505c4-ee97-476a-8778-13b3b6729e93/runner-result.json` PASS10项/46本地合成请求，exit0，产品/SDK字节未变。保留原8项并新增execution r2→原obs重排context2→execution r3使旧安排失效→同原obs重排context3→原生at自然投递→准读仍execution r1→独立研究检查，无伪经营观察。 |
| 实际浏览器与影响映射 | 作者最终44命令及仅加补图的副本52命令PASS，原工作台check:ui PASS。全新非作者`independent/ui/UI-REVIEW-R1.md`限定PASS，89条命令记录及无效尝试保留，实证准分组/旧版本/原话/四项状态、原v1依据/焦点、epoch/撤权遮蔽、320/390px及零经营写入。不是89项全PASS。R2未改UI静态源或#eligible/projection，按准确影响映射复用R1 UI；受影响currentReference/调度上下文已另经R2独立10/73/SDK10项验证。 |

最终源独立报告`independent/FINAL-REVIEW.md` SHA256 `8e4c4ae73cddda7e1ceba24eabafc2588b352129f7e26c9baa4784c041a7d17b`及JSON，结论PASS，R1-P2-01在R2独立重验关闭，原R1 FAIL不覆盖。非作者先导出EXPECTATIONS后看源码；独立边界/UI复核者亦未参与候选创作。作者修复、作者测试、独立检查分别留证。收尾后仅本批spec/results/实现说明3份文档变化，完整最终清单`CANDIDATE-FINAL-R2.json`、snapshot及`independent/FINAL-DOCS-REVIEW.json`、`DELIVERY-STATUS.json`核最终身份与doc-only适用性，不把文档核对当新运行证据。首次FINAL文档索引相对目录歧义在终核发现，仅修正证据路径；CANDIDATE-FINAL.json及candidates/FINAL原件保留，修正文档另固定FINAL-R2，不改运行代码或运行结论。

## 四原则与仍未证明项

| 原则 | 本批实际增量与受影响接缝结论 |
| --- | --- |
| Host管环境 | 通过：Host绑定身份/版本/当前资格、原件与独立资格回执、持久调度ID及技术执行上下文；当前责任与历史准关联分开，不推断执行或效果。 |
| Agent自主执行 | 通过：Agent解释实际范围/程度/成熟性、自选方法与复查条件，能为原观察主动重排；Host只验证技术上下文，不强制改写事实或补计算，不代经营选择。合成机制不证明这些判断质量。 |
| 复用官方SDK | 通过：原Engine/Agent/Session/Schedule及FollowupStore承担运行/自然到期/恢复，无平行Runtime/模型循环/计时器。原SDK/版本/锁未改，原官方1196/1197 FAIL未关闭。 |
| 减少人操作 | 通过：沿现有获准来源和补充对话，Agent用准确messageId读回原话；没有新增重复填表、签收、普通读取审批或逐项继续。原话明确为未经系统独立核实的陈述。 |

UI限定新outcomeFeed，不能推广为全部历史artifact/decision权限；后台document.hidden时原轮询暂停，恢复前台后遮蔽已实测，不宣称后台DOM即时刷新或最大撤权展示延迟。SourceStore原版本缺失/撤权拒读、新epoch重验与fresh模型输入保护由独立公共/实际SDK另证；UI合成来源回调不替代这些真实接缝。

计算OFF，Call后排。真实模型/Provider语义质量、资料可靠性和经营结果质量、效果归因与经验复用、企业来源、计算/进程/网络隔离、新结果数据OS崩溃/备份恢复、外发/导出、生产身份/运维、实际GitHub CI、Git交付/部署、POC和完整首版/用户产品验收均未由本批证明。正常Host重开、既有强制进程链按原范围分记。原官方1196/1197 FAIL、前批缺口、本批所有FAIL/UNKNOWN/NOT_RUN及无效浏览器尝试均保留，无安装/SDK改造/真实模型/企业资料/POC操作。
