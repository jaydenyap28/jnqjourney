# Trusted Media Registry · 隔离只读预检与本机 Worker 验收

基线 `5cbd5fa283b821564bb535e8c5e65c38a9d33425`。**Registry DDL BLOCKED，正式迁移 HOLD。** Worker 本机集成通过。尚无 Registry 路径的 Cloudflare 原生 CPU 数据，本轮没有部署 Preview 或执行云端写入。[隔离预检](evidence/media-registry-isolated-preflight-2026-11-09.json) · [本机验收](evidence/media-registry-worker-local-2026-11-09.json)

后续审批轮次已补充隔离数据库目录摘要、库大小及八个旧 Preview 的实际绑定。最新判定和剩余证据以独立审批包为准。[隔离 DDL 审批包](MEDIA-REGISTRY-DDL-APPROVAL-2026-11-09.md)

## 隔离 Supabase 预检

| 检查项 | 结果 |
|---|---|
| 目标边界 | 类型元数据通过 `--project-id rnamstwwbzknwbjwdgrf` 取得。Data API 只请求对应的 HTTPS origin。请求只读取 OpenAPI、表投影和行数。 |
| `locations` | 生成类型包含 36/36 列，无缺列或额外列。`opening_hours`、`review_jayden`、`review_qing` 为可空字符串，`is_visited` 为可空布尔值，`updated_at` 可空。Data API 全投影 HEAD 为 HTTP 200。生成类型合并部分底层 SQL 类型，无法证明数据库精度、约束和默认值。 |
| API 与 ACL | OpenAPI 版本为 **14.18**，本机为 **14.12**。隔离 `service_role` 与 `anon` 的全投影 HEAD 都返回 200，分别可见 11 与 9 行。该差异只能证明当前请求的可见范围不同。RLS 定义、底层授权、角色继承、`BYPASSRLS`、`UPDATE`/`DELETE` 与默认权限尚待目录检查。 |
| 命名冲突 | 六个名称均未出现在 `public` 生成类型或 service OpenAPI 中。请求 `Accept-Profile: jnq_media_private` 得到 `406 / PGRST106`，确认该 schema 未经 Data API 暴露。仍需检查 `pg_namespace` 和 `pg_proc` 中的隐藏对象和重载。 |
| 测试记录 | 现有 11 条隔离行未读取记录正文。Registry 保留段 `92000`–`92999` 的 service HEAD 计数为 0。历史固定 Preview 和隔离证据保留，旧部署的当前云端绑定未重新核对。 |
| 结构和容量 | 外键、约束、触发器、RLS、ACL、默认权限、PostgREST 完整配置和数据库实际容量均未知。账户免费余量未知。Supabase Free 标称数据库额度为每项目 500 MB，不能由 11 条 `locations` 记录推算剩余容量。 |

自动审批拒绝了 `db query --linked --project-ref …`，理由是 `--linked` 可能指向仓库关联项目。仅指定显式隔离 ID 后，CLI 退出并返回 `LegacyDbQueryMutuallyExclusiveFlagsError`，未执行目录 SQL。隔离目录预检需要能强制绑定项目 ID 的只读通道，例如 Supabase 官方 Management API 的 `/database/query/read-only` 或经审批的 Supabase MCP。应在一次预检中检查角色及默认 ACL、触发器与外键、两个名称空间、目标关系类型与约束、PostgREST 配置及 `pg_database_size`。账户用量需要账户侧只读凭据或仪表板。 [Supabase 只读端点](https://supabase.com/docs/reference/api/v1-read-only-query) · [Supabase 额度](https://supabase.com/docs/guides/platform/billing-on-supabase)

## 本机实现与安全边界

- `CANDIDATE_MEDIA_REGISTRY=true` 仅允许显式隔离项目和 `92000`–`92999` 内、slug 为 `cloudflare-loop-registry-<id>` 的 fixtures。关闭开关时保留段仍会拒绝服务。Registry 路径拒绝旧流式上传；现有 Presigned PUT、staging、CopyObject、文件前缀及大小验证和 ticket CAS 继续工作。
- 赢得 complete CAS 的请求，在验证 final 对象并成功写 receipt 后，才能用服务端捕获的两个对象身份调用 `register`。如果 receipt 或登记结果不确定，保留 final 和 receipt，取消不能删除。相同 ticket 重试只查询相同身份，不能补插。已提交但响应丢失会确认成功；未提交会保持私有并返回冲突。新上传会生成新 key。孤儿对账、回收和是否补登记需要另行审批，先确认原事务终态、两份 R2 身份和文件签名；并发不明确时保留私有对象。
- 保存把封面与相册去重，用两次实时 LIST 读 final 对象与 receipt 的大小、MIME、ETag 和版本。截断时，两个前缀合计最多八次精确 HEAD。预算用完返回 503，保存 RPC 不发送。SQL 在同一事务内检查 Spot 版本、引用集合、实际观察身份、登记及撤销状态。部分 PATCH 可增加一次 `locations` 读取来合并现有相册。
- 单字段隐藏走 `withdraw`，即使媒体读取不可用也可下架。删除和撤销走各自的事务 RPC。匿名媒体读取先走 `lookup`，只接受当前公开且被引用的登记，再读取并校验 receipt 正文和实际对象身份。未登记、撤销、缺失或替换的对象拒绝读取。已登记但未引用的对象仅向通过验证的管理员开放。
- Postgres 与 R2 跨系统无法锁住同一时刻。外部替换可以发生在 LIST 之后，导致 SQL 提交一个随后不可读的旧引用。本机集成复现此顺序并确认替换后的字节返回 404。已授权并开始返回的响应无法撤回。仍需核对旧固定部署的配置快照，确认它们保有原 allowlist 与旧 key 范围。回滚也不得把 Registry fixture 加到旧路径的 allowlist。

## 验收与调用量

本机使用 PostgreSQL **17.11** 与 PostgREST **14.12**，沿用审核过的固定镜像、临时内部 Docker 网络、loopback HTTP 和 tmpfs。Worker 使用合成 R2/Auth，经真实本机 HTTP 调用未修改的 SQL 草案。11 组适配器场景通过，包括六个 RPC、1/5/17/30 图首次及重复保存、36 字段投影、重复封面、伪造 receipt、缺失/替换、并发 complete/cancel、版本竞争、撤销/重发/删除和 HEAD 上限。直连管理 RPC 的本机 anon/authenticated 请求分别返回 `401/42501` 和 `403/42501`。容器、临时网络与监听端口均已确认清理。

相关 Node 回归为 **98/99**。旧流式上传用例期待未引用、未验证对象的匿名请求为 404，实际返回 401。直接运行 `5cbd5fa` 的 Worker 复现同一差异。本轮保留旧路径行为，该请求未取得任何媒体字节。

| 路径 | 本机观察到的调用形状 |
|---|---|
| 17 / 30 图首次及未变化保存，两项媒体字段齐全且无重定向 | 每次 2 次 R2 LIST、0 receipt GET、0 HEAD、1 次 SQL 保存 RPC，另有 1 次管理员 Auth 请求。原路径分别需要 17 / 30 次 receipt GET 加 1 次对象 LIST，30 图原路径的 CPU 未测。 |
| LIST 截断 | 回退用例是 2 LIST + 2 HEAD；耗尽用例是 2 LIST + 8 HEAD，未发保存 RPC。 |
| 首次 complete / 确认重试 | 在既有 R2 流程之外各增加 1 次 Registry RPC，重试只确认，未再复制对象。 |
| 匿名媒体读取 | 1 次 lookup RPC、1 次 receipt GET、1 次对象 GET 或 HEAD。查询失效或身份不匹配时提前拒绝。 |

R2 LIST 属 Class A，HEAD/GET 属 Class B。以当前代码替换保存路径会减少逐图 Class B 读取，每次非空相册常规保存增加一次 Class A LIST。该变动及 complete 额外 RPC 的真实 Workers CPU、Supabase 计算与账户余量仍未测。历史原生 17 图 **29 ms、19 ms** 超额及 **10 ms** 临界证据保留。原 PostgREST 138/138 验收保持独立。历史真实 TCP 强制断开产生的未解释 **HTTP 400** 仍是未解决项，本轮仅验证了已收到上游提交响应后向 Worker 模拟丢失结果。 [R2 计费分类](https://developers.cloudflare.com/r2/pricing/) · [历史相册 CPU](GALLERY-CPU-2026-11-09.md) · [历史上传验收](DIRECT-PREVIEW-2026-11-09.md) · [历史 HTTP 证据](MEDIA-REGISTRY-LOCAL-POSTGREST-2026-11-09.md)

## 下一阶段与回滚

1. 在授权的只读通道补齐目录和容量检查。只有六个名称和私有 schema 无冲突、ACL/RLS/触发器符合 SQL 前置条件，才将 DDL 改判 READY。
2. 另行批准后，仅在隔离库执行已审核草案的单事务 DDL，检查 SQLSTATE、实际授权与 PostgREST 14.18 schema cache。另行批准后创建并登记全新保留段 fixtures。确认旧固定 Preview 不能收到 Registry allowlist 或访问其 keys，再启用专用小型 Preview。
3. 在原生 Tail 记录每个请求。先量首次 complete 与确认重试，再测试 1、5、17、30 图首次及未变化保存、撤销、下架和匿名读取。任一请求超过 10 ms、Tail 缺失或安全断言失败即停止，保留原始失败和临界值。
4. 失败时冻结 Registry 写入，撤出 Registry fixtures 的 Preview 流量并保留私有对象、登记和撤销证据。旧固定 Preview 只承接其原 fixtures。确认无流量、无待定事务且有可恢复快照后，才能另行批准清理本轮 fixture、R2 对象和 SQL 对象。避免复用删除过的 fixture ID 或退回到旧媒体读取逻辑。
