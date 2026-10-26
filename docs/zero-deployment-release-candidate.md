# Release Candidate 本地安全收尾

日期：2026-10-18。结论：**本轮四项本地阻碍 LOCAL PASS；生产仍 NO-GO，等待 PREVIEW REQUIRED 验收及新的部署授权。**

接续 `zero-deployment-publication-consistency.md`。本轮没有扩大为全站审计，没有改变 Next 14.2.35 的 ISR/Data Cache 架构、3600 秒周期或引入缓存层、依赖、数据库 schema。无 Commit、Push、Deploy、线上数据库写入、Storage 删除、R2 上传或云资源创建。Admin SDK 写入测试使用合成 transport；HTTP 仅连接 loopback Next/CDN 与 `.invalid` 合成 Auth/PostgREST/Storage，网络 guard 拒绝真实外网。没有读取/输出凭据。

## 状态矩阵

| 项目 | 状态 | 证据与边界 |
|---|---|---|
| 批量影响行数与结果分类 | LOCAL PASS | 同一次 PostgREST mutation 的 returned IDs；完整、部分、零行及未知结果均有测试，不用写前 count 推测 |
| Spot 通用内容版本 | LOCAL PASS | 按既有公开 DTO 规范化后 SHA256；API header、中文 metadata、英文 source metadata 同源；更新、隐藏、重发布、旧版本失败与恢复均实测 |
| 价格 / 总费用 / Widget / Affiliate HTML 值读回 | LOCAL PASS | 校验真实 SSR HTML 与新值；RSC/script 中的字符串不能冒充 HTML；五类故障与恢复见下表 |
| 共享 tags 扇出审计与收窄 | LOCAL PASS（本地代码范围） | Spot ID、Affiliate ID、费用单 Guide 定向；价格/费用来源分开；保留既有共享集合边界，不声称全部标签都逐篇隔离 |
| R2 部分发布恢复 | LOCAL PASS（合成存储） | detail、locations、index 三个失败点；失效不提前；publication-only 重试恢复，保留旧路径范围且不重放 DB mutation |
| TypeScript / Lint | LOCAL PASS | 类型无错误；Lint 0 errors，原 Note admin ref cleanup warning 保留 |
| 正常离线 production build | LOCAL PASS | Next 14.2.35 正常构建，77/77；字体 mock/占位连接，产物不可部署 |
| 完整回归 | LOCAL PASS | **329/329，0 skipped**；原 316 项保留，新增 13 项；55 个测试文件 |
| 本机生产 HTTP | LOCAL PASS | **39/39**；原 24 项及新增 15 项，不与 Node 测试混算 |
| 本轮四项剩余本地失败 | LOCAL FAIL：0 | 不代表所有生产风险消失，也不宣称线上 PASS |
| Vercel adapter、多实例、外层 CDN、真实 Storage/R2 | PREVIEW REQUIRED | 本轮未部署，不能推断生产命中、传播、并发及实际账单 |
| 第三方 Widget 执行、Affiliate hydration/跳转与浏览器 Router Cache | PREVIEW REQUIRED | 本机证明 SSR/config 值；未访问第三方服务或假称已验证真实 booking |
| 历史故障 fallback 的真实发布状态安全 | PREVIEW REQUIRED，历史风险保留 | 本轮未扩展修复该链，旧报告所述旧来源复活风险没有被本轮全绿自动消除；预览必须验证真实权威来源与故障行为 |

本轮可以结束这四项本地实现阶段。后续进入限定预览验收，不能据此直接生产发布；不得重复无限扩大全站本地审计。

## 1. 写入确认与失败回报

locations minimal/batch 与 Affiliate mutation 增加 `.select('id')`，只取同一次写入返回的 ID；原表单保存仍返回 id/updated_at。对请求 ID 去重，验证 returned IDs 的唯一性、数量和归属，区分：

| 结果 | 回报与行为 |
|---|---|
| 完整命中 | `mutation.state=complete`，才进入正常 publication/独立复核 |
| 部分命中 | `partial`，明确 affected/expected、affectedIds、missingIds；仅发布已提交 IDs，最终 HTTP 409，提示重新加载，不重放整个批次 |
| 零行命中 | `failed` / 409，不触发发布 |
| 确定的数据库 4xx 错误 | 保留原 error/code，state=failed / 400，不失效 |
| 5xx、传输响应不确定、非法 returned IDs | state=unknown，提示 reload；不把“没有确认”说成已回滚，也不自动重试 DB |
| 数据已提交、publication 失败 | HTTP 503、publication partial；保留 mutation 分类和确认数量，给出 publication-only retry |

独立读回也处理部分写入的 409 receipt；成功验证公开版本仍不会把原部分写入状态改成完整成功。返回给编辑器的错误包含确认数量或未知结果说明。

测试通过真实锁定 Supabase SDK 注入 PostgREST responses，证明 partial 只发布命中 IDs、零行不发布、5xx 不自动重复 mutation，以及明确恢复后的成功。该变化没有新增写前/写后全表 count。依据 [Supabase update 返回修改行契约](https://supabase.com/docs/reference/javascript/update)，实际行为由已安装 SDK 测试确认。

## 2. Spot 版本与正确公开 DTO

`spotPublicationVersion` 复用现有 `publicSpotFromSupabaseRow` 规则比较公开数据，规范化空字符串/null、数字、数组和 region join，避免把数据库原始表示差异当成新版本。忽略派生 slug/title、非公开 status/timestamp；publication_status 和公开内容/SEO/价格字段仍参与版本。运营状态由既有实时 gate 负责。

`/api/spots/<id>` 返回 `X-JNQ-Content-Version`，中文与英文 HTML 带 source metadata。publication 编辑时读权威 Spot，独立请求核对 API hash、中文 HTML hash、英文 hash；不增加每次公开访问的 DB 查询。隐藏核对 API/两种语言 HTML 404 与既有 SEO 保护，重新发布必须立即恢复新的版本。

HTTP 特意让权威来源是新描述、公开 snapshot 仍旧：状态 200 不能通过 hash 校验，复核返回 503；解除故障后仅刷新 publication，所有版本恢复。原 restart 测试曾漏恢复 fixture 的 redirect_type，新 hash 正确指出差异；现完整还原 fixture，未放宽版本断言或修改真实数据。

## 3. HTML 值级验证

新增纯 HTML 校验，先排除 script/style/RSC 字符串，再核对实际元素属性与可见文字：

- **重点价格**：批准的公开记录、实际价格 span 的 currency/minor amount 与格式化金额；移除后公开 records 为空，旧价格不应仍可见。
- **总费用**：公开费用结构和实际总额 span；按中文既有 normalize 契约处理分类文案，英文按现有 raw source 契约处理。隐藏费用时不再渲染旧总额。价格和费用只读取/验证各自改变的来源。
- **Widget**：实际 section 的转义 code 配置、标题文字及当前可见记录；停用后记录/section 消失。维持原有浏览器执行第三方脚本方式，不在 SSR 执行代码；第三方最终显示另列 PREVIEW REQUIRED。
- **Affiliate**：复用 Note 原本已读取的 links 传给卡片首屏，不新增公开 DB 查询；实际 h4 标题及目标 URL、公开记录均对齐。停用后卡片消失。客户端原有后续加载与 analytics 保留，需预览检查 hydration/booking。

新增 data 属性仅含已经公开的展示数据，React 正常转义，没有注入未审核脚本或原始内部资料。真实 Storage SDK 单测另断言 Authorization/apikey Headers 得以保留；不能用对象 spread 复制 Headers 实例。Widget public read 不再反向写本地业务 JSON；最新指针有效时直接读取 immutable 对象，免去不必要 list。

没有可渲染消费者的新 Widget/未绑定 Affiliate 不预热无关首页，也不冒称 HTML 已改变：独立阶段重新确认 source 与关系，返回 `coverage=no-html-consumers`。有消费者则必须完成 HTML 检查；空列表本身不能通过。

**Next 14 顺序修复**：App writer 返回后才执行独立 verification request，由该请求刷新已有英文 Pages ISR，再读公开内容。否则 Pages 可能在 App pending tags 尚未 flush 时缓存旧价格。Pages 仍用既有 `res.revalidate(..., { unstable_onlyGenerated:true })`。失败返回 partial，重试不重放数据库保存；有故障/恢复自动化测试。

## 4. 共享 Cache Tags 与 R2 恢复

| 边界 | 本轮动作 | 仍有的共享成本 |
|---|---|---|
| Spot detail / ID | 去掉 detail/ID cache 的全局 public-spots tag，仅保留 ID/canonical tag | index 本身仍共享；membership/slug 变化及显式 manual refresh 可失效 index |
| Spot snapshot batch | 内容编辑不无条件全局失效 index；正常单条与批量走同一个有序 publisher | locations/public-data 仍是整份集合，消费者可能延迟再生 |
| Affiliate | Note 查询按 affiliate-link:id 标记；只使实际绑定 Note 显式失效 | client API 保留全局 query cache；外层 private/no-store 设置沿用上轮 |
| 价格 / 费用 | priceSource 区分 highlights 与 trip-cost；单 Guide 费用 outer cache 仅 per-slug tag | 底层各自的共享文件仍需相应 collection tag；不跨两类无关来源失效 |
| Guide / Note collections、Widgets | 保留原有单份集合缓存；显式路径 dedup / onlyGenerated | shared tag 依赖本身仍可连带失效消费页面，未新建 per-page cache 去掩盖该边界 |

这是本地 tag/调用边界审计通过，**不是承诺每次编辑只会产生一个 ISR write**。最终 receipts 的 tags/path 数见 `fanout.json`；它记录显式范围，不能替代 adapter 对隐式依赖扇出的测量。App revalidate 为延迟生成，Pages 只刷新已有路径，不做全站 pattern purge 或全量未访问 slug 预热。旧 Data Cache 条目的旧 tag metadata 可能在刷新/TTL 前保留，预览需观察迁移期间行为。

R2 顺序：受影响可见 detail → 一份 locations → 一份 index → 失效。任一对象失败都保留已写事实与已完成对象阶段，不删除旧对象或试图伪装事务回滚；响应指向受保护 batch publication retry。重试重新读取当前权威数据，不执行数据库 mutation。失败前计算旧路径关系 scope，跨失败回报、重复失败和恢复携带，避免新集合已覆盖后丢失旧 alias/region/邻居范围。

测试在第 1/2/3 个对象写入点分别抛错，并使 partial locations 写入真实改变合成旧来源；断言失败时没有 tags/paths，重试恢复最终内容/index，旧中英文 scope 保留。单条 Spot 发布复用此链，消除原并行共享对象上传的另一路径。R2 仍非多对象原子提交，实际并发读者短暂看到混合版本的风险列入预览验收。

## 5. 自动化故障证据

| 场景 | 失败证据 | 恢复证据 |
|---|---|---|
| 批量缺少部分 / 全部 ID | partial / failed，确认数量不虚报 | 只显式处理 missing ID 后成功 |
| SDK 5xx 响应不确定 | unknown，无自动 mutation 重放 | reload/显式重试成功 |
| Spot 公开旧 snapshot | HTTP 200 但版本复核 503 | publication-only 后 API/HTML/英文 hash 一致 |
| 重点价格旧 HTML | 失效成功但实际金额旧，复核 503 | 新金额可见；移除后无旧价格 |
| 总费用旧 HTML | 总额/结构不匹配，复核 503 | 中英文新总额一致；隐藏后无旧总额 |
| Widget 旧配置 / 标题 | 失效成功但配置值旧，复核 503 | 新 code/title；停用后移除 |
| Affiliate 旧卡片 | 失效成功但 SSR title/URL 旧，复核 503 | 新卡片；停用后移除 |
| 英文 ISR refresh 失败 | partial / 503，不继续伪报 read-back 成功 | 独立重试成功 |
| R2 三个写入阶段 | 每阶段 partial，不提前失效 | 不重放 DB，仅 publication 重试收敛 |

最终日志：`artifacts/zero-deployment-rc/test-all.log`、`build.log`、`typecheck.log`、`lint.log`、`runtime-summary.json`、`http-evidence.md`、`fault-evidence.json`、`fanout.json`。三个 R2 阶段的实际 completed objects、恢复状态及旧范围见 `r2-fault-evidence.json`。首轮 HTTP 31/34 的差异保留为 `runtime-first-failures.json`，没有删除测试或放宽业务断言。旧 316/24 验收目录保持原样。

冷进程首访仍会 STALE / 缺 Cache-Control，随后在同版本下 HIT / 3600；这是既有本机 Next 14 行为诊断，不为消灭 STALE 关闭 ISR。9 次暖详情无新增 cache 文件写入，只有 3 次 Spot 实时 DB 可见性 GET；Sitemap 再次 HIT 无重复 provider/CDN 读。

## 6. PREVIEW REQUIRED 清单与成本

获得新的授权、额度允许后，使用既有资源进行有限预览；本轮不执行：

1. Vercel adapter 冷实例/重启、Data Cache/Full Route Cache 的 STALE→HIT、响应头与跨实例 tag 传播；不能把本机 PASS 当作生产 HIT 保证。
2. 相同保存/批量隐藏/重发布/alias 与价格、费用、widget、affiliate 操作，经真实 Auth/权限、Storage/R2 和不同 CDN POP 独立读回；验证 Schema/旧 snapshot 表示兼容。
3. R2 中断、限额/上传失败、重复重试及并发编辑期间的真实对象可见性；确认没有重复 DB mutation、丢旧 scope 或假成功。没有多对象事务承诺。
4. 历史公共 CDN 不可用时的 Storage/local fallback 与下架防复活；这是未解决的历史风险，不因本轮本地全绿自动解除。
5. 浏览器 Router Cache、英文 Pages hydration、第三方 Widget 实际渲染、Affiliate 点击/analytics；离线未打开真实第三方页面。
6. 用相同流量/编辑频率比较 CPU、Invocations、ISR Reads/Writes/bytes、Supabase 查询/egress。只测相关路径，不全站 purge/预热。

成本影响：

- 暖公开访问新增数据库查询 **0**、新增缓存层 **0**；Affiliate 首屏复用既有服务端查询，Spot 内容 hash 为本地计算。SSR 数据属性增加公开 HTML 字节，大小按实际价格/Widget 数增长，需要预览计量。
- 编辑确认增加 returned IDs 的小型 PostgREST response，不额外查询 count。Spot 通用验证在编辑时对 affected IDs 做权威读取，批量成本随 ID 数增长；不是每次公开访问读取。
- 每次 publication 仍有上轮的四份关系 snapshot GET；值级检查增加相关 source 的 fresh read、公开 HTML read 及已有英文页再生。highlights 不读总费用，trip-cost 不读价格，避免无关依赖阻断保存及额外查询。
- Widget 有效 pointer 直接到 immutable 对象，公开 cache miss 不必先 list；不反写本地 JSON。public tagged cache 与 ISR 保留，fresh read 仅用于编辑/复核。
- 收窄 tags 减少不相关 Spot、费用与 Affiliate 消费者的失效机会；共享 Guide/Note/Widget collection 仍有既有扇出。onlyGenerated 避免从未访问详情的英文全量预热，实际生成量/写入 bytes 仍需预览测量。
- R2 partial 恢复有额外安全重写成本；保持一次批量共享 locations/index，避免每个 ID 单独重建全量集合。不会自动重复权威 DB 保存。
- Affiliate API 沿用上轮 private/no-store 外层响应、tagged DB cache；Function Invocations/CPU 仍可能高于旧外层 CDN HIT，不能承诺净账单下降。

## 7. 文件与资料保护

完整变更清单见 `artifacts/zero-deployment-rc/changed-files.md`；本轮独立 `before.json` / `after.json` / `integrity.json` 与既有工作树 patch 已保存。核心新增为 `mutation-outcome.ts`、`publication-html.ts`、`server/publication-values.ts`、`release-candidate.test.ts`。其他修改限定在 mutation 回报、Spot 版本、HTML 首屏/标记、publication coordinator、既有 source/tag/publisher、离线验证与相关测试 seam。

1136 个开始时文件均保留；1098 个未改、38 个修改、5 个新增，完整列出 43 个变更路径。`data/`、`public-data/`、行程草稿、package/lockfile 没有本轮修改；没有覆盖或回退无关本地工作。旧报告仅追加链接，历史失败继续保留。构建使用占位配置/字体 mock，当前 `.next` 不可部署；候选需在正常环境重新构建，不能发布 guard、fixtures 或 artifacts。
