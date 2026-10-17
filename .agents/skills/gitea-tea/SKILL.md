---
name: gitea-tea
description: 使用 tea CLI 操作自建（自部署）Gitea 仓库的技能包。当远端仓库 host 不是 github.com，而是公司内网 Gitea（如 http://gitea.yzxingtu.cn）时使用：涵盖 tea 的安装（macOS/Linux/Windows）、OAuth 与令牌登录授权、Issue/PR/评论/标签/发布/分支/仓库等操作命令，以及能力不足时用 tea api 和 --help 自行探测 Gitea REST API 的方法。GitHub 仓库仍用 gh，不走本技能。
---

# Gitea tea CLI

## Overview

面向**自建 Gitea** 仓库的远端操作技能。GitHub 仓库继续用 `gh`（见 `.agents/rules/`）；本技能只处理 host 非 github.com 的 Gitea 实例。tea 依赖当前目录的 Git 上下文（读 `origin` 推断实例与仓库），**命令一般在仓库根目录内运行**。

## 何时用 tea、何时用 gh

```bash
git remote get-url origin
```

- host 是 `github.com` → 用 `gh`，**不**使用本技能。
- host 是公司内网 Gitea（例：`http://gitea.yzxingtu.cn`）→ 用 `tea`，按下文操作。

## 安装 tea

先检查：`tea --version`（有输出即已安装，跳过本节）。tea 最新版本与二进制下载见官方页 <https://about.gitea.com/products/tea/>（指向 releases），下载根为 `https://dl.gitea.com/tea/<VERSION>/`，资产命名 `tea-<VERSION>-<os>-<arch>[.exe]`。

**macOS**

```bash
brew install tea
# 或下载 darwin 二进制：tea-<VERSION>-darwin-arm64（Intel 用 amd64），chmod +x 后移入 /usr/local/bin 并改名 tea
```

**Linux**

```bash
curl -L -o tea "https://dl.gitea.com/tea/<VERSION>/tea-<VERSION>-linux-amd64"   # arm 机器换 arm64
chmod +x tea && sudo mv tea /usr/local/bin/tea
# 或从源码：go install code.gitea.io/tea@latest
```

**Windows**

1. 打开官方下载页 <https://about.gitea.com/products/tea/>，进入 releases。
2. 下载 `tea-<VERSION>-windows-amd64.exe`（ARM 机器选 arm64）。
3. 重命名为 `tea.exe`，放到一个目录（如 `C:\Tools`），并把该目录加入用户 `PATH` 环境变量。
4. 新开 PowerShell/CMD 运行 `tea --version` 验证。
   > 也可用包管理器（若你的源已收录）：`scoop install tea` 或 `choco install tea`。

安装后确认 `tea --version` 可用；命令找不到时检查二进制所在目录是否在 `PATH` 中（Go 安装则查 `$(go env GOPATH)/bin`）。

## 登录与授权

tea 登录信息保存在**本机**（不在仓库内）：macOS 在 `~/Library/Application Support/tea/config.yml`（凭据另存加密文件），Linux 在 `$XDG_CONFIG_HOME/tea/config.yml`（默认 `~/.config/tea/config.yml`）。一个 tea 可管理多个实例，每个叫一个 **login**（`--name` 命名）。

先查已有 login，避免重复登录：

```bash
tea logins list                    # 列出实例（NAME/URL/USER/DEFAULT）
tea logins status [<login名>]      # 校验令牌是否仍有效
tea logins default <login名>       # 设为默认，省去每条命令加 -l
```

> 本机可能已存在公司实例 login（如名 `gitea`、URL `http://gitea.yzxingtu.cn`）。若 `tea logins status` 通过就直接用；非默认（DEFAULT=false）时每条命令加 `-l gitea`，或 `tea logins default gitea` 一劳永逸。

### 方式 A：OAuth2 授权登录（真人有浏览器时推荐）

`--oauth` 走标准授权码流程：tea 打开浏览器 → 用户在 Gitea 页面点「授权」→ 回调本地服务 → 拿到令牌。**由用户本人在能看到浏览器的终端执行**，Agent 负责把命令给到用户并说明步骤：

```bash
tea logins add --oauth --name gitea --url http://gitea.yzxingtu.cn
```

- 运行后按提示在浏览器登录并点授权，完成后用 `tea whoami` 验证。
- 若实例要求指定 OAuth 应用，追加 `--client-id <id> --redirect-url <url>`（由 Gitea 管理员在「网站管理 → OAuth 应用」或用户「设置 → 应用」创建应用后提供；redirect-url 要与登记的回调地址一致）。
- 令牌过期后刷新（刷新令牌也失效会重新弹浏览器）：`tea logins oauth-refresh [<login名>]`。
- 纯命令行/无浏览器环境（远程服务器、CI）**不要强行走 OAuth**，改用方式 B。

### 方式 B：访问令牌登录（Agent / 无浏览器环境首选）

1. 引导用户浏览器打开 `<Gitea地址>/user/settings/applications`（设置 → 应用 → 管理访问令牌）。
2. 新建令牌，勾选写权限范围（至少 `write:issue`、`write:repository`；发布/组织/标签等按需勾选或全选），生成后复制（只显示一次）。
3. Agent 用令牌登录，**令牌走环境变量，不写进仓库/提交/日志/命令行明文**：

```bash
GITEA_SERVER_TOKEN='<粘贴令牌>' tea logins add \
  --name gitea --url http://gitea.yzxingtu.cn --token "$GITEA_SERVER_TOKEN"
```

让 HTTPS 的 git push/clone 复用 tea 令牌（注册为 git 凭据助手）：登录时加 `--git-credentials`；对已有 login 补登记用 `tea logins helper setup`。

### 验证与排障

```bash
tea whoami          # 当前登录用户
tea logins status   # 各 login 令牌有效性
```

- 未登录/401 → 令牌过期或范围不足：重登或 `tea logins oauth-refresh`；令牌方式重新生成并勾足够写权限。
- 多实例串了 → 加 `-l <login名>` 或设 default。
- 内网自签证书 TLS 报错 → 登录加 `--insecure`（仅可信内网）。
- 平台识别错 → 确认在仓库根目录、`origin` 指向 Gitea；必要时用 `-r`/`-R` 显式指定。

## 仓库操作命令

Issue、PR（含 approve/reject/merge/checkout/review 全生命周期）、评论、标签、里程碑、发布、分支保护、仓库 create/fork/migrate、组织、Actions(CI)、Wiki、Webhook、通知、工时，以及 gh ↔ tea 命令对照表和「先 approve 再改标签」的收口顺序——**完整命令见 `references/commands.md`**，执行具体操作前先读取它。

## 能力不足时自行探测

tea 未覆盖或参数不确定时，**不要凭记忆猜命令**：先 `tea <命令> <子命令> -h` 查帮助，再用 `tea api` 打 Gitea REST API，端点查实例的 `<Gitea地址>/api/swagger`。**详细方法（含 `tea api` 全部参数）见 `references/api-probing.md`**。

## 硬约束（与团队规则一致）

- **禁止把 token/密码/凭据写入仓库、提交历史、日志或命令行明文**；令牌用环境变量或 tea 加密存储。
- **禁止直改 main**：从最新 `main` 开短分支、PR 合入（见 `.agents/rules/branching-strategy.md`）。
- 提交信息用中文，关联 Issue/PR。
- `repos delete`、分支保护变更、`admin`、强制合并等**高风险/不可逆操作**执行前先向用户确认。
- 只有 host 非 github.com 的 Gitea 仓库才用本技能；GitHub 仓库用 `gh`。

## Resources

- `references/commands.md`：全部仓库操作命令 + gh↔tea 对照表 + 全局参数 + 收口顺序。执行任何具体远端操作前读取。
- `references/api-probing.md`：`tea api` 详细用法、Swagger 端点、`-h` 自探测流程。tea 能力不足时读取。
