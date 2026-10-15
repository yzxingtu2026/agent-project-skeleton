# GitHub Issue / PR 工作流

## Issue（规划与讨论的载体）

- Issue 用于承载规划/讨论类工作：需求梳理、方案拆解、技术债、规则调整，以及需要 AC、排期或多方确认的事项。
- 用户直接要求实施的明确改动，可不预先建 Issue，直接开分支实现并提 PR，由 PR 承载追溯。
- 建 Issue 时描述至少包含：背景目标、验收标准、范围/非范围、风险或依赖。

## PR

- 有关联 Issue 时：关闭用 `Fixes #编号`，仅关联用 `Refs #编号`；直接实施类 PR 无 Issue 可不关联。
- PR 描述写清变更动机、变更点、验证方式、是否影响文档/规则；无 Issue 时 PR 描述即追溯来源。
- 远端操作优先用 `gh`；不得把 token/PAT 写入仓库。

## 测试标签

- 运行时行为变化必须加 `needs-testing`，PR 保持 open，等待测试。
- 纯文档、规则、CI、`.gitignore` 等不影响运行时的变更可直接合入。
- 混合变更以代码影响为准：有运行时变更就需要测试。

## 测试通过收口

主分支保护要求有写权限审批时，测试通过必须按顺序执行：

```bash
gh pr review <编号> --approve --body "代码审查通过，测试已通过，允许自动合并。"
gh pr edit <编号> --remove-label needs-testing --add-label tested-pass
gh pr view <编号> --json reviewDecision,labels,statusCheckRollup,state,mergedAt,mergedBy
```

- 禁止先打 `tested-pass` 再 approve；否则自动合并可能因缺少审批失败。
- 测试失败时移除 `needs-testing`，添加 `tested-fail`，并创建/关联 Bug Issue。
- 若项目未配置标签自动合并，按团队合并策略处理。
