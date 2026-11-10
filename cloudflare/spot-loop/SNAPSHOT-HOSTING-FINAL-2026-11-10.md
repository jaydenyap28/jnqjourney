**SNAPSHOT_HOSTING_POC_BLOCKED**

基线 `00f45a111497e2fde03f6c12bd562860716e6910`。本阶段最后一次有界诊断得到 **OBSERVABILITY_BLOCKED**，已停止远端验收。建议选择 **B，停止该快照路线，下一阶段评估简化的公开网站恢复方案**。正式迁移继续 HOLD。这个决策基于验收无法完成和已有 CPU 余量风险，Next 14 Hydration、中文无刷新导航及英文客户端提交的既有通过结果仍然保留。

本轮复用 deployment `763e3adf-a713-4049-bb47-22322152df15` 和 Build ID `voTUxzUwYFr1dxq3Q-Ntv`。预检确认 deployment 属于 Preview、别名仍指向它、隔离 fixture `92061` 为 hidden、测试 Bucket 私有、Production 的 canonical、环境变量和 R2 binding 为空，且共享 Fail closed 仍生效。八个私有快照对象和 manifest 经只读字节、长度、ETag、SHA-256 复核一致。该 Preview 的业务内容已硬到期，诊断使用独立、无内容的拒绝路径，无需更新部署或发布 fixture。

| 唯一实际请求 | 结果 |
| --- | --- |
| Acceptance ID | `1794312073068-0` |
| 路径 | `/__jnq_snapshot_observe/1794312073068-0` |
| HTTP | 404，`X-JnQ-Snapshot-Gate: 1`，正文为 9-byte `Not Found`，完整读取 |
| CF-Ray | `a584e6c98e578104-SIN` |
| WebSocket | 指定 deployment 的官方 Pages Tails API 会话，实际 open，Ping/Pong 成功 |
| 45 秒有界等待 | 原生数据帧 0，未关联事件 0，解析错误 0，socket error 0，采样警告未观测到 |
| 原生 CPU / 原生调用 ID | **UNKNOWN / UNKNOWN** |

45 秒是等待原生事件的截止条件。没有用请求耗时、客户端时间戳或 JS 计时生成 CPU。Pong 确认了连接存活，此次仍没有原生调用事件。这个请求不存在浏览器预取、自动重定向或关闭 context 的干扰，缺失也没有发生在解析或 marker 关联之后。平台未交付事件的确切原因仍 UNKNOWN。未观测到采样警告无法排除平台采样、会话传播或其他服务端原因。首条请求缺失后未发第二条 canary。

采集补丁保留了有界的会话状态、数据帧数、控制帧数、采样提示、CF-Ray、原生 trace ID 和接收时间。关联优先使用 Acceptance header，独立诊断路径还可提供相同 marker，冲突则拒绝关联。原生 `cpuTime` 缺失时始终为 UNKNOWN。四项定点本地测试通过，验证了关联冲突、凭据字段丢弃、媒体路径脱敏及时间戳不能填补 CPU。它们没有生成新的 Cloudflare CPU 证据。现有采集器与 Wrangler 的 `trace-v1` 协议、初始化消息和官方 Pages endpoint 已作静态比对。

官方兼容矩阵明确列出 Pages 支持实时日志，但不支持 Workers Logs、Logpush 和 Tail Workers。实际 deployment 也没有 observability 配置字段。Pages 日志文档说明日志不持久化，因此未找到适用于该 deployment 的官方持久逐调用补证入口，也没有新启用日志服务。官方还列出实时日志的请求率和连接数限制，账户对应历史窗口的真实用量无法确认。 [Cloudflare 兼容矩阵](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/#compatibility-matrix) · [Pages 日志限制](https://developers.cloudflare.com/pages/functions/debugging-and-logging/#limits)

Pages Functions Metrics 提供项目聚合、采样分位数及历史请求状态。这些指标不足以给本次 Acceptance ID 配对原生 CPU，未用聚合值填补缺失。 [Pages Functions Metrics](https://developers.cloudflare.com/pages/functions/metrics/)

| 图片 GET 的静态调用链 | 必要保护 |
| --- | --- |
| `jnq_public_spots` 一次 | 当前公开投影、字段契约、redirect 和引用检查 |
| `jnq_media_lookup` 第一次 | 当前发布资格、未撤销 Registry 身份、当前图片引用 |
| R2 final GET 一次、receipt HEAD 一次 | native size、ETag、version，与同一 GET 返回的字节绑定 |
| `jnq_media_lookup` 第二次 | 对象取得后再次检查最新发布、撤销及引用状态 |

这是一条 GET 路径的代码调用次数，未取得新的分项原生 CPU。外层投影和首次 Registry lookup 有重叠，但冻结 lookup SQL 没有覆盖外层的 redirect 契约，直接删去外层检查尚不能证明等价。第二次 lookup 继续承担最终资格保护。额外的 Response/Headers 包装可作为局部候选开销，现有证据无法量化它对历史 10 ms 的贡献。观测失败后没有修改或部署图片逻辑，也没有重测合成小图来替代真实大图结论。

历史图片原生 CPU **10 ms 临界值**保留。没有新的图片 CPU 或 exceededCpu 证据，图片余量及实际大图稳定性仍待验证。本轮不把 IMAGE_CPU_BLOCKED 记作新的实测失败，也不判图片性能通过。账户实际免费额度余量保持 UNKNOWN。

| 剩余目标 | 本轮状态 |
| --- | --- |
| 原生可观测性 | **OBSERVABILITY_BLOCKED**，首个只读小请求缺事件 |
| 图片 CPU 余量 | 因前置观测阻塞未进入远端复验，历史 10 ms 保留 |
| 完整发布门控 | 待验证，受观测阻塞，未证明有安全旁路 |
| 第二修订 B / 首页与详情一致性 | 待验证，未渲染、写入或切换 |
| Next 预取缓存中的隐藏内容 | 待验证，未运行新的 Chrome 流量 |

计量保持历史累计 16 次、上一轮新增 13 次。本轮只使用剩余 23 次中的 **1 次**，跨轮累计 **30 次**，上一轮与本轮合计 **14/36**，未使用的 22 次没有继续消耗。本轮 Chrome 静态、动态、重定向和取消请求均为 **0**。所有历史 UNKNOWN 原样保留，新缺失请求另存证据。

Tail 会话已删除。socket 的 1006 关闭码发生在本机主动终止之后，`clientInitiatedClose=true`，此前 `errorCount=0`。没有创建新的认证密钥。收尾只读确认 fixture 仍为 hidden、测试 Bucket 仍无公共域名、Production 仍为空、无新部署。原私有对象保留。没有重编译资源，也没有执行新的云端 DDL、媒体写入或正式资源操作。

本阶段到此停止。剩余门控、版本切换及大图 CPU 没有满足 PASS 条件。B 的下一步是另行确定简化公开站恢复的内容范围、撤销约束与上线门控，本轮没有自动实施恢复或正式切换。

[诊断请求与边界证据](evidence/snapshot-hosting-final-2026-11-10/observability.json) · [原生会话状态](evidence/snapshot-hosting-final-2026-11-10/runtime-diagnostic.json) · [收尾边界](evidence/snapshot-hosting-final-2026-11-10/final-boundary.json) · [保留的上轮结果](SNAPSHOT-HOSTING-NAVIGATION-2026-11-10.md)
