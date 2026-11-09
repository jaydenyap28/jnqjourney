# Spot 可信媒体登记表 SQL 与实施审查

**方案 A 建议继续，暂缓批准远端隔离 DDL。** 候选 SQL 已完整写出。本轮验证覆盖静态合约与合成并发模型。真实 Postgres 权限、锁和 PostgREST 调用还需在独立本地数据库通过。正式迁移保持 **HOLD**。[完整 SQL 草案](review/trusted-media-registry.draft.sql)

## 表、边界与容量

| 对象 | 设计 |
| --- | --- |
| `jnq_media_private.enabled_spots` | 操作员登记全新的隔离 fixture ID。主键引用 `locations.id`，Spot 删除后级联清理。它也是 RPC 的数据库内作用域门槛。 |
| `jnq_media_private.registry` | 主键 `(spot_id, object_key)`，前缀已覆盖外键和每 Spot 查找。记录对象大小、MIME、etag、version、receipt 大小、etag、version、`verified_at`、`revoked_at`。receipt key 由对象 key 确定。存在登记行表示完成验证，`revoked_at` 表示不可逆撤销。 |
| 约束 | 仅允许与 Spot ID 一致的 UUID 私有路径，MIME 与扩展名一致。大小限 12 字节到 10 MiB，receipt 限 1–1024 字节，身份字段必须非空且有长度上限。现有隔离 `locations` 的字段类型和依赖来自历史预检，获批执行前重新核对。 |
| 生命周期 | 上传票据过期控制 complete。已验证登记不自动过期，撤销保留墓碑至 Spot 删除。删除仅处理数据库依赖，最终对象与 receipt 留在私有 bucket，后续清理需要独立对账。Spot ID 和最终对象 key 不复用。 |

按每条含主键索引约 **0.5–1.25 KiB** 粗估，1,000 条约 **0.5–1.2 MiB**，10 万条约 **49–122 MiB**。估算不含现有数据库、膨胀和 WAL。需要用本地合成数据实测 `pg_total_relation_size`，并在获批部署前核对隔离项目 `pg_database_size(current_database())` 和组织用量。本轮未查询远端剩余容量。Supabase 文档给出的 Free 数据库门槛为 500 MB，另有组织合计用量限制。每次首次 complete 增加一次写 RPC，保存 RPC 取代原 PATCH，媒体授权 RPC 可取代原 Spot 查询。账户额度及数据库延迟仍是部署前置检查。[Supabase 数据库容量与 Free 限制](https://supabase.com/docs/guides/platform/database-size)

## RPC 与权限

| 入口 | 事务或读取约束 |
| --- | --- |
| `jnq_media_register` | 先锁 Spot 并核对登记范围。重复身份返回成功，版本差异或撤销返回冲突。只有带当前 complete 成功 PUT 证据的服务端调用可插入，处理中的重试只能确认已存在记录。 |
| `jnq_media_save` | 锁 Spot，使用 `IS DISTINCT FROM` 比较可空版本。合并并限定字段，按最终封面及相册去重。从服务端 R2 快照批量匹配所有登记与两份身份。缺项、重复、撤销或身份不符都阻止 UPDATE。返回明确的 36 字段。 |
| `jnq_media_withdraw` | 独立的带版本下架入口，只改状态和版本。R2 故障时仍可下架。重新发布必须走完整保存验证。 |
| `jnq_media_revoke` | 锁 Spot 后写撤销墓碑。若当前 Spot 引用了该对象，同事务将其下架并推进版本。未知 key 返回 404，尚未登记的上传由原有 ticket cancel 处理。 |
| `jnq_media_delete` | 锁 Spot 后校验版本再删除。实际数据库中已有的其他外键也会生效，因此只允许经依赖核对的新合成 fixture。 |
| `jnq_media_lookup` | 单次数据库快照读取当前 Spot 状态、引用关系及未撤销的登记身份。Worker 根据匿名或服务端已验证的管理员身份决定是否读取私有对象。 |

**所有修改 RPC 采用同一锁顺序。** 同一 Spot 的保存、登记、撤销、下架和删除先获取 `locations` 行锁，再访问 Registry。第二个保存等待后重新比较版本，因此旧版本返回 409。撤销先完成时，保存看到撤销状态或新版本并失败。保存先完成时，撤销会在后续事务下架最新引用。删除先完成时，后续操作找不到已启用 Spot。事务内没有 R2 网络请求。旧 Worker 和绕过 RPC 的可信后台写入不受这套锁协议约束，所以登记模式使用独占 fixture allowlist。已有字段类型验证和重定向目的地验证继续留在 Worker，SQL 草案还验证核心字段和媒体约束。并发改动重定向目的地的跨 Spot 事务不在本方案范围内，公开路由应继续实时检查目标状态。[Postgres 行锁语义](https://www.postgresql.org/docs/current/explicit-locking.html)

| 主体 | 明确权限 |
| --- | --- |
| `PUBLIC`、`anon`、`authenticated` | 私有 schema 无 USAGE/CREATE，私有表无直接操作权限，新管理与读取 RPC 无 EXECUTE。现有公开 Spot 的 RLS 范围不因本草案扩大。 |
| 现有 Worker `service_role` | 私有 schema USAGE，两个私有表 SELECT。Registry 的 INSERT 仅限身份列，UPDATE 仅限 `revoked_at`，无直接 DELETE、TRUNCATE 或启用 Spot 的写权限。六个公开 RPC 与私有 helper 可执行。`locations` 的既有 SELECT、UPDATE、DELETE 权限需预检，草案不扩充既有权限。 |
| 数据库所有者或操作员 | 负责审批后的迁移、独立合成 fixture 启用、对账及清理。只有该边界可引入新的可写 Spot。 |

函数采用 `SECURITY INVOKER`、固定 `search_path`、限定表名和 Worker 服务端身份。创建与逐函数撤销默认 EXECUTE 在同一事务完成，末尾检查 `anon` 和 `authenticated` 的有效权限，包括继承权限。私有 schema 不列入 PostgREST 暴露列表。`service_role` 凭据可绕过 RLS，属于强信任边界。SQL 无法识别服务端提交的 R2 元数据是否伪造。Worker 必须自行生成观察结果，禁止转发浏览器提供的 proof、`verified`、`p_can_insert` 或角色。预检还需确认 `public` schema 的 PostgREST 角色映射、函数签名唯一及 schema cache 已刷新。[Supabase 函数执行权限](https://supabase.com/docs/guides/database/functions#function-privileges)

## complete 与对象威胁模型

| 威胁或故障 | 处理方式与剩余边界 |
| --- | --- |
| 客户端伪造、过期票据或跨 Spot 引用 | 原签名仍仅授权写 staging。complete 继续执行 CAS、真实类型/签名/大小验证和服务端 CopyObject。保存与读取同时检查 Spot、登记及实时对象身份。 |
| R2 成功，登记 RPC 提交前失败 | 保留最终对象与 receipt，错误结果可显示为待对账。处理中的重试只能确认现存数据库登记，缺记录时拒绝补登记。经独立可信证据审核后才可人工恢复，否则使用新随机 key 重新上传。 |
| 登记已提交但超时或响应丢失 | 重试重新读 R2 receipt 与对象，对照已登记的完整身份。匹配且未撤销即可确认原结果，无额外 CopyObject 或删除。重试次数必须有界。 |
| receipt 写入本身结果不确定 | 保留可能完成的对象。若没有登记，普通重试无法证明所见对象和 receipt 是原完成调用写出的版本，继续拒绝登记。 |
| 尚未引用、下架、删除或撤销 | 每次媒体请求核对当前引用和公开状态。已验证未引用或下架的图片只允许已验证管理员预览。删除或撤销使查询失去有效登记，对管理员也拒绝该对象。已开始传输的字节无法撤回。 |
| 外部管理员覆盖或删除 | 保存时用两个受限 LIST 核对对象和 receipt 身份。查询截断时按 key HEAD，缺失或不匹配拒绝。R2 快照后、数据库提交前仍可能变化。媒体读取重新验证 receipt 元数据、正文和实际返回的对象身份，拒绝被替换或缺失的字节。外部破坏可能造成页面引用失效，需下架和对账。 |
| 外部同时换掉对象与 receipt | 这是原内存 PoC 的重试缺口。草案通过已有登记确认或独立可信导入阻止补登记。若攻击者同时控制数据库服务凭据和 R2 管理权，则已越过信任边界。 |

首次 complete 同步新增一次登记 RPC。等待网络本身不计 Workers CPU，但构造和解析数据、处理响应和错误都会执行代码。历史 complete 已到 10 ms，存在将超额转移到 complete 的明确风险。必须测真实正常 complete 与确认重试。当前保存首屏估计为 2 次 Class A LIST 加 1 次保存 RPC，另计 Auth。目录截断时，对象及 receipt 缺项最多额外 2N 次 HEAD，30 图路径可达到 60 次。需按实际运行时子请求口径验收。实现前给 HEAD 回退设硬预算，超出即返回可诊断错误，避免无界扫描或误判为成功。反复命中硬预算属于真实内容规模阻塞。[Cloudflare CPU 与子请求限制](https://developers.cloudflare.com/workers/platform/limits/) · [R2 操作分类](https://developers.cloudflare.com/r2/pricing/)

## 测试证据及批准门槛

原 27 项 PoC 包含 1、5、17、30 图首次与未变化保存、校验调用数、伪造及越权、未完成和取消上传、过期票据、双 complete、登记前后故障、对象/receipt 变化、撤销、旧版本、删除、下架、截断列表和快照后的变化。可选登记期限是原 PoC 模型的扩展。本 SQL 采用完成记录持续有效、撤销终态的最小设计。原 PoC 的自动补登记重试仅代表历史模型，新增合成测试覆盖收紧后的确认策略。[原 PoC 证据](evidence/media-registry-local-poc-2026-11-09.json)

本轮 **33 项通过**。新增 6 项由两项 SQL 静态合约检查和四项确认重试合成检查组成，包含替换对象及相应 receipt 的攻击。SQL 静态检查不会验证 PostgreSQL 的解析、权限或锁行为。下一轮隔离 DDL 前需在独立本地 Postgres 验证以下内容。

- 应用草案到与隔离项目相同的 `locations` 结构，核对可空和毫秒版本、触发器、所有 FK、列授权、schema cache 以及 36 字段响应。验证异常会回滚整次保存。
- 以真实角色测试 `anon`、`authenticated`、`service_role` 的表权限、函数执行及直接 API 调用。验证继承或默认 grant 使草案整笔回滚。隔离项目使用专属 fixture，验证越界 ID 返回 404。
- 用双连接覆盖 save/save、save/revoke、register/delete 和 revoke/republish，两种锁先后顺序均检查。模拟 DB 提交前失败、提交后连接断开和锁超时。验证完整合并引用、重复快照、撤销、后置触发器及错误码。
- 真正的 Worker 测试覆盖 Auth、同源、服务端快照构造、大小上限、匿名媒体、对象覆盖、R2 LIST 截断硬预算和故障返回。确认服务端读取拒绝结果时没有直接访问 R2 的旁路。[本轮检查摘要](evidence/media-registry-sql-review-local-2026-11-09.json)

## 最小隔离实施与原生验收计划

1. 审核草案与本地实测。隔离 DDL 获批后才核对项目 ref `rnamstwwbzknwbjwdgrf`、容量、依赖与权限，经正常审批执行事务。确认 `vrufunuomioczocdsoer` 无操作。合成 fixture 使用新增 ID，旧 Preview ID 与证据保留。
2. 接入带默认关闭开关的 Worker 适配器。保留 Presigned PUT、真实文件验证、CopyObject 和旧 receipt 格式。旧媒体须逐项校验独立可信来源、原 receipt 正文、实时对象版本和文件签名。导入冲突或证据不足时拒绝发布。新模式缺登记时直接拒绝。
3. 另行获批后部署一个小型隔离 Preview。原生预算最多 **40 个 Worker 请求**。先分配最多 10 次测 Auth、真实 complete、确认重试和 1/5 图保存。再分配最多 12 次测首次和未变化的 17/30 图保存、长字段、公开读回和有界截断场景。最后最多 18 次测失败、撤销竞态、下架与再发布、匿名保护及必要编辑器交互。预置已独立验证的合成素材，控制非关键请求。每次记录请求 ID、状态、原生 CPU 和完整 Tail 关联。任何超过 10 ms、缺 Tail、错误授权、误删或预算超限立即停止。一次触及 10 ms 仍报告余量不足。

## 回滚与清理

先冻结新模式写入，对已引用撤销或无法对账的 Spot 下架，保留数据库和 R2 证据。旧固定 Preview 只服务自己的原 fixture。若要复用新 fixture，先由操作员核对全部引用，确认撤销对象无法在旧路径访问。保留 Registry 和 receipt，直至清理计划审核通过。

将未确认或待清理对象纳入对账清单，记录 Spot、key、对象及 receipt 的版本和撤销状态。等待票据窗口结束，确认没有进行中的 complete、有效登记或其他引用，再审批删除。对仍可被写入或身份发生变化的 key 停止清理。最终对象与 receipt 不配置盲删 TTL。删除 fixture 前保全相关清单，因为外键会清除登记记录。撤销墓碑在 Spot 生命周期内保留。新 RPC 和表只有在不存在引用或回滚依赖时才安排单独清理。

建议审批下一步的本地 Postgres 真验。远端隔离 DDL 与 Preview 各自等审核，历史 29 ms、19 ms、10 ms 原生证据保留。
