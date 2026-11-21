# 本地开发入口

当前交付进入 P03–P05 合成工程阶段：正常工作台可建立持续委托，官方 Engine/Harness 与业务 SQLite 已接通，共享合成来源、生命周期摘要、本机登录/角色、备份恢复和长流写入已有隔离证据。真实企业来源、真实模型质量、Call、计算隔离及生产入口仍未接通；页面不把合成证据写成真实经营成果。

## 启动与检查

使用 Node >=24.9.0；本轮实际验证 Node 24.21.0。开发依赖精确版本与完整性在根锁文件中，安装须有适用授权。本轮用户已单独批准项目私有安装／构建。

```sh
npm ci --ignore-scripts
npm run check
npm start
```

已有agent-browser／浏览器时可运行`npm run check:ui`、`check:general-ui`、`check:lifecycle-ui`、`check:revocation-ui`、`check:auth-ui`等浏览器检查，它们新建私有合成资料库，不连接现有工作台或业务数据。已有获批官方SDK私有安装时可运行`npm run check:sdk`、`check:sources`、`check:recovery`、`check:legacy-recovery`、`check:longstream`，详见[最小SDK工程检查](../scripts/sdk/README.md)与[P03–P05结果记录](../openspec/changes/p03-p05-sustained-sources/results.md)。这些命令不会安装工具／依赖；自有单元检查、真实浏览器和SDK工程检查分别报告。

默认地址为 `http://127.0.0.1:8766`。入口固定绑定 loopback，不支持直接开放到局域网或公网。管理员可用 `SENTISCOPE_PORT` 和 `SENTISCOPE_DATA_DIR` 指定端口和私有数据目录。首次建库、目标版本、控制回执、补充记录都保存在该目录的 `business.sqlite`，默认 `.local/product/`；刷新或关闭浏览器不清除它们。

本机工作台现在要求 operator／maintainer 两个角色令牌哈希。`npm start` 读取 `SENTISCOPE_OPERATOR_TOKEN_HASH` 与 `SENTISCOPE_MAINTAINER_TOKEN_HASH`；`npm run start:runtime` 在私有 Host JSON 的 `auth` 中读取同名字段。Host 只保存 SHA256，浏览器登录后使用 HttpOnly／SameSite=Strict 会话 cookie。owner 仍由 Host 配置绑定，默认 `local-enterprise`／`local-operator`，可由 `SENTISCOPE_ENTERPRISE_ID`／`SENTISCOPE_PRINCIPAL_ID` 或 Host JSON 设置；浏览器不能提交或替换 owner／role。这不是生产 SSO、HTTPS 或 OS 用户隔离。

`npm start` 是离线持久工作台，不启动官方研究 Runtime；`npm run start:runtime` 才启动官方 Harness/Engine。暂停、结束先保存业务意图并核对原生停止回执；恢复/结束摘要只汇总已保存事实。已派发但回执未知的请求重开后保持 UNKNOWN，不自动重放。一个业务库只允许一个存活 Host 执行对账。

## 工程状态

- 已实现：持久委托、原始目标／修订、owner与幂等、本机登录/角色、生命周期意图／匹配回执、恢复/结束事实摘要、补充记录、真实HTTP／获批工作台、共享合成来源、官方 Engine/Harness 合成研究链、备份恢复与长流写入计量。
- SDK安装及最小官方消费核验与产品运行分开，见[SDK分项记录](SDK_E1_实际消费核验_v0.1.md)。官方SDK仍保持原实现；合成 Provider 证据不等于真实模型研究质量。
- 未完成：真实企业来源与更新/撤权时限、真实模型质量、Call接缝、实际计算与出口隔离、生产认证／部署、经营 POC 和完整首版验收。

CI逐字节复用核对到的OptraCall单`check` job，运行根项目锁定依赖的安装、`npm run check`及`npm audit --audit-level=high`。本地检查不是GitHub CI PASS；交付时分别核对实际 PR head 与合并后 main CI。SDK私有核验的原包FAIL与未运行项单列，不能由自有测试全绿抹去。

## 后续官方运行入口

原离线入口和历史验证保留。现可用 `npm run start:runtime` 启动项目私有的官方 minimal Harness Host（默认无模型、无来源），与 `npm start` 分开；端口冲突时指定私有 Host JSON 中的 port。准确版本、来源权限、会话与工单边界、检查命令及未完成项见[持续研究接线记录](Engine_Harness_持续研究接线_v0.1.md)。不自动接管或迁移正在使用的旧数据目录。

## Host运行控制接缝

真实Provider调用默认未启用，缺预算或出口资格不派发；计算按用户选择保持关闭，无Host执行回退。Host可一次配置resourceDefaults，为新委托分配默认资源而不重置旧账。凭据只用官方项目私有stored-record与非敏感Ref，不把原key写Host JSON。接口、限制与工程验证见[本轮接线记录](Host_运行控制接缝_v0.1.md)。

本机合成试用还可用 `resourceDefaults.sources={goalIncludes,grants}` 一次预授权来源：只有 operator 实际插入新委托且初始目标包含固定短语时才自动取得独立 grant，范围不匹配保持零授权，逐 ID 显式配置优先。目标调整和创建幂等读回不新增默认授权；逐项默认来源身份持久化，当前目标或重启策略失配时仍有效的默认项按单调修订撤回，部分撤权与重启也不使它们复活。它不开放浏览器目录/角色输入。`npm run check:synthetic-trial` 覆盖建单、双委托、范围不匹配、单方撤权、重启、自然预算到期和插件未就绪；有 agent-browser 时可另跑 `npm run check:independent-ui` 做真实浏览器和隔离服务重启演练。

## 版本化交付与自主跟进

判断/方案可由Agent发布不可变版本，并在当前资格下准确读回；观察与复查由Agent安排，复用原生Schedule。`npm run check:artifact-followup`使用独立官方SDK合成路径，验证到期、事件、重开、撤权与迟到。详细合同及跨epoch旧正文边界见[接线记录](版本化研究交付与自主跟进_v0.1.md)。本批仍无真实模型、企业资料、计算执行或Call接入。
