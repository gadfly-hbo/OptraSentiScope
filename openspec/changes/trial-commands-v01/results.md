# 本机一键启动／停止／更新命令｜结果记录

2026-11-22 开工。当前为实施中记录。

## 基线与上游核对

- 本产品开工 HEAD `e542721b00e6a0da6b95f94e8a721211193253d4`，`main` 干净；原 `8766` 服务仍由 launchd 运行合并版产品代码，未被本任务停止。
- 上游 OptraCall 只读核对 Mac mini `~/DevWorkSpace/OptraCall` HEAD `8ad8564ca8d47ff27bd0b335456c99bfa1706f94`：
  - 根目录 `启动/停止/更新并启动 OptraCall.command` 分别调用 `scripts/trial-command.sh start|stop|update`。
  - `package.json` 对应 `npm start`、`npm stop`、`npm run update:trial`。
  - launcher 具备操作锁、安全控制文件、实例身份、端口和健康检查；更新要求干净 main、官方 origin、无 Git 操作、可快进、目标 main push CI 成功、锁文件安装和构建后启动。
  - 上游 README/macbook 文档明确三个入口的用户语义；未修改上游任何文件。

## 实现记录

- 新增本产品 `scripts/trial-launcher.mjs`、`scripts/trial-update.mjs`、`scripts/trial-command.sh` 和根目录三个双击 command。
- `scripts/runtime/start.mjs` 兼容新增非敏感 `--instance-id`，仅用于 launcher 的进程命令身份核验，不进入 Host 配置。
- npm 入口：`npm start` 一键启动、`npm stop` 一键停止、`npm run update:trial` 更新并启动；原离线工作台改为 `npm run start:offline`，`start:runtime` 不变。
- start 使用现有私有 Host JSON、runtime root 和官方 SDK，不改配置、不复制数据；已有同身份实例复用并打开浏览器；陌生端口占用 fail-closed。
- stop 只停止记录中且命令身份匹配的本产品进程，超时保留控制记录和日志。
- update 停止后核对干净 `main`、官方 origin、无未完成 Git 操作、目标只可快进、main push `Check` CI 成功，再 `npm ci --ignore-scripts` 与 `npm run setup:sdk`，最后用新 launcher 启动。
- 控制记录、操作锁和日志保存在 Host 配置旁的私有 `launcher-state/`，权限 0700/0600；令牌不进入输出。

## 验证状态

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| launcher 单元回归 | PASS | `.local/trial-command-checks/unit-run-5.log` 9/9 |
| updater 单元回归 | PASS | 同上：CI 成功快进、脏工作区、CI 未过、本地领先/来源不匹配 |
| 真实产品 start/stop | PASS | `.local/trial-command-checks/product-run/result.json`，实际官方 SDK + 临时私有配置 + 动态端口 |
| 默认双击入口 fail-closed | PASS | `default-stop-before-switch.json` 为 not-running；`default-start-port-in-use.json` 拒绝接管当前 launchd 8766，旧进程 PID 保持不变 |
| 全量单元回归 | PASS | `.local/trial-command-checks/full-unit-run-1.log` 341/341 |
| 完整 `npm run check`（LOW 修复前） | PASS | `.local/trial-command-checks/full-check-1.log`：341/341、runtime preparation、公开 SDK 边界及 15 条官方/工程链全部通过 |
| 完整 `npm run check`（LOW 修复后） | PASS | `.local/trial-command-checks/full-check-2.log`：343/343、runtime preparation、公开 SDK 边界及 15 条官方/工程链全部通过 |
| 完整 `npm run check`（锁窗口修复后） | PASS | `.local/trial-command-checks/full-check-3.log`：344/344、runtime preparation、公开 SDK 边界及 15 条官方/工程链全部通过 |
| 依赖审计 | PASS | `npm audit --audit-level=high` 0 vulnerabilities；本候选未新增 npm 依赖 |
| 独立复核 | PASS_WITH_FINDINGS（仅余 INFO） | R1/R2 发现全部关闭；R3 终验 N1 关闭且无低/中/高问题 |
| Git/CI/合并/切换原服务 | PASS | PR #13 两次 CI PASS 后合并；launchd 已按授权切到 launcher，备份与读回留证 |

## 独立复核 R1 与 LOW 修复

- 非作者复核：`.local/independent/trial-commands-r1/REPORT.md`，**PASS_WITH_FINDINGS**，无 HIGH/MEDIUM。start/stop、安全边界、更新门控、测试真实性及四原则均通过；真实 origin 端到端更新 NOT_RUN。
- LOW 修复：
  - root 不匹配显式 `another_installation`；其它控制字段不匹配仍 fail-closed `unsafe_control_file`。
  - 更新前仍在运行返回 `app_running`，不再复用启动失败文案。
  - updater 导出逐项用户可读错误文案；CLI 保留具体失败原因。`updateAndStartTrial` 写 0600 更新日志，记录 started/finished/failed 及更新后启动失败 stderr；输出不可核对单独报 `updated_start_output_invalid`。
  - operation.lock 改为同目录临时文件写入后 `link` 原子上锁，消除空/半写锁崩溃窗口，临时文件总是清理。
- 新增/更新回归：`.local/trial-command-checks/low-fix-unit-1.log` 11/11；真实产品 start/stop 复跑 `.local/trial-command-checks/product-run/result.json` PASS。
- R2 独立重验：`.local/independent/trial-commands-r2/REPORT.md`，原 4 项 LOW 全部 RESOLVED；压测发现新低危 N1：`link` 成功到清理临时文件之间锁 `nlink=2`，并发者约 0.125% 被保守误报 `unsafe_control_file`。
- N1 修复：`readControl` 仅在 operation.lock 语义下允许 `nlink<=2`，instance/control 仍拒绝硬链接；update 失败日志改为 best-effort，不掩盖原错误；更新后启动子进程加 120 秒超时。新增 24 并发×3 轮锁压测，`.local/trial-command-checks/n1-fix-unit-1.log` 12/12。
- R3 独立终验：`.local/independent/trial-commands-r3/REPORT.md`，N1 与两条 INFO 修复均 RESOLVED；3000 次锁竞争 0 错误、0 残留，instance 硬链接仍 fail-closed，12/12 测试独立复跑。仅余 INFO：极端 SIGKILL 可留下 `.operation.lock-*` 临时文件（不阻塞且可人工保留反馈）、operation.lock 的 nlink=2 容忍未加 mtime 门控（无实际安全后果）。四原则通过。

## Git、CI 与本机切换回执

- 工作分支 `qoder/trial-commands` 提交 `dd94ade9105aaab299e1d10d0ad1aba396d0427f`；集中 PR #13 https://github.com/gadfly-hbo/OptraSentiScope/pull/13 。实际 head CI run `44975143295` PASS（check 5m28s），squash 合并提交 `bd3fc692b86bae0d2159afdc57a8af1fb949a0f8`（2026-11-22T02:20:05Z）。合并后 main CI run `44975601736` PASS，本地 `main` 已安全快进。
- 切换前备份：`.local/service-trial-backup-20261122-022634-launcher-switch/`。runtime 备份 111 个文件校验 `ok`，保留原 host/plist/proof/凭据/runtime/合成来源与 switch-context；上一轮恢复工作树 `.local/service-trial-recovery-44760bd` 仍保留。
- 已按授权 `launchctl bootout gui/501/dev.optrasentiscope.trial`，确认 8766 释放后用根目录“启动 OptraSentiScope.command”接管；随后实际执行“停止→启动”循环。当前 wrapper PID `34472`、官方 Harness listener PID `34483`，launchd job 不再安装，健康 ok。证据：`.local/trial-command-checks/switch-start-1.json`、`switch-stop-1.json`、`switch-start-2.json`、`switch-health-*.json` 和更新后的 `.local/service-trial-20261120/service-proof.json`。
- 数据读回：11 个既有委托保留；独立验收委托 `3455ca61-07d9-4250-93ad-40778ff24afa` 来源 ready、v2 报告仍可读。未改私有 Host 配置和凭据；真实模型/真实来源/Call 仍 NOT_RUN。

## RED 与过程失败留痕

- 首轮 launcher 回归 1/9：夹具目录未建、Node 版本把 `24.22` 与小数 `24.9` 误比、同步 fail 断言和可执行位断言问题；已修正测试并改为 major/minor 版本判断。
- 首轮真实产品启动 FAIL：launcher 以 `--config=value` 形式调用，而现有 `start.mjs` 契约是 flag 与值分离，日志 `UNKNOWN_OPTION_OR_MISSING_VALUE`。修正为分离参数后启动成功；该产品 RED 已由 start-config 增加 `--instance-id` 正负例和真实路径复验覆盖。
- 第二轮真实路径检查脚本自身把 URL 拼成 `//api/health` 得到 404；修正检查脚本后 PASS，产品未被改动。
