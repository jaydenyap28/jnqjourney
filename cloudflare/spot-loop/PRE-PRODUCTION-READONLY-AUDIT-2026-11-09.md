# Spot 正式迁移前只读审计

**正式迁移继续 HOLD。当前候选无法独立接管正式 Spot。** `3603644` 仍是已通过的隔离技术基线。正式数据、权限、发布依赖和原域名路由尚有阻塞，旧 Vercel 入口也无法作为已验证可用的回滚目标。

审计时间为 2026-11-09（新加坡时间）。GitHub 的 `main` 为 `7cee63d00a603992456eba71cc4b526a80d8ab25`，迁移基线为 `3603644e0d378cc85bd788f4a13ef2588db47248`。以 `main` 源码核对正式设计，以现有 CLI 授权运行正式 Supabase 聚合 `SELECT`，以公开 GET 核对线上表现，以 Cloudflare API 和已登录控制台读取额度。线上 Vercel 返回 402，无法核对当前部署的应用 SHA 或实际渲染与 `main` 的一致性。此次只交付审计文档和脱敏读数，历史上传、权限与 Chrome 证据保留。[现有 Preview 验收](DIRECT-PREVIEW-2026-11-09.md) · [本轮脱敏证据](evidence/preproduction-readonly-2026-11-09.json)

## Gap Analysis

状态含义：**已验证**为本轮直接观测、源码证据或已归档验收，按各项标注。**待验证**为缺少运行证据。**阻塞**为满足现有上线要求前必须关闭的问题。**需要用户授权**为下一阶段有明确外部副作用或涉及完整正式数据的操作。

| 范围 | 正式侧证据 | 候选范围与差距 | 风险 / 状态 |
| --- | --- | --- | --- |
| 数据和生命周期 | 正式 `locations` 共 **586** 行。582 为 `active`，2 为 `temporarily_closed`，2 为 `permanently_closed`，`publication_status` 全为显式 `NULL`，无当前 redirect 行。ID 450 已不存在。`id`/`region_id` 为 bigint，`updated_at` 为可空 timestamptz，`images`/`tags`/`related_note_slugs` 为 text[]，`price_info`/`image_metadata` 为 JSONB。坐标非空，另有评论、营业时间、视频、到访记录、双语编辑字段。 | `config` 拒绝正式项目，ID/slug 为 fixture allowlist。只接受 `active`/`inactive`，真实关闭状态会被当成来源异常并返回 503。缺字段、可空版本、真实 ID/slug、已有行兼容、创建及单项/批量删除未覆盖。 | **P0 阻塞**。真实状态已验证，候选差距有源码证据。 |
| 编辑、账号、权限 | `main` 的 `/api/admin/locations` 以 Bearer token 校验 Supabase 用户后用服务端 service role 执行新增、更新、删除及批量动作。后台还直接读取 `locations`、`regions`、affiliate 状态；表单支持自定义 slug、图片焦点/alt/图注、封面/相册/正文图、批量导入和下载、远程图片解析、地图和商家资料。`main` 的 `requireAdminRequest` 仅在 `ADMIN_EMAILS` 非空时检查 allowlist，实际线上 allowlist 值未读取。 | 隔离测试已证明账号、HttpOnly Cookie、同源写入、严格 allowlist 和版本冲突；界面只有一个 fixture 的部分字段、单图上传与保存。现有后台 Bearer、路由与 Cookie 作用域不能直接互换。正式身份列表和权限迁移仍待验证。 | **P0 阻塞**。空 allowlist 是正式源码中的条件风险，不能据此断定线上配置为空。 |
| 下架与旁路 | 正式数据库 RLS 已开启，`locations` 目前的 SELECT policy 为 `public USING (true)`，`anon` 与 `authenticated` 均实际有 SELECT 权限。正式 Middleware 和 Spot 路由用实时状态阻断页面，但数据库读规则不会过滤 draft/hidden。公开 R2 `r2.dev` 可直接返回快照和图片。 | 候选只保护自身 HTML、JSON 和私有媒体端点。已通过下架后页面 404、私有媒体 401。旧公开 R2 URL、历史快照、列表 API、Next 数据端点和直接数据库读不会因 Worker 路由切换而自动受保护。 | **P0 阻塞**。需要明确每个公开表示的下架契约，并关闭旁路。现有 586 行均无 draft/hidden，审计未创建样本验证泄露。 |
| 媒体来源和迁移 | 582 条 active 行有 582 个 `r2.dev` 封面引用。相册共 4,049 个引用，其中 4,047 为 `r2.dev`、2 为其他 HTTP。封面与相册合计 **4,623 个不同 URL**，不是实际对象数，也不含正文内嵌图、外链视频和其他模块共用图。正式相册 P95 为 **17 张**，最大 **30 张**；正文 P50/P95/最大为 1,171/2,785/7,694 UTF-8 bytes。 | 已验证 10 MiB Presigned PUT、S3 签名、R2 CopyObject 和私有对象 receipt。候选只接受其 fixture 下带 receipt 的媒体路径，不能直接保存正式 `r2.dev`、Supabase Storage、外链或已有无 receipt 对象；CSP 仅允许自己的图片源。旧对象 MIME、字节数、共享关系和引用完整性未盘点。 | **P0 阻塞**。应先决定兼容旧 URL、受保护资产及共享资产的边界。 |
| 媒体提交与并发 | 正式 `/api/upload/r2` 由 Node 处理 `multipart`，使用 AWS SDK 写现有 R2；后台支持多图和客户端压缩。已有图片管理还涉及 Supabase Storage、远程导入、下载和清理。 | Presigned 骨架可以保留，但当前 `completeDirect` 先读票据再执行多个 R2 操作，未见原子认领。重复 complete 或 complete/cancel 交错时，失败清理路径可删除同一最终键和 receipt。另，`/media/candidate/*` 对可见 Spot 检查 receipt，但未核对该图片已被行引用，所以已验证未保存的图在知道 URL 时可匿名读。以上为源码风险，未做并发重放。 | **P0 阻塞**。授权后只做有界竞争复现和状态保护；验证中断、过期、重复请求和已发布对象不被清理。 |
| 发布和缓存 | `locations` 有版本更新时间、redirect 验证和发布入队触发器。表单写数据库、保存 `_system/location-slugs.webp`（legacy `.json` 回退）、发布 R2 detail、locations、index，随后协调英文记录和 Next cache/tag/path。当前公开 `locations.json` 与 Spot index 同属 11 月 5 日快照，英文公开记录对象较旧。发布队列共 586 行，4 行待同步且已达重试阈值，均为关闭状态。最近确认同步为 11 月 5 日。调用 `/api/system/spot-sync` 的任务仍启用、每分钟调度，最近调度为 11 月 9 日 09:53 SGT；调度发生不能证明目标 HTTP 或发布成功。 | 候选用即时读取 DB 与 PATCH 版本保护，保存无需构建；不会更新正式索引、英文快照、主页/地图投影或旧 Next 缓存。阶段 1 的 outbox SQL 与构建 Worker 是未启用备选，不能作为发布能力计入。 | **P0 阻塞**。确定单一写入与发布责任、可重试的版本回执及交叉模块可见性。 |
| URL、重定向和 SEO | `/spot/:slug`、`/en/spot/:slug`、`/api/spots/:slug`、`/api/spot-routing/:slug` 共享 ID 与 canonical 逻辑。正式 alias 由 Storage slug map 与 ID 生成。源码支持真实 301/302、Spot/Notes 目标、链和循环保护、404/503、质量门槛、英文翻译完整性、canonical/hreflang、结构化数据、OG/Twitter 和合并 sitemap。正式 `location-images` 为公开 Storage bucket，存在一份 slug map 对象；本次未导出其内容。 | 候选只有 fixture alias、两语言简化模板、试验 JSON 和 blanket noindex。不能覆盖历史 alias、正式重定向链和 Notes 目标、英文翻译过期策略、原 SEO 元数据、sitemap 与现有 Next 客户端契约。公开英文快照有 331 条 Spot 记录，其中 246 complete、85 partial，不能直接当成线上可索引 URL 数。 | **P0 阻塞**。需权威 URL 与状态清单及逐类型对照，不能用单一 301 样本替代。 |
| 与非 Spot 模块协作 | 首页/地图、地区列表依赖 `/api/locations` 及共享快照；Guide、Notes、地区和配套通过 `spotId`、slug、关联和封面引用 Spot。Spot 页面也读取这些模块、地图及第三方内容。正式 `/admin`、`/_next/*`、`/api/*`、sitemap、robots 是共用边界。现有 Next 14 App/Pages、ISR、Node `fs`、AWS SDK、`sharp`、`archiver` 等不能从轻量候选测量推出兼容。 | 仅代理 `/spot/*` 和 `/en/spot/*` 能隔离一部分 HTML 流量，但不能交付完整发布/后台/SEO 契约。把候选 `_routes` 的宽 `/api/*` 放在正式同域会拦截无关 API。替换整个域名会影响非 Spot。 | **P0 阻塞**。模块可分步拆，但现有候选无法独立承接。 |

关键源码定位：[正式主分支](https://github.com/jaydenyap28/jnqjourney/tree/7cee63d00a603992456eba71cc4b526a80d8ab25) · [`middleware.ts`](../../middleware.ts) · [`spot-routing`](../../lib/server/spot-routing.ts) · [`AdminLocationForm`](../../components/AdminLocationForm.tsx) · [`spot-publication`](../../lib/server/spot-publication.ts) · [`sitemap`](../../app/sitemap.ts) · [冻结的候选 Worker](worker.mjs)。

### 公开来源能说明什么

- 正式首页、中文/英文 Spot 样本、路由 API 和 sitemap 均实测 **402 `DEPLOYMENT_DISABLED`**。`robots.txt` 虽返回 200，同样携带该 Vercel 错误标识，不能据此认定正常正式 robots 可用。Cloudflare zone 为 active，现有 Worker 路由查询返回 0 条；DNS record 详情读取 403。当前 HTTPS 回包显示 Cloudflare 与 Vercel，精确 origin、proxy、TTL、历史可恢复部署还要单独核实。
- 现有 R2 `locations.json` 和 Spot index 均返回 200，582 个不同 ID/slug，生成时间为 11 月 5 日。它们与 DB 当前 active 计数相同，仍不能证明整套投影、逐条字段和路由一致。仓库的 547 个旧详情每个相册仅一条，线上只读抽样的一条详情有 8 张，正式 DB P95 为 17。旧 bundle 只能作对照，不能作为真实容量、完整备份或发布状态来源。
- 将同版本的 582 条公开 slug 转成候选 `CANDIDATE_SPOTS` 形状，JSON 为 15,366 B，已超过 Workers 单变量 5 KB 的官方限制。该试验 allowlist 不能直接扩成正式路由清单，真实 slug 应按权威数据契约读取。 [Workers 变量限制](https://developers.cloudflare.com/workers/platform/limits/#environment-variables)
- 正式 `r2.dev` 已在用，官方将其定义为开发用、有动态限流的公开端点。沿用旧 URL 涉及稳定性与下架旁路；贸然关闭它会影响共享内容。若未来需要换资产入口，必须先列出受影响对象与非 Spot 消费方并获得授权。[R2 公开 bucket 文档](https://developers.cloudflare.com/r2/buckets/public-buckets/)

## 免费额度与成本

| 项目 | 当前已观测 | 限额或无法确认 |
| --- | --- | --- |
| Workers / Pages Functions | 控制台当前 Workers **Free**。2026-11-09 UTC 00:00 至 01:47:49 的账户 Pages Functions Analytics 为 **54** 次，独立 Workers 数据集返回空集合。属于短窗口分析数据，不是账单，也不代表历史正常流量。 | 共享 **100,000 次/UTC 日**，每次 **10 ms CPU**，128 MB 内存、每请求外部 subrequest 限额 50，内部服务另有口径。Workers 官方当前包体限额是 64 MiB 未压缩、启动 1 秒，旧 3 MB gzip 规则已取消。达到每日限额时 Fail closed 会返回 1027。静态请求绕过 Functions 才不计动态额度。正式 Spot 高峰、爬虫、并发和另有项目用量未获完整历史。 |
| Pages 构建与产物 | 候选 API 返回 6 个 Preview 部署、0 个 Production，canonical 为空，两个环境 Fail closed。冻结产物 9 个文件、共 36,414 B，最大 28,812 B，Worker gzip 9,829 B。历史样本是 442 个文件、27.223 秒本机构建；之前 5,040 文件为静态估算。 | Pages Free 500 次构建/月、账户同时 1 个、20 分钟、每站 20,000 文件、单文件 25 MiB。六个 Direct Upload 记录不等于托管构建计量；账户本月已消耗构建次数、完整正式产物、实际构建时长均未知。候选 Spot 保存的构建次数实测为 0。 |
| R2 Standard | 账户 API 7,475,803,277 B payload、466,208 B metadata、5,984 个已发布对象；Infrequent Access 汇总为零。控制台约 **7.48 GB**，正式共享 bucket 约 7.44 GB，隔离 bucket 10 对象/37.75 MB。控制台 10 月 30 日–11 月 30 日当前周期 **Class A 85、Class B 约 67.22k、$0.00**。月初至查询时的 GraphQL 聚合遇到 API 查询预算限制，周期读数来自控制台。 | Standard 免费 **10 GB-month、1M Class A、10M Class B/月**，R2 互联网出站免费。GB-month 按周期每日峰值平均计算，不能把即时存量直接当本月可用余额。超额按计费单位向上取整，Standard 单价分别为 $0.015/GB-month、$4.50/M Class A、$0.36/M Class B。免费额度不是费用硬上限。 |
| Supabase 和其他现有依赖 | 此次确认正式数据库能只读查询，历史记录的组织为 Free、文件存储约 0.93/1 GB。 | 当前文件、数据库、缓存/非缓存出站及 Auth 使用量未知。Free 公开额度包括 500 MB 数据库、1 GB 文件、缓存与非缓存出站分别 5 GB。候选扩大请求规模会向 PostgREST/Auth 转移用量；翻译、地图等现有外部服务的额度和可用性另核。 |

官方口径：[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) · [Workers 包体规则变更](https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/) · [Pages Functions Pricing](https://developers.cloudflare.com/pages/functions/pricing/) · [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/) · [R2 Pricing](https://developers.cloudflare.com/r2/pricing/) · [Supabase Pricing](https://supabase.com/pricing) · [Supabase Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)。

### 按当前候选路径估算

一次匿名页面浏览触发一次 HTML Worker 请求，每张实际加载的私有图片再触发一次 Worker 请求、一次实时 DB 读取及两个 R2 Class B（receipt 和图片）。缓存命中、懒加载、机器人、重试、其他站点请求均会改变结果；`m` 取实际加载数，不取相册上限。每张成功新上传约有 2 个 Worker API 请求、1 次直达 S3 PUT、4 次 Class A（票据、PUT、复制、receipt）和 3 次验证读；保存与预览另计。`mutationData` 会按提交的媒体逐条检查 receipt 和对象 HEAD，大相册及封面重复可能放大操作数；R2 内部 subrequest 与外部请求分开测量。

| 假设日浏览量 | `m` | Worker 需求/日，未扣其他使用 | R2 Class B 需求/30 天，未计现有用量 |
| ---: | ---: | ---: | ---: |
| 1,000 | 2 | 3,000 | 120,000 |
| 10,000 | 4 | 50,000 | 2,400,000 |
| 20,000 | 4 | 100,000 | 4,800,000 |
| 10,000 | 17 | 180,000 | 10,200,000 |

这些是需求情景，不能假定超额流量仍能通过 Free。以每天 50,000 次同形 DB 读取为例，若实际响应平均 2 KB，30 天约 3 GB；5 KB 则约 7.5 GB，可能先遇到 Supabase 非缓存出站配额。当前候选媒体请求也读取完整选定 Spot 行，实际网络字节、缓存率与授权流量未测，不能按正文大小直接计费。

以现有存量稳定一个月作示例，即时量距 10 GB 约 **2.52 GB**。若 4,623 个不同 URL 全部各形成独立新对象，平均 0.5 MB 时多约 2.31 GB，总量约 9.79 GB；平均 1 MB 时多约 4.62 GB，总量约 12.10 GB，若持续整个周期，按上述取整和免费量计算的存储示例约 $0.045。两者都是假设，未测对象实际大小或去重，且未计 staging/备份、共享 bucket 增长和临时峰值。候选票据/暂存已有清理，已验证但未引用的最终对象仍需要保留策略。**目前能确认的成本只有已观测周期 $0.00，不能承诺正式负载也为零。**

### CPU 临界值和必要的下一次验证

冻结的直传结果（授权/完成）为 1 MiB **5/10 ms**、5 MiB 5/8 ms、10 MiB 4/6 ms、独立 10 MiB 4/7 ms。1 MiB 完成验证的 **10 ms 已触及硬门槛**。旧的整文件缓冲 74 ms 和流式重复 12 ms 属于淘汰路径，不能归入 Presigned PUT。原始 409 的 CPU 缺失，单次新 409 实测 3 ms；续验 30/30 有原生事件，安全阶段最高 4 ms，浏览器最高 7 ms。

直传大小与 Worker CPU 不线性相关，R2 网络等待和 Worker CPU 也不同。现有数据反映单 fixture 的签名、回执、轻量渲染与少量图，无法外推真实相册循环、复杂元数据/正文、重定向链、冷路径、并发突发或上游限流。并发会放大排队、请求总量、重复完成/保存和部分失败；10 ms 仍按每次 invocation 判断。

下一阶段只需一批脱敏代表样本，覆盖实际状态枚举、17/30 图、长正文、英文缺失/过期、301/302 到 Spot/Notes、旧媒体/新 receipt。先离线比对序列化和 URL/SEO 合同；再在隔离环境对这些新增路径做定点原生 Tail，限定 1/3/5 并发短批及一次同票据竞争、一次同版本编辑冲突。建议总预算最多 60 次候选 Worker 请求，超过 10 ms、观测缺失、泄露、错误路由或误删即停止。达到临界值应复核热点和可接受余量。无需重新执行已通过的四次文件尺寸和既有 Chrome 流程。

### 风险排序

- **P0 / 阻塞切换**：关闭状态不兼容，正式权限与下架旁路，媒体提交竞争与遗留对象契约，现有发布投影和 SEO 路由缺口，以及不可用的原站回滚目标。
- **P1 / 高、待验证**：真实相册和流量下的 CPU、请求放大、R2/Supabase 额度、公开媒体限流及第三方依赖。拿到代表性原生数据和正常流量前无法签署零费用可行性。
- **P2 / 较低、待验证**：冻结小包和 0 构建保存已验证；正式文件数、完整兼容产物和实际构建预算需在受控版本交付时核算。

## 备份、切换和回滚门槛

| 门槛 | 必须具备的证据 / 处理方式 | 当前状态 |
| --- | --- | --- |
| 可恢复备份 | 在授权窗口导出同一 DB revision 的结构、约束、序列、RLS/授权、Spot 和相关引用、发布队列及路由映射。用稳定排序、ID/状态计数、关键字段 hash 与序列值核对。Supabase Storage 和 R2 单独备份对象字节，保留 key、大小、MIME、版本/ETag 与 SHA-256，区分公开与私有、共享与孤立。跨 DB/Storage/R2 无共同事务，须记录一致性边界并核对增量。备份应加密存于经批准位置，先离线或隔离恢复演练；ETag 不能普遍替代内容 hash。 | **阻塞 / 需要用户授权**。公开快照不是备份；未核实正式可恢复备份日期、范围、RPO/RTO 或演练结果。Free 不应假定可用 PITR。数据库备份不包含 Storage 对象字节。[Supabase Backups](https://supabase.com/docs/guides/platform/backups) |
| 单写与发布保护 | 保持一个 `locations` 权威和一个写入者。影子阶段只读；审批后切换窗口冻结旧编辑入口和会写入的 cron/优化/翻译任务，处理或记录排队 revision。新写入原子匹配版本，发布回执必须对应同一版本，旧任务不能覆盖新版。对旧公开 DB/快照、两语言页面、alias、JSON、图片、CDN 与其他引用逐一校验隐藏/删除。不要为双写在两个数据库维护冲突版本。 | **阻塞 / 需要用户授权**。当前正式触发器存在，旧发布器会使用共享投影。实际批量队列和状态已读到，迁移事务、权限和下架跨表示尚未演练。 |
| 路由与 SEO | 原 host 保留时先列出精确匹配及排除路径：双语 Spot、其 API 与受保护媒体，单独处理 sitemap 和跨模块契约。不得用 DNS/CNAME 做 URL 分流。Cloudflare Worker Routes 需要 active zone 和可代理的记录，需验证旧源非 Spot 页面可用、TLS 与 host 转发、cache 行为、登录 Cookie 和原域名 CORS。保护规则应以真实 live state 决策；Preview 仍 noindex，正式只对合格 canonical 恢复索引，核对双语 hreflang、301/302、404/503、OG/结构化与 sitemap。 | **阻塞 / 需要用户授权**。路径代理在原理上可分流，但现站非 Spot 的源目前 402，当前候选无正式路由和同域契约。 [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) |
| 可用回滚目标 | 切换前以独立地址验证一个可服务的旧 Spot 源或其他明确批准的安全回退部署，保留路由快照、版本与一致性清单。设置触发条件：数据泄露、状态/SEO 错误、超 10 ms、配额或 5xx 失控即暂停写入及回滚。先封写与记录最后提交，再切回已验健康的路由并验证保护/索引；必要时依据 delta journal 对齐写入及共享投影，避免回滚代码时回退业务数据或重新显示下架项。 | **P0 阻塞 / 需要用户授权**。Vercel 当前 402，单纯撤 Worker 路由只能回到不可用入口；候选 Pages 从未部署 Production，Preview 也不是 Pages 原生 rollback 目标。 [Pages Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/) |

## 下一阶段最小实施计划（待决定）

1. **先解决回滚与数据授权。** 确定可用的非 Spot 上游和独立健康回退目标，确认有权限取得受保护的正式备份、slug/alias、对象清单、近期正常流量与配额。记录最低可接受恢复时间和零丢失已提交版本的验收条件。备份、完整正式导出和任何副本恢复要另行批准。
2. **限定为隔离兼容包。** 在现有 Presigned 方案上做差量适配，优先处理真实 status/ID/字段、正式公开渲染与 URL/SEO 契约、单写发布投影、权限/下架旁路、媒体并发与历史引用。保留旧 URL 与共享对象，先走脱敏克隆和只读影子验证。变更数据库策略/SQL、正式 bucket 和密钥、旧后台和任务开关均需授权。
3. **只做新增的代表性验证。** 执行上面的有界样本、CPU 与并发、恢复演练，得到正常流量的每页请求、B 操作、出站、存储增量和切换预算。要求所有路由及非 Spot 回归通过，回滚目标可用，$0 预算在账户共享用量下仍有余量。只在这些条件齐备后提交具体切换/回滚清单给用户决定。

**本阶段到此停止。** 隔离技术 GO 有效；正式上线、DNS/Worker Routes、数据写入或迁移、凭据和付费变更都不在本次授权内。
