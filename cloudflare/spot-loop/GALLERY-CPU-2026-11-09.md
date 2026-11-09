# 相册保存 CPU 定点修复：NO-GO / HOLD

本轮从 `f584cd4` 继续，最小补丁提交为 `400b513`。只修改隔离候选的相册对象元数据校验及定点验收工具。新固定 Preview 为 [5332ce56](https://5332ce56.jnqjourney-spot-loop-migration-candidate.pages.dev)，部署 `5332ce56-643d-4c5c-9882-4487c516c563`。**首次 17 图保存原生 CPU 19 ms，仍超过 10 ms，因此新版 NO-GO、正式迁移 HOLD。**

## 原因调查：已确认与未知

`mutationData()` 已通过 Set 去除封面/相册重复路径。原实现对每个不同路径调用 `verifiedMedia()`：R2 GET receipt → 读取正文并 JSON.parse → R2 HEAD 图片 → 对比 size、MIME、etag、version，再调用 Supabase PATCH。因此首次新增、未变化、已验证但未引用的 17 张图片都产生 17 GET + 17 HEAD，封面重复不额外计数。这是已确认的调用放大因素；没有跳过“已保存”引用的缓存。

`validateSpotFields()` 是纯字段/类型检查；`location()` 的 PATCH 仍包含服务端控制 updated_at、PostgREST 版本条件、请求序列化和响应解析。原生 29 ms 是整个请求的总 CPU，没有分项计时。**无法把 29 ms 精确分配给 JSON、R2 binding、对象 HEAD、Auth、PATCH 或响应序列化。**

本机用 `f584cd4` 的真实旧 Worker 源码与新 Worker、同一合成 R2 fixture 比较调用数，并以 20,000 次同步迭代测纯 JS 平均 CPU。旧版 17 图的字段验证约 0.0039 ms、17 份 receipt JSON.parse 约 0.0078 ms、请求 JSON.parse 约 0.00705 ms、PATCH JSON.stringify 约 0.0047 ms；这些只说明本地小型纯 JS 工作量，**不是 Cloudflare 分项 CPU，也不包含真实 R2/Supabase runtime 工作**。不能据此推算每次 R2 调用成本。Windows 单个短请求 process.cpuUsage 会出现粗粒度 0/16 ms，原始值有记录，但不作为精确耗时解释。[本地旧版分析](evidence/gallery-cpu-local-before-2026-11-09.json)、[本地新版分析](evidence/gallery-cpu-local-after-2026-11-09.json)

真实新旧代表性结果是 29 ms → 19 ms；请求和部署不同、receipt 调度也由顺序改为最多四个并发，**并非严格隔离单变量的 A/B，更不能将差值全部归因于 HEAD**。确认优化不足；剩余原生开销的精确归属仍未知。

## 最小补丁与安全不变量

新增 `verifiedSaveMedia()`，保留每个 receipt 的权威正文读取、1024 字节上限、JSON 结构、fixture、签名完成标记、10 MiB、MIME 校验。每批最多四个 receipt，读取/解析完成后才取图片元数据，限制同时打开的 body 和连接数。

两个以上不同媒体使用一次 `R2.list({prefix: media/candidate/<id>/, include: [httpMetadata], limit: max(32, 2N)})` 取得当前对象元数据，逐个核对 **key、size、MIME、etag 和随机 version**。列表页有界；若截断且未列出目标，则使用原来的精确 HEAD，而不是视作已验证。完整列表中缺少目标即拒绝。1 张图保留 GET+HEAD；不支持 list 的兼容测试环境也保留原校验路径。R2 的 LIST 元数据和截断机制见[官方 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)。

首次 17 张新引用与未变化相册走相同的完整验证，不信任浏览器 proof，不因已有 DB 引用而跳过，也不新增 proof 格式、提交 token、缓存或异步发布流程。没有改 Presigned PUT、完成签名/字节验证、CopyObject、ticket CAS、complete/cancel、最终对象保留策略、管理员/同源检查、Supabase 版本条件、下架/删除或媒体匿名引用门槛。`mediaProof()` 与 `matchesMediaProof()` 只是提取原验证逻辑供保存和公开读取共用；超限 receipt 显式取消 body。

### TOCTOU 的实际边界

R2 与 Postgres 没有跨系统事务，LIST 也不是锁。原 GET+HEAD 同样存在验证与 PATCH 之间的窗口。当前 Worker 可达路径依赖：随机最终 key、浏览器只可写 staging、完成 ticket 单一 CAS owner、receipt 尝试写入后不再删除已验证最终对象、cancel 只删除自身 staging。本轮未增加最终对象覆盖/删除路径；测试 bucket lifecycle 仅清理 staging/tickets 和未完成 multipart，没有清理最终媒体或 receipts 的规则。

若拥有独立 R2 管理权限的外部写者在验证后替换/删除对象，数据库可能提交过时引用；这点**没有被本补丁解决，不能声称原子提交**。公开媒体请求仍重新 GET receipt 与对象正文核验版本，替换/删除都会 fail closed。合成 TOCTOU 回归明确模拟了这两种情况，媒体均返回 404；未经验证的字节不公开。生产前须继续明确不可变最终对象/受控删除及外部写者边界，不能把候选的隔离写协议直接推定为正式资源已符合。

## 本地回归

47 项通过、0 失败，覆盖 1/5/17/30 图首次与未变化相册、封面重复、缺失/损坏/过大/外 fixture receipt、size/MIME/etag/version/签名不符、对象删除、截断 LIST 回退、已验证未引用媒体、保存版本冲突、下架、complete/complete 与 complete/cancel、模糊 receipt 写入失败及外部 TOCTOU 保护。[回归摘要](evidence/gallery-cpu-local-regression-2026-11-09.json)

共享合成 fixture 提取到 tests/helpers。旧 presigned 测试的“匿名访问未引用最终路径”预期从 404 校正为 401：`f584cd4` 的原控制流就先要求 Auth，再读取 receipt；这项修正不修改产品权限。未重跑全站构建、全站审计、历史尺寸上传或 Chrome 闭环。

## 新部署原生验收

本轮创建专属 fixture 8（5 图）和 9（30 图），均为合成资料；原三条记录、历史 fixture 1、29 ms fixture 3 未复用或修改。35 张有效 68 字节 PNG 与 35 个 receipt 的 70 次隔离 R2 PUT 均返回成功，CRC/解压已在本机校验。[fixture 摘要](evidence/gallery-cpu-fixtures-2026-11-09.json)

| Acceptance ID | 请求 | HTTP | 原生 CPU | 原生 wall time |
| --- | --- | --- | --- | --- |
| `1794209849949-0` | 登录 | 200 | 3 ms | 1419 ms |
| `1794209852355-1` | 1 图首次保存 | 200 | 6 ms | 1252 ms |
| `1794209853726-2` | 已验证、未引用图片匿名访问 | 401 | 2 ms | 171 ms |
| `1794209854015-3` | 5 图首次扩大保存 | 200 | 6 ms | 1325 ms |
| `1794209855464-4` | 5 图未变化保存 | 200 | 4 ms | 752 ms |
| `1794209856278-5` | **17 图首次、完整字段保存** | 200 | **19 ms，超额** | 2229 ms |

17 张都是 fixture 9 的首次引用；并未使用“未变化图片”的快路径获得低值。HTTP 200 / outcome=ok 不能覆盖 CPU 失败。脚本在该请求的原生 CPU 门槛处停止，**没有继续响应字段断言、公开读回、17 图未变化保存或 30 图请求**；不能标记 17 图整体通过。30 图只有本地通过，云端 CPU 未知。

本轮 **6/40**，每个请求均关联真实 Tail；parseErrors、unmatchedRequests、truncatedEvents 均为 0。停止 Tail 后只核对控制面边界，未再发 Worker 请求。原轮次 **2/40** 以及原 29 ms、历史 10 ms 临界值完整保留，绝不合并成一次成功验收。[原生事件](evidence/gallery-cpu-runtime-2026-11-09.json)、[逐请求及停止日志](evidence/gallery-cpu-native-results-2026-11-09.json)、[新部署](evidence/gallery-cpu-deployment-2026-11-09.json)

## R2 操作与免费额度

| 相册不同图片数 | 旧校验 | 新校验（目标均在首个列表页） |
| --- | --- | --- |
| 1 | 1 GET + 1 HEAD | 相同，共 2 次 |
| 5 | 5 GET + 5 HEAD | 5 GET + 1 LIST，共 6 次 |
| 17 | 17 GET + 17 HEAD | 17 GET + 1 LIST，共 18 次 |
| 30 | 30 GET + 30 HEAD | 30 GET + 1 LIST，共 31 次 |

这是本地精确计数及云端成功代码路径推断，**Tail 不含逐请求 R2 操作计量**；没有伪造原生操作数或账户余量。目录更大且截断时，缺失引用会额外 HEAD，最多恢复到 N 个 HEAD，再加一次 LIST。列表 payload/回退仍可能增加 CPU，不能将小 fixture 结果推广到无限真实内容量。

LIST 属于 Class A，GET/HEAD 属于 Class B；因此调用总数减少不等于所有成本同比下降。Standard 免费额度为每月 1M Class A、10M Class B、10 GB-month，共享账户额度；本轮没有重新获取账户实际剩余额度。以 1,000 次无回退的 17 图保存为纯估算：新 1,000 A + 17,000 B，旧 34,000 B，不含上传、公开图片读取及其他模块。[官方 R2 定价与操作分类](https://developers.cloudflare.com/r2/pricing/)

没有增加 CPU 配额、启用收费服务或把保存拆成无保护异步操作。**现有版本仍无法可靠通过 Free 10 ms 预算**。如继续，应另行规划如何减少 receipt 绑定交互本身，并证明 receipt 内容、对象版本、首次多图提交和外部变更保护仍成立；本轮不因 19 ms 继续堆叠修改或复测。

## 边界与剩余阻塞

部署前后 canonical 空；最终 Production 环境变量/Secrets 0、R2 binding 0、部署 0，双方 Fail closed，四个 Preview Secret 类型正确。`c592d40c` 与 `bd7af17d` 均保留 success / preview。没有正式域名绑定；本轮只用既定隔离库和私有 bucket，没有 DDL、正式数据/RLS/cron、DNS、Vercel 或 main 修改。[预检](evidence/gallery-cpu-preflight-2026-11-09.json)、[最终边界及 lifecycle](evidence/gallery-cpu-post-boundaries-2026-11-09.json)

本轮新版 **NO-GO / HOLD**。17 图 CPU 超额仍为 P0，30 图和新版兼容的原生 CAS/安全/Chrome 未完成。此前隔离 schema P0 已关闭；正式旧媒体、SELECT/RLS、发布队列/cron、完整 SEO/slug/跨模块契约、正式备份/恢复及切换授权等原 P0 保留。旧技术 GO 不变，正式迁移继续 HOLD。到此停止。
