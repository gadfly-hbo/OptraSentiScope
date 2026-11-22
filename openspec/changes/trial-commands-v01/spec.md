# 本机一键启动／停止／更新命令

2026-11-22 · 分支 `qoder/trial-commands` · 开工 HEAD `e542721b00e6a0da6b95f94e8a721211193253d4`。用户要求对照 OptraCall 的三个一键 command，为 OptraSentiScope 提供同源的一套。上游核对对象为 Mac mini OptraCall `main` HEAD `8ad8564ca8d47ff27bd0b335456c99bfa1706f94`，只读未改。

## 目标与执行清单

- [x] **入口与命令。** 根目录交付 `启动 OptraSentiScope.command`、`停止 OptraSentiScope.command`、`更新并启动 OptraSentiScope.command`；npm 入口为 `npm start`、`npm stop`、`npm run update:trial`。原离线 `npm start` 另名保留。
- [x] **start。** 使用现有私有 Host JSON、数据目录、官方 SDK 与 `scripts/runtime/start.mjs` 启动；操作锁防并发；已有同身份实例复用并打开浏览器；端口被其它服务占用时 fail-closed，不停止陌生进程。
- [x] **stop。** 只停止启动器记录并核验命令身份的本产品进程；等待健康与进程退出；超时保留记录和日志，不扩大杀进程范围。
- [x] **update。** 先确认已停止；要求干净 `main`、官方 origin、无未完成 Git 操作、远端 main 只可快进；目标提交的 main push `Check` CI 成功后才 `npm ci --ignore-scripts`、运行既有 `setup:sdk`，再用新启动器启动。
- [x] **持久与安全。** 配置、业务数据、来源、凭据和日志保留；控制记录/锁/日志在私有 `.local` 且权限受限；不打印令牌；不自动回滚、恢复真实模型、接真实来源或 Call。
- [x] **验证与交付。** 永久回归覆盖 start/stop/update 的正常、并发、端口冲突、脏工作区、非快进、CI 未过和来源不匹配；真实产品路径本机验证；完整检查、独立复核、PR/CI/合并和本机切换按授权执行。

## 上游同源行为与差异

- 同源：三个 Finder 入口只做路径/Node 解析并转入统一 launcher；launcher 有操作锁、实例身份、端口与健康检查；更新检查干净 checkout、官方远端、快进、main CI、安装和构建后启动。
- 差异：本产品 Node 最低 24.9（上游 25）；无前端构建产物，更新用 `npm ci --ignore-scripts` + `npm run setup:sdk`，不做 `npm run build`；运行入口复用现有 `scripts/runtime/start.mjs` 和私有 Host JSON；实例身份通过 wrapper 命令中的 root/config/runtime/sdk/instance-id 核验，健康 API 不新增敏感字段。
- `npm start` 从离线工作台改为一键启动；原离线入口保留为 `npm run start:offline`，`npm run start:runtime` 不变。

## 四原则与边界

- Host 负责命令、配置、进程、端口、锁、更新和日志；Agent 仍经官方 Engine/Harness 自主执行，不新增研究流程或业务判断。
- 复用 OptraCall 已验证的一键命令形态和现有 OptraSentiScope 启动/SDK 准备入口；不改官方 SDK、不建第二 Runtime。
- 人只需要双击或运行三个命令；更新不要求手工 git/npm/服务操作，失败时保留现场并给出安全提示。
- 不做生产部署、真实模型、真实来源、Call、自动安装 Node、自动回滚或跨设备同步。

## 允许路径与检查

允许根目录三个 `.command`、`scripts/trial-command.sh`、`scripts/trial-launcher.mjs`、`scripts/trial-update.mjs`、`scripts/runtime/start.mjs` 的兼容参数、`test/`、根 `package.json`、本 OpenSpec 和本地开发文档；私有配置/证据只写 `.local/`。

检查：launcher/updater 单元与 fixture 回归进入 `npm test`；真实本机产品路径、完整 `npm run check`、审计和独立复核另行执行。证据放 `.local/trial-command-checks/` 与 `.local/independent/trial-commands-*`。
