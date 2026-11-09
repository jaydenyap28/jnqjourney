# Trusted Media Registry 原生 CPU 验收

**FREE_REGISTRY_CPU_NO_GO。正式整站迁移 HOLD。** 首次 5 图保存原生 CPU **11 ms**，超过本轮 10 ms 门槛。已在 **8/40** 次候选 Worker 请求后停止。首次 1 图保存还出现 **10 ms 临界值**。原生超额后没有修改 Worker、重部署或重测。[逐请求台账](evidence/registry-native-2026-11-09/native-acceptance.json) · [Cloudflare Runtime Tail](evidence/registry-native-2026-11-09/runtime-events.json)

固定 Preview 为 [8ea5d57f](https://8ea5d57f.jnqjourney-spot-loop-migration-candidate.pages.dev)，完整部署 ID `8ea5d57f-6dcb-4ddc-beae-b232d643bc51`。部署基于 `f7627ad` 加本轮默认关闭的测试计数功能，Worker SHA-256 为 `d32efe2006508a4345deb44d52a8d96a7f2ac1ea7543a6122d2cf08609137890`。候选仅允许 `92001`、`92005`、`92017`、`92030` 四个新 fixture，slug 均为 `cloudflare-loop-registry-<id>`。[部署记录](evidence/registry-native-2026-11-09/deployment.json)

| 请求 | Acceptance ID | HTTP | 原生 CPU ms | 实际 R2 操作 | Supabase RPC / 读取 / Auth |
| --- | --- | --- | --- | --- | --- |
| 准备 presign，同时证明 Tail 关联 | `1794227507003-0` | 201 | 6 | PUT 1 | 0 / 1 / 1 |
| 首次 complete | `1794227509891-1` | 201 | 7 | GET 3，PUT 2，DELETE 1，CopyObject 1 | 1 / 1 / 1 |
| 同 ticket 仅确认重试 | `1794227512199-2` | 201 | 5 | GET 2，HEAD 1 | 1 / 1 / 1 |
| 已验证、未引用媒体的匿名读取 | `1794227695993-3` | 401 | 5 | 0 | 1 / 0 / 0 |
| 1 图首次保存 | `1794227697626-4` | 200 | **10，临界** | LIST 2 | 1 / 0 / 1 |
| 1 图原样重存 | `1794227698983-5` | 200 | 5 | LIST 2 | 1 / 0 / 1 |
| 1 图公开数据读回 | `1794227699525-6` | 200 | 4 | 0 | 0 / 1 / 0 |
| 5 图首次保存 | `1794227930841-7` | 200 | **11，超额并停止** | LIST 2 | 1 / 0 / 1 |

八个事件均与部署、Acceptance ID、路径、HTTP 方法和状态匹配，解析错误、截断及未关联事件均为 0。CPU 直接取原生 Tail 的 `cpuTime`。R2 和 Supabase 调用次数由本次 Preview 内的服务端测试计数器采集，并与同一原生事件一起落盘。该计数与日志开销包含在测量值中。首次 5 图请求体为 **1,338 bytes**，返回体为 **2,125 bytes**，含封面、相册和常规 alt/caption 元数据。两次保存均未读取 receipt 正文或执行对象 HEAD。 [CPU 定义与 Free 限制](https://developers.cloudflare.com/workers/platform/limits/)

**5 图原样重存、17 图、30 图、撤销、下架及旧固定 Preview 的原生拒绝测试均未执行。** 首次 5 图保存虽然 HTTP 200，但已超 CPU 门槛并实际提交。只读查询确认该 fixture 当前有 5 张引用。保留全部原始失败及历史 29 ms、19 ms 超额、10 ms 临界和 TCP 强制中断 HTTP 400 证据。

本轮遇到两项验收工具问题，并在真实 CPU 超额前修正。第一次以 JSON 字符串顺序比较 jsonb 元数据而误报，官方隔离 SELECT 确认键值、引用和版本均正确。第二次服务端预置在 Registry 登记前拒绝了 HTTP 弱 ETag 表示，读回确认 final/receipt 字节正确，工具修正 HTTP validator 的表示解析，登记身份仍来自成功 PUT 的原生 ETag/version。前七次候选请求均保留且未重发，未登记对象也保留。修正只影响本机验收工具，Preview 未重部署。[第一次停止快照](evidence/registry-native-2026-11-09/native-before-json-order-correction.json) · [第二次停止快照](evidence/registry-native-2026-11-09/native-before-etag-correction.json) · [独立键值核对](evidence/registry-native-2026-11-09/json-order-review.json)

隔离库新建四条合成 Spot 及四条 enabled 记录。首张媒体使用原 Presigned PUT、staging、CopyObject、文件验证及同步 Registry 登记流程。5 图由获准的本机服务端流程预置，每张读取真实 final 字节并核对 PNG、大小、MIME、哈希及 ETag，再写 receipt 并逐字节读回，使用成功 PUT 的两份原生身份登记，随后 lookup 确认身份相同且未公开引用。原生保存又用 R2 binding 的 LIST 身份与登记事务核对。共保留 **6 条 Registry 记录**及另一个未登记的预置对象/receipt 对；17/30 图只有空 fixture。原 11 条隔离记录的有序摘要仍为 `5ddae432cf21a614863e7115c064631e`。[预置逐对象证据](evidence/registry-native-2026-11-09/media-setup.json) · [最终数据库与停止状态](evidence/registry-native-2026-11-09/final-state.json)

已停止本轮请求、登出测试 Auth 会话并结束 Tail，主机进程检查确认没有匹配的专用 Tail 进程。最后一个 Tail 文件保留中断前的 `closed=false` 原值，单独停止证据记录进程已退出。资源和撤销状态均保留待后续决定。最终只读边界确认 Production canonical、变量、R2 binding 和部署数均为空，旧八个固定 Preview 的 allowlist 仍为原 ID 集合，测试 bucket 无公开域名，冻结 SQL SHA-256 保持 `b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1`。[最终隔离边界](evidence/registry-native-2026-11-09/final-boundaries.json)

当前瓶颈仍是一个 Worker 请求承担管理员鉴权、实时 R2 快照验证、JSON 与 REST 响应处理的整体 CPU 预算。逐图 receipt GET 已消除，5 图保存仍达到 11 ms。原生事件没有各阶段 CPU 细分，因此各步骤及测试计数开销的占比未知。本轮按规则停止于该失败。

后续 RM0 方向可优先评估由现有 Supabase Edge Functions 承担管理员 API 的鉴权、验证和 RPC 编排。官方当前上限为每请求 **2 秒 CPU**，Free 包含每月 **500,000 次调用**，实际账户剩余量仍为 **UNKNOWN**。复用当前 Registry SQL 和私有 R2 保护时，需要先设计服务端的 R2 快照访问方式，明确 Edge Functions 如何获得并核对当前对象与 receipt 的原生版本，以及浏览器鉴权和 CORS 边界。该方向尚未实现或部署。[Supabase 运行限制](https://supabase.com/docs/guides/functions/limits) · [免费调用额度](https://supabase.com/docs/guides/functions/pricing)
