# tea 能力不足时：自行探测 + REST API 兜底

tea 未覆盖或参数不确定时，**不要凭记忆猜命令**，按以下顺序探测。

## 1. 查子命令帮助（最权威，随本机 tea 版本走）

```bash
tea --help                    # 顶层命令总览
tea <命令> -h                 # 例：tea pulls -h 列出全部子命令
tea <命令> <子命令> -h        # 例：tea pulls merge -h
```

> 注意：子命令帮助要用 `tea <命令> <子命令> -h` 直接跑；`tea help <命令> <子命令>` 或把多级命令塞进变量循环里常报 `No help topic`。

## 2. 用 `tea api` 直接打 Gitea REST API

带鉴权，自动补 `/api/v1/` 前缀，支持 `{owner}`/`{repo}` 占位符按当前仓库上下文替换：

```bash
tea api 'repos/{owner}/{repo}'                        # GET（默认方法）
tea api 'repos/{owner}/{repo}/issues?state=open'      # 带 query 要加引号防 shell 展开
tea api -X POST 'repos/{owner}/{repo}/issues' -f title='x' -f body='y'
tea api -X PATCH 'repos/{owner}/{repo}/issues/5' -F state='"closed"'
tea api -X DELETE 'repos/{owner}/{repo}/labels/3'
tea api 'repos/{owner}/{repo}/pulls/7' -o saved.json  # 响应体写文件（-o '-' 写 stdout）
```

参数：

```
-X, --method <GET|POST|PUT|PATCH|DELETE>   HTTP 方法（有 body 时默认 POST）
-f, --field key=value                       字符串字段（可多次）
-F, --Field key=value                       类型化字段：数字/布尔/null；@file/@- 读文件或 stdin；
                                            以 [ 或 { 开头按 JSON 解析；加引号强制字符串
-d, --data <json|@file|@->                  原始 JSON body（不能与 -f/-F 同用）
-H, --header key:value                      自定义请求头
-i, --include                               状态码与响应头打到 stderr
-o, --output <file|->                       响应体写文件而非 stdout
-l/--login, -r/--repo, -R/--remote          指定实例 / 仓库 / remote
```

## 3. 实例自带的交互式 API 文档

Gitea REST API 全量端点与参数见实例的 Swagger UI：

```
<Gitea地址>/api/swagger        # 例：http://gitea.yzxingtu.cn/api/swagger
```

## 探测到新用法后

若属通用约定，回写到本技能 `references/` 或 `.agents/rules/`（遵循「文档归位」原则）。
