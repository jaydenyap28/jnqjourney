# Supabase Edge Functions 有界试点前置结果

**NOT_FEASIBLE，当前凭据条件阻塞。正式迁移 HOLD。** 基线 `5bb6fde82a2c75aa959a5aa502a98d47a02f2a73`。隔离项目 `rnamstwwbzknwbjwdgrf` 的自定义 Edge Secrets 数量为 **0**，本机进程也没有隔离 R2 凭据对。依照本轮“需要新授权或新凭据时停止”的要求，试点停在部署前。平台上的实际保存可行性仍为 **UNKNOWN**。[脱敏预检证据](evidence/supabase-edge-rm0-preflight-2026-11-09.json)

官方 Supabase 连接确认项目为 `jnqjourney-preview`、`ACTIVE_HEALTHY`、PostgreSQL 17.11，所属 `JNQ Media` 组织的 `plan=free`、`tier=tier_free`。该项目当前 Edge Functions 数量为 **0**。官方 Free 配额为每月 **500,000 次函数调用**，每请求 CPU 上限 **2 秒**、内存 **256 MB**、Free worker wall clock 上限 **150 秒**。实际账户剩余调用量、egress 和数据库余量为 **UNKNOWN**。本轮 Edge 请求数为 **0**，实际 CPU 和请求耗时均为 **UNKNOWN**。[调用额度](https://supabase.com/docs/guides/functions/pricing) · [运行限制](https://supabase.com/docs/guides/functions/limits)

本轮只读取远端 Secrets 名称元数据，没有读取其值。没有名为 `CANDIDATE_R2_ACCESS_KEY_ID` / `CANDIDATE_R2_SECRET_ACCESS_KEY` 的条目，也没有其他 R2/S3/AWS 名称的条目。此前的测试密钥位于 Cloudflare Preview Secrets。Supabase 托管 runtime 可自动提供本项目的 Supabase 内置变量，因此自定义 Secrets 列表为空不构成 Supabase 管理 API key 的缺失证据。[Supabase runtime Secrets](https://supabase.com/docs/guides/functions/secrets) · [此前 Preview 凭据类型记录](evidence/registry-native-2026-11-09/final-boundaries.json)

冻结 Registry 事务要求服务端实时提供 final 对象及 receipt 的 `size`、`etag` 和上传 `version`，并在同一 SQL 保存事务内与登记核对。R2 Workers API 定义了每次上传的唯一 `version`。R2 官方发布记录还记载了 S3 `CopyObject` 返回 `x-amz-version-id` 等响应头。实际 S3 `HEAD` / `GET` 头是否能提供与既有登记**完全相同**的两个原生版本，仍待使用合法测试凭据验证。本轮没有向私有 S3 发请求，没有将旧 receipt、浏览器声明、ETag 或模拟版本填入 `p_observed`。[Registry SQL](review/trusted-media-registry.draft.sql) · [R2 原生对象定义](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) · [R2 发布记录，2022-09-06](https://developers.cloudflare.com/r2/platform/release-notes/) · [R2 S3 兼容性](https://developers.cloudflare.com/r2/api/s3/api/)

恢复这个试点需要用户本人将已有、仅限 `jnqjourney-spot-loop-isolated-media` 的凭据安全设置到隔离项目的 Edge Function Secrets，保留上述两个候选名称。凭据值通过 Supabase Dashboard 输入。完成后先对少量现有 final/receipt 执行真实 S3 身份对照。若原生版本缺失或与 Registry 不同，即判定该直接适配路径 NO-GO 并停止。匹配后，才在当前已授权的单一隔离试点内创建独立保存函数，进行 5/17/30 图事务、身份替换拒绝、认证、失败回滚和撤销保护验证。[隔离项目 Secrets](https://supabase.com/dashboard/project/rnamstwwbzknwbjwdgrf/functions/secrets)

本轮没有创建 Edge Function、配置 Secrets、执行 SQL 写入或发出 R2 写入及 Cloudflare 候选请求。现有 Registry SQL、六个 RPC、原生 CPU NO-GO 证据和测试资料保留。试点停在凭据步骤。
