# E1 官方组件实际消费分项记录 v0.1

日期：2026-11-16（Asia/Shanghai）。状态：**分项结果已取得，完整E1和产品运行未验收**。用户已确认spec/UI开发，另明确批准[依赖清单](开发依赖采用清单_v0.1.md)的项目私有安装／构建。未改官方实现、Call、全局环境或在用服务，未使用真实模型／企业资料。

## 来源、安装与构建

Harness为官方`@deepseek-ai/dsh@0.2.2-rc.3`，源码依据`38a6a5c965aa99ab525161efb7cc5cf1fe62fced`；superagent为固定`8c32a9dc5d72c033816c6a8110b37f40cf94fba4`完整源码。私有pnpm为11.7.0，原package和lock保持不变。位置在项目忽略的`.local/official-sdk/`，不由生产源码深导该目录内部模块。

完整原源码216份tracked文件在安装／构建后逐字节一致；Harness安装树409个官方包、75632份regular files与对应registry原tarball及锁内完整性相符。该数字只说明检查范围，不扩大为所有第三方包、所有可选工具或实际服务采用的证明。

## 分项结果

| 核验 | 实际结论 |
| --- | --- |
| 原锁安装、固定Harness和私有工具链 | PASS；不改全局，不改官方peer／loader |
| superagent原`pnpm run check` | **FAIL：1196/1197**。原应用worker Git环境测试期待英文错误，本机Git返回中文诊断；typecheck通过，`&&`后的build未执行 |
| 外层C locale定向核对 | 仍FAIL。原测试构造的Git子进程环境未带该locale变量。失败保留，不改官方测试、Git或断言，也不称其通过 |
| 单独执行原build | PASS；完整原公开根、随包资源及类型产物保留，不冒称原check全绿 |
| 公开根／profile消费 | PASS；真实官方Host经包名根入口加载Engine，不深导core，显式不激活原应用bundle／Loader／apply |
| peer实际身份 | Cordis4.1.0、Agent／Session／LLM rc.3在所测消费者与superagent解析到同一Host模块；Schemastery3.19.0为同包目录，但官方ESM/CJS条件导出实例不同，公开Schema识别／验证可用，不能写成所有构造器同一 |
| 原Engine最小行为 | PASS；合成来源经过receive、evaluate、Assessor端口、decide、Assignment，重复不重建Ticket。用官方MemoryRepositories，不是业务持久事务，也不是Agent业务判断 |
| 原生idle生命周期及JSONL | PASS；真实create/setup commit、inject、flush、公开持久reader、空闲cancel／whenIdle／dispose／resume；无Provider、无模型step |
| 原生Schedule及冷重开 | PASS；创建后立即禁用，新Host进程读回paused任务及准确Session／原消息历史；没有实际到期投递 |

消费者自身与profile都须直接link同一完整superagent目录，只加profile link不足以让消费者裸包名解析。profile只激活获准官方服务和自有工程检查，不照抄原应用部署激活。使用官方`sessionPersistence.open(id,'read')`／reader读取持久历史，不新用已移除或禁止新消费的`Session.events`／同步历史扫描接口。

## 未完成及证据边界

尚未验证官方Engine与自有业务SQLite同事务、恢复report／note／epoch及实际投递对账；活动turn取消、子工作drain、真实到期／重复投递；当前资格与旧上下文、完整生产profile、凭据、计算／进程／网络及四类出口。当前没有把独立probe接成产品自主研究，首个工作台仍明确未接通运行环境。

本地原始证据在`.local/archives/general-build-v01-20261116/sdk-intake/`：`SOURCE-MANIFEST.json`、`INSTALL-AND-BUILD-IDENTITY.json`、`HARNESSSDK-PACKAGE-FILES.json`、`PROFILE-ROOT-PROBE.json`、native两个进程结果、原check失败及commands原始输出。私有profile／probe原件和锁身份另见`E1-PROBE-CANDIDATE.json`。这些本地证据不随Git公开分发。

自有可复用[工程检查脚本](../scripts/sdk/README.md)已入仓，在全新私有目录重跑公开根、首次原生Host和冷重开三个进程，均exit0。该脚本不联网／安装，缺SDK、越界输出或已存在目录明确失败；实际结果位于本地`.local/sdk-checks/public-engineering-check-20261116/`。原先E1失败记录未改。

原先设计PASS、用户UI确认、安装、构建、公开根导入及本记录的分项PASS都不代替完整工程或产品验收。组合未通过关键接缝前，不自动升级／降级、改SDK或用影子Runtime／工单／计时器补齐。
