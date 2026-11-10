# Edge 与 R2 Identity Bridge 隔离保存验收

**EDGE_BRIDGE_SAVE_GO。正式整站迁移 HOLD。** 5、17、30 图首次引用和原样重存共六次，全部通过真实 Supabase Auth、Cloudflare 原生 R2 身份快照和 Registry 保存事务。15 次 Cloudflare 请求均有对应的原生 Runtime Tail，CPU 为 **0–5 ms**。本结论覆盖隔离保存试点。

| 相册 / fixture | 首次 HTTP / CPU | 原样重存 HTTP / CPU | 客户端耗时，首次 / 重存 | Edge 内经过时间，首次 / 重存 |
| --- | --- | --- | --- | --- |
| 5 图 / 92005 | 200 / **5 ms** | 200 / **3 ms** | 2,844 / 1,001 ms | 1,797 / 963 ms |
| 17 图 / 92017 | 200 / **5 ms** | 200 / **3 ms** | 890 / 1,232 ms | 776 / 1,198 ms |
| 30 图 / 92030 | 200 / **4 ms** | 200 / **2 ms** | 1,977 / 965 ms | 1,875 / 924 ms |

每次保存消耗 **1 次 Edge 调用、1 次管理员身份查询、1 次 Spot 读取、1 次桥接、2 次 R2 LIST 和 1 次 Registry RPC**，HEAD、GET 和分页均为零。独立数据库读回确认顺序、元数据、可空字段和版本。92005 原先已有五图，首次保存指首次引用本轮新登记的五张图；92017、92030 原先无图。Edge 客户端和函数内耗时均含 I/O，Edge 原生 CPU 为 **UNKNOWN**。[逐请求结果](evidence/edge-bridge-save-2026-11-10/native-acceptance.json) · [原生 Tail](evidence/edge-bridge-save-2026-11-10/runtime-events.json)

## 实施边界

沿用 `a9f04539` 单对象 PoC 的 HMAC。批量桥接只接受固定隔离项目、主机、路径、三组 fixture、对应 PNG key 和最多 30 个唯一引用。请求体上限 4,096 bytes，拒绝浏览器 Origin、Cookie 和无效签名。签名绑定请求体摘要、目标、时间、nonce 与请求关联 ID，验签时间窗口为 30 秒。桥接和 Edge 使用同一个 30 分钟硬截止。窗口内签名可被原样重放读取同一批元数据，桥接没有写接口。

桥接对 final 与 receipt 各做一次带前缀的 R2 LIST，只有截断且缺少所需对象时才 HEAD，合计最多八次。返回经过筛选的八项真实原生身份及操作数。Edge 使用 JWT 网关和 Supabase Auth 用户查询核对隔离管理员，从服务端快照生成 `p_observed`。冻结 Registry 保存 RPC 在同一事务检查版本、媒体身份和撤销状态。Presigned PUT、现有上传完成逻辑和取图处理均沿用历史版本。此次新增的 `media` 操作验证匿名读取资格，响应只含判定和遥测。

复用隔离项目 `rnamstwwbzknwbjwdgrf`、私有 bucket `jnqjourney-spot-loop-isolated-media`、专用 [Preview df43d68d](https://df43d68d.jnqjourney-spot-loop-migration-candidate.pages.dev) 和隔离函数 `jnq-registry-rm0-pilot` v6。部署 ID 为 `df43d68d-744c-47f7-94d7-163f4b83529a`。固定部署域名用于标识证据，桥接只接受部署分支别名的签名请求。Production canonical、环境变量和 R2 binding 均为空，两环境 Fail closed，测试 bucket 无公开域名。冻结 SQL 的 LF SHA-256 为 `b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1`。[部署记录](evidence/edge-bridge-save-2026-11-10/deployment.json) · [打包哈希](evidence/edge-bridge-save-2026-11-10/verification.json)

## 安全和数据结果

| 场景 | 真实结果 |
| --- | --- |
| 浏览器伪造 `p_observed` / `verified`、匿名保存、错误 Origin | 分别 400、401、403。无桥接或保存 RPC，Spot 原样保留 |
| 过期 HMAC | Cloudflare 401、原生 CPU 0 ms、零 R2 操作 |
| 外键事务失败 | Edge 409、真实 `23503`。全部字段和版本回滚 |
| 用旧版本重复提交 | Edge 409 / `PT409`。全部字段和版本原样保留 |
| 真实 final 与 receipt 存在但未登记 | Edge 409 / `PT409`。对象保持未引用 |
| 用相同字节覆盖已登记对象 | ETag 相同，原生 version 不同。保存 409 / `PT409`，匿名读取资格 404 |
| 撤销被引用对象 | 撤销与下架成功，Spot 版本推进。继续引用该对象重新发布返回 409 / `PT409`，匿名读取资格 404 |
| 下架并重新发布有效相册 | 92017 下架成功，匿名读取资格 404。重新发布及再次核验读取资格均为 200 |

52 张参与保存的合成图通过真实 R2 写入、字节回读、PNG 内容校验和 Registry 登记确认。相册测试使用新媒体身份。测试另外保留两对未登记对象，其中一对在中断时未完成确认，一对用于证明未登记引用会被拒绝。92005 因撤销保持 hidden，92017、92030 保持 published，其他隔离 `locations` 记录的摘要一致。[媒体准备记录](evidence/edge-bridge-save-2026-11-10/media-setup.json)

在 30 图预置期间发生中断。4 条已匹配 Tail 记录、5/17 图读回和 18 张已确认的 30 图预置资料全部保留。核对原部署、原预算和数据库状态后，仅补齐其余 12 张并继续。中断前的 Auth 会话注销状态为 **UNKNOWN**，恢复使用的会话已成功注销。最终关闭 Tail 并确认本轮进程数为零。Tail 文件保留 Windows 中断时的 `closed=false` 原值。项目级临时 Secret 已从 Supabase 和 Pages Preview 移除，本机临时密钥文件已删除。固定部署快照和已加载 Edge runtime 的硬截止为 **2026-11-10 09:02:13 SGT**。[清理与隔离核对](evidence/edge-bridge-save-2026-11-10/final-boundaries.json)

## 免费额度和整站集成清单

本轮共 **15/24 次 Cloudflare 请求、21 次 Edge 请求、18 次 Edge Registry RPC、28 次桥接 R2 LIST**。预置和覆盖另外使用 109 次 R2 PUT、108 次 GET、52 次登记、52 次确认 lookup。按操作类别计算，记录内 R2 共 137 次 Class A、108 次 Class B，另有控制面核对。Workers Free 公布每请求 10 ms CPU、每日 100,000 次请求；Supabase Free 公布每月 500,000 次 Edge 调用，Edge 平台 CPU 上限 2 秒；R2 Standard 公布每月 100 万次 Class A、1,000 万次 Class B、10 GB-month。账户实时剩余额度、实际账单、Edge 原生 CPU 和长期 CPU 分布均为 **UNKNOWN**。本轮最高 5 ms，历史 Worker 的 10 ms 临界及 11/19/29 ms 超额证据保留。 [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Edge limits](https://supabase.com/docs/guides/functions/limits) · [Edge invocations](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

R2 LIST 与数据库提交跨系统，无法在同一事务锁住外部对象。快照后发生的覆盖或删除可能令本次保存引用已失效的对象。取图必须在提供字节前校验当前对象身份及最新发布状态，并避免缓存绕过。此次测试验证了先覆盖、再保存与匿名资格判定，未覆盖快照后的竞争、真实图片字节公开路径或缓存失效。历史 TCP 强制中断时的未解释 HTTP 400 仍待确认，应用层响应丢失证据单独保留。[历史 PostgREST 证据](MEDIA-REGISTRY-LOCAL-POSTGREST-2026-11-09.md)

进入整站集成前，先将现有后台保存接入 Edge，验证保留 Presigned PUT 的完整浏览器流程及版本冲突提示。随后验证旧媒体 URL、公开图片字节和下架后的缓存行为，核实账户实际额度以及较大历史前缀触发截断时的运行表现。最后准备公开页面、双语 SEO、301/404 和 sitemap 的隔离验收，以及数据备份、切换和回滚清单，等待正式迁移授权。
