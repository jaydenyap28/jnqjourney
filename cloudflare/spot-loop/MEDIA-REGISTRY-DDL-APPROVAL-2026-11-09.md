# Trusted Media Registry 隔离 DDL 审批包

**DDL_PRECHECK_READY。正式迁移 HOLD。** 审批对象是隔离 Supabase 项目 `rnamstwwbzknwbjwdgrf`。本轮以审批包提交 `03c94c573f3be1cad814f75f30cb93e3f4154151` 为检查点。已通过本机验证的 DDL 草案 LF 规范化 SHA-256 已重新核对，为 `b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1`。目录摘要和后续权限确认均符合前置条件。建议下一阶段单独批准隔离 DDL 及必要的 cache 刷新，实际执行仍须通过即时复核。[SQL 草案](review/trusted-media-registry.draft.sql) · [脱敏证据](evidence/media-registry-ddl-approval-2026-11-09.json)

## 前置条件比对

| 前置条件 | 来源与结论 |
| --- | --- |
| 引擎、表和字段 | 官方隔离连接的目录摘要报告 PostgreSQL 17.11、36 列。独立 Data API GET 返回 OpenAPI 14.18 和 36 列定义。`id` 显示为 `int64` 主键，`updated_at` 为可空 `timestamp with time zone`，`images` 为 `text[]`，`image_metadata` 和 `price_info` 为 `jsonb`，`opening_hours` 和两个 review 字段为 `text`。这些格式符合草案和本机合约。 |
| 名称与私有 schema | 官方目录摘要报告 `jnq_media_private` 不存在、`public` 六个 RPC 名称无冲突。上一轮 Data API 对私有 profile 返回 `406/PGRST106`。执行前须重新查目录，以覆盖两次检查之间的变化。 |
| 外键和现有约束 | 最新官方目录摘要已核对主键、双向外键及删除动作。草案新增 `enabled_spots.spot_id → locations.id` 和 `registry.spot_id → enabled_spots.spot_id` 两个 `ON DELETE CASCADE` 外键。新表为空，创建外键不会对现有 `locations` 行执行级联。 |
| RLS 与触发器 | `locations` 已启用 RLS，唯一策略为 `anon SELECT`。`anon` 仅有 SELECT，`authenticated` 与 `authenticator` 对该表无直接读写权限，三个角色均无直接发布写入路径。`locations` 无用户自定义表触发器，库内存在 Supabase 内置 DDL 事件触发器。建表后仍按实际目录和 HTTP 回应确认 cache。 |
| `service_role` 与执行者 | `service_role` 对现有 `locations` 具备 SELECT、INSERT、UPDATE、DELETE 与 `BYPASSRLS`，满足草案使用的 SELECT、UPDATE、DELETE 权限。现有表的 INSERT 权限不自动延伸到新表。官方会话的 `current_user` 和 `session_user` 均为 `postgres`，具备数据库和 `public` 的 CREATE，以及 `locations` 的 REFERENCES、SELECT、UPDATE、DELETE。 |
| PostgREST 角色与默认 ACL | `authenticator` 可切换到 `anon`、`authenticated` 和 `service_role`，不直接继承其权限，符合历史本机 PostgREST 行为。已知 `public` 对 `anon`、`authenticated` 的直接默认 EXECUTE 由草案显式撤销。用户补充确认已核对 `postgres` 的全局和 `public` 默认 ACL，没有可被其他应用角色或其继承角色取得的额外 Registry 权限。`anon`/`authenticated` 也没有继承或切换至 `service_role`、`postgres` 或其他高权限角色的路径。 |
| 空闲 ID 与数据范围 | 最新官方目录确认保留段无记录，与上轮 Data API 的 `200`、`Content-Range: */0` 一致。DDL 创建两张空表、函数、触发器和权限。未来 fixture 的选择另行批准，限 `92000 ≤ id < 93000` 和 `cloudflare-loop-registry-<id>`。 |

目录、会话权限和最后两项 ACL 结论来自用户转交的官方隔离 Supabase 工具摘要及补充确认。当前会话做静态比对，复用上一轮 Data API 和 Cloudflare 证据。默认权限只由创建对象时的 `current_user` 决定。表直接权限、立即继承权限和 `SET ROLE` 已分别核对。原目录查询包含 `default_acl` 及 `effective_role_membership`，仓库仅记录脱敏判定。[已执行的只读目录查询](review/trusted-media-registry-preflight.read-only.sql) · [PostgreSQL 默认权限](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html) · [PostgreSQL 有效角色权限](https://www.postgresql.org/docs/17/functions-info.html)

草案对六个精确签名逐一撤销 `PUBLIC`、`anon`、`authenticated`、`service_role` 的权限，再仅向 `service_role` 授予运行时 EXECUTE。函数为 `SECURITY INVOKER`，运行时管理路径校验 `current_user`。私有 schema、表和辅助函数也有显式 ACL。历史 PostgreSQL 17.11 验收向 `anon` 注入可继承的默认 EXECUTE，草案返回 `42501 / JNQ_RPC_EXECUTE_EXPOSED` 并整笔回滚。历史 PostgREST 14.12 的 138 个场景验证了普通身份拒绝、服务身份 RPC 和 schema cache 行为。隔离托管环境的实际 ACL 和 HTTP 状态仍按下述清单核验。[本机 PostgreSQL ACL 证据](MEDIA-REGISTRY-LOCAL-POSTGRES-2026-11-09.md) · [本机 PostgREST 验收](MEDIA-REGISTRY-LOCAL-POSTGREST-2026-11-09.md)

## 免费容量与旧 Preview

- 官方目录摘要的实测库大小为 **11,744,947 bytes**，约 **11.74 MB**。以 Supabase Free 公布的 **500 MB/项目** 作静态比较，约占 **2.35%**。该比值只用于初始容量评估。账户计费余量、当前组织计划和可用请求/egress 余量均为 **UNKNOWN**。 [Supabase Free 额度](https://supabase.com/docs/guides/platform/billing-on-supabase) · [数据库与磁盘口径](https://supabase.com/docs/guides/platform/database-size)
- Cloudflare 控制面逐个读取了候选项目列出的 **8 个 Preview 部署**。`c592d40c` 的快照 allowlist 为 `1`，`bd7af17d` 为 `2–7`，`5332ce56` 为 `8–9`，其余五个均为 `1`。八个快照均指向隔离 Supabase，`TEST_MEDIA` 都绑定隔离测试 bucket，保留段重叠为零。项目当前 Preview 配置也只允许 `8–9`，四个凭据类型为 `secret_text`。候选项目 Production canonical 为空、列出的 Production 部署为 0、变量和 R2 binding 都为 0，双方 Fail closed。测试 R2 的 `r2.dev` 已禁用，自定义域名计数为 0。 [逐部署快照](evidence/media-registry-ddl-approval-2026-11-09.json) · [Cloudflare 部署详情](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/get/)
- 八个部署的旧 allowlist 在当前快照中与保留段分离。R2 绑定本身是 bucket 级，隔离依赖旧 Worker 的 ID 路由检查和项目配置纪律。任何后续 Preview 都需在写入前再次核对旧固定快照、独立 fixture ID 和四个对象前缀，核对后才启用 Registry。使用固定 Preview URL 验证旧路由对新 fixture 和媒体拒绝访问，避免将固定部署快照当作未来配置的保证。

## 仅隔离 DDL 的执行边界

1. **独立授权与即时复核。** 取得仅隔离 DDL 及必要 cache 刷新的明确用户授权后，在显式绑定 `rnamstwwbzknwbjwdgrf` 的官方通道复核项目 ID、实际 `current_user/session_user=postgres`、36 列、权限、约束和默认 ACL。确认 `jnq_media_private`、六个 RPC 名称及保留 ID 段仍为空，保存 `locations` 行数、有序行摘要与 ACL/RLS 摘要。即时比对冻结草案的 LF SHA-256。发现任何漂移，或通道无法一次提交完整事务，立即停止。
2. **一次执行。** 在该隔离目标原样提交审核文件的完整 `BEGIN…COMMIT`，保留 `lock_timeout=3s`、`statement_timeout=15s`、全部 REVOKE 和 `42501` 断言。范围限新增空 Registry 对象、六个 RPC 及权限。fixture、R2 写入、Preview 部署和配置变更均属独立审批。
3. **提交后目录核验。** 比对原 `locations` 行数、有序行摘要、ACL 与 RLS。核验两张新表为空并已启用 RLS，两个级联外键和 `jnq_registry_terminal` 触发器匹配，六个函数签名精确、所有者为 `postgres`、`SECURITY INVOKER` 和固定 `search_path` 正确。`PUBLIC`、`anon`、`authenticated`、`authenticator` 应无直接 RPC 或私有对象权限。`service_role` 的私有 schema 权限只含 USAGE，`enabled_spots` 仅 SELECT，Registry 仅允许指定列 INSERT 及 `revoked_at` UPDATE，并有 SELECT。核对实际授权记录及有效角色链，遇到额外可调用或可写权限即停止。
4. **托管 API 核验。** 先观察自动刷新。若目录正确而 PostgREST cache 尚未更新，在同一隔离目标发一次 `NOTIFY pgrst, 'reload schema'` 并有界轮询。服务身份的 OpenAPI 应显示六个精确 RPC，使用未启用保留 ID 和同 ID 的合法合成 key 做只读 `lookup`，预期 `200` 和 JSON `null`。匿名与普通认证 `lookup` 应拒绝，`jnq_media_private` profile 应保持 `406/PGRST106`。记录实际 HTTP 状态及错误码。 [PostgREST 14 缓存刷新](https://docs.postgrest.org/en/v14/references/schema_cache.html)
5. **失败停止与恢复。** 遇到权限断言、超时、锁冲突、缓存异常或响应丢失，立即停下并记录 SQLSTATE 或 HTTP 结果。只读检查 schema、六个签名、表状态、ACL 和 `locations` 摘要，区分事务未提交、完整提交和异常状态。即使确认未提交，也先查明原因再决定后续动作。缓存异常只按第 4 步处理。
6. **已提交后的单独回滚。** 仅在获得回滚授权、两表仍为空、没有新依赖或流量时，使用同一目标的单事务和 `RESTRICT`，按签名移除六个 `public.jnq_media_*` RPC，再移除 `jnq_media_private.registry`（表触发器随表移除）及 `enabled_spots`。随后移除六个私有辅助函数，先移除 `lock_spot`、`media_keys`、`spot_projection` 和 `guard_registry_update`，再移除 `require_service` 与 `valid_key`，最后移除空 schema。刷新隔离 cache 并重新核验 `locations` 摘要、原 ACL/RLS 及 RPC 不可见。发现依赖、数据或流量，保留登记和撤销证据，停止回滚并另审。

精确函数签名用于提交后目录核验及任何单独获批的回滚。私有函数按表中顺序移除。

| `public` RPC | `jnq_media_private` 辅助函数 |
| --- | --- |
| `jnq_media_register(bigint,text,bigint,text,text,text,bigint,text,text,boolean)` | `lock_spot(bigint)` |
| `jnq_media_save(bigint,timestamptz,jsonb,jsonb)` | `media_keys(bigint,text,text[])` |
| `jnq_media_withdraw(bigint,timestamptz)` | `spot_projection(public.locations)` |
| `jnq_media_revoke(bigint,text)` | `guard_registry_update()` |
| `jnq_media_delete(bigint,timestamptz)` | `require_service()` |
| `jnq_media_lookup(bigint,text)` | `valid_key(bigint,text)` |

## 另行批准后的 Cloudflare CPU 验收

先确认旧固定部署的 allowlist 和 R2 绑定与本轮快照一致，再对候选保留 ID 检查数据库以及 final、receipt、staging、ticket 前缀。只在单独批准的隔离 fixture 内使用合成媒体。大相册如需预置，须由另行批准的服务端流程独立验证 final 与 receipt 身份并登记，分别使用未曾保存过的 17 图与 30 图 fixture。

部署小型 Registry Preview 后，先关联 Tail 并验证首次 `complete` 和仅确认重试，再依次测 1/5/17/30 图首次和未变化保存，最后测公开读取、撤销、下架及旧固定路由拒绝。最多 **40 次候选 Worker 请求**，包含为验收发出的所有候选请求，逐次保存部署 ID、请求关联 ID、原生 CPU、结果和 R2/数据库调用量。任一请求 **>10 ms**、Tail 缺失、路由泄露或数据异常即停止。**10 ms** 记录保留为临界值；历史 **29 ms、19 ms** 超额和真实 TCP 强制断开的 **HTTP 400** 继续留档。既有 138 项 HTTP 与 11 组 Worker 本机验收未重跑。 [Workers CPU 限制](https://developers.cloudflare.com/workers/platform/limits/) · [本机适配器证据](MEDIA-REGISTRY-WORKER-LOCAL-2026-11-09.md)
