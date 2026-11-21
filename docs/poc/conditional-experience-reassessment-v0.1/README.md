# 条件经验重评固定案例包 v0.1

**packageId：`POC-CONDITIONAL-EXPERIENCE-REASSESSMENT-001`；状态：固定候选；时区：UTC；计算：OFF。** 本包全部主体、证据、失败、权限和事件均为人工合成，不指代真实企业，不含真实来源、凭据或业务操作。准备阶段 `real_model_run=NOT_RUN`、`model_quality_scoring=NOT_RUN`，不构成模型成绩，也不构成完整 AC07 验收。

## 谁做什么

| 角色 | 职责与边界 |
| --- | --- |
| 被评 Agent | 只读 `inputs/00-scenario.json`、本批及已释放输入，以及自己此前实际产出；自主判断、引用、形成／修正／撤回建议和经验。不得联网、补造事实或执行真实业务操作。 |
| 释放方 | 按 `release-plan.json` 分批提供文件和虚构权限，保存每批实际输出、可见输入和运行配置；不替 Agent 作答，不用参考答案补历史。`availableAt` 是剧情时点，上一批产出保存后即可继续，无需等待现实日期。 |
| 非作者评阅者 | 运行结束后读取完整包、实际输出及运行记录，按 `reference/review-sheet.md` 逐项评阅；核对版本、时点、证据与影响，不把自己的业务选择当唯一答案。 |

**`reference/` 绝对不能给被评 Agent，也不能复制到其工作区、提示、检索索引或历史经验中。** README、release-plan、manifest 和运行记录同样不是 Agent 输入。reference 含未来资料、反证关系与可接受表现，泄漏会使主动发现和重评失效。

## 逐批使用

| 批次 | 释放文件（另保留已释放输入） | availableAt | 委托方式 |
| --- | --- | --- | --- |
| 初始委托 | `01-initial-delegation.json`（连同 `00-scenario.json`） | 2026-03-05 09:00Z | `SYN-D-ORIGIN`，形成判断、两条关联建议、一条无关建议及经验 |
| 新证据 | `02-new-evidence.json` | 2026-03-22 09:00Z | 回到同一 origin，基于实际旧产出保留／修正 |
| 反证 | `03-counterevidence.json` | 2026-04-07 09:00Z | 同一 origin，限缩／撤回并逐项重评 |
| 后续委托 | `04-followup-f1.json`，随后 `05-followup-c2.json` | 2026-05-10 09:00Z；2026-05-11 09:00Z | 两个独立新委托分别释放，不互看目标资料 |

每批先冻结实际输出身份再开下一批。后续委托只能通过实际经验机制取得此前产出；若未运行前批或经验不可读，相应项记 UNKNOWN／未运行，**不得用 reference 冒充记忆**。禁止提前释放未来文件，详见释放计划逐项 `prohibitedEarlyRelease`。

## 运行记录与评阅

1. 保持固定包只读，将 `reference/run-record.json` 和 `reference/review-sheet.md` 复制到包外本次运行目录后填写，避免改变候选哈希。
2. 在 run-record 填实际 Provider／协议／线路、模型身份及完整解析配置（含 reasoning、thinking、上下文、maxTokens、compat、工具和 SDK／Host 版本），不得记录密钥。逐批填开始／结束／耗时、输入／输出／缓存 token、输出 delegation／session／artifact／哈希。
3. 费用分 SDK 估计、供应商账单和可核现金支出记录，缺证据保持 UNKNOWN／NOT_RUN，不写“免费”。评阅者填身份、独立性、时间和各项证据。
4. 每项可记 **符合／不符合／证据不足／未运行**；未真实运行时所有质量项保持未运行。未来资料泄漏、反证后照搬失效建议、只提经验却没有可观察实际影响，均有专门评阅项。

可接受多种有依据的结论：判断可保留、修正、限缩或撤回；建议可选择不同业务方案。关键是准确引用、说明理由、保留旧版／FAILED／UNKNOWN、分别重评关联建议、不误伤无关建议，并在后续委托证明经验采用或拒用造成了什么实际影响。措辞、标题和唯一业务路线不作为评分依据。

## 离线完整性核对

在本目录执行（仅做文件完整性核对，不运行模型或业务计算）：

```bash
python3 - <<'PY'
from pathlib import Path
import hashlib, json
root = Path.cwd()
m = json.loads((root / 'manifest.json').read_text())
actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p.name != 'manifest.json'}
listed = {f['path'] for f in m['files']}
assert actual == listed, (sorted(actual - listed), sorted(listed - actual))
for f in m['files']:
    data = (root / f['path']).read_bytes()
    assert len(data) == f['bytes'], f['path'] + ': bytes'
    assert hashlib.sha256(data).hexdigest() == f['sha256'], f['path'] + ': sha256'
print(f"OK: {len(listed)} files; manifest.json excluded")
PY
```
