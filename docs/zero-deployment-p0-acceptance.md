# JnQJourney P0 本地安全验收

> 后续缓存与发布一致性修复见 [zero-deployment-publication-consistency.md](zero-deployment-publication-consistency.md)。仍维持 NO-GO；以下历史失败和证据保留。

日期：2026-10-18，Asia/Singapore。结论：**NO-GO**。本报告接续 `zero-deployment-safety-acceptance.md`，历史失败和日志均保留。

本轮没有 Commit、Push、Deploy、线上数据库写入、R2 上传、Storage 删除或云资源创建。生产写入路径只在合成 SDK/Storage/R2 中执行；本机 HTTP 调用 Admin 的非写入 refresh 分支。外部网络由预加载 guard 拒绝，真实 HTTP 仅限 loopback。未读取或输出凭据文件内容。构建使用占位连接配置和字体 mock，不能部署当前 `.next`。

## 验收矩阵

| 门槛 | 结果 | 证据与界限 |
|---|---|---|
| TypeScript | PASS | `validate-offline.mjs typecheck`，无错误 |
| Lint | PASS | 0 errors；既有 `app/admin/notes/page.tsx:522` ref cleanup warning 保留 |
| 正常 Next production build 流程 | PASS（离线配置） | Next 14.2.35，77/77 页面生成；未使用真实生产连接/字体下载 |
| 全部 Node 回归 | FAIL | **307 项，305 PASS、2 FAIL，99.35%；0 skipped**，53 个测试文件；原两条失败未删除或放宽 |
| Guide/Note 下架 API 与 HTML | PASS（本地 CDN 可用） | API 404/private no-store；HTML 404、noindex，后续 404 HIT；重新发布恢复 200 |
| Guide/Note SEO | PASS（本地） | 下架 HTML 无原详情 canonical、含 robots noindex；已发布页面保留详情 canonical |
| Spot 冷/暖实时可见性与旧别名 | PASS | 暖 ISR 页面仍立即 404/301/503；保留 SEO headers 与故障关闭 |
| 三类页面首访、复访 | PASS | 首次 MISS，随后 HIT，`s-maxage=3600` |
| 三类页面进程重启后首访 | FAIL | 运行时生成路径 STALE、缺 Cache-Control；不是 Data Cache 文件丢失 |
| 重启后 Data Cache 保留 | PASS | 重启前后磁盘 cache 一致；恢复 HIT 未新增 snapshot CDN 读取 |
| 主动刷新无需等待 TTL | FAIL（Guide）/PASS（Note、Spot） | HTML 先行严格断言：Guide 出现刷新后旧 HTML/API 的不稳定结果；API 预热可能掩盖该问题，未据此改宽断言 |
| 英文 Spot 独立刷新 | PASS（本地） | 修复 Pages API 导入 React.cache 的 500；真实 on-demand refresh 后看到新正文 |
| 英文 Guide 与 Note 提交闭环 | FAIL | App 的 tags/paths 不自动刷新已有 Pages ISR；旧英文 Guide、下架 Note fallback 仍可 HIT |
| 批量列表 mutation 的公共发布 | PASS（合成写入链） | 一次 batch 的 details → locations → index → tags/paths；发布失败 503，禁止自动重复 DB mutation |
| 批量英文列表/关联页全刷新 | FAIL | 目前仅逐 Spot 刷新英文详情；隐藏/删除时英文 reader 返回 null，列表、旧路径及关联页仍未全部覆盖 |
| Widgets 编辑 | PASS（最小回归）/未完成全链验收 | 先持久化后 tag 与 Note route pattern 失效，失败无失效；未证明多实例、Storage 故障 fallback 的最终 HTML |
| Affiliate 编辑 | PASS（最小回归）/未完成 CDN 验收 | 写入错误不失效；成功失效 fetch tag/API/Note HTML；失败返回部分完成 503。带 query 的外层 CDN 变体不能仅凭 revalidatePath 视为已清除 |
| 价格与费用发布 | PASS（最小回归）/英文 FAIL | 价格 fetch tag + 中文 Guide 失效；英文改读已审核权威来源。费用发布失败 HTTP 503；英文 Pages 与 aliases 尚未端到端关闭 |
| Sitemap 与暖缓存资源成本 | PASS（本地） | 复访 HIT，无新增 CDN/SDK 请求；9 次暖详情请求没有 cache 文件大小/mtime 变化 |
| 生产 Vercel adapter/CDN 与真实额度 | 未验证 | 零部署限制下不接触生产验证；不能由本机 next start 推断生产表现 |

历史缓存条件与独立空 Data Cache 的完整 HTTP 验收均为 **24 项，18 PASS、6 FAIL（75%）**。前者保留于 `runtime-retained-cache.json`；后者记录在 `runtime-summary.json`。失败条目完全相同：三类详情重启、中文 Guide 主动刷新、英文 Guide 更新、英文 Note 下架失效。实际状态、响应头、canonical、noindex、CDN 请求及缓存文件证据均保留。HTTP 测试不混入 307 项 Node 回归通过率。

## 1. 重启：四类机制分别判断

**Data Cache** 保存共享 Guide/Note collections、Spot ID payload 与 tagged fetch 数据。本机磁盘内容在 stop/start 之间保留；恢复页面 HIT 期间没有新增合成 CDN 请求。没有为了解决重启额外增加持久缓存层。

**Full Route Cache** 保存 HTML/RSC；**ISR** 决定何时重生成这些页面。Next 14.2.35 安装代码 `shared-revalidate-timings.js` 将按需生成路径的 revalidate 时间放入进程 Map；构建 manifest 中有路径的配置可重读。`incremental-cache/index.js` 的 `calculateRevalidate()` 对缺失记录使用 `?? 1`，`curRevalidate` 也会缺失。旧 HTML/RSC 文件仍存在，但新进程首次请求按约 1 秒默认期限判为 STALE，响应缺少原 3600 秒头；重生成后再次 HIT。

旧验收中 Guide 的 MISS 还混入了 setup 的关联失效：Note refresh 会使引用 notes collection 的 Guide HTML 失效。本轮先把所有相关详情恢复 HIT，再等待 1.2 秒超过框架缺失配置的默认 1 秒，才 stop/start。严格的“重启首访应为 HIT+3600”断言保留，三类均失败。该问题是本机 next start 的可复现框架行为，不是 mock 断网或断言误把 Data Cache 当 HTML cache；Vercel 使用的存储/adapter 是否相同仍未知。

为排除历史构建数据干扰，另将原 `.next/cache/fetch-cache` 完整移动保留于本轮 `fetch-cache-before-clean-run/`，创建空本地目录复测；没有删除旧缓存内容、改变业务 source 或清除线上缓存。缓存首次生成与进程重启分开测量，空缓存仍复现同样的重启问题。

Guide 的另一项失败不能与上述 timing 问题混为一谈：最终 HTML 先行读取中，调用 refresh 后新内容未出现，后续 API 诊断也返回旧标题；空缓存下只有一个 `guides` collection 数据条目，仍写入旧标题。合成 CDN 已提供新标题，但当前证据尚不足以定位哪个读取/再生顺序使旧结果再次落盘。曾在先读取 API 的复测中通过，所以明确禁止把 API 预热作为验收前提。该刷新/再生问题保留为独立阻碍，未用新增 cache、长等待或宽松断言掩盖。

**Middleware** 在 Full Route Cache 前运行。Spot 每次公开访问仍只有一个内部 routing HTTP；实时 SDK fetch 是 no-store，因此即便 HTML 已 HIT，隐藏、重定向及上游故障也即时生效。Guide/Note 没有新增 Middleware 或公开访问的实时 DB 查询。

参考 [Next 14 caching 文档](https://nextjs.org/docs/14/app/building-your-application/caching)。实际结论优先采用安装源码与本机 HTTP，而不是把文档的持久缓存承诺当作当前 adapter 的验收结果。

## 2. 下架 200 的根因与修复

第一步只在 generateMetadata 提前 notFound，仍返回 200，证据保留于 `runtime-metadata-only.json`。根因是 `app/loading.tsx` 将 Guide/Note 包进全站流式边界；页面抛出 notFound 时，状态头可能已经发出。该组件本来就是“正在载入景点”的 Spot skeleton。

将原组件原样移动至 `app/spot/loading.tsx`，并在 Guide/Note metadata 先检查已缓存 collection 中是否存在/已发布，缺失立即 notFound，再读取次要数据。没有增加 DB 查询、内部 API、可见性缓存或 JS 客户端重定向。Spot 加载体验保留；Guide/Note 未缓存首访需要等待服务端判定，失去全站 skeleton 是明确的体验取舍。

本机真实 HTTP：下架 API 404/no-store；HTML 404/noindex，后续缓存仍 404；重新发布、主动失效后恢复 200 且去掉 noindex。原详情 canonical 不出现在 404 HTML。404 可缓存 3600 秒，因此重新发布后的主动失效必须继续保留。参见 [Next 14 loading](https://nextjs.org/docs/14/app/api-reference/file-conventions/loading) 与 [not-found 状态语义](https://nextjs.org/docs/14/app/api-reference/file-conventions/not-found)。

**仍有安全边界**：这只证明 CDN 公共集合可用且 publication/refresh 成功的路径。Guide/Note 的 CDN 故障仍可进入旧 Storage/local fallback，Guide 静态集合合并还可能带回已移除项目。未建立新鲜发布状态来源之前，不能宣称所有故障条件都已防止内容复活。

## 3. 提交链的安全修复及剩余缺口

- 列表/批量 location PATCH/DELETE（包含封面清除）成功写 DB 后，服务端调用一次 `publishLocationBatch`。一次权威 locations/regions 读取及一次 slug map 读取，先发布受影响可见详情，再各写一次 locations/index，完成后失效 tags/paths。隐藏/删除仅从索引排除，不删除旧 Storage/R2 文件。POST 与 returning 单记录表单保留“先保存 custom slug 再发布”的顺序，避免双重发布。
- 新增受 Admin 保护的 batch publication endpoint，允许后续只重试发布；非法 ID/未登录不触碰 publisher。已提交 DB 后发布失败返回 503，消息明确要求重载，不自动重放 mutation。
- 表单发布或英文刷新失败不再显示“发布成功”；兼容旧 schema 的 safe-save 也继续进入公共发布链，不再提前跳走留下旧页面。
- Widget 原进程 60 秒 Map 无法跨实例 tag 失效。本轮用单份带 `klook-widgets` tag 的既有 Next Data Cache 替换它，而非叠加；Admin 读新权威值，public 共享读取，成功保存后只使实际消费该 store 的 Note 页面延迟失效。不是每次访问强制 Storage 下载。
- Affiliate 给真实 SDK fetch 标记共享 tag，成功编辑后失效 API/Note HTML；DB 失败不失效，失效异常返回 503。外层 query CDN 缓存仍需独立验证，不能当作完整解决。
- 英文 fresh regeneration 现在强制读取 locations、regions、guides、notes、trip-costs 与 localization，不再只刷新部分 Map。英文 Guide 价格改为与中文相同的已审核 reader，Sitemap eligibility 跳过该额外读取。被移除的英文 Note 首次生成会 notFound；但已有英文 Note ISR 仍需被主动失效。
- 修复英文 Spot refresh 的 Pages API bundle 中 React 18 `cache` 不存在导致的模块初始化 500。App Router 保留请求 memoization；Pages 不应用该 request wrapper，原持久 ID cache 不变。新增无 React.cache 环境回归，并以真实本机 refresh 验证。
- Guide 手动费用 snapshot 和预算 publish/restore 的公共发布失败改为 HTTP 503，保留权威已保存事实与错误信息，不自动回滚、重复保存或报告完整成功。

**未闭合**：英文 Guide/Note 提交没有 Pages res.revalidate 调用；英文批量隐藏/删除、关联 region/Guide/列表和旧 alias 路径没有全部覆盖；价格英文页的 on-demand 调用与 read-back 也未补齐。不能通过对每次访问加 DB gate、全站 purge、全量 res.revalidate 或全量预热宣称解决，这些会改变本轮成本目标。需要在实际 Pages 依赖范围明确后实施有界的跨 Router publication 协调与失败读回，当前候选继续 NO-GO。

R2 多对象写入不具备原子性：后续对象失败时，前面的对象可能已经更新，503 不代表整批回滚。只有全部写入完成后才发出本轮失效；这也是批量流程仍需要独立故障验收的风险。没有自动回滚权威资料。

## 4. 两条行程/渲染失败的逐条结论

1. `tests/guide-attraction-display.test.ts:30` 要求 daily renderer 中 `guideAttractionDisplayName(...)` 字符串出现 **2** 次，当前为 **1** 次。图片 alt 用 helper；标题改用 `EntityName`，后者实际使用同一个 `resolveEntityDisplayName`。新增真实 React SSR 验证中英文标题的编辑别名与 alt helper 一致、不会泄露不相关 canonical 名字。原测试同时要求 EntityName 的断言仍在；为凑次数添加无用 helper 调用不是根因修复。该文件/renderer 未修改，原失败保留。
2. `tests/guide-segment-contract.test.ts:11` 要求 Day 1–15 范围 `[[1,3],[4,5],[6,6],[7,8],[9,11],[12,15]]`。`complete-guide-display-contract.test.ts` 与已确认草稿却要求 Day 0–14：`[[0,2],[3,4],[5,5],[6,7],[8,10],[11,14]]`。新增测试逐段以 2025-11-04 为 Day 0 计算 dateStart/dateEnd 差值，全部吻合，2025-11-18 截止共 15 天，15天14夜不变。原两份测试与真实行程数据保持原样，未移动住宿/景点/日期掩盖矛盾。

这两条需要明确更新过时测试契约的独立决定；当前按用户要求保留红灯，不标全绿。

## 5. 资源成本与风险

- 下架修复新增公开访问 DB 查询 **0**、内部 API **0**、持久缓存层 **0**。首访等待服务端状态验证，暖 HIT 保留。
- Spot Middleware 仍为每次 Spot 访问一次内部请求、一次实时可见性 DB 读取。9 次暖详情请求（3 Spot + 3 Guide + 3 Note）只有 3 次该 DB 读取，没有额外 public provider/CDN 读取，cache 文件未重复写。
- Sitemap 复访 HIT 没有重复 SDK/CDN 读取。
- 批量 n 个公开 Spot 至多 n 个 detail 对象加 2 个共享对象，避免逐 ID 重建 n 次全量集合/索引。相较旧列表“只改 DB”增加了必要发布成本，不能当作纯节省；相较重复调用完整单 Spot 发布，可少写约 `2(n-1)` 个共享对象。英文仍逐 ID refresh，有随 n 增长的编辑成本。
- Widget 使用单份 tagged Data Cache 取代进程 Map，有一次缓存写入/失效后重读；避免每个实例每分钟重复 Storage 读，但实际额度收益未计量。Note route pattern 失效是延迟再生，不会立即全量预热；频繁编辑仍可能增加 ISR writes。
- 价格 Storage fetch 使用现有 Next tag；Admin 新鲜读取是 edit-time 成本。英文先前 bundled 价格改用权威 reader，首次构建/再生可能增加 Storage 读取；不发生在每次暖页面访问。不能承诺净收益为正。
- 重启的 HTML 再生会增加 CPU/ISR writes；当前不能保证新增 Guide/Note ISR 的资源收益。Guide HTML 数百 KB、英文大 props（构建警告）进一步放大成本。没有新增付费资源、预生成全部 slug 或全站清缓存。
- 本地节省不等于线上释放空间，本轮线上 Storage 释放 **0**。已有 R2/Storage URL 引用资料未修改，也没有据此生成安全删除清单。

## 6. 仅撤回新增 Guide/Note ISR 的具体备选（尚未执行）

建议的最小备选是仅从 `app/guide/[slug]/page.tsx`、`app/notes/[slug]/page.tsx` 删除本轮优化新增的空 `generateStaticParams()` 及其说明。保留共享 collection Data Cache、3600 秒 fetch/cache tags、主动失效修复、metadata 硬 404 和 Spot 实时 Middleware；不改 Spot/英文 Pages 的既有 ISR，不回退 data、media、slug、价格或内容改动。

可审阅补丁：`artifacts/zero-deployment-p0/guide-note-isr-opt-out.proposed.patch`，**未应用**。验证候选应在隔离副本中应用后正常 build，确认这两类动态详情不再新增 Full Route Cache 条目，HTML 下架 404、metadata、共享 Data Cache 命中与主动刷新仍正确；重新评估逐次 SSR 的 CPU/invocations。减少 ISR writes 会牺牲 SSR 成本，不能假定两项都下降。

该备选只消除新增两类 route ISR 的部署风险；不会修复既有 Spot 冷启动、英文 Pages 失效、fallback 发布状态或两条回归契约，因此执行后也不能自动升级为 GO。本轮不修改框架依赖、不加入 custom cache handler、不修改 node_modules。

## 7. 本轮完整变更文件（相对本轮开始）

生产实现：

1. `app/guide/[slug]/page.tsx`：metadata 前置存在性判定。
2. `app/notes/[slug]/page.tsx`：metadata 前置发布判定、affiliate fetch tag。
3. `app/loading.tsx` → `app/spot/loading.tsx`：原文件原样移动，不丢组件。
4. `app/api/admin/locations/route.ts`：列表/批量写入后一次公共发布。
5. `lib/server/publish-location-batch.ts`（新增）：有序批量快照发布与成功后失效。
6. `app/api/admin/public-data/spots/batch/route.ts`（新增）：Admin 保护的只重试发布入口。
7. `lib/admin-locations.ts`：列表 mutation 后英文刷新、部分失败不报成功。
8. `components/AdminLocationForm.tsx`：发布/英文失败提示及 safe-save 不跳过发布。
9. `lib/server/public-data-resolver.ts`：权威 snapshot DB 读取 no-store。
10. `lib/server/public-spot-resolver.ts`：权威读取 no-store、React.cache 条件兼容 Pages bundle。
11. `lib/server/klook-widgets-store.ts`：单份可失效 cache 替换进程 Map，Admin fresh 读取。
12. `app/api/admin/klook-widgets/route.ts`：成功后失效 tag/Note 路径。
13. `app/api/admin/affiliate-links/route.ts`：错误与成功失效顺序、部分错误 503。
14. `app/api/affiliate-links/route.ts`：共享 affiliate fetch tag。
15. `lib/server/english-page-data.ts`：fresh 覆盖全部相关快照、Note 存在性、已审核价格 reader。
16. `lib/server/guide-price-highlights-store.ts`：公开 tagged fetch 与 Admin fresh 分离。
17. `app/api/admin/guide-price-highlights/route.ts`：成功后失效价格 tag。
18. `app/api/admin/guide-budget-snapshots/route.ts`：公共费用发布失败 503。
19. `app/api/admin/guides/route.ts`：公共费用发布失败 503。

测试与工具：

20. `tests/zero-deployment-p0.test.ts`（新增）：12 项根因、失败顺序、权限、渲染与日期行为回归。
21. `tests/admin-locations.test.cjs`：原断言保留，新增批量成功/部分失败真实 SDK 回归。
22. `tests/admin-affiliate-links.test.cjs`：为原 SDK 集成测试提供 cache 副作用 seam。
23. `tests/spot-localization-authoring.test.ts`：新价格依赖 mock，原断言不变。
24. `tests/zero-deployment.test.ts`：新价格依赖 mock，原断言不变。
25. `scripts/validate-offline.mjs`：独立 P0 日志目录、补齐新增文件 lint。
26. `scripts/verify-offline-routes.mjs`：排除 setup 干扰、磁盘/请求证据、硬 404 metadata 与英文刷新。
27. `scripts/lib/offline-network-guard.cjs`：fixture 路径限定在当前仓库 artifacts，外网和写请求仍拒绝。
28. `docs/zero-deployment-p0-acceptance.md`（新增）：本报告。
29. `docs/zero-deployment-safety-acceptance.md`：仅追加后续报告链接，历史结论保留。
30. `docs/zero-deployment-optimization.md`：仅追加后续报告链接，历史结论保留。

证据位于 `artifacts/zero-deployment-p0/`：开始时 1125 个源文件 hash、既有 Git diff、原 loading 备份、各阶段 runtime、build/typecheck/lint/test-all、最终 integrity 与 proposed patch。旧 `artifacts/zero-deployment/`、`zero-deployment-acceptance/` 保留。最终 source hash 清单显示 1099 个原文件未变、26 个原路径修改/移动、5 个新增路径，共 31 个物理路径，范围外变更为 0；两个失败测试、Guide renderer、草稿与 data/public-data 内容保持开始时一致，loading 原内容逐字节一致。上面清单将一次文件移动作为一项列出。

## 8. 额度恢复后、获得后续授权才执行的步骤

1. 先解决英文提交/关联失效、Guide 刷新不稳定、fallback 可见性与两条测试契约；选择是否采用仅撤回 Guide/Note ISR 的候选，当前不部署。
2. 用只读方式核对真实权威数据、R2 publication 版本和线上 quota 基线；本地旧 snapshot 不作为生产内容事实。
3. 在干净候选中只拣选审定文件，正常配置重新 lint/typecheck/test/build；不得复用本轮 `.next` 或把网络 guard/假配置/font mock/artifacts 部署。
4. 经新的明确部署授权后，使用现有资源进行有限路径冷启动/重启、MISS/HIT、发布/隐藏/重发布、英文/aliases、CDN query 变体及管理员部分失败 read-back；不全站 purge、不批量预热。
5. 按相同流量比较 Vercel CPU、Function Invocations、ISR writes bytes/units 与 Supabase Storage egress。任一必要门槛不通过维持 NO-GO，不创建付费资源或删除文件作为补救。
