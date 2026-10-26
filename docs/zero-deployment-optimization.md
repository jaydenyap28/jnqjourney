# JNQ Journey 本地资源优化审计

> 后续 P0 修复与最新门槛见 [zero-deployment-p0-acceptance.md](zero-deployment-p0-acceptance.md)，结论仍为 NO-GO。以下历史报告与证据保留。

> 后续安全验收见 [2026-10-18 验收报告](zero-deployment-safety-acceptance.md)。上轮 Snapshot 超限已无损修复；新的全量回归、主动刷新与重启结果以该报告为准。原报告保留为历史证据。

日期：2026-10-16（Asia/Singapore）。本轮只读检查代码和本地数据，并修改本地实现。没有生产部署、Git Push/Commit、数据库写入、线上图片删除、R2 发布、缓存清除或新资源创建；没有读取凭据文件内容。外部查阅限于官方文档，未查询项目实时额度或线上资源库存。

## 已完成及预期收益

| 项目 | 原行为 | 本地改动 | 资源影响与边界 |
|---|---|---|---|
| Sitemap canonical | 每条 Spot 分别调用 Storage slug map reader | 一次读完整 map，传入所有 canonical builder | 547 条本地 fixture：reader 调用从 547 次到 1 次，减少约 99.8%。这是代码调用次数；实际下载请求数受框架缓存、失败重试及 legacy 路径影响，不是生产 egress 实测 |
| 英文 Sitemap | 每条候选记录重新装配集合，并查询关联 packages | 一次共享英文集合；完整性判断关闭无关 package 查询 | Sitemap 仍执行真实翻译完整性校验；避免每条英文候选重复查 packages 和读取/处理集合 |
| Spot Middleware | 实时 routing API 后，再 HTTP 请求完整 Spot API | routing API 内调用已有 cached resolver，仅返回可见性及来源 header | 普通可见 Spot 内部 HTTP 从 2 次到 1 次，不再跨内部 HTTP 传 gallery。第二个 API 原先可能 CDN HIT，所以不能承诺每次都少一次计费 invocation |
| Guide / Note 详情 | 本地运行实测 `private, no-store`，逐请求 SSR | 空 `generateStaticParams()` 启用首次访问生成及 3600 秒 ISR | 实测先 MISS 后 HIT；热路径避免重复页面渲染、price/widget/affiliate 读取。会增加原先 SSR 路由没有的 ISR 缓存写入，换取 CPU / invocation 减少，不宣称四项指标都同时下降 |
| ISR 时间 | Guide/Note 列表、Spot、英文 Pages 等配置 600 秒 | 统一相关配置为 3600 秒 | 在持续有请求、无主动失效、同一路由缓存未被淘汰时，理论时间触发机会从每小时约 6 次降至 1 次（约 83.3%）。不是定时作业，不是全站或账单节省率 |
| Guide / Note 数据 | 每个 slug 单独下载/normalize 整个集合 | 详情复用已有 collection cache，同时保留 per-slug cache/tag | 多篇文章共享一份集合读取；Admin 原有 collection + slug invalidation 保留，减少 R2 和 Storage fallback 重复读取 |

Next.js 14 的 Data Cache 与 Full Route Cache 是不同层。`revalidate` 配置本身不保证详情页被缓存，故本轮通过本地启动后的真实响应头确认。Vercel ISR writes 按数据量计量；页面越大，一次写入可能占更多单位，不能用再生成次数直接等同写入单位。

参考：[Next.js 14 缓存机制](https://nextjs.org/docs/14/app/building-your-application/caching)、[Vercel ISR 计量](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing)。

## 图片引用与 R2

纯本地扫描 `data/` 和 `public-data/` 共 577 个 JSON，均可解析。完整逐 URL/文件/字段清单在 `artifacts/zero-deployment/local-resource-refs.json`。

| 来源分类 | 去除 query/hash 后的唯一 URL | 出现次数 |
|---|---:|---:|
| Supabase Storage | 29 | 29 |
| R2 `.r2.dev` | 566 | 1679 |
| 其他图片字段来源 | 30 | 32 |

29 个 Storage 引用中，27 个来自 `public-data/regions.json` 的 thumbnail，2 个来自 `data/guides.json` 的 coverImage。R2 自定义域可能归为其他；统计不代表线上图片数量、存储字节或每个引用的浏览器最终请求。现有公共媒体 resolver 有明确封面、绑定 Spot 媒体、去重与 fallback 逻辑，原始引用不一定最终展示。

没有凭文件名推断 Supabase 与 R2 图片相同，没有自动替换 29 个 URL。目录中没有引用也不能证明线上对象可删除：线上 DB、历史版本、其他页面、草稿与系统 `_system/*` 文件可能仍依赖它。没有读取线上对象列表或下载图片核验身份，因此不能提供安全删除清单。

本轮释放的 Supabase **存储占用为 0**；预期减少的是公开读取时的 Storage egress/请求，实际字节收益须恢复后测量。复制图片到 R2 而保留 Supabase 原件本身不会减少 Supabase 存储占用。

## Snapshot / 公开数据库链审计

- 公共 locations/regions：现有顺序为 R2 CDN snapshot → 白名单字段 Supabase → bundled JSON；外层缓存 3600 秒并合并 in-flight。没有改为盲信旧本地快照。
- Spot：R2 index/detail → Supabase 精确 ID 及发布状态 → bundled detail；保留 authoritative not-found 与 unavailable 的区别。
- Guide/Note：R2 collection 优先，失败转现有 Storage/local store。本轮减少按 slug 重复获取集合；保留 Guide 的 fresh URL 机制，避免重新引入旧 CDN 字节问题。
- Guide Trip Costs：现有公开 snapshot 优先；只有缺失记录时才查询已发布 budget。保留原始金额与业务语义。
- 英文：R2/bundled 双语快照；真实页面仍保留关联 package 数据。本轮只在 Sitemap eligibility 检查中跳过 packages。
- 仍有数据库/Storage 路径：Spot live routing、package visibility、packages、Note affiliate IDs、Guide price highlights、Klook widgets、缺失 budget snapshot 的 fallback。未声称公开链完全脱离 Supabase。
- 埋点 `/api/page-view` 仍为 POST + `page_views` insert；访问量高时它可能是主要 invocation 来源。本轮没有执行它、改动统计语义或关闭分析。未来若采用采样/关闭须明确统计损失。
- Middleware matcher 已限定 `/spot/*`、`/en/spot/*`、`/packages/*`，没有全站拦截；保留实时下架及重定向安全检查，因此 Supabase 不可用仍可能让 Spot 返回 503，即使存在旧 snapshot。这是现有可见性约束，未为省额度绕过。
- Package guard 仍实时请求 visibility，异常时现有 fail-open 行为未改；这一处没有计入本轮节省。

本地 locations 和 regions snapshot 的 generatedAt 为 **2026-08-09**，547 个 Spot / 56 个 Region；index 同日生成。它们不是线上最新事实。离线构建的英文 Langkawi Region 及两个 Spot 缺少对应本地数据而 404/Sitemap omission；构建成功不代表这些线上页面验收通过。

## 验证与证据

所有运行经 `scripts/validate-offline.mjs`，以进程级占位 Supabase URL/key、空 service/R2 配置及 Node 外网拦截运行；允许 loopback 供 Next IPC/HTTP 测试。`next build` 会自动载入现有 dotenv，但连接相关值已提前覆盖，没有打印或读取凭据内容。新 guard 的测试确认外部 fetch、HTTPS、socket 在连接前被拒绝。

- 离线 `next build`：通过，静态生成 76/76；Guide/Note 详情从动态标记变为 SSG/ISR。原 .next 权限 EPERM 已通过仅运行本地离线命令的提权解决，没有线上操作。
- TypeScript `--noEmit --incremental false`：通过；最终构建也通过 type validation。
- ESLint：0 error，1 条既有 warning：`app/admin/notes/page.tsx:522` 的 ref cleanup。
- 11 组文件的回归：83 项，82 通过、1 失败。新增 7 项全部通过。
- 唯一失败：`tests/public-media-contract.test.ts:113` 既有 `<500000` 字节约束，本地 locations 为 **503881** 字节。该 snapshot SHA256 与本轮开始一致，测试文件与 HEAD 一致。没有放宽阈值或改数据使其变绿。
- 本地 HTTP：Guide/Note 列表、抽样详情、Sitemap、英文首页均 200；详情第一次 MISS、第二次 HIT，`s-maxage=3600`。6 个路径各请求 2 次。HTML 页各 1 个 H1 且有 canonical。未运行浏览器 JS，不触发 page-view 写入。
- 重启复核另发现：重启 `next start` 后读取已在磁盘生成的 Guide 详情时，缓存响应头缺失，自动断言失败；保留 `runtime-restart-summary.json` / `runtime-restart.log`。同进程首次生成流程通过不等于跨进程或 Vercel 缓存行为已验收。部署前必须验证该条件，尚不能将详情 ISR 标记为生产 GO。
- 重定向、隐藏、404、503、循环及中英文 alias 由 mocked transport / loopback HTTP 回归覆盖；未执行生产 routing 请求。
- 原有改动及 data/public-data 共 **588 个保护文件** SHA256 前后相同。
- `git diff --check`：通过。

证据：`artifacts/zero-deployment/{build.log,test.log,typecheck.log,lint.log,runtime-summary.json,runtime-before-detail-isr.json,build-route-summary.json,protected-before.json,protected-after.json}`。

构建使用 Next 字体 mock，验证编译与数据流，不验证真实字体布局；**该 `.next` 产物不可上传部署或使用 `--prebuilt` 发布**。生产需重新构建并使用真实配置、真实字体。

## 风险及仍待处理

1. 缓存新鲜度：3600 秒是再验证间隔，不是严格最大延迟；首次过期请求可能读 stale，下层 snapshot/data cache 与上层 ISR 叠加也可增加延迟。原 Guide/Note save/delete 的目标路径失效保留，但 price highlight、affiliate、Klook widget 编辑没有完整的目标路径刷新。仅修改这些数据时可能等待缓存再验证，需恢复后逐项验证/补充精准 invalidation。
2. 新增详情 ISR 减少 SSR，但增加缓存写入；低流量/大量一次性 URL 时净收益小，需同时看 CPU、invocation 与 ISR write units。未知 slug 与 alias 也可能形成缓存项，未采用全量 warm-up。
3. 本地首页原始 HTML 约 3.6 MB，英文首页约 3.5 MB；英文多页 props >128 kB。上述为本地未压缩输出，含字体 mock，不能直接换算 Vercel 压缩后的 ISR units。大型内联数据/字体 CSS 与首页数据投影值得下一阶段单独优化，不在本轮重构 UI。
4. Regions snapshot 仍有 Storage URL；没有图片身份核验，无法安全自动迁移。存储量和真实下载字节未测。
5. 额度恢复前，不以本地旧快照重新发布覆盖 R2；不执行 migration、Storage 清理、全站 revalidate 或 broad cache purge。
6. 没有真实浏览器视觉 QA、生产响应头、实时额度与生产 query count 证据。SEO 仅验证抽样 H1/canonical 与既有结构；英文首页现有 HTML 未检测到 JSON-LD，未扩大为 SEO 修复。
7. Next.js 14.2.35 本地重启后已生成详情的 Cache-Control 缺失，原因尚未定位。需在恢复额度后的真实 Vercel 环境验证跨冷启动缓存、3600 秒再验证及发布失效；未通过前不得把新增详情 ISR 作为生产已验证收益，必要时暂不部署这两个详情模板的新增 ISR 改动。

## 本轮变更文件清单

生产代码（13 个，本轮开始时均无本地改动）：

- `app/sitemap.ts`
- `lib/server/location-slugs-store.ts`
- `lib/server/english-page-data.ts`
- `lib/server/public-content-store.ts`
- `middleware.ts`
- `app/api/spot-routing/[slug]/route.ts`
- `app/api/guides/route.ts`
- `app/guide/page.tsx`
- `app/guide/[slug]/page.tsx`
- `app/notes/page.tsx`
- `app/notes/[slug]/page.tsx`
- `app/spot/[slug]/page.tsx`
- `pages/en/[[...path]].tsx`

上列按路径逐个审阅，不包含用户既有 `next.config.mjs`、上传 API、后台、README 或 data 改动。

验证/报告：

- `tests/public-data-contract.test.ts`：原 Middleware source 合约断言改为新的 routingResponse 名称，状态码约束保留。
- `tests/zero-deployment.test.ts`：新增 7 项行为验证。
- `scripts/audit-local-resource-refs.mjs`
- `scripts/validate-offline.mjs`
- `scripts/lib/offline-network-guard.cjs`
- `scripts/verify-offline-routes.mjs`
- `docs/zero-deployment-optimization.md`
- `artifacts/zero-deployment/`：本地证据、原有 diff 备份、构建字体 mock，不属于生产发布内容。

## 额度恢复后才执行的步骤（本轮未执行）

1. 先只读确认 Supabase/Vercel 当前额度、目标生产版本及近 24 小时 CPU/invocation/ISR writes/Storage egress 基线，按相同流量口径比较；不把公开套餐限额当项目剩余额度。
2. 从权威线上数据核对 R2 collections、Spot index/detail、双语 snapshot 与 slug map 的版本和可见性；重点核对离线缺失的 Langkawi 内容、29 个 Storage 引用，以及当前本地未提交内容。此步骤只读，不能自动覆盖 snapshot。
3. 单独解决/确认已有 503881 字节测试失败；核验本地重启缓存头问题；验证 price/affiliate/widget 更新、Guide/Note 发布/下架以及 aliases 的精准缓存失效。需要立即可见的发布链及跨冷启动缓存未验证前，不把详情 ISR 变更直接上线。
4. 在干净分支/checkout 中只拣选本轮 13 个生产代码文件及必要测试，审核原有工作区 diff；不要把已有 data、上传 API、next.config、临时图片或 artifacts 顺带发布。若后续需要 Git 操作，另按授权执行。
5. 使用正常生产配置和真实字体重新 lint/typecheck/test/build；不得复用离线 `.next`，不要将 guard、placeholder URL/key 或 font mock 写入生产环境。检查 public snapshot 读取成功、构建没有隐性 fallback；不需要数据库迁移、新资源或图片删除。
6. 获得后续明确部署授权后，按现有项目流程部署；先验证真实路由的 canonical/H1、301/302/404/503、隐藏边界、首访/复访缓存头和 Admin 发布刷新。不要全量预热或全站 purge。
7. 分时段对比资源指标：Sitemap Storage 调用、Spot routing/detail API invocation、Guide/Note CPU 与 invocations、ISR writes bytes/units、Storage egress。结果恶化则回滚本轮 scoped code；回滚不改数据库和图片。
