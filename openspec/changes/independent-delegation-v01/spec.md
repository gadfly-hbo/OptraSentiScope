# 经营者独立持续委托与研究判断案例包

2026-11-21 · 分支 `qoder/independent-delegation` · 开工 HEAD `a4c2da208df0a110e89dfa7dc1d59581eb2b5b9b`。派单交付基线为 `6a01fd1`，其后的 HEAD 只增加同版派单与产品讨论稿。依据为[产品讨论稿](../../../docs/经营者独立完成持续委托_产品讨论稿.md)、[开发派单](../../../docs/Qoder_经营者独立持续委托_开发派单.md)及工程规范。全程仅用合成来源与合成 Provider，计算 OFF，真实模型、真实来源和 Call 不在本轮范围。

## 目标与执行清单

- [x] **基线与复现。** 核对 main、工作树、原 `8766` 服务、私有配置和已有数据；从普通经营者入口建单，记录操作者和阻塞。完成条件：实际缺口由真实浏览器与代码共同证明，旧实例和数据未被清理。
- [x] **A1 一次配置，独立建委托。** 维护者在私有 Host 配置一次允许的角色、目标范围和合成来源；经营者一句话建立匹配委托后直接看到来源、首个进展与依据，无逐单绑定、改配置、首次重启或显式研究触发。（主线 AC01）
- [x] **A2 持续跟进与权限独立。** 真实浏览器走通来源更新、判断与依据、暂停、恢复自动核对、工作台重开和隔离服务重启读回；不匹配的新委托不自动获权，两个匹配委托共享来源时单方撤权不影响另一方，失权方正文和历史回放受限。（AC02–AC04、AC08）
- [x] **A3 故障原因与恢复条件。** 隔离制造来源失联、预算自然到期和运行插件未就绪；页面状态与实际来源、预算和适配器行为一致，保留上限、UNKNOWN、取消和历史回执，不自动扩权、续预算或重放未知操作。（U09/U10）
- [x] **B 固定案例包与评阅表。** 交付稳定 ID/版本/可知时间的“初始委托→新证据→反证→后续委托”，分离 Agent 输入、释放顺序和评阅参考；覆盖经验采用/拒用、准确引用、修正理由、关联建议逐项重评、旧版与 UNKNOWN。非作者离线试读，真实模型运行和评分保持“未运行”。
- [x] **候选验证与独立复核。** 先保留产品 RED，再做最小 GREEN；运行完整 `npm run check`、受影响真实浏览器、审计和官方合成链。固定全部变更后由未参与任何候选作者的独立上下文复核规格、标准和四原则，修复后重验。
- [ ] **Git、CI 与本机交付。** 仅在派单有效授权内提交、推送、集中单 PR、核实际 head CI、squash 合并及 main CI；切换原实例前备份数据、配置和恢复点，交回实际版本、入口、人工步骤、逐项证据与未完成项。

## A 的可观察契约与最小接缝

### 建单时来源预授权

复用现有 `resourceDefaults`，新增 Host 私有 `sources` 策略：

```json
{
  "resourceDefaults": {
    "sources": {
      "goalIncludes": "合成来源",
      "grants": [{
        "sourceId": "trial-synthetic",
        "directory": "/private/synthetic-source",
        "grantRevision": 1,
        "enabled": true,
        "cacheBody": true,
        "allowHistorical": true
      }]
    }
  }
}
```

- 普通创建入口已强制 `operator`；协调器方法仍再核角色。只有角色为 operator、初始目标包含固定短语且没有逐 ID 显式 `grants[id]` 时才物化默认授权。固定短语是 Host 的环境准入条件，不是 Agent 业务判断，也不接受正则、目录、owner、Provider 或角色等浏览器输入。
- 默认授权只在 `createWithOutcome.created=true` 的真实新建且 `goalRevision=1` 时按初始目标判定；revision 1 不能代替插入事实，创建幂等读回和既有目标调整都不自动新增权限。当前目标或重启时策略不再匹配时，默认派生授权按单调修订撤回，之后不因目标/短语重新匹配而自动复活。逐 ID 显式配置（包括空数组）优先，不套用默认范围规则。
- 默认 grant 按委托独立命名空间持久化，并在 `source_default_grants` 同事务记录逐项来源身份，在 `source_default_scopes` 记录默认策略使用史。只有未改变的默认项仍匹配当前目标和策略才保留；部分撤权不清空其余默认项的管理身份，手动变更/撤权成为显式事实且不被默认规则重写。失配、旧策略或被移除策略的默认项逐项撤回，手动显式项保留；不因重启、幂等重放、部分撤权、重新匹配或另一委托而复活。无默认使用史的旧路径行为不变。
- 首次 `notifyChanged` 继续进入既有 `scan → Engine → native Agent`，不新增维护者 HTTP 写接口、手工作业、Runtime、Schedule 或队列。

### 运行状态真实性

- 被动预算到期时，即使没有在途请求或持久 block，也从实际 `budget.expired` 投影 `budget_expired`；已有成果与上限不变，恢复需要 Host 管理员明确配置新预算。
- 通过官方 `ctx.llm.listProviders()` 核对所选 Provider 的实际适配器注册。模型名存在但适配器缺失时，全局运行状态为 `unavailable`，委托为 `runtime_plugin_unready`，不打开原生研究资源或发起模型请求；适配器恢复并经既有对账入口核对后才可继续。
- 来源失联沿用现有 `unavailable/restored`、安全索引和补读；UNKNOWN 优先级不被新状态覆盖。启动期产品插件自身失败与“Host 存活、运行适配器未注册”分别记录，不声称浏览器能展示一个未启动的 Host。

## B 的材料契约

固定目录 `docs/poc/conditional-experience-reassessment-v0.1/`：`inputs/` 只含可逐批给 Agent 的材料，`release-plan.json` 定义可见批次，`reference/` 只供评阅。每个时点能看到的资料可复原，晚到反证不得解释早期判断；后续委托同时包含条件匹配的采用与条件不匹配的拒用。

评阅项使用“符合／不符合／证据不足／未运行”，每项列证据要求、通过条件与典型失败，接受有依据的不同结论。运行记录预留 Provider/协议/模型配置、耗时、用量与可核费用；本轮 `real_model_run=NOT_RUN`、`model_quality_scoring=NOT_RUN`。材料试读不等于模型评分或完整 AC07。

## 四原则、接口与 UI 前置检查

- **Host：** 私有来源预授权、owner/角色、资格、预算、插件就绪、取消、UNKNOWN、持久化和状态展示；不替 Agent 决定研究步骤、判断或经验采用。
- **Agent：** 继续经官方 Engine/Harness 自主读取获准资料、决定事件归属、方法、报告、判断修正与经验使用。
- **SDK：** 保持 Harness `0.2.2-rc.3` 与 superagent `8c32a9dc5d72c033816c6a8110b37f40cf94fba4`，只消费公开 `listProviders()` 及既有统一 `NativeResearchPort`；不升级、不改包、不新增内部导入例外或第二套生命周期。
- **减少人的操作：** 删除建单后的逐单绑定、首次重启和显式 sync；维护者一次私有配置和经营者必要登录/目标输入保留，不新增机器身份或普通读取审批。
- **Interface/owner/profile：** 沿用 `NativeResearchPort`/`RunBinding`、固定 Host owner 与 launcher 生成 profile；只兼容扩展 `resourceDefaults` 和业务投影。
- **UI：** 沿用已获批工作台、来源覆盖、暂停/恢复和状态区。新增仅是状态文案与既有字段投影，不变更布局、导航或关键交互，按规范不需新 Demo。基线登录页的 CSP 控制台告警不阻塞本任务，记录为范围外，不顺手重构。

## 允许路径与范围外

允许 `src/`、`runtime/`、`scripts/`、`test/`、根 `package.json`、本 OpenSpec、上述合成案例目录、必要的本地开发文档及 `.local/` 私有证据/试用配置。公开提交不含令牌、会话 cookie、私有业务库或原始日志。

不做真实 Provider/真实来源连接器、真实模型评分、Call、计算开启、生产部署、SDK 升级或完整 AC07 关闭。发现与本验收无关的问题只登记。

## 检查与证据

先以现有 `synthetic-trial-probe` 和新增定向回归证明：手工绑定仍是旧路径、默认策略缺失/不匹配/撤权/插件缺失/自然到期会失败，再实施。权限、运行时和持久化受影响，最终采用完整 `npm run check`，另跑真实浏览器和 `npm audit --audit-level=high`。

原始证据固定于 `.local/independent-delegation-20261121/`，独立复核只读候选并只写 `.local/independent/independent-delegation-*`。结果逐项记 PASS／FAIL／NOT_RUN／UNKNOWN，不用历史 PASS、HTTP 200、脚本存在或材料试读替代本轮真实路径、模型质量或用户产品体验。
