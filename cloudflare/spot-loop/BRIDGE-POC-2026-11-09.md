# 原生 R2 身份查询桥接 PoC

**BRIDGE_POC_PASS。正式整站迁移 HOLD。** 真实 Supabase Edge → Cloudflare → 隔离 R2 查询取得 final 和 receipt 当前原生身份，与现有 Registry 八个身份字段完全一致。Cloudflare 原生 CPU 为 **2 ms**。本轮只验证 fixture 92005 的一对对象，批量保存可行性仍待单独验证。[逐请求证据](evidence/bridge-poc-2026-11-09/native-acceptance.json) · [原生 Runtime Tail](evidence/bridge-poc-2026-11-09/runtime-events.json)

固定只读 Preview 为 [ebd1f8ea](https://ebd1f8ea.jnqjourney-spot-loop-migration-candidate.pages.dev)，部署 ID `ebd1f8ea-1892-43b9-a77f-4e3cb07f6b41`。部署使用候选项目的独立 Preview 标签 `codex/r2-identity-bridge`。源代码和本报告仍提交至 `codex/cloudflare-free-migration`。Supabase 复用隔离项目 `rnamstwwbzknwbjwdgrf` 的独立测试函数 `jnq-registry-rm0-pilot`，本轮桥接版本为 **3**，JWT 验证开启，并在服务端核对原隔离管理员身份。[部署记录](evidence/bridge-poc-2026-11-09/deployment.json)

| 真实测试 | Acceptance ID | Cloudflare HTTP | 原生 CPU ms | 结果 |
| --- | --- | --- | --- | --- |
| 匿名请求 | `1794239414523-0` | 401 | 0 | 无身份元数据及 CORS 授权头 |
| 伪造签名 | `1794239415620-1` | 401 | 1 | 无身份元数据及 CORS 授权头 |
| 有效签名但携带浏览器 Origin | `1794239416182-2` | 403 | 0 | 无身份元数据及 CORS 授权头 |
| 真实 Edge 服务端签名查询 | `1794239418201-3` | 200 | **2** | 两份原生身份与 Registry 完全一致 |

实际共 **4 次 Cloudflare 请求、1 次 Edge 请求，5 次测试 HTTP 请求**。另有准备与收尾用的 Supabase Auth 登录/登出和控制面操作。四条 Tail 均关联同一固定部署、请求 ID、路径、方法和结果，解析错误及截断均为 0。成功查询执行两次 R2 HEAD、一次 Registry 只读 lookup，LIST、文件正文读取和写入均为 0。Edge 客户端耗时为 **3,520 ms**，函数内经过时间为 **2,470 ms**，含网络等待。Edge 原生 CPU 为 **UNKNOWN**。2 ms 仅是本次单对象查询的原生观测值。[R2 原生身份 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

final 的大小 **68 bytes**、ETag `a75db2c3e1deed40d807e8d2656674cd`、version `7e5e3faee1294321eeae0bc34e0cff53`，receipt 的大小 **257 bytes**、ETag `e7790da1126b8f2bbc4caf5b65f68716`、version `7e5e3faed7a07d838d46a6f3463922f0` 均与服务端 Registry lookup 及历史真实 PUT 身份相同。没有借用 S3 缺失的版本头、receipt 自述版本或浏览器身份声明。

本地安全审查和 **17 项新增定点测试**通过。原 Registry Worker 的 `mediaIdentity` 投影提取为共用纯函数，身份验证条件保留。Cloudflare 桥接使用现有 TEST_MEDIA binding，只允许固定主机和内部 POST 路径，固定隔离项目、测试 bucket、fixture 92005、单一合法 PNG key，并据此生成唯一 receipt key。请求体最多 **2,048 bytes**，未知长度流同样逐块限制。查询数量固定为一对对象，只使用 HEAD，因此没有 LIST 截断或分页扩张。返回投影元数据和请求关联信息。[桥接 Worker](identity-bridge/worker.mjs) · [共用身份投影](media-identity.mjs) · [定点测试](../../tests/cloudflare-identity-bridge.test.mjs)

服务端认证采用本轮自动生成的独立 **256 位随机密钥**与 HMAC-SHA256，使用原生 Web Crypto verify。签名绑定隔离项目、方法、主机、路径、原始请求体摘要、时间、nonce 和请求关联 ID。签名时间窗口为 **30 秒**，桥接和 Edge 都有 **30 分钟硬截止**。桥接拒绝 Origin、Cookie、OPTIONS 和多余参数。短窗口内同一签名可重复读取相同对象元数据，nonce 不做持久化去重，本轮不引入额外状态。该行为不会写入媒体或 Registry。[签名实现](identity-bridge/auth.mjs) · [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

认证凭据通过已有登录自动设置到隔离 Supabase Secrets 与 Pages 的 **Preview** Secret，配置前后检查 Production 完全一致。短期本机凭据文件先核对 Git 忽略规则，完成后已删除。两端项目级共享 Secret 也已移除，原有 R2 Secrets 保留。固定 Preview 的不可变快照及已加载 Edge runtime 可能保有短期密钥，均受到代码内硬截止保护，截止为 **2026-11-10 00:18:17，新加坡时间**。没有继续发送请求，Tail 进程已退出。Tail 文件保留中断前 `closed=false` 的原值，独立进程检查确认无匹配进程。[收尾与边界证据](evidence/bridge-poc-2026-11-09/final-boundaries.json)

本轮复用现有合成对象和登记，Registry 写入、新 fixture、R2 写入均为 0。冻结 SQL 哈希继续为 `b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1`。旧上传系统和既有 Cloudflare 保存 Worker 未重新部署。Production canonical、变量和 R2 binding 仍为空，双环境 Fail closed。身份投影共用文件已加入原打包脚本，以保持未来候选打包完整。

这个 PoC 证明在小范围内，原生版本可以由仅服务端认证的 Cloudflare 只读查询提供给 Edge。它未验证 5/17/30 图保存、并发和跨系统提交一致性，也未改变此前 Cloudflare 整体保存路径的 CPU NO-GO。免费账户余量和长期 CPU 分布仍为 **UNKNOWN**。本轮到此停止。
