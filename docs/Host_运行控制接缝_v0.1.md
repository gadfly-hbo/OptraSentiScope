# Host 运行控制接缝 v0.1

2026-11-17，承接已确认搭建规格的R03–R05、AC04/AC08。本轮由用户明确授权实施；另明确选择“先完成接缝，计算保持关闭”。这份记录是实际接线与验证范围，不替代完整首版、生产部署或真实模型验收。

## 1. R2交付状态

先核对前一切片102份当前文件与R2原件一致、manifest SHA匹配非作者报告，再同步结果索引及DELIVERY-STATUS。采用原非作者的 `R2-REVIEW-ADDENDUM.md/JSON`，结论PASS_LIMITED_SCOPE（E01–E07），不等于完整首版。原等待状态另存本轮证据根 `R2-DELIVERY-STATUS-before.json`；R1/R2原件、原报告、失败和NOT_RUN不覆盖。活工作区继续开发后的新身份由本轮候选另行固定，不用旧R2冒充新实现已复核。

## 2. 官方复用和自有职责

| 对象 | 实际接线 |
| --- | --- |
| 凭据存储 | 官方 `@deepseek-ai/dsh-credentials` / `credentials-local` 0.2.2-rc.3 stored-record API；原子写/跨进程锁及持久化由官方持有 |
| 模型边界 | 官方 `llm/stream` waterfall，覆盖每个stream调度及原生重试；不改冻结GenerateOptions、不另写模型循环/重试 |
| 计量 | 官方TokenUsage；输入/缓存分项保留，reasoning是output子集，不重复加 |
| 时限/停止 | 官方 `dsh-timeout.deadline` 与Agent hook cancel/whenIdle/持久化；只收到取消信号不记已停止 |
| 自有Host控制 | SQLite中非敏感授权Ref、预算预约/结算/UNKNOWN、出口准入与状态投影；没有自建Secret Store |
| 计算 | 已建立关闭的ComputePort；当前不注册Host fs/shell/terminal/jobs/通用网络工具，不回落local执行 |

精确组件版本、superagent固定提交及原锁延续前一切片。新增消费的3个官方包共44文件与既有官方包逐文件清单比对通过，类型/入口哈希纳入准备核验。没有SDK补丁、fork、内部子路径导入、加载替换或版本升级。

## 3. 凭据合同

`HostCredentials`管理owner＋delegation＋provider＋purpose＋ref/revision授权；业务库只存非敏感映射。每次调用准确 `readRecord`；不调用 `resolve/unset` 的环境/.env回退，不把删除或损坏文件当作撤权证明。

`describe`只返回ref/revision/status；`assertAuthorized`只查当前资格；`use`将secret交给受信Host transport回调、丢弃其返回值，仅给固定安全回执。错误code/message固定，不透传原始异常、cause或masked内容。撤权/修订中止匹配在途能力；`rotate`复用官方modifyRecord，下次使用读新值；轮换结果不明不能盲重试。撤业务授权不删除可能共享的官方record。

凭据管理不注册Agent/浏览器工具。生产profile显式加载项目私有 `data/private/credentials.yaml`，不继承个人vault；启动环境仅传必要非敏感变量。原始key不进入Host JSON、提示词、模型请求、工具结果、业务SQLite、遥测或计算环境。必要原生历史留在受控本地；真实Provider认证头与线路尚未接入/验证。

## 4. 委托预算与原生请求

`BudgetStore`按委托共享主/worker预算，维度为请求次数、预授权输出token、计算毫秒及expiresAt。每次实际stream调度前同步事务预约，再记dispatch；不足不调用Adapter。并发连接不能超卖。预算配置修订不重置used/held，暂停/恢复/重启不清账。

正常有权威用量时结实际output并归还差额；没有usage/请求结果未确认保留全额UNKNOWN，占用不释放、不重新派发。同一请求/回执幂等，冲突拒绝。只有明确未派发才可释放。已报告超额保留原actual，停止共享委托不再获准的活动请求；不改写原超额来使检查通过。

最后一份合法预约仍可完成，不因remaining变0就取消已获准的工作。预算修订缩短未来截止会重新arm官方deadline；延长配置不会延长既有调用原先的截止。到时通过原生hook取消，不用Promise.race冒充停止；不合作的Provider只能保留未确认。平台支持的最长单次deadline为2147483647ms，超长配置在派发前拒绝，不静默截短再谎报真正到期。

撤权/暂停之后业务输出停止，但迟到的权威usage仍只结原预约；不会据此恢复业务资格。错误终止chunk也须经过安全failure投影：保留官方code及安全的状态/重试数值，去掉未可信message/requestId等诊断值，避免进入原生JSONL。

这是技术资源控制：没有精确输入token或金额硬上限声明；请求次数指SDK stream调度，不等于网络包数，SDK费用估计不代表供应商账单。预算耗尽也不代表研究结论成立。

## 5. 计算与四类出口

当前机器无获准容器/VM运行时；用户明确选择关闭。`ComputePort.status/run/cancel`核绑定并给出unavailable/not-dispatched事实，run永不创建进程、读写Host目录或连接网络。Agent可以看到计算缺口，不会拿一个local Node/Python进程或SandboxMode当隔离替身。**真实进程/网络/资源隔离仍NOT_RUN，不能记完整计算环境已完成。**

模型出口必须匹配精确provider/model、maxTokens及当前RunBinding/来源资格；历史和准确引用亦重验。本轮只通过受信测试代码显式注册本地合成Adapter，生产JSON无“本地模型”或真实网络启用开关；真实Provider不注册，默认不派发。

外部研究/连接器、提醒/导出、遥测/备份均未启用发送能力；工作台和必要本地存储保持原有owner范围。没有额外会话日志上传bundle。出口授权账本不等于OS网络防火墙，不能据此声称验证了外部端点或企业网络。

## 6. 用户操作和默认策略

Host管理员可一次设置 `resourceDefaults`：新委托自动取得默认预算/模型出口/凭据Ref映射；已有授权、撤权与累计用量不覆盖。负责人仍只表达目标和必要边界，无须填写委托ID、维护资源表或逐次批准普通读取。已知资源缺口和UNKNOWN按不同事实展示，未知停止状态优先于“等待资源”。

公开工作台仍原六页签；在原“运行与接收记录”折叠区展示预算已用/预约/未知及计算关闭，不新增凭据表单或机器配置流程。所有数值仅资源状态，不推定实际费用、方案采纳或经营效果。

## 7. 工程检查与保留项

```sh
npm run check                # 类型/永久回归/边界/原生/持续研究/冷恢复/Host controls真实SDK工程链
npm run check:host-controls  # 独立私有profile，显式本地合成Provider/凭据，禁止真实模型/资料
npm run check:ui
```

来源、命令、退出、候选身份及非作者复核见 `openspec/changes/host-controls-v01/results.md`。原始证据根 `.local/archives/host-controls-v01-20261117/`，原生探针另存 `.local/host-controls-checks/`；测试与独立证据不相互冒充。

本轮修正并保留初始失败：迟到usage丢计、活动截止修订未重arm、已知共享超额未停其他流、SDK finish错误消息泄露合成标记、UNKNOWN被等待状态遮盖。另记录脚本编辑/fixture错误，不伪称产品行为RED。流式日志仍增量追加，资源守卫用标量资格视图，不逐token展开整段业务历史。

完整fresh网络安装、Linux/Node25.9实际GitHub CI、企业登录/管理面、真实凭据/模型/企业资料、容器/VM隔离、更多外部来源、Call只读接缝、完整方案/决策/经营结果/学习、具体POC、部署和Git交付均未进行或仍未完成。前一官方完整check1196/1197 FAIL、早期Store RED过程缺口及所有历史NOT_RUN原样保留。

四原则实证：Host管资源与资格，Agent管研究方法；复用官方credential/stream/deadline/cancel，不改SDK或造第二Runtime；默认策略省去逐委托人工配置；关闭的计算和未接通的出口如实展示，不以关闭能力冒充完整首版验收。
