# 静态切换候选实施

## 1. 已完成

- 保留原 [1,349 页静态 Preview](https://921277e0.jnqjourney-static-recovery-candidate.pages.dev)，共 3,621 个文件、0 Functions。本轮新增的两个部署只包含合成演练页。
- 将媒体审批接入原静态构建。构建前按精确 URL 重写结构化来源、正文、静态代码和 CSS，保留合法共享引用和焦点。已确认缺图使用现有站内占位图。RSC 随 Next 渲染重新生成。每个静态图必须匹配审批身份、字节 SHA-256、长度、文件类型和内容寻址路径。获批缓存按内容去重，只下载缺失字节。打包后检查旧主机、未知图片、未引用文件和 Functions；Chrome 检查已增加实际旧 R2 请求计数、站内图片解码、桌面与手机校验。
- 本机 10 项媒体、SEO 和组件 SSR 测试通过。实物媒体闸门读取既有 4,775 个源 URL 清单和分类结果，确认 **6 个缺图决定、4,745 项待决、0 个可复制对象**，在下载、构建、上传之前退出。33 个关闭 Spot 独占对象不在审批范围，9 个跨模块共享对象需要完整的合法消费者列表。
- 检查真实容量。原包 226,642,240 B，本机可用 39,522,791,424 B。加上既有测量的 R2 及可读外部图片后，保守预计 **最多 8,372 文件、约 7.22 GB**；已量最大对象 12.92 MiB。满足 Pages 文件数量和单件尺寸的已知限制。完整传输耗时、账号剩余额度和最终文件数需要实际包确认。没有增加 R2 桶。 [Pages Free 限制](https://developers.cloudflare.com/pages/platform/limits/)
- Cloudflare 分页清单记录了 **26 个现存 Preview**：静态项目 6 个，Spot Loop 项目 19 个，新隔离测试项目 1 个。共 14 个非最新无别名固定部署可列为删除候选，12 个分支最新部署须先保护或替换。清单保存完整 ID、别名与默认 pages.dev URL。三个项目均无 Production canonical、Production 部署或自定义域名。合成测试部署旧版 `bff77ec5` 删除 API 返回 200，旧固定地址原 URL 和查询变体均返回 404；分支别名返回新版 `bd64706d` 的内容，项目根地址返回 404。保留上一轮真实边缘 HIT 风险记录。 [Pages Preview 与删除](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- 保留既有 31/31 PostgreSQL 结果。隔离 Supabase 项目完成 **27/27** HTTP 与数据断言。匿名和普通登录账号不能直读内部字段与草稿，私有测试桶两个对象路径拒绝公开读取。真实 Supabase Auth 登录与现有 Next 管理员鉴权通过；普通用户收到 403，授权服务端完成合成 Spot 保存和读回，公开投影省略 hidden，私有图片 SHA-256 一致。合成对象、桶、Spot 和两个 Auth 用户均已清理。此验收覆盖管理鉴权与服务端写入，后台浏览器表单及 Notes、Guide 写入未纳入。
- 回滚 SQL 在 PostgreSQL 17.11 定点测试 **12/12**，模拟授权漂移后仍拒绝匿名表读、普通账号 RPC 和目标桶读取，保留服务端投影。初次测试误把整个合成表期望成 3 行，实际为 19 行，已改为核对三条指定 fixture 的投影，并保留初次记录。

## 2. 待授权媒体

按来源集合处理待决项，避免逐图判断。4,625 个旅行 R2 对象需确认站方自有或有权重托管的范围和例外；32 个配套 R2 对象按供应商确认；24 张旧 Supabase 图、23 张外站图分别核对来源许可。41 张 YouTube 缩略图要满足最终同源图片要求，需明确允许重托管或批准使用站内占位状态；影片点击播放保留。6 张已有确切缺图证据的对象按本次指令走缺图状态，无新替代照片。

## 3. 技术阻塞

- **正式 Storage 目录缺证据。** 现有官方 CLI 单独使用 `--project-ref` 返回 `LegacyDbQueryMutuallyExclusiveFlagsError`。自动审批拒绝了所需的 `--linked` 调用，理由是项目关联边界。Codex Work 本机浏览器入口关闭，当前会话未提供 Supabase SQL MCP。正式 SQL 未发送。已准备 [只读目录查询](review/formal-storage-acl.read-only.sql)、[收紧草案](review/static-read-boundary.draft.sql) 及 [安全回滚](review/static-read-boundary.rollback.sql)。下一次只在明确绑定正式项目的官方只读连接取得策略和有效 ACL，再锁定切换 SQL。先验证可代替当前匿名捕获的服务端权威导出，保持静态前台同源。
- **Access 与域名缓存未通过。** 本轮只对合成 Pages 项目尝试 Access API，返回 403 / 1010。现有账户只有正式 Cloudflare zone，未对它或 Cloudflare 自有的 pages.dev 发 purge。正式切换前需在获准的隔离入口验证匿名拒绝、获准访问、旧固定 URL 与已预热边缘缓存清除。域级缓存清除不撤回第三方下载。 [Preview Access](https://developers.cloudflare.com/pages/platform/known-issues/) · [按 URL 清除缓存](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/)
- **最终站点未生成。** 审批闸门拒绝候选，未下载本轮真实图片。新包的原 1,349 页路由、全部图片同源、浏览器旧 R2 请求为零、SEO、robots、sitemap 和 0 Functions 要在最终构建验证。此前 Preview 已通过的验收保持有效。

## 4. 待批准步骤

1. 用户确认上列媒体使用范围、撤销清单及 41 个影片封面处理；确认静态下架时限和历史缓存边界。
2. 先通过官方只读连接取得正式 Storage 目录。确认隔离 Access 权限及独立测试域，并完成受控导出和旧入口保护验收。备好当前撤销集合下可验证的干净包或维护页。
3. 审批清单齐全后复用一次性缓存和构建入口。获批媒体 SHA、体积和路径入审核清单后，先执行 `node scripts/cloudflare/recovery-media-staging.mjs --populate-approved-cache`，再执行 `npm run cf:recovery -- --check --final-media`。技术门槛齐全后执行 `npm run cf:recovery -- --final-media --deploy-preview`，用该 run 目录执行 `node scripts/cloudflare/recovery-browser-check.mjs --final-media` 并检查部署回执。
4. 仅在最终 Preview 通过后单独审批正式 Supabase ACL/RLS、Storage 私有化、旧 Preview Access 或删除、旧 r2.dev 关闭及 Production/DNS。先让替代站点与媒体可访问，再收旧入口，检查旧域及内外链接。正式故障回退只能选符合最新撤销清单的包；SQL 回滚保留私有桶、收紧策略和只供服务端的投影。

## 5. 结论

**STATIC_CUTOVER_BLOCKED，Production HOLD。** 正式服务、权限、DNS 和 R2 公共开关未修改。 [本轮验收证据](evidence/static-cutover-implementation-2026-11-11.json)
