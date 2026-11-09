# Trusted Media Registry 隔离 DDL 审批包

**DDL_BLOCKED。正式迁移 HOLD。** 审批对象是隔离 Supabase 项目 `rnamstwwbzknwbjwdgrf`，代码基线为 `1377b9ec7f0264d29b5cca6a95aa5217b54845c6`。已通过本机验证的 DDL 草案 LF 规范化 SHA-256 为 `b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1`。本轮获得了新的数据库前置条件和旧 Preview 快照证据，仍缺实际 RLS 写入条件、约束及角色链的可审查结果。建议补齐后再批准仅隔离 DDL。[SQL 草案](review/trusted-media-registry.draft.sql) · [本轮脱敏证据](evidence/media-registry-ddl-approval-2026-11-09.json)

## 前置条件比对

| 前置条件 | 来源与结论 |
| --- | --- |
| 引擎、表和字段 | 官方隔离连接的目录摘要报告 PostgreSQL 17.11、36 列。独立 Data API GET 返回 OpenAPI 14.18 和 36 列定义。`id` 显示为 `int64` 主键，`updated_at` 为可空 `timestamp with time zone`，`images` 为 `text[]`，`image_metadata` 和 `price_info` 为 `jsonb`，`opening_hours` 和两个 review 字段为 `text`。这些格式符合草案和本机合约。 |
| 名称与私有 schema | 官方目录摘要报告 `jnq_media_private` 不存在、`public` 六个 RPC 名称无冲突。上一轮 Data API 对私有 profile 返回 `406/PGRST106`。执行前须重新查目录，以覆盖两次检查之间的变化。 |
| 外键和现有约束 | 草案只新增 `enabled_spots.spot_id → locations.id` 和 `registry.spot_id → enabled_spots.spot_id` 两个 `ON DELETE CASCADE` 外键。Data API 标记现有 `region_id` 有外键。目录约束与外键已由官方连接提取，本轮收到的摘要未包含定义、入向依赖或删除动作。须核对 `locations.id` 的有效唯一约束、实际约束表达式及相关删除动作，尤其是随后 fixture 的插入和清理。 |
| RLS 与触发器 | 官方目录摘要报告 `locations` 已启用 RLS、无用户自定义表触发器。尚缺实际 `USING`/`WITH CHECK`、策略角色及可写列的脱敏判定。须确认匿名及普通认证用户不能直接写入或重新发布 Registry fixtures。直接修改 `locations.images` 或发布状态会绕过 Registry 保存事务，单凭 RLS 已启用不足以排除。 |
| `service_role` 前置权限 | 官方目录摘要确认 `SELECT`、`UPDATE`、`DELETE` 和 `BYPASSRLS`，与草案末尾断言一致。尚缺 DDL 创建者、数据库/`public` 的有效创建权限、`locations.id` 的 `REFERENCES` 权限，以及 `authenticator` 和应用角色的 `SET ROLE` / `USAGE` 链。 |
| 默认 `EXECUTE` 与有效 ACL | 官方目录摘要确认 `public` 有面向 `anon`/`authenticated` 的默认函数执行授权。草案对每个精确签名在同一事务中显式撤销 `PUBLIC`、`anon`、`authenticated`、`service_role`，再只授予 `service_role` 执行权限。私有 schema、表、列和辅助函数也有显式授权边界，末尾有效权限断言失败会以 `42501` 中止事务。直接默认授权与现有写法兼容。仍须用实际创建者的全局/`public` 默认 ACL 及角色链核对间接授权、可切换角色和 `service_role` 的私有 schema `CREATE` 等额外权限。 |
| 空闲 ID 与数据范围 | 本轮隔离 Data API service-role HEAD 对 `92000 ≤ id < 93000` 返回 `200`、`Content-Range: */0`。DDL 只创建空表、函数、触发器与权限，不创建或启用 fixture。未来只选择独立批准的少量新 ID，slug 为 `cloudflare-loop-registry-<id>`。SQL 的 `enabled_spots` 检查通用安全整数范围，`92000–92999` 由 Worker 和操作者选取规则共同约束。 |

官方连接的目录摘要来自本轮用户提供的证据。当前会话没有明确绑定隔离项目的 Supabase 目录 SQL 工具，未使用 `--linked`。已准备一条单语句 SELECT，集中检查实际约束、双向外键、策略、有效角色链、创建者默认 ACL 和 DDL 事件触发器。原始策略表达式只在授权通道内审阅，提交结果时脱敏。DDL 创建者的 `CREATE` 和 `REFERENCES` 另用该批准通道确认。 [待执行的只读目录查询](review/trusted-media-registry-preflight.read-only.sql) · [PostgreSQL 默认权限](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html) · [PostgreSQL 有效角色权限](https://www.postgresql.org/docs/17/functions-info.html)

## 免费容量与旧 Preview

- 官方目录摘要的实测库大小为 **11,744,947 bytes**，约 **11.74 MB**。以 Supabase Free 公布的 **500 MB/项目** 作静态比较，约占 **2.35%**。该比值只用于初始容量评估。账户计费余量、当前组织计划和可用请求/egress 余量均为 **UNKNOWN**。 [Supabase Free 额度](https://supabase.com/docs/guides/platform/billing-on-supabase) · [数据库与磁盘口径](https://supabase.com/docs/guides/platform/database-size)
- Cloudflare 控制面逐个读取了候选项目列出的 **8 个 Preview 部署**。`c592d40c` 的快照 allowlist 为 `1`，`bd7af17d` 为 `2–7`，`5332ce56` 为 `8–9`，其余五个均为 `1`。八个快照均指向隔离 Supabase，`TEST_MEDIA` 都绑定隔离测试 bucket，保留段重叠为零。项目当前 Preview 配置也只允许 `8–9`，四个凭据类型为 `secret_text`。候选项目 Production canonical 为空、列出的 Production 部署为 0、变量和 R2 binding 都为 0，双方 Fail closed。测试 R2 的 `r2.dev` 已禁用，自定义域名计数为 0。 [逐部署快照](evidence/media-registry-ddl-approval-2026-11-09.json) · [Cloudflare 部署详情](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/get/)
- 八个部署的旧 allowlist 在当前快照中与保留段分离。R2 绑定本身是 bucket 级，隔离依赖旧 Worker 的 ID 路由检查和项目配置纪律。任何后续 Preview 都需在写入前再次核对旧固定快照、独立 fixture ID 和四个对象前缀，核对后才启用 Registry。使用固定 Preview URL 验证旧路由对新 fixture 和媒体拒绝访问，避免将固定部署快照当作未来配置的保证。

## 仅隔离 DDL 的执行边界

1. **审批前。** 用获准且明确绑定 `rnamstwwbzknwbjwdgrf` 的只读连接补齐目录，记录实际 DDL 创建者。确认没有常规用户可绕过发布流程写入拟用 ID，确认所有有效角色边界、外键和约束，更新 DDL_READY 判定。若发现意外写策略、默认/继承权限或不兼容外键，停止并另审，保留完整撤销及断言。
2. **批准后一次执行。** 在同一显式隔离项目中复核项目 ID、空 schema/六名称、ID 空闲和草案哈希。记录现有行数及有序行摘要，不导出正文。仅提交已审核文件的完整 `BEGIN…COMMIT`，保留 `lock_timeout=3s`、`statement_timeout=15s`、全部 REVOKE 和 `42501` 断言。该授权包只涵盖新增空 Registry schema 对象、六个 RPC 及权限和隔离 schema cache 刷新。fixture、R2 写入、配置和 Preview 部署分别审批。
3. **提交后核验。** 比较原 `locations` 行数和摘要。检查两张私有表均为空且已启用 RLS、外键及触发器符合草案、六个签名及有效 ACL 无漂移。若 PostgREST 尚未自动更新，在同一隔离目标发送一次 `NOTIFY pgrst, 'reload schema'` 并有界轮询。确认 service OpenAPI 看见六个签名，service 的空 `lookup` 返回 `200/null`，anon 和普通 authenticated 的 `lookup` 被拒，私有 profile 仍返回 `406/PGRST106`。记录实际托管 HTTP 状态和 SQLSTATE；写 RPC 功能测试放在 fixture 授权之后。 [PostgREST 14 缓存刷新](https://docs.postgrest.org/en/v14/references/schema_cache.html)
4. **失败停止与恢复。** 权限断言、超时、锁竞争或其他 SQL 错误立即停下。明确回滚后验证 schema 和六个 RPC 都不存在。提交结果不明时仅查目录、ACL、空表和旧行摘要，先判定全未提交或完整提交，再决定是否申请恢复；遇到混合状态保留证据并停止。缓存异常先查目录，避免重跑 DDL。若已提交且需要回退，另行批准单事务清理，仅在两表仍为空且没有新依赖时按精确签名和依赖顺序移除本轮对象，使用 `RESTRICT` 并刷新隔离 cache。已有 fixture 或媒体使用时先停止流量与写入并保全撤销证据，避免退回旧读取路径。

## 另行批准后的 Cloudflare CPU 验收

先确认旧固定部署的 allowlist 和 R2 绑定与本轮快照一致，再对候选保留 ID 检查数据库以及 final、receipt、staging、ticket 前缀。只在单独批准的隔离 fixture 内使用合成媒体。大相册如需预置，须由另行批准的服务端流程独立验证 final 与 receipt 身份并登记，分别使用未曾保存过的 17 图与 30 图 fixture。

部署小型 Registry Preview 后，先关联 Tail 并验证首次 `complete` 和仅确认重试，再依次测 1/5/17/30 图首次和未变化保存，最后测公开读取、撤销、下架及旧固定路由拒绝。最多 **40 次候选 Worker 请求**，包含为验收发出的所有候选请求，逐次保存部署 ID、请求关联 ID、原生 CPU、结果和 R2/数据库调用量。任一请求 **>10 ms**、Tail 缺失、路由泄露或数据异常即停止。**10 ms** 记录保留为临界值；历史 **29 ms、19 ms** 超额和真实 TCP 强制断开的 **HTTP 400** 继续留档。既有 138 项 HTTP 与 11 组 Worker 本机验收未重跑。 [Workers CPU 限制](https://developers.cloudflare.com/workers/platform/limits/) · [本机适配器证据](MEDIA-REGISTRY-WORKER-LOCAL-2026-11-09.md)
