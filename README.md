# OptraSentiScope

OptraCall 的同源项目。用户已确认通用首版搭建规格和UI Demo并进入开发。当前已接通官方 Engine、业务 SQLite 与 Harness 原生会话，持续研究和受限自动信息流已有工程闭环；结果学习及完整首版仍未完成。Call只读接缝开发继续后排。

- [Host凭据、预算、计算关闭与出口控制](docs/Host_运行控制接缝_v0.1.md)
- [版本化研究交付、成果读回与自主观察复查](docs/版本化研究交付与自主跟进_v0.1.md)
- [Engine / Harness 持续研究接线与保留限制](docs/Engine_Harness_持续研究接线_v0.1.md)
- [本地开发启动与当前完成边界](docs/local-development.md)
- [规格／UI开发确认与实施记录](docs/通用首版开发确认与实施记录_v0.1.md)
- [开发依赖批准清单](docs/开发依赖采用清单_v0.1.md)
- [SDK实际消费分项结果及保留FAIL／NOT_RUN](docs/SDK_E1_实际消费核验_v0.1.md)

- [产品蓝图讨论 baseline（原文）](docs/product-blueprint-baseline-original.md)
- [产品蓝图讨论稿 v0.4（当前）](docs/OptraSentiScope_产品蓝图讨论稿_v0.4.md)
- [DSH 技术架构方案 v0.2（已确认设计基线）](docs/DSH_技术架构方案_v0.2.md)
- [技术架构确认与四原则设计复核记录](docs/DSH_技术架构_v0.2_确认与复核记录.md)
- [通用产品首版范围与完整使用过程 v0.1（已确认设计基线）](docs/通用产品首版范围与完整使用过程_v0.1.md)
- [通用产品首版确认、来源与四原则复核记录](docs/通用产品首版_v0.1_确认与复核记录.md)
- [Call只读接入与superagent官方源码消费方案 v0.1（已确认设计与候选）](docs/Call只读接入与superagent源码消费方案_v0.1.md)
- [接入方案确认、Call延期与待验证记录](docs/接入方案_v0.1_确认与待验证记录.md)
- [首发运行方案 v0.1（已确认设计）](docs/首发运行方案_v0.1.md)
- [首发运行确认与原始证据记录](docs/首发运行方案_v0.1_确认与证据记录.md)
- [通用首版搭建规格 v0.1（原固定稿，已获后续确认）](docs/通用首版搭建规格_v0.1.md)
- [可点击关键交互 Demo（获批的虚构内存原型，原件保留）](docs/prototypes/general-v0.1/index.html) · [原型说明](docs/prototypes/general-v0.1/README.md)
- [产品蓝图讨论稿 v0.3](docs/OptraSentiScope_产品蓝图讨论稿_v0.3.md)
- [产品蓝图讨论稿 v0.2](docs/OptraSentiScope_产品蓝图讨论稿_v0.2.md)
- [产品蓝图讨论稿 v0.1](docs/OptraSentiScope_产品蓝图讨论稿_v0.1.md)
- [成人服饰线下渠道会员运营 POC（后续优先，细节暂缓）](docs/poc/adult-apparel-offline-member-operations-v0.1.md)
- [成人服饰单店 POC 场景基线 v0.1（已确认，仅保留备选）](docs/poc/adult-apparel-store-v0.1/README.md) · [用户确认记录](docs/poc/adult-apparel-store-v0.1-approval.md)
- [下一阶段开发计划（P03–P05 已确认范围、验收清单与 Qoder 交接 prompt）](docs/P03-P05_下一阶段开发计划.md)
- [P03–P05 当前工程规格与逐项结果](openspec/changes/p03-p05-sustained-sources/results.md)
- [工程入口](AGENTS.md)
- [开发流程规范](docs/engineering-workflow.md)
- [分析类 Skill 编写规范](docs/分析类Skill编写规范.md)
- [OptraCall 继承来源与初始化记录](docs/optracall-inheritance.md)
- [本轮蓝图固化与 Git／CI 交付范围](docs/blueprint-handoff-delivery.md)

Baseline 于 2026-11-11 从用户提供的全文附件逐字节保存，保留原有内容、项目名称和格式；[原始分享链接](https://chatgpt.com/s/t_6af195af48c48191a2d80412eb66826c)。后续讨论与决定另行记录，原文中的 OptraCall 规划和既有确认措辞不自动成为 OptraSentiScope 的已确认范围。

规格和Demo原文的“待审核／禁止开发”是设计归档时的历史状态，不改其字节；后续确认及范围变化见开发记录。Call接缝实现后排，完整首版依赖保留，替身不算接通。历史设计PASS与本轮部分SDK核验均不等于持续研究或产品验收。具体来源、生产主机／隔离、活动运行与完整验收未完成；具体POC继续后置。本轮另获必要项目私有依赖安装／构建许可，真实模型／企业资料、POC、Git推送合并和生产部署仍不由开发授权自动获得。已建立同源CI配置，未运行的GitHub检查不记PASS。

后续接线进度以[持续研究工程记录](docs/Engine_Harness_持续研究接线_v0.1.md)及[本切片规格](openspec/changes/engine-runtime-v01/spec.md)为准：原生工具/定时到期/活动取消/冷进程续接使用本地合成 Provider 验证，未调用真实模型或企业资料；历史部分 SDK / 首片结论不改写为完整产品验收。
