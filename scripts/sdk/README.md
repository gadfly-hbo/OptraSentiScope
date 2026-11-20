# 官方 SDK 最小工程检查

从仓库根目录执行：

```sh
node scripts/sdk/verify.mjs
```

可指定既有 SDK 根和一个**尚不存在**的项目私有输出目录：

```sh
node scripts/sdk/verify.mjs --sdk-root .local/official-sdk --output .local/sdk-checks/review-run
```

运行器只使用已批准并安装／构建的组件：Harness `0.2.2-rc.3`、superagent 完整官方源码 `8c32a9dc5d72c033816c6a8110b37f40cf94fba4` 及原 pnpm `11.7.0`。缺失、错版或源码变动会明确失败；不会联网、安装、重新构建、修改 SDK、切换全局工具链或自动降级。SDK 根和输出必须在本项目 `.local/` 下；已有输出拒绝覆盖。

运行器将自有 probe 复制到新私有目录，为消费者与测试 profile 直接链接同一完整 superagent 目录，通过官方 CLI／profile 解析启动检查。没有自定义 loader，不深导 core。输出包含原始 stdout／stderr、进程退出码、结果、配置和源身份；首次原生进程建立历史和禁用的 Schedule，第二个全新进程冷回读同一数据。检查 profile 只包含所需官方服务和自有 probe，未激活原 superagent 应用、Provider、凭据、会话日志上传或文件／shell 工具。测试资料仅为合成文本。

检查范围：

- 原公开根与 Engine／ports 最小行为、重复事件不重复建工单。
- Cordis、Agent、Session、LLM 的 Host 模块解析；Schemastery 同一版本／包目录及公开 Schema 兼容。其官方 ESM／CJS 条件导出不同，不能称为同一构造器或 namespace。
- 真实 idle Agent 的创建、setup commit、inject、Session flush／reader、取消／whenIdle／dispose／恢复。
- 原生 Schedule 创建后禁用，同进程及新 Host 进程持久回读。

通过只说明这些最小、idle 和禁用 Schedule 路径有效。它不证明产品已集成 SDK、发生自主研究、活动 turn 已安全取消、子工作已 drain、Schedule 已真实到期投递或业务事务、隔离／凭据／出口控制已验证。原生收件、读取、执行和业务完成分别判断。

初次 E1 的官方 superagent `pnpm run check` 保留 **FAIL（1196/1197）**：原应用 Git 环境测试期待英文诊断，本机返回中文同义诊断。官方源码、测试和断言没有修改；单独官方 build 与本目录小路径通过不把该 FAIL 改写为全绿。本运行器不重跑原全量 suite 或已有的全包完整性核验，安装／构建身份也应由相应采用证据另行证明。

原始 E1 证据保留在本地 `general-build-v01-20261116/sdk-intake/` 归档，本检查不会覆盖它。
