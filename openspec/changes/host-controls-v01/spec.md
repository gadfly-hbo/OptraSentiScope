# Host 凭据、预算、计算与资料出口接缝 v0.1

日期2026-11-17。输入为已确认《通用首版搭建规格 v0.1》§3–6、AC04/AC08、首发运行方案R03–R05，以及本轮明确开发指令。用户追加选择：**先完成接缝，计算保持关闭**。原始指令/选择及开工前102份可见文件保存于 `.local/archives/host-controls-v01-20261117/`。

## 本轮目标与允许范围

H01 同步R2非作者复核、交付状态与索引，保留原件、失败和NOT_RUN，不把限切片通过变完整首版。
H02 Host凭据授权Ref与官方stored-record解析/轮换接通；每次重解析，不用ambient fallback；Agent/HTTP/计算/日志均无原始secret。异步撤权使在途能力失效；错误仅安全code。
H03 委托预算同SQLite持久预约/结算，主worker共享；官方llm/stream每次实际调用/重试前预约；输出上限和请求次数为技术资源约束，不规定研究方法。未知保留占用，暂停/重启不清账，迟到真实用量只结旧预约，不恢复业务资格。未配置则拒实际调用。
H04 统一计算接缝与准确状态建立。本机无获准container/VM，按用户选择保持计算关闭；所有文件/shell/terminal/jobs执行入口不挂Host local provider，不以SandboxMode/0600假报已隔离。没有真实计算隔离PASS。
H05 模型出口精确route+当前输入资格控制，研究/连接器、提醒/导出、日志/备份出口默认不扩大；不额外加载日志上传/通用联网/Host文件工具。既有原生JSONL是受控本地必要历史，不冒充脱敏遥测。
H06 真实官方SDK工程路径用显式本地合成Provider和合成凭据验证，覆盖取消、撤权、迟到、预算/未知及持久重开；无真实模型、企业资料、Call、POC、部署或Git交付。

允许修改自有src/runtime/test/scripts、依赖公开peer/类型声明（不安装升级）、实施/结果文档。官方Harness0.2.2-rc.3与superagent固定提交/原锁原实现只读。基线分支codex/general-v01-build，main fetch核对无领先/落后；既有WIP不覆盖。

## 已确认测试边界与接入

沿用获批spec的RunBinding/SourceAccess/EvidenceEligibility、资源/取消及R03–R05/AC04/AC08边界。HostCredentials和BudgetStore是这些自有业务接缝的具体实现；NativeResearchPort v0.1以兼容可选Host hook扩展，SDK原生会话/循环/调度保持唯一权威。owner=(enterpriseId,principalId)，按delegation/goalRevision/epoch/generation资格绑定。SDK公开服务原生使用场景与单测替身证据分开。

Credential stored-record由官方服务持secret和跨进程锁；SentiScope仅存非敏感授权映射。官方resolve/unset有ambient回退，不作为撤权证明。llm/stream是公开每实际调用入口，TokenMeter不是硬费用预算；不声明准确输入token/金额硬上限，输出reasoning为output子集不重复加。未知usage保留预约。

计算仅提供关闭的ComputePort；未来统一执行world合同不等于已有container实现。本轮不安装运行时、不启动VM/远端、不执行任意Agent代码；允许隔离的纯合成接口测试。UI沿用已确认工作台，在原状态/技术详情区展示限制，不新增表单或导航，故无新Demo门槛。

## 四原则前置核对

Host管授权、预算/凭据/出口、停止事实；Agent仍自行选择问题/方法/收敛。复用官方Credential records、llm/stream/usage、Agent取消/持久化，不新造模型循环、Secret Store或计时器。普通读取/研究不逐次审批，不要求负责人填写机器身份；尚无计算载体为一次Host资源条件，明确关闭而不回落宿主机。

## 阶段任务

- [x] 核对工作区/main、保存102份原件和本轮指令；R2报告/索引同步（原等待状态保留）。
- [x] 只读核对官方组件和本机载体；用户确认计算关闭。
- [x] H02 凭据端口及真实官方stored-record工程验证。
- [x] H03 原生每次调用预算与持久化/未知/取消。
- [x] H04 计算关闭接缝，无Host执行入口；真实隔离验证仍NOT_RUN。
- [x] H05 模型输入与四类出口准入、默认关闭与错误脱敏。
- [x] 整体接线及当前/第三合成消费者回归、真实SDK工程链、工作台状态检查。
- [x] 固定完整候选并交给非作者独立复核，保留发现/修正/未验证；最终复核结论以results索引指向的原报告为准。

完成指上述接缝与本轮关闭策略可验证；不含真实模型或完整计算隔离部署，不把默认关闭必要能力记成完整首版通过。
