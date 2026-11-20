# 本地开发入口

当前交付是首个真实持久委托切片，运行方案与完整首版规格不变。正式 Agent 研究、企业来源、Call、计算隔离及生产入口尚未接通；页面明确等待运行资格，不带原型研究或虚构成果。

## 启动与检查

使用 Node >=24.9.0；本轮实际验证 Node 24.21.0。开发依赖精确版本与完整性在根锁文件中，安装须有适用授权。本轮用户已单独批准项目私有安装／构建。

```sh
npm ci --ignore-scripts
npm run check
npm start
```

已有agent-browser／浏览器时可运行`npm run check:ui`，它新建私有合成资料库验证周期刷新后的键盘焦点，不连接现有工作台或业务数据。已有获批官方SDK私有安装时可运行`npm run check:sdk`，详见[最小SDK工程检查](../scripts/sdk/README.md)。两项都不会安装工具／依赖；自有单元检查、真实浏览器和SDK工程检查分别报告。

默认地址为 `http://127.0.0.1:8766`。入口固定绑定 loopback，不支持直接开放到局域网或公网。管理员可用 `SENTISCOPE_PORT` 和 `SENTISCOPE_DATA_DIR` 指定端口和私有数据目录。首次建库、目标版本、控制回执、补充记录都保存在该目录的 `business.sqlite`，默认 `.local/product/`；刷新或关闭浏览器不清除它们。

本地工程 owner 由 Host 配置绑定，默认 `local-enterprise`／`local-operator`，可由管理员通过 `SENTISCOPE_ENTERPRISE_ID`／`SENTISCOPE_PRINCIPAL_ID` 明确设置。它们不是企业登录或SSO身份；浏览器不能自行提交或替换 owner。当前同源／Host／请求体约束只保护本机开发入口，不代替生产认证、HTTPS、OS用户隔离或完整资料出口控制。

当前 `npm start` 没有 Agent／Session／计算启动实现。暂停、结束对这个事实核对后保存匹配回执；恢复因研究运行能力未接通而返回已暂停并说明原因，不假称开始研究。控制投递意图与业务命令同事务，提交后才调用受限端口；已派发但回执未知的请求重开后保持UNKNOWN，不自动重放。一个业务库只允许一个存活 Host 执行对账。

## 工程状态

- 已实现：持久委托、原始目标／修订、owner与幂等、生命周期意图／匹配回执、补充记录、真实HTTP／获批工作台、明确空态和未接通状态。
- SDK安装及最小官方消费核验与产品运行分开，见[SDK分项记录](SDK_E1_实际消费核验_v0.1.md)。官方SDK仍保持原实现；该独立核验不将研究接通到本地工作台。
- 未完成：官方Engine与业务SQLite、真实会话／资料工具、原生调度的委托授权、持续研究、方案／结果／学习、实际计算与出口隔离、生产认证／部署。Call接缝继续后排；完整首版相关能力不因本切片存在而算通过。

CI逐字节复用核对到的OptraCall单`check` job，运行根项目锁定依赖的安装、`npm run check`及`npm audit --audit-level=high`。本地检查不是GitHub CI PASS；本轮未推送或合并，也未部署。SDK私有核验的原包FAIL与未运行项单列，不能由自有测试全绿抹去。

## 后续官方运行入口

原离线入口和历史验证保留。现可用 `npm run start:runtime` 启动项目私有的官方 minimal Harness Host（默认无模型、无来源），与 `npm start` 分开；端口冲突时指定私有 Host JSON 中的 port。准确版本、来源权限、会话与工单边界、检查命令及未完成项见[持续研究接线记录](Engine_Harness_持续研究接线_v0.1.md)。不自动接管或迁移正在使用的旧数据目录。

## Host运行控制接缝

真实Provider调用默认未启用，缺预算或出口资格不派发；计算按用户选择保持关闭，无Host执行回退。Host可一次配置resourceDefaults，为新委托分配默认资源而不重置旧账。凭据只用官方项目私有stored-record与非敏感Ref，不把原key写Host JSON。接口、限制与工程验证见[本轮接线记录](Host_运行控制接缝_v0.1.md)。

## 版本化交付与自主跟进

判断/方案可由Agent发布不可变版本，并在当前资格下准确读回；观察与复查由Agent安排，复用原生Schedule。`npm run check:artifact-followup`使用独立官方SDK合成路径，验证到期、事件、重开、撤权与迟到。详细合同及跨epoch旧正文边界见[接线记录](版本化研究交付与自主跟进_v0.1.md)。本批仍无真实模型、企业资料、计算执行或Call接入。
