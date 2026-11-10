# 公开网站迁移准备

**PUBLIC_SITE_MIGRATION_READINESS_BLOCKED。正式迁移 HOLD。** 已部署只读 [公开页面 Preview](https://codex-public-readiness.jnqjourney-spot-loop-migration-candidate.pages.dev)，部署 ID 为 `c7569e24-a6e4-4905-8748-d79341cf6c43`。真实页面可静态生成及显示，一张有明确历史引用的图片已通过私有镜像门控。全量权威发布清单、旧公开媒体旁路、实时页面门控和 SEO 来源一致性尚未闭合。

基线 `15b231f05a490dce4becf93ba406d44de90ac788`。项目实际为 **Next.js 14.2.35、React、App/Pages 混用**。本轮复用模板，以白名单构建环境生成专用副本。沿用既有 Registry、Edge、Bridge 保存核心，冻结 SQL 保持原哈希。正式 Supabase 仅官方聚合 SELECT，正式 R2 仅公开 GET/HEAD。写入仅涉及隔离项目 `rnamstwwbzknwbjwdgrf` 的现有 fixture 92017 和私有测试 bucket 新生成的一对对象。Production 配置、DNS、Vercel 和 main 无改动。[收尾边界](evidence/public-readiness-2026-11-10/final-boundaries.json)

| 分类 | 已取得的证据 |
| --- | --- |
| 正式数据库，2026-11-10 官方 SELECT | **586** 景点，582 active、2 temporarily_closed、2 permanently_closed。publication_status 均 SQL NULL，无 redirect 行，450 不存在。封面 586 次、相册 4,078 次，共 **4,664 次引用、4,656 个完整 URL、4,590 个去 query/fragment 身份**。R2 4,662 次引用、4,589 个身份，另有 Google 图片 2 次引用、1 个身份。相册 P95 17、最大 30，1 个身份跨景点共享。数据库 171,371,667 bytes，非账户余量。[正式聚合](evidence/public-readiness-2026-11-10/formal-readonly.json) |
| 当前公开 R2 投影 | 582 景点索引、**6 篇 published Notes、7 篇 Guide**。英文记录中标记 complete 的有 Spot 246、Guide 7、Region 58、Page 7；有效翻译仍需源文本一致性检查。Notes 快照生成日期为 2026-09-29，Guide 为 2026-09-23。其版本可能早于当前编辑源。[公开来源摘要](evidence/public-readiness-2026-11-10/inventory.json) |
| 真实媒体来源和复用 | 公开 Notes 中扫描到 122 次图片引用、64 个 URL，Guide 7 个封面 URL。归档的 582 条 Spot 详情扫描到 4,669 个 URL，包含元数据引用和已过时来源。跨这些投影和归档共 4,740 个 URL，其中 625 个被多记录或多投影复用。此口径与数据库封面/相册口径不同。17 个代表性公开媒体 HEAD 均为 200，其他图片有效性与孤立 R2 对象数量为 UNKNOWN。[有界图片抽检](evidence/public-readiness-2026-11-10/media-head-sample.json) |
| Storage 和旧 URL | `location-images` 为 public，目录共 2,436 个对象，不能据此认定孤立对象数量。公开 slug map 有 220 项，与 bundle 有 2 项差异，与公开详情索引有 218 项 slug 差异。索引 slug 与网页 canonical 属不同层，需逐 ID 归并。[公开 slug map 摘要](evidence/public-readiness-2026-11-10/slug-map-readonly.json) · [有效权限](evidence/public-readiness-2026-11-10/formal-access.json) |

检索中实际出现首页、Guide/Notes 列表及 `/spot/turtle-alley-turtle-alley-636`、`/spot/bukit-tun-razak-274` 等历史记录，证明这些公开 URL 曾被外部检索服务采集。精确 Google 索引、点击和入链需 Search Console 的 URL Inspection/Performance 数据，本轮未取得。正式首页、样本中英文页面和 sitemap 当前 HEAD 为 **402 DEPLOYMENT_DISABLED**。robots 虽为 200，仍带同一平台错误头。[公开请求记录](evidence/public-readiness-2026-11-10/inventory.json)

已验证的真实页面和历史媒体

- 专用 Preview 的首页、两条真实 Spot、海龟笔记及相应英文路由，共 8 路由 × 桌面 1440 / 移动 390 的 **16 次 Chrome 检查**均为 200，单一服务器 H1、canonical、可解析 JSON-LD、无横向溢出。移动截图有实际历史图片解码。中文 Spot 有 TouristAttraction/BreadcrumbList，中文笔记有 Article/BreadcrumbList。英文 Spot 有对应结构化数据，英文笔记缺 Article。[浏览器及 SEO](evidence/public-readiness-2026-11-10/browser-seo.json)
- 五条按源码、slug 和历史链接证据设定的 alias 实际返回 301，包括 `/notes/turtle` 和中文/英文 `spot-274`。真正不存在的路径返回 404。Preview robots 为 `Disallow: /`，所有页面附 noindex。正式 robots 模板另保留允许公开页面、屏蔽 admin/api 和正式 sitemap 的规则。
- 真实海龟巷封面为 **489,326 B WebP**。从已公开 R2 URL 读取，在测试 bucket 以新 UUID 存储，校验字节、MIME、RIFF/WEBP 签名、真实原生 version 并登记。原始 URL 的相同 pathname 与 `/media/legacy/636/turtle-alley-cover.webp` 在 Preview 都返回 200 和相同 SHA-256。此映射明确绑定正式来源 636 → 隔离 fixture 92017，仅为代表样本。[历史字节与身份](evidence/public-readiness-2026-11-10/deployment.json)
- 8 项 HTTP 用例通过。未引用/未发布 404、发布后两个入口 200、下架同一 URL 404、对象缺失 404、同字节但原生版本改变 404、撤销后两个入口 404。使用既有单次 GET 身份与字节门控和最新 Registry 资格，禁止匿名 cookie 预览，响应 no-store。新增 4 项本地安全测试通过。[真实历史媒体记录](evidence/public-readiness-2026-11-10/historical-media.json)

仅完成方案设计与尚未验证部分

| 范围 | 最小兼容方案及状态 |
| --- | --- |
| 站点域名旧媒体 URL | 在同域精确映射原 pathname 到服务端受控记录，两个入口复用同一门控。样本已用真实旧 pathname 验证。全量映射应以来源 URL、共享消费者及当前对象身份为依据，避免按文件名或 ID 猜测。未知映射 404，状态/身份来源故障 503。静态永久 301 会被客户端缓存，受保护图片优先保持原路径的动态 200/404。 |
| `r2.dev` 完整旧 URL | 实测隔离镜像撤销后，**原始公开 URL 仍返回 200**。站点 DNS 无法控制另一个 host 的请求。更新 HTML 引用只能改变新访问，旧外链和缓存仍直达原对象。需先列出共享模块，再审批正式入口退役/私有化与兼容清单。对 r2.dev host 的 301 仅属待确认的平台能力，不能承诺。 [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) |
| 状态和共享媒体 | 已发布且被至少一个授权公开消费者引用、身份一致才允许字节。未发布/撤销/缺失返回 404，来源不可核实返回 503。正文、Guide/Notes/地区/配套复用须纳入消费者关系，避免仅由一个 Spot 下架误删或泄露共享媒体。正式全量映射、迁移及回滚演练尚未执行。 |
| 正式编辑源 | 本轮未导出正式完整数据库、私有稿件、Storage 版本文档、Auth 或 R2 对象清单。已获准并成功的是聚合和少量公开样本 SELECT。公开投影、归档和 bundle 均有时间差，需要按同一迁移检查点核对差量。 |

真正阻止上线的问题

1. **公开旁路 P0。** 当前 locations 已启用 RLS，但 public SELECT policy 为 `true`，anon/authenticated 有 SELECT。anon 无写权限。新路由无法替代正式 RLS 与旧公开 R2 的下架保护，权限与旧资产入口改动需单独审批。
2. **完整路由及实时发布 P0。** 本轮静态 HTML 只代表已捕获内容，未接入正式状态变化门控。公开 Spot 列表、详情索引、Storage slug map 与 canonical 不是同一份清单。需要合并公开路由、历史 alias、隐藏/关闭状态和跨模块引用，并按版本发布。
3. **SEO 来源一致性 P0。** 样本 sitemap 80 条、79 唯一 URL，**0 Spot**，两个 Spot 未列入。源码在缺少可核实质量清单时返回保守空 Spot sitemap，不能直接把所有静态路径补入。两个 Spot 的描述与英文 source 不一致，274 虽标记 complete，运行时降为 partial；636 本来 partial。样本缺 hreflang，英文 noindex 按现有策略生效。应先对齐内容/翻译来源，再恢复有效 reciprocal hreflang 与索引清单。[翻译诊断](evidence/public-readiness-2026-11-10/localization-diagnostics.json)
4. **依赖与恢复 P1。** 初测部分页面有客户端 Event 异常，定点复查 Spot 仍可复现，根因未确认。外部脚本、遥测、地图 API 和写请求在 Chrome 验收中被拦截，地图/影片/商家功能仍待独立验证。中文笔记截图中的嵌入因该隔离策略不可用。原 Vercel 402 也不是已验证的恢复目标。[定点诊断](evidence/public-readiness-2026-11-10/browser-diagnostics.json)

免费限制、后续有界验证和恢复步骤

本轮样本静态导出 **39.125 秒、404 文件、最大文件 2,619,324 B**。Next 类型检查通过，新增脚本定点 lint 为 0 error / 1 anonymous-default-export warning。首次构建被 Windows 沙箱 mkdir 权限阻断，按同一受控入口重跑成功。首次部署被 Wrangler 以重叠 _routes 拒绝，修正为两个不重叠前缀后复用同一媒体登记，成功部署。原始失败记录保留。浏览器检查器最初的 `passed` 只表示检查完成，汇总明确将本轮判为 BLOCKED；代码已修正其判断。[产物及检查摘要](evidence/public-readiness-2026-11-10/summary.json)

保持历史 complete **8 ms** 与更早 **10 ms 临界**记录。下一轮只需对接入版本测一张实际代表性大图及必要的独立重试，校验原文件哈希、MIME、10 MiB 上限和完成后登记，逐请求采集原生 Tail。CPU >10 ms、Tail 缺失或安全异常立即停止，8–9 ms 保留低余量标记。此轮历史媒体适配路径未采集原生 Tail，CPU 为 UNKNOWN，现有上传/保存基准未重跑。

全库 4,590 个规范化身份不能全放一个 LIST。现有双 LIST 按 Spot 前缀查询，响应有上限，仅八次缺项 HEAD、无自动翻页。长年积累的未引用对象会造成截断和预算耗尽，届时 fail closed。先只读取得对象数/每前缀分布，再做一个截断代表样本，维护独立清理计划；不得为了“修复”读取失败盲删或无限分页。私有迁移副本和备份还会增加存储量。

用户核对免费余量可在 Cloudflare Dashboard 的 Workers & Pages → Usage/Analytics、候选 Pages → Deployments、R2 → Metrics/Billing 查看共享用量；Supabase Dashboard 的组织 Usage 按项目筛选数据库、出站、Storage 和 Edge 调用。保存当前周期、统计区间及截图再计算余额。公开限制为 Workers Free 100,000 请求/日、10 ms CPU，Pages Free 500 构建/月、20,000 文件、20 分钟超时，R2 Standard 10 GB-month / 1M A / 10M B，Supabase Free Edge 500,000 调用/月。本轮未取得账户实时余额或保证收费硬上限。[Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Pages](https://developers.cloudflare.com/pages/platform/limits/) · [R2](https://developers.cloudflare.com/r2/pricing/) · [Supabase Usage](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)

用户可执行的备份和回滚流程，执行前另行授权正式导出及停写窗口

1. 选择受控本机加密备份目录，记录时间、main/分支提交、公开投影与 slug map 哈希、DNS/路由配置和当前发布队列位置。
2. 通过正式 Supabase 官方连接导出结构、数据、角色/ACL、序列、触发器、RLS、发布任务及所需 Auth/Storage 元数据。核对 CLI `db dump --help` 的版本和输出范围，连接凭据只在本机受保护环境中使用。
3. Storage 和 R2 字节单独备份到已批准位置，记录 key、大小、MIME、版本、ETag、SHA-256 与共享关系。数据库备份不包含这些字节，ETag 也不普遍等同内容哈希。[Supabase backups](https://supabase.com/docs/guides/platform/backups)
4. 在独立隔离环境恢复，以 586 行、4,664 次引用等当时的基线计数及逐项哈希核对，演练匿名下架、旧 alias、图片与后台。记录可接受 RPO/RTO。
5. 切换时确定唯一写入者，冻结旧后台和会回写旧投影的任务，保留增量日志。异常时先封写并确定最后确认版本，再回到已验证健康的旧版本或静态恢复候选，保持撤销/隐藏清单。当前 Vercel 402，不能把“撤回路由”视为可用回滚。

本轮到此停止。隔离历史镜像已撤销，fixture 保持 hidden，bucket 无公共域名，无新临时 Secret，测试进程已退出。正式切换继续等待授权。
