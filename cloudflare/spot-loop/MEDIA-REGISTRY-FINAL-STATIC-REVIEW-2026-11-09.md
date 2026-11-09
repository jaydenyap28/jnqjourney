# Trusted Media Registry 最终静态安全审查

**静态审查 PASS，建议批准下一阶段独立本地 PostgreSQL 真验。** 本轮以 `3b0d9ab` 为基线，审查了完整 SQL、前一份设计与安全报告、PoC 和证据。PASS 仅限源码审查和本地静态与合成测试。远端隔离 DDL、Preview 和正式迁移继续 HOLD。[最终 SQL 草案](review/trusted-media-registry.draft.sql) · [历史审查](MEDIA-REGISTRY-SQL-REVIEW-2026-11-09.md)

## 六个 RPC

| RPC | 静态权限结果 | 事务与拒绝条件 |
| --- | --- | --- |
| `jnq_media_register` | PASS。仅 `service_role` 执行 | 先锁已启用 Spot。重复身份成功，版本、receipt 或撤销不符返回 `PT409`。仅首次可信 complete 或另经审查的导入器可插入。处理中的重试只确认已有同一身份。 |
| `jnq_media_save` | PASS。仅 `service_role` 执行 | 锁 Spot，比较可空版本，合并字段并逐项校验登记与服务端 R2 快照。拒绝未登记、撤销、缺项、重复或版本不同的对象。更新后复读，抑制或改写触发 `PT503` 并回滚。 |
| `jnq_media_withdraw` | PASS。仅 `service_role` 执行 | 锁 Spot并检查版本。只接受下架操作，不接受媒体字段。更新后复读状态与版本。 |
| `jnq_media_revoke` | PASS。仅 `service_role` 执行 | 锁 Spot 后写撤销墓碑。已引用时同事务下架。下架失败整笔回滚。重复撤销幂等，无法通过列写权限清空墓碑。 |
| `jnq_media_delete` | PASS。仅 `service_role` 执行 | 锁 Spot 并检查版本。删除成功后外键级联清理登记与启用范围。检测跳过或重建的行。再次调用返回 `PT404`，适配器按已不存在对账。 |
| `jnq_media_lookup` | PASS。仅 `service_role` 执行 | 单一 SQL 快照返回登记身份与公开引用状态。撤销、已删除或无登记返回 SQL NULL。匿名请求仍由 Worker 检查公开引用，并对实际对象和 receipt 再验。 |

所有函数采用 `SECURITY INVOKER`，固定 `search_path = pg_catalog, pg_temp`，并以限定名访问应用表、函数和复合类型。对象身份列采用 `C` 排序规则。公开 RPC 在同一 DDL 事务中显式撤销 `PUBLIC`、`anon`、`authenticated` 的默认执行权限，随后仅授权 `service_role`。私有表启用 RLS，私有 schema 不暴露给 PostgREST。末尾有有效权限断言，覆盖匿名和普通用户继承的 ACL，并限制服务端登记列权限。撤销保护触发器未授予 `service_role` 直接执行权限。真实角色映射与授权检查仍须 PostgreSQL 和 PostgREST 验证。[PostgreSQL search_path](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-SEARCH-PATH) · [Supabase 函数权限](https://supabase.com/docs/guides/database/functions#function-privileges)

## 事务和信任边界

- **锁顺序。** 所有写 RPC 先锁单个 `locations` 行，再访问登记。`READ COMMITTED` 下，等待者获得的是更新后的 Spot 行，后续 SQL 语句读取最新登记。保存先完成时，后续撤销会下架最新引用。撤销先完成时，等待的保存会看到新版本或已撤销登记。删除先完成时，等待者找不到 Spot。每个 HTTP 请求须限制为一个 Spot 写事务。跨 Spot 的批量写不在此协议内，本地脚本故意反转两行锁顺序作为死锁负对照。[PostgreSQL READ COMMITTED](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED) · [函数快照](https://www.postgresql.org/docs/current/xfunc-volatility.html)
- **可空版本。** `IS DISTINCT FROM` 支持 `NULL` 对 `NULL` 的首次保存。首次成功后版本推进到毫秒对齐时间，旧 NULL 或旧时间戳均冲突。发生超时或提交响应丢失时，保存和下架需要重读当前版本与结果，不能盲重放。删除结果不确定时核对已删除状态。记录 `PT409`、`55P03`、`40P01` 和 `PT503`，运行时错误映射仍待真验。
- **已修正的缺陷。** 前版列授权下可直接清空撤销时间，现在触发器拒绝该操作及身份改写。前版可能将被触发器跳过的更新或删除报告为成功。现在检查实际写入，保存及下架复读结果，撤销下架失败回滚整个事务。草案上线前仍须核对目标库的触发器、FK、真实列类型及 `service_role` 既有权限。
- **可信 complete。** R2 成功而数据库结果不确定时保留私有最终对象。重试只能确认已有相同登记，不能依赖当前 R2 的一对对象和 receipt 重新建立身份。没有独立来源证明时只能用新 key 重新上传。缺登记或已撤销拒绝读取。旧媒体必须经过独立校验后才登记，旧 Worker 回滚仅允许其原有的独立 fixture。
- **剩余边界。** `SECURITY INVOKER` 使用现有可信 `service_role` 的底层权限。持服务端凭据可绕过 Worker 调用直接写入，所以迁移模式必须独占其 fixture，并由 Worker 自行生成 R2 快照和执行管理员、同源及读取检查。SQL 不能对浏览器声明赋予可信性，也无法跨 R2 和 PostgreSQL 原子提交。外部覆盖或删除发生在快照后时，读取阶段必须重验对象和 receipt 并拒绝异常。已开始传输的字节无法撤回。

## 证据与真验准备

| 层面 | 本轮状态 |
| --- | --- |
| 纯逻辑与静态检查 | **34 项通过**。原 33 项加一项静态检查，覆盖固定命名空间、撤销终态和写入失败保护。Node 通过测试运行器语法检查。 |
| 真正 PostgreSQL SQL、锁、ACL | **待运行**。Docker、psql、pg_ctl 当前未发现于 PATH。已准备网络隔离的 PostgreSQL 17 脚本及 36 列合成 fixture，含真实双连接阻塞探测、默认 ACL 继承回滚、锁超时、反序死锁、触发器抑制与恢复。 |
| PostgREST | **待验证**。准备独立 HTTP 角色与 schema cache 测试步骤，使用临时签名与合成角色。 |
| Cloudflare CPU | **待验证**。历史 17 图 29 ms、19 ms 及 complete 10 ms 继续保留。本轮 Worker 请求为零。 |
| Supabase Free 额度 | **待验证**。历史容量估算可用作规划，实际剩余容量、组织用量和 RPC 负荷均未获取。 |

下一阶段按本机 Docker、经审核的 PostgreSQL 17 镜像、合成 fixture、双连接与自动清理的顺序执行。运行入口要求显式本地 SQL 开关及本机预置镜像 ID。本轮仅做脚本准备和语法检查。[本地真验与清理步骤](review/local-postgres/README.md) · [本轮证据](evidence/media-registry-final-static-review-2026-11-09.json)
