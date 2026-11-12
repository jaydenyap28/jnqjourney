# 独立管理后台

使用原 JnQ Journey 管理登录、列表、Spot 表单、Note 长文编辑器和 Guide 表单生成静态后台。Pages 只提供编译后的界面和字体。登录与令牌刷新使用 Supabase Auth。隔离 Edge API 在每个请求用 Auth 服务核实用户 ID，只有服务端配置的管理员 ID 可访问。对外只提供隔离 Preview，浏览器只有项目的公开 anon key。

[Admin Preview 登录](https://admin-review.jnqjourney-admin-isolated.pages.dev/admin/login) · [脱敏实测结果](evidence.json)

正式资料只读接入、完整静态网站 Preview、备份及正式启用步骤见 [正式切换准备](FORMAL-CUTOVER.md)。

实际 Chrome 已通过 Spot 新增、修改、slug 与封面保存，手工英文草稿保存，Note 长文、封面、预览、自动保存和重新登录恢复，Guide 每日景点关联、预算、封面保存与重新读取。三个模块的旧版本保存均返回 409，无效 Guide 预算返回 400，伪造图片返回 415。普通登录账号带有管理员样式的用户 metadata 仍被拒绝。手机登录、登出和旧会话失效已验证。

Preview 仅恢复三个编辑模块及相关私有图片操作。旧报表、联盟管理、配套、Klook 独立管理和外部英文生成服务未迁移。独立后台可编辑隔离测试数据，尚未连接正式资料。正式操作员的 Auth ID、生产数据源和生产发布执行器需分别核准。

## 构建和验收

在 Windows 项目目录，设置 `JNQ_SUPABASE_CLI` 和 `JNQ_WRANGLER_CLI` 为本机已有的 CLI JavaScript 入口。用隔离 Auth 测试资料执行。服务端管理员身份取自本机已有、Git 忽略的隔离测试账号文件。切换操作者须单独核准对应 Auth 用户 ID。

```powershell
node scripts/cloudflare/admin-preview-deploy.mjs --prepare rnamstwwbzknwbjwdgrf
node scripts/cloudflare/build-admin-preview.mjs
node scripts/cloudflare/admin-preview-deploy.mjs --edge rnamstwwbzknwbjwdgrf
node scripts/cloudflare/admin-preview-deploy.mjs --pages rnamstwwbzknwbjwdgrf
node scripts/cloudflare/admin-preview-browser.mjs rnamstwwbzknwbjwdgrf
```

Pages 的生产分支保留为 `reserved-production`，验收仅用 `admin-review` 分支。首次提交如果遇到 Preview TLS 签发延迟，用 `--verify-pages` 查询现有部署和别名。不要因一次 TLS 失败重复上传。所有浏览器测试写入隔离数据库和私有媒体。测试的普通账号在验收后删除。

Spot 使用隔离 ID 95000–95099，单记录修改要求读到的 `updated_at`。Note 和 Guide 各自在私有桶使用已有 `_system/<collection>/<version>.webp` JSON 快照与最新版本指针格式。保存使用独立锁串行执行，写入版本并读回后才切换指针。指针提交不明时保留锁；核对现有指针、版本字节和调用已经结束后，才能移除该隔离锁。Spot 的自定义 slug 保存和数据库事务分开，失败时应读回核对，不能将成功写入误判为未保存。

草稿图片使用隔离 R2 的 `_admin-drafts/` 前缀。服务器验证 MIME、文件签名、大小和 SHA-256，浏览器通过管理员请求取得临时 Blob 预览。移除图片引用不删除仍可能被其他草稿使用的对象。尚无自动回收草稿媒体或过期文档版本的任务。

## 隔离一键发布

[首轮 Preview](https://71e1652c.jnqjourney-publish-isolated.pages.dev) · [撤销版 Preview](https://5ae205d8.jnqjourney-publish-isolated.pages.dev) · [线上撤销版回执](https://5ae205d8.jnqjourney-publish-isolated.pages.dev/_publication.json) · [脱敏验收证据](publication-evidence.json)

Chrome 实测保存草稿未创建任务、重复点击合并、旧版本被拒绝及执行器离线时显示等待。首个任务因旧执行器凭据收到 403，改用独立执行器密钥后重试同一任务成功。撤销演练中的排队任务因 Note 已修改被拒绝，后台保留上一条成功链接。重新批准后，计划任务自动发布新版。新版 Spot 页面和独占图片均返回 404，Note 和 Guide 仍可读取。新版复用了两个图片文件，未从 R2 下载新图片。停下执行器后，已实测计划任务自动启动新进程。

在后台展开「网站发布」，点击「准备发布」，勾选这次允许公开的完整范围，核对后点击「发布网站」。Spot 必须处于 active + published，Note 必须先标为 Published，Guide 以发布面板明确勾选的版本为准。未选内容从新版本撤下。保存动作只写编辑资料。点击发布才生成持久任务。

隔离流程沿用原发布 outbox 的修订号、单任务领取、按修订确认及不明部署核对约束。任务、重试标记和回执放在现有隔离私有 Storage 桶的 `_publication/`。不执行候选 SQL DDL。Edge 通过现有管理员授权读取隔离表及 Note、Guide 的版本文件与最新指针，服务端投影只保留获准字段、版本号和被引用图片。任务 ID 为投影的 SHA-256。重复点击同一版本只返回现有任务。已经被后续选择取代的旧任务不可直接重放。

执行器复用静态恢复的 Pages 文件与 noindex 规则、HTML 元数据验证、SHA-256 媒体映射和 Direct Upload。隔离适配器生成所选内容的 Spot、Note、Guide 页面及 JSON，用于验证发布链路。全量正式构建器继续保留原有模板和来源。执行器只读取批准清单中的隔离 R2 对象，新图片按摘要获取，已缓存图片按摘要复用。部署前后复核任务版本。后台只在 Pages API 显示该部署成功，且线上 HTML、JSON、图片及版本回执字节全部匹配后显示成功链接。

每个任务使用独立 Preview 分支，构建或验证失败不会替换上一次成功链接。提交结果不明时，本地 `pending.json` 保留部署分支和提交指纹，重启只查 Deployment ID 和实际回执。不要为了重试删除这个文件。若批准范围在构建期间变化，重新准备并批准新版本。撤销通过重新构建实现。新 Preview 排除撤销内容及无引用图片，历史固定 Preview 和已缓存副本仍可能可访问。正式撤销策略须另行批准。

### Windows 执行器

使用同一台电脑、同一 Windows 登录用户的已授权 Supabase CLI 和 Wrangler。完成上面的隔离 Edge 部署后，执行：

```powershell
& scripts/cloudflare/install-admin-publisher.ps1 -SupabaseCli $env:JNQ_SUPABASE_CLI -WranglerCli $env:JNQ_WRANGLER_CLI
Start-ScheduledTask -TaskName 'JnQ Journey Isolated Publisher'
Get-ScheduledTask -TaskName 'JnQ Journey Isolated Publisher'
```

任务在该 Windows 用户登录时启动，每分钟检查并可自动重新启动，已运行时忽略重复启动。运行用户退出、电脑关机或网络离线时，未执行任务留在隔离私有 Storage，恢复登录与联网后可继续领取。执行器每 30 秒更新心跳。浏览器只看进度，无法调用执行器路由。执行器密钥保存在 Git 忽略的 `artifacts/cloudflare-admin-isolated/publisher/.runner-key`，Edge 部署仅包含其摘要。任务配置仅包含 CLI 路径和固定隔离目标。

本地状态和错误日志位于 `artifacts/cloudflare-admin-isolated/publisher/`。暂停时先禁用该计划任务，再停止运行实例。恢复时启用并启动。状态中的等待冷却时间是 UTC。执行器与恢复脚本共用本机锁和尝试账本，限制每天 8 次、每月 240 次、至少间隔 10 分钟。预检在占用构建预算前失败。正式账户剩余额度需另查，私有仓库的托管 Actions 也受配额限制。[GitHub Actions 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

静态后台为 0 Pages Functions。Supabase Free Edge 公布额度为每月 500,000 次调用，并有每请求 CPU、内存及请求超时限制。后台按操作调用，Note 自动保存、图片读回、版本历史和 R2 出入站仍消耗账户额度。Cloudflare Pages Free 单站最多 20,000 文件，单文件 25 MiB，托管构建 500 次/月。直接上传、本机磁盘与账户真实剩余额度需要分别核对。[Supabase Edge 配额](https://supabase.com/docs/guides/functions/pricing) · [Supabase Edge 运行限制](https://supabase.com/docs/guides/functions/limits) · [Cloudflare Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)

## 正式权限审批清单

沿用 [隔离 PostgreSQL 31/31、HTTP 27/27 和回退 12/12](../static-recovery/STATIC-CUTOVER-IMPLEMENTATION-2026-11-11.md)。正式项目仍需先完成以下操作，批准前只读。

1. 完整备份数据库、Auth、Storage 权威文件与版本指针、R2 对象与权限配置，保存可核验哈希。确认 Note 与 Guide 当前指针、目标和历史版本都可从备份恢复，执行隔离恢复演练。
2. 把构建器及旧后台调用切换至服务端授权读取。服务端输出只包含通过资格规则的公开投影。明确保留有效的 `active`、`publication_status IS NULL` 旧记录，排除关闭、隐藏与草稿。核对 SQL 的直接、继承和列级授权、依赖视图、可调用的 DEFINER RPC，以及 Storage signed URL 的历史有效期。
3. 用待收紧边界跑完整隔离发布，校验已发布站点独立于旧数据入口。正式更改分开审批。先确认 [正式只读权限目录](../static-recovery/review/formal-storage-acl.read-only.sql)，核对备份和独立服务路径，然后按 [收紧草案](../static-recovery/review/static-read-boundary.draft.sql) 关闭浏览器直读。Bucket 公开开关属于独立操作。保留管理员 Auth、服务端投影及私有读写，逐项核对游客、普通账号、授权管理员和构建器。
4. 如应用失败，优先恢复已验收且通过最新撤回核对的 Pages 包，暂停编辑或发布。按 [安全回退 SQL](../static-recovery/review/static-read-boundary.rollback.sql) 保留目标桶私有、RLS 和服务端授权，不通过重新公开草稿恢复访问。旧 r2.dev 在所有消费者完成迁移并验证原始对象备份前保持可用，关闭需单独批准。
