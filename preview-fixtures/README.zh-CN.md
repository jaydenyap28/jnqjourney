本目录用于独立分支 `codex/jnq-preview-cpu` 的首次 Preview 准备。CPU 修复提交为 `3213b38cbd0ff4a7cb5c54dc25c4a73e5be982d5`，父提交为 `716d46093980a006b34a0eca87b08550bf07b305`。Preview 准备直接继承 CPU 提交。

2026-11-04 已通过 Supabase 连接核实并初始化测试项目 `jnqjourney-preview`，Ref 为 `rnamstwwbzknwbjwdgrf`，区域为 `ap-southeast-2`。初始化前业务表、Auth 用户和 Storage bucket 均为零。生产项目未执行 SQL。

`bootstrap.sql` 只提取仓库已有地区、Spot、配套、选项及联盟表的 DDL，并加入已有 Spot 内容字段。公开样例完全合成，固定 ID 为测试身份。Guide、Note、英文集合和预算样例随代码打包，所有媒体引用为本地资源。无需配置外部公开 CDN 或 R2。

云端已完成的资料与验证如下。

- 五张业务表启用 RLS。anon 只读可见 1 个地区、1 个 Spot、1 个已发布配套、1 个有效选项和零条联盟记录。
- 隐藏 Spot、草稿配套、停用选项及草稿配套下的选项均不可由 anon 读取。
- 业务表对 anon/authenticated 的表级和列级写权限检查通过。public schema 没有可供它们执行的 RPC。
- Supabase 托管 Storage 保留平台自有 ACL，所有托管表启用 RLS，bucket 和 policy 均为零。实际 anon 业务表、bucket 和 object 的 INSERT 探针全部被拒绝，事务回滚。
- 安全 advisor 返回零项，测试项目没有 Edge Functions，未安装 pg_cron、pg_net 或 pgmq。
- `verify.sql` 包含可重复执行的可见范围、权限及回滚探针验证。bootstrap 只允许空项目，已初始化项目会有意拒绝再次执行。

Vercel 项目为 `jnqjourney`，ID 为 `prj_ve8zzToXNgvKQZDhqZD1GLMM91ib`。已读取 Preview 变量的目标环境元数据，并在内存中核对测试 URL、Ref 和 anon key。三项均为 Preview-only，anon key 与测试项目当前有效公开 key 匹配。没有导出任何环境文件或保存 key。

本分支进一步锁定测试项目身份，在构建配置和服务端读取处拒绝错误项目。配置检查拒绝高权限 key、GA/AI/YouTube/Mapbox 凭据及所有外部公开快照来源。Preview 使用独立 Data Cache key，生产 bundled fallback 在 Preview 关闭。构建目标为 Production 时，此专用分支会被配置检查拒绝。

为保证首次验收隔离，本分支 Preview 使用系统字体，隐藏 Mapbox 与 WhatsApp 入口，停止 FX 查询。CSP 限制浏览器同源请求、禁止外部 frame、worker、表单和 popup，Next Image 关闭远程主机。后台、发布、统计、清理、AI、R2 和第三方预览入口继续在副作用前拒绝或明确跳过。地图、真实字体、视频与询盘体验需要后续单独验收。

本地验证使用以下定向命令。已有 55 项 CPU 测试作为上一轮证据保留，本轮未重跑整套 CPU 测试或完整构建。

```powershell
node --test tests/preview-bootstrap.test.cjs
node --test --test-name-pattern='next.config enforces|private source client factories|R2 and localization|Preview skips external' tests/rc1.5-preview-isolation.test.cjs
node --test --test-name-pattern='Preview rejects inherited|Preview requires the pinned|actual public readers|all candidate route writers' tests/rc1.5-preview-isolation.test.cjs
node --test --test-name-pattern='server App layout|English Pages shell' tests/preview-safety.test.ts
```

新增测试经过首页、Spot、Guide、Note、Package 的真实数据入口，使用真实 Supabase SDK 配合合成 REST transport，23 次读取全部约束在测试 origin 和 anon key。它另行覆盖 59 次实际 handler 调用及错误配置早退。该实验与云端 anon SQL 验证分别记录，不将合成 transport 称作真实部署 HTTP 验收。

本轮上述 16 项定向测试通过，TypeScript、修改文件 ESLint 和 Git diff 检查均通过。分支继承检查通过全部 12 个要求的里程碑，RC1.2 的 31 个路径均保留。

首次部署仍需完成以下云端步骤。

1. 所有者确认测试项目 Auth 注册、邮件、SMTP 和 Webhook 设置符合只读测试用途，并复核 Team/Integration/分支变量继承及 Vercel 项目 Build/Install 覆盖命令。当前工具已核对项目级变量及公开 key，未读取这些额外配置。
2. 确认 Hobby 额度允许一次 Preview 构建。将本地专用分支提交推送到同名非 main 分支，并只选择原生 Preview target。禁止合入 main 或 Promote。
3. 使用最新提交和已核对的 Preview 环境进行一次云端构建，保留 Deployment Protection。检查精确部署 URL 的首页、`/spot/fixture-lookout-91001`、`/guide/fixture-guide`、`/notes/fixture-note`、`/packages/fixture-package`，以及隐藏样例的 404、noindex、robots 和 CSP。
4. 在浏览器确认无生产资源或第三方服务请求，并核对构建日志、SDK 读取和 RLS。云端构建及浏览器网络验收完成后，才能把本分支标为 Preview 已验收。

当前完成的是本地候选与测试数据库准备。首次部署尚未执行，Production 部署和正式数据更新均未纳入操作。
