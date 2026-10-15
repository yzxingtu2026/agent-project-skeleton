# 分支策略

- `main` 是受保护主干，只接受 PR 合入，禁止直接提交或推送。
- 开工前同步最新 `main`，再按 Issue 或聚焦任务创建短期分支。
- 一条分支只服务一个 Issue 或一个可独立合并的聚焦任务。
- 范围扩大时拆分支，不把无关改动混入同一 PR。

## 命名

- 关联 Issue 时带编号：`feat/issue-<编号>-<slug>`、`fix/issue-<编号>-<slug>`、`docs/issue-<编号>-<slug>`、`chore/issue-<编号>-<slug>`。
- 无 Issue 的直接实施类改动省略编号：`feat/<slug>`、`fix/<slug>`、`docs/<slug>`、`chore/<slug>`。
- 紧急修复：`hotfix/<slug>`；不合入探索：`spike/<name>-<slug>`。
- 分支名只用小写英文、数字和连字符。

## 冲突预检

开工前查看 open PR；若预计改动与已有 PR 重叠较多（约 3 个以上文件）或命中公共组件、迁移、核心配置，先确认依赖/优先级，再决定开工、等待或拆分。

## 生命周期

`git switch main && git pull` → `git switch -c <type>/[issue-<编号>-]<slug>` → 小步提交 → PR 到 `main` → 合入后删分支。
