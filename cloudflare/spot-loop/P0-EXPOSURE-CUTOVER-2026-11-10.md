# P0 公开旁路与发布门控

**P0_EXPOSURE_CUTOVER_BLOCKED · PUBLICATION_GATE_BLOCKED。正式迁移 HOLD。**

隔离数据库已收紧真实权限，页面与图片已接通同一实时资格检查。正式切换仍有具体依赖未迁移，验收也保留一条原生 CPU 缺口。本轮以 `69d66af55e1939cd2287152495c58242e05f7328` 为基线，仅处理两个 P0，没有重跑 Registry/Edge/Bridge 保存基准和 30 图浏览器用例。[脱敏汇总](evidence/p0-cutover-2026-11-10/summary.json)

| 已实际修复的隔离功能 | 实测结果 |
| --- | --- |
| locations 旧入口 | 撤销 PUBLIC、anon、authenticated 的 SELECT。真实匿名与 authenticated JWT 对 `select=*`、公开列、后台列和 hidden 过滤均为 401/403、`42501`。同两角色直接调用新 RPC 也被拒。共 10 项 ACL 检查通过。 |
| 服务端公开投影 | 新增 `jnq_public_spots(bigint[])`，SECURITY INVOKER，固定 search_path，限制 1–20 个唯一安全 ID，只有 service_role 能执行。显式选择 32 字段，排除当前公开模板未使用的 `review_jayden/review_qing/is_visited/created_at`。测试私有标记没有出现在公开 JSON/HTML。正式字段分类仍需审核。 |
| 统一资格 | `id<>450 AND status='active' AND (publication_status IS NULL OR publication_status='published')`。与既有 Spot/Registry 的公开语义一致。正式只读计数为 **586 总记录、582 合格**，绝不会因 NULL 把所有景点隐藏。关闭状态继续不公开。 |
| 首页、列表、详情、alias | 专用门控样本以 92005/92017 为边界。NULL 发布时首页、列表、详情 200，旧 alias 301；隐藏后首页列表去除该记录，详情和 alias 404；重新发布后正文立即显示新版本。 |
| 历史媒体 | 复用已有隔离海龟巷 WebP 的字节，独立验证并登记新 key。真实旧 pathname 和新路径在公开时返回 489,326 B、相同 SHA-256；隐藏/关闭/撤销后返回 404。 |
| 来源故障 | 独立故障 Preview 请求一个不存在的上游 RPC，产生真实上游失败。首页、列表、详情、alias、历史图片均返回 503，no-store，无图片字节和静态 fallback。 |

正常 [Preview](https://codex-p0-publication-gate.jnqjourney-spot-loop-migration-candidate.pages.dev) 的固定部署为 `b1bf921e-65a7-46f3-853e-73e40f4e5824`，故障部署为 `74daccaf-3d0b-47d6-8974-03f919c3786f`。这是最小隔离门控样本，首页列表为两个 fixture 的简单渲染，详情复用已有候选 renderer。它尚未把真实站点首页、所有 API 和后台读调用整体换成新入口。[代码](publication-gate.mjs) · [部署与原生身份](evidence/p0-cutover-2026-11-10/deployment.json)

页面每次请求直接读当前数据库公开投影，图片先用同一投影核对引用，再用原 Registry lookup、同一次 R2 GET 的身份和字节、receipt HEAD 及最后一次资格检查放行。页面正文来自本次读数，保存和撤销**不触发静态构建**。真正 Next 静态站未来必须在静态 HTML、RSC/JSON、历史 alias 和图片的每个入口前执行当前资格门控。未接通的静态快照不能提供实时撤销。

旧 r2.dev 的确切范围

| 正式资源或消费者 | 已核对的依据与影响 |
| --- | --- |
| Bucket | **`jnqjourney-img`**。账户 API 将它唯一对应到 **`pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev`**，当前 enabled=true，自定义域名为零。测试 Bucket `jnqjourney-spot-loop-isolated-media` 的 managed URL disabled。 |
| 景点 | 正式库 **586 条记录**有该 host 的存储引用，其中 582 条按当前状态公开。依据实际 URL 字段和 JSON 引用统计。 |
| Notes | 现有公开快照 **6 篇**均直接引用该 host，各有 7–15 个不同媒体 URL。slug 和显式 relatedSpotIds/block.spotId 保存在证据中。 |
| Guide | 7 篇公开攻略经**现有 public-content-media resolver**和已捕获 locations 投影解析后，7 个实际封面均指向该 host。其中仅 2 篇原始 cover 字段直接是 R2，另外 5 篇通过关联地点和现有解析规则取得 R2 封面。没有按文件名推断。 |
| 其他页面 | 正式 SQL 命中 **10 条地区、3 个已发布配套、12 个 active 选项**。首页、地区页、搜索、Guide/Notes 列表与详情、配套卡片/选项，以及中英文和元数据中复用的图片都受影响。 |
| 公开数据源 | 该 host 同时提供 `public-data/locations.json`、regions、guides、notes、spots/index/详情及英文 records。关闭 bucket 公共入口也会中断这些 feed，不能只替换图片。 |

[Bucket/域名核对](evidence/p0-cutover-2026-11-10/bucket-entrypoints.json) · [正式引用所有者](evidence/p0-cutover-2026-11-10/formal-reference-owners.json) · [逐 Guide/Note 解析及源码调用清单](evidence/p0-cutover-2026-11-10/reference-impact.json)

上述是可取得的正式聚合和公开投影范围。完整私有稿件、外部客户端、旧缓存页面和外部热链仍未知。跨模块共用图片的最终公开资格不能直接等同于某一个 Spot 的状态。关闭之前必须确认共享消费者，否则会损坏仍公开的 Notes/Guide。

旧 r2.dev host 属于 Cloudflare 管理入口。站点域名上的映射只能保留旧 pathname，无法拦截另一个 host 的访问，也不能承诺给 r2.dev 原 URL 配置 301。上一轮已验证原 URL 在隔离镜像撤销后仍为 200。本轮只读核对其开关仍启用。现有可行的最小路径是**先改所有站内引用和数据源，再关闭旧公共入口**，接受未更新的外部热链失效；若必须保持这些旧完整 URL 永远 200，同时要求即时撤销，目前没有经过验证的兼容办法。[R2 公共入口说明](https://developers.cloudflare.com/r2/buckets/public-buckets/)

数据库依赖与精确变更

正式 locations 的 RLS 已启用，policy 为 public SELECT USING(true)，anon/authenticated 都有表级 SELECT，无列级限制，二者无直接写权限。目录检查未发现依赖 locations 的 public view；字面引用该表的 public function 只有 SECURITY INVOKER 的 `validate_spot_redirect`。这不覆盖目录文本无法识别的外部动态 SQL。[正式权限](evidence/p0-cutover-2026-11-10/formal-preflight.json) · [目录读取路径](evidence/p0-cutover-2026-11-10/formal-read-paths.json)

仓库检出 **17 个直接表调用文件**。其中 7 个后台客户端为列表、编辑、地区、Notes、Guide、affiliate、Klook Widgets，它们使用普通 authenticated 会话直接读表，正式收紧前必须换成经过管理员鉴权的服务端 API。4 个公开 reader/fallback 文件涉及首页、搜索、地区、Spot、英文页面、sitemap 和 `/api/locations`、`/api/spots`、Guide/Notes API。它们的匿名 fallback 及旧 R2 快照 fallback 也需接通新公开投影/实时门控。另 6 个服务器调用应核对保持服务端身份。不能直接在正式库 REVOKE 后期待原站继续工作。

- [隔离执行 SQL](review/public-read-gate.draft.sql) 已经通过官方连接，仅执行于 `rnamstwwbzknwbjwdgrf`。已有 RLS policy、Registry 六个 RPC 与全部写权限保留。实际有效 ACL 和 PostgREST 拒绝已核对。
- [正式切换 SQL 草案](review/public-read-gate.formal-cutover.sql) **未执行**，含显式项目/reader-ready 操作者断言和对象/有效 ACL 检查，单事务提交。断言只是执行前置检查，不自动证明所有应用调用已完成迁移。
- [安全回滚 SQL](review/public-read-gate.rollback.sql) 保留新 RPC 和关闭后的 ACL，以便应用退回上一份健康的服务端读取部署。文件另列了原 SELECT grant 的人工逆操作，但重新 GRANT 会重新开放旁路，不是安全的自动回滚。正式 schema 完整撤回只能在调用方已迁走且替代保护通过后另行审批。

最小上线顺序及回滚

1. **替代入口先可用。** 为正式媒体和公开数据 feed 准备已获准的服务端入口、完整引用映射及最新资格来源，完成必要备份。共享消费者规则和旧完整 URL 的处理方式需用户批准。只有一张图片的隔离证明不足以关闭整个 bucket。
2. **先换调用方再收权限。** 先上线并影子核对服务端公开 reader 和 7 个后台受保护读 API，验证首页/列表/详情/alias/图片/所有 feed，确认隐藏内容不会从旧缓存和 fallback 回流。之后才执行经批准的正式 SQL，匿名直接表/API/RPC 拒绝必须即时核验。
3. **核对所有链接。** 正式页面、JSON、英文、meta 图片与已知消费者的有效引用全部指向替代入口，禁止遗漏旧 R2 feed。以保存的 URL/key/版本/消费者清单核对，未知项继续 BLOCKED。
4. **最后关闭旧 r2.dev。** 准确目标为 `jnqjourney-img`。Wrangler 4.158.0 的只读 help 已确认待批准命令为 `wrangler r2 bucket dev-url disable jnqjourney-img`。本轮未执行。随后从无登录上下文验证真实旧图片和真实旧 feed 入口不可读，并验证新入口仍按状态工作。
5. **故障时安全回退。** 暂停编辑并记录最后确认版本，回到前一份健康受控入口，保留隐藏/撤销记录及闭合 ACL。保留原对象、路由及映射备份，不按失败请求盲删对象。旧 Vercel 当前 402，不能视为健康回退目标。只有用户明确接受再次公开、并确认无隐藏/撤销泄露后，才考虑 `wrangler r2 bucket dev-url enable jnqjourney-img` 这种恢复开关的逆操作；它会重新开放整桶。

原生验收和剩余阻塞

27 次 Cloudflare 请求中 **26 条**取得原生 Tail，最高 **6 ms**。页面/列表通常 1–2 ms，历史图片门控为 4–6 ms，包含 1 次 GET、1 次 HEAD、3 次 RPC。原请求 `1794278768484-11` 返回预期隐藏 alias 404，但 CPU 仍 UNKNOWN，后续一次新的 404 有独立 1 ms 证据，未冒充原数据。恢复过程中最后一个查询参数拒绝请求已有原生 CPU 0，脚本误把 query 与 Tail pathname 直接比较，已只读重新关联，保留原错误。两项静态旁路请求未继续发到云端，本地三项测试通过。未用重复低值覆盖缺口。[首段](evidence/p0-cutover-2026-11-10/native-acceptance.json) · [续段](evidence/p0-cutover-2026-11-10/native-resumed.json) · [Tail 正常](evidence/p0-cutover-2026-11-10/runtime-gate.json) · [Tail 故障](evidence/p0-cutover-2026-11-10/runtime-fault.json)

因此隔离功能已验证，但本轮保守保留 **PUBLICATION_GATE_BLOCKED**，缺完整原生观测且真实站点所有表示尚未接通。**P0_EXPOSURE_CUTOVER_BLOCKED** 的实质原因是 7 个后台客户端、4 个公开 reader、全部媒体/feed 消费者仍需完成适配，以及旧 r2.dev 热链/共享资格的取舍。最小下一步是完成这些确定的调用方替换和入口映射，复用本轮 RPC/门控，不增加媒体架构。

两条隔离 fixture 均 hidden，新镜像已撤销。新 Secret 为零，Tail/验收进程已退出，测试 bucket 私有。正式复核仍为 586/582、原 SELECT 权限和 public R2 启用，新 RPC 在正式库不存在。Production canonical、变量和 R2 binding 均为空。历史 complete 8 ms 风险保留，实际账户免费余额和 Edge CPU 仍 UNKNOWN。本轮不扩大到 SEO、地图或影片，完成后停止。[收尾](evidence/p0-cutover-2026-11-10/final-boundaries.json) · [正式复核](evidence/p0-cutover-2026-11-10/formal-final.json)
