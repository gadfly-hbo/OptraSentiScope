# OptraCall 规范继承记录

日期：2026-11-11。用户要求 OptraSentiScope 作为 OptraCall 同源项目，直接读取原仓库的 AGENTS.md 与开发流程规范。

## 固定来源

- 本机只读来源：OptraCall 本机工作副本，干净 `main`；精确路径留在本地证据。
- 来源提交：`d161bb537c3f1989f7a1a8249a6b66503f788d4f`（`docs: keep development focused on task goals (#60)`）。
- [工程入口](https://github.com/gadfly-hbo/OptraCall/blob/d161bb537c3f1989f7a1a8249a6b66503f788d4f/AGENTS.md) · [工程规范 v1.10](https://github.com/gadfly-hbo/OptraCall/blob/d161bb537c3f1989f7a1a8249a6b66503f788d4f/docs/engineering-workflow.md) · [分析类 Skill 规范](https://github.com/gadfly-hbo/OptraCall/blob/d161bb537c3f1989f7a1a8249a6b66503f788d4f/docs/分析类Skill编写规范.md)。
- 读取时远端 `main` 为 `d5ded3b2fa1077dbaad9bfbda9684c42ef7ba198`，领先上述本机提交一条；比较文件清单确认下列六个文件均无变化。本次未修改或更新原仓库。

下表为读取的原始文件 SHA-256，逐一核对与固定提交字节一致：

| 原文件 | SHA-256 |
| --- | --- |
| `AGENTS.md` | `f4c9e2da702dffd631580236b94ce4ea056cd24db1f608e8971f6afa336edec7` |
| `docs/engineering-workflow.md` | `18163f08adc51ff1a9dd16f6f717f734b210e46090c48d5b8c9fef6eec4e2674` |
| `docs/分析类Skill编写规范.md` | `89038984965974b698a4c3545c04d202a8b8f0769ebbc59c236c8fcba30e1c8c` |
| `.gitignore` | `37e75f5fa2d6f8973131df543d62227a08e0c4acd1c13a631424c64e69a971d3` |
| `.gitattributes` | `d60f352d0db1404c70afb4bb8b2ca3fd1c610572aa40720e8a0b7baa7885418c` |
| `.editorconfig` | `faf9dd42993b57dd5870dda0deadf47e14ea97529884994a073f8fc58b984d2f` |

## 继承与适配

| 内容 | 本项目处理 |
| --- | --- |
| AGENTS 工程入口 | 适配项目名、当前范围与有效指针，保留图谱优先发现代码的要求 |
| 工程规范 §2–8 | 继承职责、四原则、SDD/TDD、目标清单、UI 前置确认、独立复核、Git/CI、Skill 测评、数据及证据规则 |
| Pi／Semantica 与统一会话 | 保留条件适用的官方组件治理、升级回退、IN01–IN07；不宣称已采用组件或已有 Interface v3 |
| Qoder 协作与移交 | 保留可选模式及清楚的写入归属，不代表已安排 Qoder 执行当前任务 |
| 分析类 Skill 规范 | 继承编写、自检及独立测评要求；旧资产相对链接改为固定上游链接 |
| `.editorconfig`、`.gitattributes` | 原样继承 |
| `.gitignore` | 原样继承通用忽略规则，仅将 `/.optracall/` 改为 `/.optrasentiscope/` |
| 旧任务、验收、历史授权及设备部署 | 留在来源，不迁入新项目状态；具体设备分工、长期分支和部署安排待实际任务确定 |
| 具体会话接入手册、产品讨论稿、源码、测试与依赖 | 不复制；后续根据本项目蓝图与实际契约决定复用 |
| 原 CI 工作流与产品测评展示页面 | 当前无技术栈和界面；继承验证及证据规则，不伪造检查命令或已有能力 |

本项目当前执行入口为[AGENTS.md](../AGENTS.md)，详细长期规则唯一维护在[工程规范](engineering-workflow.md)。这次继承固定来源，不自动跟随上游覆盖。

## 初始化目标与执行清单

目标：在当前空目录建立本地 Git，与指定 GitHub 仓库连接，落地可追溯的同源工程规范；完成后等待用户产品方向资料。

- [x] 核对本地目录为空且尚无 Git；核对指定远端已存在，为空的公开仓库，保留其可见性。
- [x] 读取原项目规则并核对提交、文件字节及适配范围。
- [x] 初始化 `main`，配置 `origin` 为 `https://github.com/gadfly-hbo/OptraSentiScope.git`。
- [x] 写入工程入口、详细流程、专项 Skill 规范与基础文件。
- [x] 核对文档引用、来源一致性、公开内容与差异，并完成全新非作者只读复核；限初始化静态范围通过。
- [ ] 首次提交并推送 `main`，核对本地 HEAD、远端 HEAD 和工作区状态。

本次无产品实现与界面变更，UI Demo 不适用；运行时测试、构建和 CI 未运行／未建立。初始化静态检查、独立复核和 Git 交付分别记录，不构成产品验收。原始来源快照与本地验证证据保留在被忽略的 `.local/bootstrap/`。

## 本次验证

- 作者静态检查通过：8 个候选文件；20 个本地链接及章节锚点、10 个固定上游文件引用有效；六份来源快照与来源提交字节一致；基础配置及忽略规则符合适配要求；编码、空白和凭据模式检查通过。
- 全新上下文、未参与创作的非作者只读复核：本次初始化与规范继承静态范围通过，无剩余阻断项。公开文件中的个人本机路径已按复核建议移至本地证据。
- 运行时测试、构建、真实模型和部署未运行；当前无产品代码、构建系统及 CI。

原始静态检查与复核报告分别保留在 `.local/bootstrap/static-validation.json` 和 `.local/bootstrap/independent-review.md`；Git 交付结果另存 `.local/bootstrap/` 并以实际本地／远端引用核对。
