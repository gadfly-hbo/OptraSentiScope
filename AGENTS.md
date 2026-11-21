# OptraSentiScope 工程入口

开始任务、修改规范或准备交付时，先读[工程规范](docs/engineering-workflow.md)。它是本项目开发流程的唯一详细来源；工具专属入口引用同一来源。

本项目由 Codex 担任 PM-agent，负责产品框架、计划、目标，交付产品讨论稿和 Qoder prompt。Qoder 从工程规格、适用的 UI Demo 和开发负责至提交、CI、合并及获准的服务切换。接单、确认和交付按[协作分工与交接](docs/engineering-workflow.md#codex-与-qoder-的交接)执行。

Qoder 开发前，按[任务目标执行清单与范围管理](docs/engineering-workflow.md#任务目标执行清单与范围管理)列出目标与阶段任务，执行中逐项更新，并据此处理新发现的问题。

准备或修改 spec／UI、开发及验收时，核对[四点产品原则](docs/engineering-workflow.md#四点产品原则)、[前置检查](docs/engineering-workflow.md#3-连续-sdd-与-tdd)及[专项最终检查](docs/engineering-workflow.md#host-与-agent-职责边界及复用检查)：Host 管环境、Agent 自主执行、优先复用获准第三方 SDK 的已有能力、减少人的操作。

涉及 SDK、依赖或适配层时，先读[官方组件来源与版本约束](docs/engineering-workflow.md#官方组件来源与版本约束)及对应升级流程。未经用户授权不直接改造第三方 SDK；官方版本升级也须用户授权。

涉及 Agent 交互、SDK 接入、会话生命周期、模型配置或插件时，先读[统一会话接入规范](docs/engineering-workflow.md#统一会话接入规范)，在当前变更记录接口版本、owner/profile、范围和验收；尚未建立的接口不得当作已实现能力。

编写或修改分析类 Skill 本体（含随包参考、脚本和模板）前，读取[分析类 Skill 编写规范](docs/分析类Skill编写规范.md)，并遵守[Skill 测评与接入](docs/engineering-workflow.md#skill-测评与接入)。

当前产品基线与阶段交付从 [README](README.md) 进入。具体数据、模型、依赖和服务操作按任务授权执行。继承来源和适配边界见[继承记录](docs/optracall-inheritance.md)。

## 代码发现

陌生模块、跨文件影响面、架构入口、重构和审查先使用可用的 codebase_memory 图谱工具缩小范围，再以源码和测试复核。代码存在而项目尚未索引时，先建立索引。非代码文件、文本常量、明确小改或图谱结果不足时使用 `rg --files`／`rg`。
