# JnQ Journey 零部署安全验收

后续 P0 定点修复与最新门槛见 [zero-deployment-p0-acceptance.md](zero-deployment-p0-acceptance.md)。以下保留该阶段原始结论与证据，不代表全部后续修复结果。

日期：2026-10-18，Asia/Singapore。结论：**NO-GO，尚不满足上线前全部验收条件**。

本轮只做本地修复、合成传输测试、离线构建和本机 HTTP 验收。没有 Commit、Push、Deploy、线上数据库修改、Storage 文件删除、R2 发布、全站清缓存或创建资源。没有读取/输出凭据文件内容。既有工作区改动保留；原始 Snapshot 及本轮开始时的 Git diff 已备份。

## 1. 500 KB 失败定位及无损修复

| 项目 | 证据 |
|---|---|
| 文件 | `public-data/locations.json` |
| 原始字节数 | **503881**，不是 503881 KiB |
| 原测试 | `tests/public-media-contract.test.ts:113`，`Buffer.byteLength(locationRaw) < 500000` |
| 超出限制 | 3881 字节；测试要求严格小于 500000 |
| 修复后 | **423612** 字节；减少 **80269 字节，约 15.93%** |
| 原因 | JSON 缩进/换行占 80269 字节；不是重复景点行导致 |
| 数据完整性 | 547 个 ID、547 条完整记录均唯一；解析前后 deep equality，通过；字段、顺序、文本、URL、日期及 source metadata 全部保留 |

评估了去重、拆分及轻量化：整行/ID 没有重复，不删除任何景点；region 对象有重复信息，但做字典化需要改公共 schema 和全部消费者；shortSummary（各值合计约 175343 字节）及 thumbnail（约 88179 字节）占比较大，但截断或删除会丢信息。本轮只做序列化空白精简，足以满足原限制；没有调高上限。

新增 `scripts/compact-public-locations.mjs`，仅操作本地固定文件并校验无损及原字节预算。原始文件：`artifacts/zero-deployment-acceptance/locations.before.json`；精确分析：`snapshot-size.json`。原有 500 KB 测试保留并通过。

该文件仍是 2026-08-09 的旧 fallback，不是生产最新数据。精简本地文件不会直接释放 Supabase 存储，也不表示线上 R2/API 响应同步缩小；线上占用本轮减少 **0**。

## 2. Middleware 与 SEO 验收

已修复：

- live routing 的 Supabase SDK fetch 显式 `cache: 'no-store'`，防止 Next 默认 GET 缓存削弱实时发布状态。
- Spot Middleware 每次只请求一次 `/api/spot-routing/<slug>`；详情解析在该服务端 handler 内调用已有 resolver，无第二个 `/api/spots` HTTP 请求。
- 发布状态确认失败、异常 JSON、错误目的地、网络/上游故障均关闭访问，返回 503 + Retry-After，不能用旧快照绕过可见性检查。
- 隐藏页面返回真实 HTTP 404。旧别名/编辑重定向保留 301/302；只允许本站受限 Spot/Note 路径，拒绝外部跳转。
- 增加 `X-JNQ-SEO-Indexable`。隐藏、重定向、故障、静态旧快照回退均为 false；英语需实际翻译状态 complete 才允许 true。负向响应保留 `X-Robots-Tag: noindex, nofollow` 和 `private, no-store`；正常页面不强行覆盖自身 robots 元数据。
- 权威 Supabase 已确认隐藏/删除时，Spot resolver 不再复活旧 bundled detail；真正的网络错误仍可走既有内容 fallback，但 Middleware 的实时 gate 不能被该 fallback 绕过。

覆盖：冷模块与暖模块、两种语言、发布/隐藏/旧别名/404/503/断网/畸形响应/非法跳转/旧快照/翻译不完整；实际 SDK transport 连续及冷实例查询均为 no-store；实际本机页面已暖缓存后仍立即观察到隐藏 404、旧别名 301、上游故障 503。参数或 slug 非法时 API 拒绝。未查询线上发布状态。

兼容限制：schema 缺少 publication_status 等新字段时，仍有原先 legacy schema reader；没有确认当前线上是否有这些字段。本轮没有修改 schema。

## 3. ISR、保存与失效链

### 本地修复

1. 移除 Guide/Note 详情的第二层按 slug 持久数据缓存，改为单份 collection cache 后选择详情。修复“刷新集合时，详情再次缓存旧选择结果”的问题；同时减少持久缓存项。集合 key 升为 v3，避免沿用旧的按 slug 选择。
2. Spot payload 改为按稳定数字 ID 缓存（v2）。`spot-449`、canonical 和任意同 ID 前缀共享一个 payload key/失效 tag，避免 alias 产生重复数据缓存写入；页面路径缓存仍独立，不能据此宣称任意 URL 的页面缓存已受限。
3. Note 保存、改名、隐藏（published=false）、重新发布和删除补齐已知 aliases 的 tag/path，以及 Sitemap 失效；Guide 保存和删除补齐 Sitemap、删除时全部 aliases 的失效。
4. Guide price highlight 保存后刷新对应 `/guide/<slug>`。
5. Spot snapshot 发布完成后补齐 ID tag、主页、locations API、Sitemap 和相应双语 fetch tags；所有失效只在该发布步骤成功后执行。失败返回 503，测试确认不会提前宣称缓存刷新成功。
6. Note 的 R2 snapshot 发布失败不再被静默吞掉。保留已经写入的权威版本并释放原有锁，向调用方返回“权威已保存、公共发布失败，先重新载入版本”的明确错误；不自动重试保存、不回滚真实资料。该流程只在内存 fake Storage/R2 中测试。
7. Guide 和 Spot snapshot Admin handler 增加 `action: 'revalidate-public'` 的非写入恢复分支；Note 原分支加 slug 校验。全部仍先校验 Admin，固定内容类型/身份和路径，不能提交任意 path/tag；没有新增通用无鉴权刷新 endpoint。Spot 恢复会读权威身份，随后按 ID/canonical 精准失效，不重建 snapshot。正常默认保存/发布流程保留。
8. R2 collection/index/detail 的缓存读取增加 origin revalidation 请求头，保留 Next 的 3600 秒数据缓存；没有全局 no-store。Guide 原有 fresh URL/read-back 机制保留。

### 各业务流程的验收边界

| 内容 | 现有流程 | 本轮验证 |
|---|---|---|
| Spot 创建/修改 | Admin mutation → slug 保存 → snapshot publish → English refresh | 既有真实 SDK+mock HTTP 回归；snapshot 发布成功后失效顺序、失败分支回归；未在生产执行 |
| Spot 隐藏/发布 | publication_status + snapshot；Middleware 实时权威 gate | 内存发布/隐藏/再发布及真实本机暖页面隐藏 404；主动 refresh 后新正文立即出现 |
| Spot 旧别名 | 数字 ID 与 canonical/custom slug、redirect_url | ID 缓存共享、已知 alias 失效计划；本机旧 alias 301、暖/冷故障保护 |
| Guide 保存/改名/删除 | 权威 Storage + R2 collection → tags/paths | 既有保存读回/aliases/发布失败回归，补齐 alias/Sitemap；本机内容主动刷新通过 |
| Guide “隐藏” | 模型没有独立通用 published/hidden 开关；公共集合中移除对应项目相当于下架 | 未给模型虚构新状态；模拟从公共集合移除，API 404；页面严格 404 未通过 |
| Note 保存/改名/隐藏/发布/删除 | 权威锁/版本校验 → Storage → R2 已发布 collection → tags/paths | 合成全部状态转换、版本冲突和发布失败保留权威版本；本机内容主动刷新通过；页面严格 404 未通过 |
| 英文 Pages | Spot 表单后续 Pages `res.revalidate` 与本地 snapshot reader | 既有流程检查及翻译单元回归；没有把 App Router 的 revalidatePath 当作英文 Pages 端到端刷新证明 |

**仍有缺口**：Spot Admin 列表的批量 mutation/删除与表单完整 publish 流程不同，未自动重建所有相关 R2/English 列表；Guide/Note 英文通用页面也未在本轮补齐完整的跨 router 失效。Klook widgets、affiliate 独立编辑仍没有完整的关联 Note 页面精准刷新。双语 reader 的进程内 60 秒 Map 缓存不能只靠 App tag 失效来证明已刷新。不能声明所有保存入口都无需等待 TTL。

此外，Guide/Note 在公共 CDN 不可用时仍保留既有 Storage/local fallback；旧本地版本不能证明内容仍处于已发布状态，Guide 的本地完整集合合并也可能重新包含已移除项目。此次没有为 Guide/Note 建立等同 Spot 的实时前置 gate，不能将故障 fallback 当作下架安全已验证。非写入 refresh 只使缓存失效，不会重发一次失败的 R2 publication。

### 本机 HTTP 结果

运行 `scripts/validate-offline.mjs runtime` 启动真实 Next production server；使用 `.invalid` 域名限定的 synthetic Auth/PostgREST 和 loopback CDN。调用真实 Admin **非写入 refresh 分支**，读/改只限 artifact fixture 内存和状态文件。对保存 endpoint 的写入流程使用独立 mocked transports，不使用真实数据写入。

已验证 Spot、Guide、Note 首次生成/随后 HIT、主动刷新后的合成内容立即出现；Spot 已缓存页面仍可实时隐藏/重定向/故障关闭。严格重启与严格下架 404 的失败继续保留，不改成宽松断言。

## 4. 仍未通过的运行验收

### A. 三种详情路径重启

按需生成路径在重启后的首次读取：Guide 出现 MISS（额外生成）；Note/Spot 出现 STALE，且缺少 Cache-Control。不能视为保留了 3600 秒缓存。

已从安装的 Next.js **14.2.35** 源码定位：

- `SharedRevalidateTimings` 运行时新增路径的时间保存在进程内 Map，重启后消失；build manifest 中预列出的路径有持久初始时间。
- `IncrementalCache.calculateRevalidate()` 对 manifest 中没有的路径使用 `?? 1`，默认约 1 秒；`curRevalidate` 缺失也会影响响应头。
- 新增单元测试直接执行已安装模块，确认 seeded path 与 runtime path 的重启差异。

没有修改 node_modules、伪造响应头、把所有页面设为永久缓存、禁止新内容路径，或为了绕开问题升级整个框架。预生成部分旧本地 slug 只能覆盖部分路径，还会增加构建/写入，不能消除新内容路径的问题。**当前详情 ISR 不获生产 GO**；应在独立变更中验证兼容修复/框架版本与 Vercel adapter，或在最终发布候选中暂不包含新增 Guide/Note ISR。

### B. Guide/Note 下架 HTTP 状态

从 fixture 公共集合移除内容并主动刷新后，对应 JSON API 已返回 **404 + private,no-store**。页面正文也已变为 not-found，并有 `<meta name="robots" content="noindex">`；但 HTML 的实际 HTTP 状态为 **200**，且被页面缓存复用。严格 404 检查失败，不能声称页面硬 404 已通过。

这与 [Next.js 14 not-found 对流式响应返回 200 的文档](https://nextjs.org/docs/14/app/api-reference/file-conventions/not-found)一致。Spot 有前置 Middleware gate，因此同一问题没有使隐藏 Spot 返回 200。若 Guide/Note 必须硬 404，需要单独验证响应发出前的可见性/路由判定方案；直接给每次请求再加实时 API 会增加 CPU/invocations，不能未经成本评估照搬。

运行记录为 `runtime-summary.json`，失败阶段的 status/cache/metaNoindex 均保留；API 与 HTML 分开记录。重新发布有独立检查，不因前一项下架断言失败而跳过。

最终本机 HTTP 验收 **18 项，13 通过、5 失败（72.22%）**。5 项分别是三种详情重启、Guide 下架 HTML 硬 404、Note 下架 HTML 硬 404。Spot/Guide/Note 内容主动刷新、Guide/Note 重新发布、Sitemap 复访 HIT、热读写入检查均通过。

## 5. 成本检查及预计收益

- Sitemap 行为测试：547 条 Spot 只读取 1 份 slug map、1 份 English collection、1 次 packages reader；逐条翻译完整性判断跳过无关 packages。没有逐 Spot 查询数据库。主数据 resolver 已有 in-flight 合并；中文与双语 R2 reader 仍是不同缓存体系，不能宣称所有 snapshot HTTP 获取已完全合并。
- Middleware 行为测试每次只有 1 次内部 HTTP，真实本机 gate/隐藏/旧别名/故障也通过；保留每个 Spot 请求 1 次 live publication 查询，这是实时性的必要成本，不能算作减少。
- 连续 9 次热详情访问（3 种页面各 3 次）中，页面/fetch cache 文件的字节数和 mtime 未变，CDN fixture 调用没有增加；provider trace 只有 **3 次 GET locations**，对应 3 个 Spot live gate，没有额外 Guide/Note provider 请求。
- 数据缓存数量：Guide/Note 每集合 1 项，详情选择不再新建每 slug payload 缓存；Spot 同 ID alias 只产生 1 个 payload key。Sitemap 不批量调用 revalidate，不增加定时预热或新资源。
- 600→3600 秒在持续访问、没有主动失效及缓存淘汰时，时间触发生成机会理论减少约 83.3%；不适用于重启故障、主动发布失效或未使用 ISR 的路由。新增详情 ISR 会把原先 SSR 的一部分工作转成缓存写入。
- **不能确认生产 ISR writes 一定下降或不会大量增长**：重启额外生成仍未解决；collection tags 会影响所有依赖该集合的缓存页，编辑后再次访问可能带来较大再生成范围。热读局部无写入不能证明生产额度安全。没有线上 CPU、invocation、ISR units 或 egress 基线，不给账单百分比。
- Supabase 图片引用没有做猜测替换，也没有删除对象。Storage 占用释放为 0。Snapshot 本地无损减小约 15.93%，不能直接换算为线上 Supabase egress 收益。

## 6. 最终检查及全部回归

- TypeScript：`node scripts/validate-offline.mjs typecheck`，通过（--noEmit、--incremental false）。
- Lint：覆盖 app/components/lib/pages/Middleware 及本轮修改的测试/验证脚本；0 errors，1 条既有 `app/admin/notes/page.tsx:522` ref cleanup warning。
- 构建：`node scripts/validate-offline.mjs build`，通过，静态生成 76/76。保留英文大 props 警告及本地旧 snapshot 缺少 Langkawi 内容的记录。
- 全部回归：`node scripts/validate-offline.mjs test-all`，枚举 `tests/` 下全部 52 个 test 文件（ts/cjs/mjs），**294 项，292 通过、2 失败，约 99.32%**。没有 skipped/todo/cancelled；新增 11 项通过。
- 必要测试没有删除；500000 字节限制不变。公共内容合约由“存在 per-slug 持久缓存”调整为“共享 collection、按路径失效、不再叠加 per-slug 数据缓存”，同时保留行为、发布及数据完整性测试。
- 现有两项失败：
  - `tests/guide-attraction-display.test.ts:30`：renderer 文本中 helper 调用次数预期 2，实际 1。
  - `tests/guide-segment-contract.test.ts:11`：预期 Day 1–15 分段，当前 fixture 是 Day 0–14（如 [0,2] 对 [1,3]）。
  两个测试及对应 renderer/行程数据与本轮开始一致；本轮没有改这些断言、移动行程天数或删测试。它们仍是全套非绿的原因，不能把局部通过率称为全部通过。
- `git diff --check` 通过。保护文件清单和实际修改路径在 `file-integrity.json`；除了本轮明确列出的源码/验证文件以及无损 Snapshot 变更，既有资料未变。

运行 HTTP 检查结果单列于 `runtime-summary.json`，不与 294 项 Node 回归混合成一个虚假的“总全绿”数字。验证产物使用字体 mock/占位配置，**不得 Deploy 或 `--prebuilt` 使用当前 `.next`**。

## 7. 本轮完整变更清单

源码与本地快照：

1. `middleware.ts`：单请求、故障关闭、SEO headers、重定向目标约束。
2. `app/api/spot-routing/[slug]/route.ts`：ID/slug 校验、locale eligibility 与来源。
3. `lib/server/spot-routing.ts`：实时 SDK fetch no-store。
4. `lib/public-spot.ts`：权威 hidden/deleted 不被旧 fallback 复活。
5. `lib/server/public-spot-resolver.ts`：按 ID 共享缓存、origin revalidation header。
6. `lib/server/public-data-resolver.ts`：locations CDN revalidation header。
7. `lib/server/public-content-store.ts`：单 collection cache v3、移除双层详情缓存、Note origin revalidation header。
8. `lib/server/english-page-data.ts`：保留正常页面 packages reader，Sitemap 可跳过该读取；整理分支兼容既有公共 UI 合约。
9. `lib/server/notes-store.ts`：公共发布失败不再静默成功。
10. `app/api/admin/guides/route.ts`：非写入 refresh、Sitemap 和删除 aliases 失效。
11. `app/api/admin/notes/route.ts`：refresh slug 校验、完整 aliases/Sitemap 失效。
12. `app/api/admin/public-data/spots/[id]/route.ts`：非写入 refresh、发布成功后的补充失效。
13. `app/api/admin/guide-price-highlights/route.ts`：保存后刷新关联 Guide。
14. `public-data/locations.json`：仅 JSON 空白无损精简。

测试与工具：

15. `tests/public-data-contract.test.ts`：单 collection 数据缓存合约。
16. `tests/spot-content-network.test.ts`：隔离环境 AbortSignal、命名 React mock（修复工具 lint），原状态/redirect 断言保留。
17. `tests/zero-deployment.test.ts`：保持原安全测试、增加依赖 mocks 和 collection cache 数量断言、修复 lint 命名。
18. `tests/zero-deployment-safety.test.ts`：新增冷/暖 Middleware、真实 SDK no-store、SEO、权威隐藏、生命周期、稳定 key、刷新权限及框架重启原因测试。
19. `tests/note-cloud-sync.test.cjs`：增加发布失败但保留权威版本/释放锁的回归。
20. `scripts/compact-public-locations.mjs`：固定文件无损精简及字节预算验证。
21. `scripts/validate-offline.mjs`：全部 test 枚举、扩展 lint、独立本轮日志目录。
22. `scripts/lib/offline-network-guard.cjs`：严格限定 artifact/.invalid 的 runtime synthetic transport 与无敏感字段请求计数；其他外网/数据 mutation 仍拒绝。
23. `scripts/verify-offline-routes.mjs`：真实本地服务 cold/warm/restart/refresh/下架/再发布、Sitemap 和缓存写入验收；非零退出保留失败。
24. `docs/zero-deployment-safety-acceptance.md`：本报告。
25. `docs/zero-deployment-optimization.md`：保留上轮报告并链接本次验收结论。

证据目录：`artifacts/zero-deployment-acceptance/`，含开始时 diff、1062 个归一化保护文件 hash、原 Snapshot、全部日志、各次 runtime 结果与 synthetic fixture。它不是生产发布目录；原 `artifacts/zero-deployment/` 仍保留。

## 后续发布门槛（本轮不执行）

先解决/明确两项既有测试与三个类型详情重启、Guide/Note HTML 硬 404；补齐批量操作、英文和 widget/affiliate 编辑的刷新闭环。随后在正常配置重新构建，核对权威 R2 snapshots 与旧本地 fallback 的差异，再经明确授权进行有限目标的真实 Vercel 冷启动/刷新和资源计量验证。没有通过上述门槛前，不发布当前整批候选，也不以全站 purge、全量预热、加付费资源或清 Storage 作为补救。
