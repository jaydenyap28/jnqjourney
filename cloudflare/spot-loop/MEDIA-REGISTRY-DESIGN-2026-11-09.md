# Spot 相册可信验证设计

**推荐先验证 A，服务端可信媒体登记表。正式迁移继续 HOLD。** 登记表让数据库在同一事务内核对媒体撤销状态和 Spot 版本，并完成保存。R2 仍负责核对对象和 receipt 是否为登记时的版本。完整保存的首屏命中模型为两次 R2 LIST 加一次保存 RPC，另计原有管理员身份校验。本地 PoC 覆盖首次及未变化的 1、5、17、30 图，真实 Cloudflare CPU 仍待测。

历史首次 17 图的 **29 ms、19 ms**、首次 5 图 **6 ms**，以及上传 complete **10 ms** 临界记录，继续作为验收基线。原生轮次分别为 2/40、6/40，30 图仍未原生执行。本轮使用本地合成数据，远端数据库与部署操作均为零。[历史相册证据](GALLERY-CPU-2026-11-09.md) · [历史上传证据](DIRECT-PREVIEW-2026-11-09.md)

## A、B、C 比较

以下比较均假设私有 R2、原有 Presigned PUT、完成验证、管理员授权和实时媒体读取门槛继续有效。次数为设计模型，另计 Auth，截断回退和老媒体导入。

| 方案 | 首次新增与旧图再次保存 | 撤销、重放与并发 | 保存及 complete 开销 | 所需资源 |
| --- | --- | --- | --- | --- |
| **A. 可信媒体登记表** | 首次与再次保存均由事务批量核对当前登记及两个 R2 身份。上传票据过期前必须完成验证，完成后的记录默认持续有效，直至撤销。 | 同一 key 只允许同一身份幂等登记。撤销是终态，并在被引用时下架及推进 Spot 版本。锁内核对有效期和版本，旧提交或撤销后的 complete 无法恢复记录。 | 完整相册为 2 LIST + 1 保存 RPC。正常首次 complete 增加 1 次登记 RPC，复用 receipt PUT 返回的元数据。 | 新增隔离表及受限 RPC。使用现有服务端凭据，权限须实测。 |
| **B. 每 Spot 一份私有 R2 Manifest** | 单份受限 JSON 保存所有已验证身份，包括尚未引用的图片。首次和再次保存都读一次 Manifest，保留两个 R2 LIST 核对身份。 | 写入要做对象 CAS、相同身份幂等、撤销墓碑及严格容量限制。不同 ticket 同时完成会争抢同一 Manifest。Manifest 的版本即使在 PATCH 前复查也存在跨 R2 与数据库的窗口。要让撤销和 Spot 提交按同一顺序生效，需引入数据库版本协调。 | 1 Manifest GET + 2 LIST + 1 PATCH。每次 complete 需读取、解析、改写整个清单，加上有界 CAS 重试。歧义写入要重新核对清单，不能清理可能已登记的对象。 | 纯 R2 版本无需 DDL 或新密钥。增加读写和热点对象，若补足撤销事务协调则还需数据库结构。 |
| **C. 服务端签名凭据** | complete 可发绑定环境、Spot、对象与 receipt 版本、大小、类型、用途和有效期的凭据。旧图再次保存需刷新或从持久权威记录重新签发，不能把浏览器持有的长期凭据当作撤销状态。 | 短期签名可限制伪造和跨 Spot 重放。签名有效期内仍可重放，需在服务端检查撤销代际或消费状态。未完成或取消上传不得签发。对象身份仍需查 R2。 | 单图凭据会把 N 次验签放进保存路径。批量签发还需可信批量来源。保持即时撤销时需额外查询状态或事务 RPC，调用数取决于状态存储。 | 单独签名 Secret、轮换和撤销状态。若要即时撤销和旧图刷新，仍需持久登记或等价服务端状态。 |

A 的结构改动比纯 R2 Manifest 多。它把并发写入分散到媒体记录，且可用同一 Spot 行锁协调登记、撤销、删除及提交。C 在保留即时撤销和旧图刷新时仍需要可信状态，同时增加密钥和凭据生命周期。选择 A 优先验证，是基于这些安全约束及较少的完整保存交互。10 ms 能否达标仍取决于真实运行时。

## PoC 和可复核调用量

PoC 位于 `poc/trusted-media-registry.mjs`。测试通过本地适配器调用现有 Presigned PUT 签名、complete/cancel 及票据 CAS 路径。每张图成功写入 receipt 后，从同一次 PUT 结果取得 receipt 的 key、etag、version 和 size。登记同时绑定 Spot、最终对象 key、etag、version、size、MIME 和签名验证事实。保存请求只接受 Spot 版本和字段，R2 元数据由服务端读取。一次 LIST 查 receipt 身份，另一次查最终媒体身份。数据库模型核对事务内的当前登记状态及合并后全部引用。

| 不同引用数 | `400b513` 保存模型 | 登记表 PoC 首次及未变化保存 |
| --- | --- | --- |
| 1 | 1 receipt GET + 1 HEAD + 1 PATCH | 0 receipt GET + 2 LIST + 1 RPC |
| 5 | 5 receipt GET + 1 LIST + 1 PATCH | 0 receipt GET + 2 LIST + 1 RPC |
| 17 | 17 receipt GET + 1 LIST + 1 PATCH，共 19 次 | 0 receipt GET + 2 LIST + 1 RPC，共 3 次 |
| 30 | 30 receipt GET + 1 LIST + 1 PATCH，共 32 次 | 0 receipt GET + 2 LIST + 1 RPC，共 3 次 |

上述保存次数对应完整字段中的封面和相册均提交，封面重复去重，两份列表均命中。保留现有管理员 Auth 调用后，两列各加一次 Supabase Auth 请求。只传部分媒体字段的编辑需要先读 Spot，再由事务重新核对版本及合并后引用。现有重定向检查若触发，仍有其独立查询。只下架且不改媒体时不依赖 R2。发布或恢复公开时重新核对有效引用。

列表为有界 Spot 前缀查询。若截断，缺项需精确 HEAD，最坏多 2N 次。数据库或对象查询异常、完整列表中目标缺失、登记或快照不匹配，均阻止提交。若未来真实目录经常截断，须将该路径纳入 CPU 验收。R2 LIST 的强一致性仅适用于该次读取。两个 LIST 和数据库事务各自有观察时点。[Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) · [R2 一致性模型](https://developers.cloudflare.com/r2/reference/consistency/)

本地 **27 项通过**。用例包括首次及未变化的 1、5、17、30 图、伪造客户端 proof/角色、仅有 R2 对象与伪造 receipt、未完成/取消/过期/坏签名上传、同一和不同 ticket 并发、登记成功前后发生不确定错误、重复 complete、跨 Spot 引用、撤销、有效期、版本冲突、对象或 receipt 替换删除、列表截断、未引用图、下架和删除。证据记录 `networkAttempts: 0`，事务通过内存队列模拟。真实 SQL、PostgREST 权限、R2 调度及 Workers CPU 尚待验证。[本地计数与结果](evidence/media-registry-local-poc-2026-11-09.json)

## 完成阶段、权限与剩余风险

**complete 可能成为下一个 CPU 阻塞。** 正常首次 complete 在保留原 R2 读取、CopyObject、receipt 写入和清理的基础上，增加一次同步登记 RPC 及其序列化和结果检查。历史一次 complete 已达 10 ms。PoC 的计数只说明新增一次数据库交互，无法估计 Cloudflare 执行开销。登记未确认时返回可重试错误并保留私有最终对象。重试仅能在服务端复核既有 receipt 和当前对象后确认同一身份，已撤销或身份冲突的记录禁止覆盖。若数据库已提交但响应丢失，匹配的有效登记可被保存事务识别，且重试不复制或删除对象。正式实现须限制自动重试，并在既有 ticket 清理期之外提供受控人工对账方式。

下一阶段需经审批新增一个服务端登记表。建议以 `(spot_id, object_key)` 为主键，绑定固定隔离 bucket 和项目边界，保存上述两个身份、验证时间、状态和撤销代际。以外键及约束限制归属、类型和大小。Spot 删除可按受控外键处理登记，保留最终 R2 对象，Spot ID 不重用。登记默认无过期日期。若政策需要到期，事务与媒体读取均应检查时间，已过期记录不可复活。最小接口为登记、保存、撤销与媒体授权读取 RPC。撤销引用中的对象时在同一事务下架并推进版本。现有删除路径须与相同 Spot 行锁协调。RPC 应显式列出允许写入的 Spot 字段、按 `IS NOT DISTINCT FROM` 比较可空版本、限制条目数、以稳定的顺序加锁，并以短事务核对结果后提交。所有涉及同一 Spot 的写操作统一先锁 Spot，再访问登记行。数据库事务内无 R2 调用。真正的行锁冲突、过期时点和超时行为要用本地 Postgres 单独验证。[Postgres 行锁](https://www.postgresql.org/docs/current/explicit-locking.html)

表置于非公开 schema，启用 RLS，明确拒绝 `PUBLIC`、`anon`、`authenticated` 直接访问。RPC 优先采用 `SECURITY INVOKER` 与限定 `search_path`，对每个新函数撤销默认的 `PUBLIC`、`anon`、`authenticated` EXECUTE，仅授予现有 Worker 的隔离服务端角色所需权限。公开媒体由 Worker 请求服务端读 RPC 后自行应用管理员或匿名访问门槛。浏览器无法直接调用登记或提交 RPC，不能把浏览器 JWT 换成服务端权限。PoC 用进程内身份模拟该边界。真正 DDL 后要测匿名、普通登录用户、管理员经 Worker、服务端角色、直接表写与 RPC 权限。预计可沿用现有服务端 Secrets，无需新增服务或签名密钥。[Supabase 数据库函数权限](https://supabase.com/docs/guides/database/functions#function-privileges)

R2 外部管理员可在快照后改动对象。登记表能原子协调数据库撤销与保存，无法锁住独立的 R2 写入。PoC 复现了替换或删除发生在快照后而 Spot 仍可能落库的情况。媒体读取重新核对实时 Spot 状态、当前登记、receipt 身份与正文，以及将返回的对象版本，拒绝变化后的字节。请求已授权之后发出的字节也无法追溯撤回。正式方案须限制最终对象和 receipt 的写入主体，保留仅 staging/ticket 的生命周期清理，协调受控删除，并维持无公开 bucket、无绕过实时门槛的缓存或外链。具有同时篡改登记及 R2 能力的管理员或凭据泄露属于信任边界之外。服务端对账可下架已断链引用，审批后再执行，不应静默删除对象。

R2 LIST 消耗 Class A，receipt GET 和 HEAD 消耗 Class B。17 图首屏从 1 A + 17 B 变为 2 A + 0 B，公开媒体依旧读取 receipt 和对象。首次 complete 每图增加一次登记 RPC，完整保存 RPC 替代原 PATCH，媒体授权读 RPC 可替代原 Spot 读取。账户共享额度、实际目录规模、真实流量和数据库压力均需在下一阶段核对。Standard 免费额度为每月 1M Class A、10M Class B、10 GB-month。PoC 计数不足以判断实际账单。[Cloudflare R2 定价](https://developers.cloudflare.com/r2/pricing/)

## 最小实施、原生验收与回滚

1. **本地 Postgres 验证。** 审核表与 RPC 后先在本地数据库验证约束、权限、锁顺序、可空版本、错误映射、撤销与提交的两种顺序，以及 complete 的不确定写入。PoC 未包含可执行迁移。实现时保留原有 36 列返回契约、重定向检查和现有 URL。
2. **隔离导入。** 经单独授权，仅对新隔离 fixture 启用登记模式。旧媒体通过服务端一次性导入。逐个校验受控来源的原 receipt 正文、当前对象的 size/MIME/etag/version 和文件签名，并记录当时的 receipt 身份。冲突、无来源或已撤销条目留在 HOLD。路径或现有 Spot 引用本身不能证明可信。新模式的缺登记一律拒绝，不走静默旧路径。固定旧 Preview 继续使用互不重叠的 fixture ID 和原有 receipt 格式。
3. **原生验收。** 另行获批后用新 Preview、新证据和明确请求预算。先做真实 complete、已登记重试和 1/5 图保存，再测 17 和 30 图的首次完整保存、未变化保存及公开读回。17/30 首次场景应使用未保存的新登记引用。可在隔离数据准备阶段预置一部分合成图，再以真实 complete 混合验证，减少请求。补测大文件 complete 的临界路径、真实撤销并发、R2 截断与异常、版本冲突、下架和匿名媒体保护。每个候选请求关联原生 Tail。任一 CPU >10 ms、缺 Tail、安全失败或预算超限即停。历史失败仍保留，待完整兼容验收后才评估技术 GO。
4. **回滚。** 先冻结登记模式 fixture 写入并下架受影响 Spot，保存版本和撤销状态。若回到旧固定 Preview，只允许它继续操作各自独立的原 fixture。不可将忽略登记撤销状态的旧 Worker 指向新 fixture，即使原 receipt 仍存在。恢复同一批新 fixture 的旧模式之前，须核对并隔离所有 revoked、未对账或缺失对象的引用。保留登记和 receipt 供对账。只有确认无依赖后，才另行审批清除隔离表或 RPC。

本轮交付为本地 PoC 与设计评审材料。新版 17/30 图 CPU、complete 余量、真实数据库权限和并发均待验证，正式迁移继续 HOLD。
