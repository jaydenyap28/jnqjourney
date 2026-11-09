# Supabase Edge RM0 真实 S3 身份试点

**SUPABASE_EDGE_RM0_NOT_FEASIBLE。阶段一为 S3_IDENTITY_NO_GO，正式迁移 HOLD。** 基线 `bd7f1f39b155939f0cd00e60ad655b8379ec2f74`。真实 R2 S3 `HEAD` 对 final 和 receipt 均返回 **200**，两份 ETag 均与现有 Registry 一致，但两份响应的 `x-amz-version-id` 均缺失。冻结事务要求核对的原生上传版本无法从这两份响应取得，函数返回 **409**，试点在第一次 Edge 请求后停止。[真实响应证据](evidence/edge-s3-identity-2026-11-09/identity-acceptance.json)

官方 CLI 使用显式项目 ID `rnamstwwbzknwbjwdgrf`，确认两个自定义 Secrets 名称 `CANDIDATE_R2_ACCESS_KEY_ID` 和 `CANDIDATE_R2_SECRET_ACCESS_KEY` 均存在。密钥仅由托管 runtime 用于签名。为在此边界内取得第一阶段证据，单一试点函数先部署为只读身份诊断版本，尚未加入保存接口。函数名为 `jnq-registry-rm0-pilot`，ID `195ebca6-8cb9-4173-98ec-5e97947097ae`，版本 **1**，`verify_jwt=true`。服务端另外调用真实 Auth `/user`，核对现有隔离测试管理员 ID、邮箱和确认状态，只允许固定候选 Origin、fixture 92005 和对应 PNG 路径。[部署证据](evidence/edge-s3-identity-2026-11-09/identity-deployment.json) · [只读函数代码](edge-pilot/index.ts)

| 身份 | S3 HEAD 实际结果 | Registry 权威记录 | 判定 |
| --- | --- | --- | --- |
| final 大小 | 68 bytes | 68 bytes | 相同 |
| final ETag | `a75db2c3e1deed40d807e8d2656674cd` | 同值 | 相同 |
| final version | 响应头缺失，记录为 JSON null | `7e5e3faee1294321eeae0bc34e0cff53` | 无法核对 |
| receipt 大小 | `Content-Length` 头缺失 | 257 bytes | 无法核对 |
| receipt ETag | `e7790da1126b8f2bbc4caf5b65f68716` | 同值 | 相同 |
| receipt version | 响应头缺失，记录为 JSON null | `7e5e3faed7a07d838d46a6f3463922f0` | 无法核对 |

final MIME 为 `image/png`，receipt MIME 为 `application/json`。权威身份由服务端使用现有 `jnq_media_lookup` 获取，且逐字段匹配上轮真实 R2 PUT 的历史登记证据。S3 请求用 runtime 内的测试凭据计算 AWS SigV4，只指向固定账户、测试 bucket 和这对现有合成对象。没有把 receipt 内保存的版本、浏览器输入或 ETag 当作当前原生 version。

R2 官方将 Workers API 的 `version` 定义为每次上传对应的唯一字符串，发布记录也曾记载 S3 `CopyObject` 返回版本头。该记录不能证明本轮 HEAD 响应必然包含相同身份。本轮只证明当前直接 S3 HEAD 适配路径未满足冻结契约。按照身份失败即停的要求，未追加 GET 或替代端点实验，也未放宽 SQL 的 version 检查。[R2 原生对象定义](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) · [R2 发布记录](https://developers.cloudflare.com/r2/platform/release-notes/)

| 实际调用与耗时 | 结果 |
| --- | --- |
| Edge 调用 | 1 次，HTTP 409 |
| 私有 S3 | 2 次真实 HEAD，0 次 GET |
| Registry | 1 次只读 lookup，0 次 save |
| 客户端 HTTP 耗时 | 3,332 ms |
| 函数内实际经过时间 | 2,335 ms，含 Auth、Registry 和 S3 网络等待 |
| 原生 CPU | **UNKNOWN** |
| 免费调用量 | 本轮 1 次 Edge 调用。最近官方组织核验为 Free，标称每月 500,000 次。实际剩余额度和账户计费为 **UNKNOWN**。 |

Edge Free 官方 CPU 上限为每请求 2 秒，内存 256 MB，worker wall clock 上限 150 秒。上述经过时间不能用于判断 CPU 是否达标。真实对象身份核验已先失败，因此没有执行 5/17/30 图首次或重复保存、缺失/替换/撤销/伪造引用、事务冲突或失败回滚测试。[运行限制](https://supabase.com/docs/guides/functions/limits) · [调用额度](https://supabase.com/docs/guides/functions/pricing)

测试 Auth 会话已登出，测试流量已停止。独立函数保留为 JWT 和服务端管理员双重校验的只读诊断版本，没有新增 fixture、SQL 写入、Registry 变更或 R2 写入。冻结 SQL、已通过的 ACL 和旧 Cloudflare Worker 保留原版本。没有重跑历史测试。[停止与范围证据](evidence/edge-s3-identity-2026-11-09/preflight-and-stop.json)

建议停止这条“直接以 S3 HEAD 替换 Workers 原生身份快照”的免费适配路线。当前试点未证明 Supabase Edge 的算力不可行，但在保持既有原生版本契约的条件下，直接适配已遇到明确阻塞。取得新版本身份通道需要额外设计与单独授权，超出本轮有界试点。现有结果不支持继续整站迁移。
