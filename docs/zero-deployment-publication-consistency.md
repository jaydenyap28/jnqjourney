# P0 缓存与发布一致性：本地修复验收

> 四项本地收尾的最新结果见 [zero-deployment-release-candidate.md](zero-deployment-release-candidate.md)。本轮历史结果保留，生产仍需预览验收，未部署。

日期：2026-10-18（Asia/Singapore）。**NO-GO，当前候选不具备部署条件。**

完整阅读并接续 `zero-deployment-p0-acceptance.md`；旧报告、失败日志、原始工作树补丁和本轮开始时的文件 hash 均保留。本轮无 Commit、Push、Deploy、生产数据库写入、Storage 删除、R2 上传或云资源创建。Admin 写入仅由合成 transport 测试执行；真实 HTTP 验收只访问本机 Next 与合成 CDN、Auth/PostgREST。所有外部应用网络由预加载 guard 拒绝。文档查询未访问生产项目。

安装版本与 lockfile 均为 **Next 14.2.35 / React 18.3.1**；没有更换依赖或修改 node_modules。正常 `next build` 使用占位数据库配置及字体 mock，**本轮 `.next` 不可部署**。

## 1. 验收矩阵

| 门槛 | 结果 | 范围与证据 |
|---|---|---|
| TypeScript | PASS | `validate-offline.mjs typecheck`，退出 0 |
| Lint | PASS，有既有 warning | 0 errors；原 Note admin ref cleanup warning 保留 |
| 正常离线 production build | PASS | 77/77，未跳过类型/Lint/生成；构建仍有英文大 props、离线 optional provider 警告 |
| 完整回归 | PASS | **316/316，100%，0 skipped**，54 个测试文件；新增 9 项发布一致性测试 |
| 最小范围回归 | PASS | 发布一致性及两个旧契约测试共 14/14 |
| 本机生产 HTTP | PASS（限定场景） | **24/24，100%**；不能等同于所有发布场景或生产验收 |
| Guide 主动刷新，HTML 先读 | PASS | 新标题及版本 hash 出现在首个 HTML；后读 API 一致；随后 HIT，无 TTL 等待 |
| 英文 Guide 已暖页面同步 | PASS（本地） | App publication 调用受保护 Pages ISR refresh；英文新正文与 raw source hash 均读回 |
| Guide/Note 下架与重发布 | PASS（本地、公共集合可用） | API 404/no-store、HTML 404/noindex、后续 404 HIT；重新发布恢复 200 |
| 英文 Note 下架 | PASS（本地） | 已暖 fallback 页面失效后 404 |
| Spot 隐藏、旧别名、故障关闭 | PASS（本地） | 暖页面前仍立即 404 / 301 / 503；SEO headers 保留；每次一个内部 routing HTTP |
| 中英文 alias | PASS（合成场景） | 旧中文路径保留；英文旧身份 308 到 published canonical，再返回 200 与新正文；不是把 308 当成正文成功 |
| 批量失效与失败顺序 | PASS（合成范围） | 一次 snapshot batch、path/tag 去重、保留旧身份、Pages onlyGenerated；SDK/Storage/ISR 错误不报告完全成功 |
| 所有相关页内容逐一读回 | FAIL | 为避免全量预热，仅读回修改身份和小型集合表面；相关页面映射有单测，尚未逐一证明实际新值 |
| Spot 任意编辑的版本级验证 | FAIL | HTTP fixture 证明新描述出现；通用 receipt 当前只验证 Spot 身份/状态，没有完整公开字段版本校验 |
| DB 写入影响行数确认 | FAIL | 原 minimal PostgREST mutation 检查 error，但尚未确认零行/部分行命中；不得把 SDK 无 error 等同于所有行完成 |
| 价格、widget、affiliate 渲染新值闭环 | FAIL | 已接入定向失效；缺少独立 HTML 值级证据。复核明确返回 partial/503，不将 200 状态冒充新值成功 |
| 仅失效真正受影响内容 | FAIL（尚不完整） | 显式路径已定向，但既有 collection tags 会连带失效其他消费者；不能保证所有依赖均最小 |
| 安全重试 | PASS / 部分 FAIL | 有受保护 publication-only retry，不重放 DB mutation；R2 多对象发布失败恢复、旧依赖 scope 的所有失败阶段尚未闭合 |
| 冷进程 STALE 机制诊断 | PASS（诊断） | Data Cache 与 HTML 文件保留；首访版本稳定 STALE，后台生成后 HIT；没有强制 no-store/关闭 ISR |
| 重启首访 HIT+Cache-Control 保证 | 未通过生产门槛 | 本机实际首访仍 STALE、缺 Cache-Control；旧失败证据保留，不能以诊断测试通过替代该保证 |
| Sitemap / 暖访问不重复读写 | PASS（本地） | Sitemap 再次 HIT 无 provider/CDN 读；9 次暖详情无 cache 文件大小/mtime 变化，仅 3 次 Spot 实时可见性 DB GET |
| 故障 fallback 不复活下架内容 | FAIL / 需预览验收 | 真正 CDN 故障仍可读旧 Storage/local fallback；本轮没有凭合成正常来源证明故障安全 |
| 多实例、Vercel adapter、外层 CDN、账单 | 需预览部署验收 | 未部署、未连接生产项目、未读取真实配额，不能标 PASS |

此前一次全回归为 315/316：真实 loopback HTTP 测试遭 Windows 沙箱 `connect EACCES 127.0.0.1`。保留 `test-all-sandbox-eacces.log` 后，在获准本机网络、外网仍被 guard 禁止的条件下重跑原测试，316/316。没有删除或放宽该 HTTP 测试。

## 2. Guide 旧内容的完整调用链与根因

调用链：Admin 权威保存/公共 snapshot → `guides` tag 与路径失效 → `readPublicGuides()` 的现有 `unstable_cache` → Guide API / metadata / HTML → Full Route Cache；英文另走 Pages ISR。浏览器 Router Cache 与外层 CDN 是后续独立层。

本机合成 CDN 已返回新标题，但旧实现的 collection fetch 显式设置 `cache: 'no-store'`。Next 14.2.35 安装源码 `patch-fetch.js` 在静态生成中检查显式 init，抛出 `DynamicServerError`。外层 `unstable_cache` 的内部 fetch 行为不能绕开这项显式检查。原 catch 吞下框架控制异常，误走 `readGuides()` 旧 bundled/Storage fallback，最终把旧集合写回 Data Cache。HTML 与随后 API 同时旧，是集合缓存被旧 fallback 污染；不是该次实验里的 DB 未写成功、Router Cache 或远端 CDN 命中。

修复限定在现有 collection：Guide fetch 保留随机 `?fresh=` URL 和 no-cache 请求头，移除显式 cache init，由已有 outer cache 管理持久化；框架控制异常继续抛出，真实网络故障 fallback 保留。collection identity v3 → v4，避免继续复用已污染条目；未增加 per-slug cache、自定义 cache handler 或持久层。Note 没有这项显式 no-store 根因，其既有缓存保留。

证据：`runtime-root-cause.log` 中可见 `Dynamic server usage: no-store fetch ...` 后的 fallback；`runtime-root-cause.json` 保留原失败。最终验收严格先请求 HTML，再请求 API，Guide 新标题 `OFFLINE_ACCEPTANCE_GUIDE` 与新 hash 均已出现；没有用 API 预热掩盖顺序问题。

层次边界：

| 层 | 本轮确认 |
|---|---|
| 数据库 / Storage 权威写入 | 合成 writer 测试保持先保存后失效；真实生产状态未读取。零行 mutation 确认仍缺失 |
| snapshot 源 / CDN | 本机 cache-busted GET 可见新 bytes；外层真实 CDN 未验证 |
| Data Cache | Guide 根因在此层。tag 失效后重新读新集合，API/HTML hash 对齐 |
| Full Route Cache / ISR | 中文详情延迟再生，首个新 HTML MISS，再次 HIT；已暖英文 Pages 需显式 res.revalidate |
| Router Cache | HTTP 验收不包含浏览器已打开 tab 的客户端缓存。Route Handler 失效不等于所有访客即时 router.refresh；保留为预览门槛 |
| Middleware | Spot live routing 每次单次内部 HTTP，先于暖 HTML；Guide/Note 没有新增逐访问 DB gate |
| 外层 Vercel/CDN | 本轮没有线上 purge/部署，不能推断多 POP 一致性 |

参考版本文档：[Next 14 revalidatePath](https://nextjs.org/docs/14/app/api-reference/functions/revalidatePath)。实际判断以安装源码和 HTTP 证据为准，不套用 Next 15/16 行为。

## 3. 发布失效与结果回报

新增纯函数 `publication-plan.ts`：统一去重 paths/tags/English paths，携带 previous identities/relationships，限制允许的公开路径。Spot 包括新旧详情、同 region 邻居、引用 Guide/Note、祖先 region、列表与 Sitemap；Guide/Note 包括新旧 aliases、关联页面及公开集合；price 仅相关 Guide，widget/affiliate 仅引用 Note，不做整站 route-pattern purge。英文没有对应消费的 widget/affiliate 不额外重写。

`publication.ts` 在编辑时读取四份已发布关系快照；Note 另读一次窄字段 backlink query。源不可用时失败关闭，不能拿过期关系表宣称完整范围。App tags/paths 与 Pages `/api/admin/publication-revalidate` 协调；后者使用安装版本的 `res.revalidate(path, { unstable_onlyGenerated: true })`，不主动生成从未访问的所有详情。只向允许的同源/本地 origin 转发 Admin 身份。

成功 writer 返回 `verification-required` receipt；`adminFetch` 在 writer 响应结束后发起独立 `/api/admin/publication-verify`。这避开在 Next 14 writer 尚未 flush pending tag 时自读旧缓存。Guide/Note 同时核对 API 内容 hash、HTML metadata hash 和英文 source hash，并确认 HTTP 状态；空检查列表拒绝，状态正确但内容 hash 旧仍失败。中文 normalize 与英文 raw published source 的 hash 分开，避免 media resolution/normalization 差异造成错误比较。

失效或独立读回失败：503、partial、persisted 提示及 publication-only retry，禁止客户端自动重放数据库 mutation。重试 API 不进行 DB 写入。**不代表 R2 多对象写入有事务或所有旧 scope 已可靠持久化**，这些仍是阻碍。

价格/widget/affiliate 当前 receipt 使用明确 unverified 原因，独立复核不能将它们标为 verified；前端显示资料可能已保存但公开复核未完成。该行为避免假成功，但不满足完整功能门槛，不能部署。Spot 通用 read-back 还缺版本级证据，也不作为所有字段更新的充分证明。

英文首次运行生成及 TTL 再生也必须 fresh 读取既有 snapshot Map；此前只 on-demand fresh 不覆盖首次 blocking visit。published canonical 优先于旧 bundled slug map。Next 14 构建禁止 getStaticProps 返回 redirect，因此 `getStaticPaths` 排除已成为别名的 pilot 身份，保留 blocking runtime redirect；没有改动真实 slug 数据。

## 4. 冷启动和响应头的实际记录

三类页面的本机实测相同：

| 阶段 | HTTP | x-nextjs-cache | Cache-Control | 内容 |
|---|---|---|---|---|
| 首次生成 | 200 | MISS | s-maxage=3600, stale-while-revalidate | 当前内容 |
| 随后访问 | 200 | HIT | 同上 | 当前内容 |
| stop/start 后首访 | 200 | STALE | **缺失** | Guide/Note hash 与重启前一致；Spot 另查实时可见性 |
| 后台再生后 | 200 | HIT | 恢复 3600 | 同版本 |
| 主动刷新新内容 | 200 | MISS → HIT | 3600 | 新 marker；Guide/Note 新 hash |
| Guide/Note 下架 | API 404 / HTML 404 | HTML MISS → HIT | API private no-store / HTML 3600 | noindex，无原详情 canonical |

Data Cache 与 HTML/RSC 文件的 bytes/mtime/hash 在 start 前后一致。Next 14 本机 `shared-revalidate-timings` 中运行时生成路径的 timing 属于进程 Map；新进程缺项落到约 1 秒默认值，已有 HTML 会按 SWR 再生。**这是已复现的本机框架行为，不是 Data Cache 丢失；并未修复成重启首访必定 HIT。**

重启期间 Guide/Note 未重新下载 collection。Spot gate 的独立进程缓存重新读取了 3 个冷依赖（localization、Spot index、Spot detail），不能再宣称所有 snapshot 都零读。原严格失败与后续诊断原始文件均保留。

最终原始记录：`artifacts/zero-deployment-consistency/runtime-summary.json`；易读完整逐请求表：同目录 `http-evidence.md`，包含状态、headers/cache-control、版本、alias；summary 另保存 robots、indexable、markers、canonical、Data Cache 和 CDN 请求证据。

## 5. 两条旧失败测试

1. attraction renderer：原测试数 helper 源码出现 2 次，实际 alt 使用 helper，标题用 `EntityName`，其内部同样调用 `resolveEntityDisplayName`。现分别断言真实 alt helper 与 EntityName 的共享 resolver，不再要求无用重复调用；原 canonical href/EntityName 断言及已有真实 SSR 测试保留。renderer 未改。
2. Day 0：范围纠正为 `[[0,2],[3,4],[5,5],[6,7],[8,10],[11,14]]`，逐段按 2025-11-04 计算 dateStart/dateEnd，并验证 15 天 14 夜。没有改变行程日期、住宿、景点或草稿。原始两个测试文件备份保留。

这是根据真实调用与既有日期契约更新过时预期，符合本轮用户授权；不是删除测试、放宽业务断言或修改业务资料。

## 6. 资源开销与风险

- Guide 根因修复不增加公开访问 DB 查询、内部 HTTP 或持久缓存层。暖 Guide/Note HIT 继续避免重复 SSR；一次 v4 cache identity 更换会产生一次集合重读/写入，不能忽略迁移成本。
- 本机 9 次暖详情仅 3 次 Spot 实时 DB 可见性读取；Sitemap HIT 无额外请求/写入，既有一次共享集合/slug map 优化保留。
- 持续访问且无主动失效时，600 → 3600 秒的理论时间再生机会约从 6 次/小时降为 1 次；这不是实际账单节省率。冷进程 STALE 再生仍消耗 CPU/ISR writes。
- 发布时新增 4 次关系 snapshot GET，Note 加一次 narrow backlink DB query，另有认证、Pages 已有页面再生和独立 read-back。相较旧漏失效流程，这些是必要但新增的编辑成本。
- 批量 publication 共享集合/index 各写一次；相较逐 ID 重发共享对象，n 个 Spot 可少写约 `2(n-1)` 个共享对象，但实际成功保存后的关联页再生仍会增加 CPU 和 ISR 写入。onlyGenerated 避免全量未访问详情预热，不保证低成本或没有其他共享依赖再生。
- collection tags 的扇出尚未精确到所有单篇消费者，一次 Guide refresh 的计划中可能包含几十个已有英文详情/regions。不能承诺所有 cache writes 最小；频繁编辑需要预览测量 writes bytes/units。
- Affiliate API 改为 private/no-store 响应，保留既有 tagged DB fetch cache，避免无法按 query 可靠清除的外层 API 缓存旧变体。**代价是每次 API 请求可增加 Function Invocations/CPU，DB 通常仍命中共享缓存**；净收益未证明，该变更需单独评估才可部署。
- ISR Reads 随实际页面命中/读回增长；新增 ISR 会把原 SSR 流量转成读写，不能声称 CPU、Reads、Writes、Invocations 全下降。英文首页约 573 kB、部分详情超过 128 kB props 的构建警告仍在，未通过改大警告阈值掩盖。
- Supabase Storage 释放空间为 **0**，没有删除图片。实际 egress、R2 URL 引用安全与生产配额没有本轮在线核验，不能承诺额度恢复。

## 7. 剩余门槛与后续顺序

必须先补齐本地问题：minimal/batch mutation 行数确认、Spot 全字段版本校验、price/widget/affiliate 值级 HTML read-back、R2 部分发布失败的安全恢复及 old dependency scope、共享 tag 扇出评估。现有单测全绿不能替代这些必要门槛。

之后仍需获新授权且额度恢复，使用既有资源做预览部署验收：CDN 故障 fallback 的下架防复活、多实例并发/锁/失效传播、Vercel adapter 的冷实例 STALE/Cache-Control、浏览器 Router Cache、中文英文 aliases、相关列表/region/Sitemap、外层 CDN query 变体；对相同编辑/流量测 CPU、ISR Reads/Writes/bytes、Invocations、Supabase 查询与 egress。任一必要项失败维持 NO-GO。

候选必须重新使用正常环境构建，不能复制本轮 `.next`、假配置、guard、font mock 或 artifacts；不得自动 Push/Deploy。若 Guide/Note ISR 风险仍不可控，可审阅原 P0 报告的仅撤回两类新增 ISR 方案；本轮未执行该补丁或大范围回滚。

## 8. 文件清单与保留证据

本轮相对开始的完整路径、hash 与保护检查由 `artifacts/zero-deployment-consistency/finalize-evidence.mjs` 生成：见同目录 **`changed-files.md`、`integrity.json`、`before.json`、`after.json`**。范围涵盖：

- 核心：`lib/server/public-content-store.ts`、新 `lib/publication-plan.ts`、`lib/publication-version.ts`、`lib/server/publication.ts`。
- 发布入口：admin Guide/Note/locations/Spot 单条与 batch/aliases/prices/budgets/widgets/affiliates；新 publication-retry、publication-verify 和 Pages publication-revalidate。
- 回报与公开版本：`lib/admin-fetch.ts`、locations/affiliate helpers、`AdminLocationForm`、Guide/Note API 与 metadata、English adapter/reader/Pages entry、location slug reader、batch publisher、affiliate API cache headers。
- 测试：两个旧契约与既有依赖 seam、publication consistency 新测试/mock；离线 runner、guard、真实 HTTP 工具。
- 报告：本文件；旧 P0 报告仅追加指向新报告的链接。

生产源代码/测试路径逐一列在 `changed-files.md`，不以原本已脏的 Git diff 冒充本轮范围。1129 个开始时文件均保留；`data/`、`public-data/`、Guide renderer、草稿、package/lockfile 没有本轮修改。旧失败、临时 instrument 诊断、后续 alias/filter 失败和沙箱失败均保留，没有清理旧 artifacts。
