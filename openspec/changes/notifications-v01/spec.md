# 自动汇总与站内提醒 v0.1

2026-11-17，用户明确授权按已确认spec接续本批。依据产品过程§3.4、搭建规格NotificationIntent/调度合同/AC05，沿已确认工作台与Demo，承接准确成果和经营者回应。计算关闭、Call后排、官方Harness0.2.2-rc.3与固定superagent原实现/原锁不变；无依赖安装、真实模型/企业资料、POC、外发通知或部署授权。

## 目标与执行清单

- [x] N01 Agent发布可版本化的持续事项：告知/补事实/需决定，准确成果及独立待决ref、变化/未知/合并理由；同一事项更新、独立取舍不混并，重要性由Agent判断。
- [x] N02 使用Harness原生weekly工作日简报；复用有效偏好，无偏好时Host时区17:00:00、ISO周一至周五。没有实质变化只保留核对状态，不推空汇总。没有企业节假日日历声明。
- [x] N03 重要变化由Agent说明不能等待下一简报的理由，站内准确一次；同一事项当前视图合并、多次原始事实保留。
- [x] N04 准确决策窗口经原生at跟进：提醒/复查/最迟决定/执行期限分别留证；到期不等于提醒/已读/采纳。Agent核对后决定是否站内提醒，无固定循环催批，未回复不阻塞独立研究。
- [x] N05 调度creating/原生ID/回执/UNKNOWN、资格、暂停恢复结束与冷重开保持准确；无自建计时器、原生调度重入或未知副作用盲重发；旧摘要不绕过撤权。
- [x] N06 原工作台首页重要变化、委托进展及待决提醒接真实投影，按需阅读，无新增导航/表单/签收或技术配置。准确依据/待决入口、跨刷新状态保留。
- [x] N07 模块/HTTP/原生会话公开接缝的适用TDD、官方SDK合成实际唤醒/持久化/浏览器检查、完整适用回归及固定候选的非作者复核；原FAIL/UNKNOWN/NOT_RUN保留。R2完整检查与R3准确UI影响映射、实际结果和范围见results；不代表完整产品验收、CI或发布。

实现完成逐项标记并在results链接实际证据。测试接缝是用户已要求的业务持久化/Host HTTP/Agent工具/原生Schedule和工作台；不增加对分析内部步骤的约束。

## 契约、职责与最简路径

Host保存owner/委托/目标与来源资格、准确版本、简报偏好、调度意图和已知ID及本地投递事实。Agent自主判断同一问题关系、重要变化、摘要内容、是否需要经营者取舍及到期后的后续研究。NotificationStore不是第二套工单或Runtime，通知可见不表示已读或选择。

`NativeResearchPort v0.1`原接口/owner/profile不变。原生weekly使用time/time_zone/ISO weekdays；决策复查用at，目标为本委托主Session。SDK只有schedule来源和Session resolver，不能据prompt推测调用权威；主步骤根据持久化的due业务工作决定准入，避免成果观察waiting吞掉应处理的简报/窗口，同时不令待决阻塞独立研究。公开SDK没有业务创建幂等键，因而自有映射先提交creating、保存准确原生回执；未知不新建替代或手动run。resolver只等待来源扫描/持久接收，不等待会重入Schedule的协调。

同一经营者跨委托先合并展示各自当前合格简报/事项，不把其他委托正文塞入某个Agent会话或新建全局分析Runtime。提醒收件为当前owner，channel仅workbench，外发出口不变。旧成果/待决/摘要失去当前资格时，只给安全元数据，原件留存但不回放派生正文。

最简使用路径保持已确认Demo：首页看工作日简报和重要变化→进入对应委托→准确方案依据/待决→必要时明确回应。没有变化默认不增加提醒，减少重复打开/审批。既有UI布局/导航/操作不变，仅把占位内容接真实投影，沿用已确认Demo，不新增审批关卡。

允许改动src/notifications.ts、src/notification-schedules.ts、src/research.ts、src/server.ts、src/web/app.js、runtime/plugin.ts、对应test/runtime工程探针/scripts、package检查入口及本批docs/openspec。不得改SDK、锁、凭据/计算/出口权限或其他既有WIP。

## 四原则前置核对

Host仅治理环境、资格与事实；Agent决定业务内容/合并/提醒必要性；复用官方Engine/Agent/Session/Schedule的时间与投递/恢复，不增加计时器或模型循环；负责人按需阅读和做必要取舍，不逐条签收、不维护技术配置。
