# 隔离 Registry DDL 执行验收

**DDL_EXECUTION_PASS。** 2026-11-09，新加坡日期。目标为 `rnamstwwbzknwbjwdgrf`，仓库基线为 `ae2b4b58cdc69599529639f7f819e41a3832cd68`。下一阶段隔离 Fixture + Cloudflare 原生 CPU 验收的数据库前置条件已满足，实际执行仍待单独授权。正式迁移 **HOLD**。[完整脱敏目录与事务证据](evidence/media-registry-ddl-execution-2026-11-09.json) · [托管 HTTP 证据](evidence/media-registry-ddl-http-corrected-2026-11-09.json)

Supabase 官方工具通过 `JNQ Media` 连接显式读取目标项目，返回 `jnqjourney-preview`、`ACTIVE_HEALTHY` 和 PostgreSQL 17.11。即时目录检查确认执行身份与会话身份均为 `postgres`，36 列、无对象冲突、保留 ID 段为空、创建及外键权限符合审批条件。实际角色链仅有 `authenticator` 可切换到三个 API 角色，且不直接继承权限。目录还区分了 `supabase_admin` 与 `postgres` 的默认授权规则，实际创建者 `postgres` 的 `public` 默认函数 ACL 仅含 `postgres` 和 `service_role`。草案全部显式 REVOKE 和有效权限断言保留。

LF 规范化 SHA-256 再次确认是 `b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1`。官方 `apply_migration` 一次提交原草案完整 `BEGIN…COMMIT` 并返回成功，产生迁移记录 `20261109115152 / trusted_media_registry_isolated`。提交后的 12 个函数正文逐一与冻结文件相同。 [冻结 SQL](review/trusted-media-registry.draft.sql)

| 核验 | 实际结果 |
| --- | --- |
| 原数据完整性 | `locations` 提交前后及 HTTP 验收后均为 11 行，有序行摘要 MD5 均为 `5ddae432cf21a614863e7115c064631e`。原 36 列、表 ACL、RLS、默认 ACL、角色链及既有约束保持一致。新增一个预期的入向 Registry 外键。 |
| 私有对象 | `enabled_spots` 与 `registry` 均为空，RLS 均启用，无普通用户策略。两个已验证的级联外键、主键、约束及撤销终态触发器与草案一致。保留段仍为 0 行。 |
| 函数 | 六个公开 RPC 和六个私有辅助函数均由 `postgres` 拥有，全部 `SECURITY INVOKER`，固定 `search_path=pg_catalog, pg_temp`。实际参数签名及托管 OpenAPI 参数名匹配。 |
| 最小权限 | 私有 schema 向 `service_role` 只授予 USAGE。两表的表级授权只含 service SELECT，Registry 额外列级授权为九个身份列 INSERT 和 `revoked_at` UPDATE。`enabled_spots` 无 service 写权限。`PUBLIC`、`anon`、`authenticated`、`authenticator` 无直接 RPC/私有对象授权。有效函数权限核验也匹配，触发器函数不向 service 开放直接执行。 |
| 托管 cache | PostgREST 14.18 自动显示六个 RPC 及精确参数，无需手动 `NOTIFY`。 |
| 只读 lookup | 未启用 ID 92001 的合法合成 key 返回 service `200 / null`，anon `401 / 42501`，真实隔离测试账号 authenticated `403 / 42501`。该账号随后成功登出。 |
| 私有 profile | service 身份的 `Accept-Profile` 和 `Content-Profile` 均返回 `406 / PGRST106`。 |

首个 HTTP OpenAPI 探针返回 401，验收立即停止。该请求的脚本搭配了 anon `apikey` 与 service Authorization。只读目录重新确认事务完整提交、两表为空且原始行摘要一致后，使用既有 helper 的配对 service 头读取 OpenAPI，实际返回 200。修正验收脚本后继续有界 HTTP 核验，全部通过。首轮 401 证据保留，DDL 只执行一次。[首轮 HTTP 证据](evidence/media-registry-ddl-http-2026-11-09.json) · [定点验收脚本](../../scripts/cloudflare/registry-ddl-http-acceptance.mjs)

本轮授权动作限隔离 DDL、只读核验和现有隔离账号的 Auth 登录/登出。新增 Fixture 0、R2 写入 0、Cloudflare 部署 0、候选 Worker 请求 0。账户实际免费余量为 **UNKNOWN**。Cloudflare Registry CPU 尚未测量，历史 29 ms、19 ms 超额、10 ms 临界记录及真实 TCP 中断 HTTP 400 继续保留。

下一阶段需单独批准独立 Fixture 和小型 Preview。沿用审批包的最多 40 次原生请求计划，先测首次 complete 与确认重试，再测 1/5/17/30 图首次及未变化保存，逐请求关联 Runtime Tail。任一原生 CPU >10 ms、Tail 缺失、数据异常或安全保护失败即停。 [既定后续计划与回滚清单](MEDIA-REGISTRY-DDL-APPROVAL-2026-11-09.md)
