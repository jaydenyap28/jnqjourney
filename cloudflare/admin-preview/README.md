# 独立管理后台

使用原 JnQ Journey 管理登录、列表、Spot 表单、Note 长文编辑器和 Guide 表单生成静态后台。Pages 只提供编译后的界面和字体。登录与令牌刷新使用 Supabase Auth。隔离 Edge API 在每个请求用 Auth 服务核实用户 ID，只有服务端配置的管理员 ID 可访问。对外只提供隔离 Preview，浏览器只有项目的公开 anon key。

[Admin Preview 登录](https://admin-review.jnqjourney-admin-isolated.pages.dev/admin/login) · [脱敏实测结果](evidence.json)

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

## 一键发布前置条件

后台显示实际发布执行器状态。当前执行器未接通。原 `publication-outbox.sql` 与 `publication-worker.mjs` 的隔离测试继续可用，现有全量恢复构建器仍读取正式匿名数据库、旧公共 Storage、R2 权威 feed。直接调用会跳过隔离草稿来源，并可能与当前正式媒体授权清单不一致。接通前需要把批准发布的版本投影和增量图片清单绑定到一次发布任务，并在独立公开 Preview 完成真实静态构建、部署和回执核对。

优先选用本机 Direct Upload 执行器。现有恢复脚本有本机互斥、来源复核及 SHA-256 校验，已证明 Pages 能复用资产。`--check` 实测本机保护值为每天 8 次、每月 240 次、至少间隔 10 分钟。执行器还需要持久在线、凭据隔离和运维授权。任务按发布内容版本去重，草稿保存不入队。若提交结果不明，先查部署和精确版本回执，禁止直接重试。回退包须再次通过最新撤回与媒体资格核对。私有仓库的托管 Actions 用量受分钟数、缓存及制品配额限制，不能以存放或传输全量 7 GB 包为免费前提。[GitHub Actions 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

静态后台为 0 Pages Functions。Supabase Free Edge 公布额度为每月 500,000 次调用，并有每请求 CPU、内存及请求超时限制。后台按操作调用，Note 自动保存、图片读回、版本历史和 R2 出入站仍消耗账户额度。Cloudflare Pages Free 单站最多 20,000 文件，单文件 25 MiB，托管构建 500 次/月。直接上传、本机磁盘与账户真实剩余额度需要分别核对。[Supabase Edge 配额](https://supabase.com/docs/guides/functions/pricing) · [Supabase Edge 运行限制](https://supabase.com/docs/guides/functions/limits) · [Cloudflare Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)

## 正式权限审批清单

沿用 [隔离 PostgreSQL 31/31、HTTP 27/27 和回退 12/12](../static-recovery/STATIC-CUTOVER-IMPLEMENTATION-2026-11-11.md)。正式项目仍需先完成以下操作，批准前只读。

1. 完整备份数据库、Auth、Storage 权威文件与版本指针、R2 对象与权限配置，保存可核验哈希。确认 Note 与 Guide 当前指针、目标和历史版本都可从备份恢复，执行隔离恢复演练。
2. 把构建器及旧后台调用切换至服务端授权读取。服务端输出只包含通过资格规则的公开投影。明确保留有效的 `active`、`publication_status IS NULL` 旧记录，排除关闭、隐藏与草稿。核对 SQL 的直接、继承和列级授权、依赖视图、可调用的 DEFINER RPC，以及 Storage signed URL 的历史有效期。
3. 用待收紧边界跑完整隔离发布，校验已发布站点独立于旧数据入口。正式更改分开审批。先确认 [正式只读权限目录](../static-recovery/review/formal-storage-acl.read-only.sql)，核对备份和独立服务路径，然后按 [收紧草案](../static-recovery/review/static-read-boundary.draft.sql) 关闭浏览器直读。Bucket 公开开关属于独立操作。保留管理员 Auth、服务端投影及私有读写，逐项核对游客、普通账号、授权管理员和构建器。
4. 如应用失败，优先恢复已验收且通过最新撤回核对的 Pages 包，暂停编辑或发布。按 [安全回退 SQL](../static-recovery/review/static-read-boundary.rollback.sql) 保留目标桶私有、RLS 和服务端授权，不通过重新公开草稿恢复访问。旧 r2.dev 在所有消费者完成迁移并验证原始对象备份前保持可用，关闭需单独批准。
