# 新版兼容 Preview 原生验收 · NO-GO / HOLD

`4e443f4` 在隔离环境预检被现有测试库的结构差异阻断。36 列零行 SELECT 实际返回 **400 / `42703`**。修正版的云端原生验收停在部署之前，候选 Worker 请求预算使用 **0/40**。历史 `3603644` 技术 GO 和固定 `c592d40c` 验收记录保留。[本轮脱敏预检证据](evidence/compatibility-native-preflight-2026-11-09.json)

## 各阶段实际结果

| 项目 | 结果 |
| --- | --- |
| 分支和版本 | `codex/cloudflare-free-migration`，核验源码提交 `4e443f48f1cad5c652f0480c0f676d5c0c983b51`。 |
| Production 边界 | canonical 为空，环境变量/Secrets 0、R2 binding 0、部署数 0，Production 与 Preview 均 Fail closed。 |
| Preview 配置 | 四个变量 `SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`CANDIDATE_R2_ACCESS_KEY_ID`、`CANDIDATE_R2_SECRET_ACCESS_KEY` 均确认为 `secret_text`。只记录名称和类型判定。 |
| 隔离资源 | Supabase ref 为 `rnamstwwbzknwbjwdgrf`。测试 bucket `jnqjourney-spot-loop-isolated-media` 的 managed public access 为 false，自定义域名数 0。 |
| 历史部署 | `c592d40c-394e-4cbc-b842-f3cb2aa71535` 仍为 success / preview，项目 latest deployment 也仍为该版本。 |
| 小型打包 | 已复制现有 Worker、纯契约模块及测试静态资源。Worker 与 `spot-contract.mjs` 分别和源码 hash 一致，包中该模块存在。只执行小候选文件打包。 |
| 隔离数据库结构 | 现有 `locations` 为 33 列，新版固定 SELECT 需要 36 列。缺 `review_jayden`、`review_qing`、`is_visited`。`opening_hours` 实际为 JSONB，新版正式兼容契约为 text。 |
| 部署 | 因结构预检失败停在部署前。 |
| 原生验收 | 17/30 图、完整字段、CAS、complete/cancel、失败清理、重定向和新编辑器浏览器交互均为 **待验证**。新 fixture 与合成图片尚未创建。 |

源码 Worker SHA-256 为 `168496a4c55263d1e404fc1f59707b295b933316bad260665cc373f339d1963b`，契约模块为 `bed2b522c19f0863ae5b846e50ad2cbd66cdd287041bdcd9aa9453ccfcea99cf`。这两个 hash 证明打包内容，不能代替云端部署或 CPU 证据。

## 证实的阻塞及最小建议

新增的三列直接导致 PostgREST 拒绝 `4e443f4` 的 SELECT，后台与公开页面都会使用这个字段清单。`opening_hours` 类型差异还会影响“完整字段保持正确类型”的验收。此前隔离库满足旧版较短的字段清单，新版 36 列尚未完成隔离结构对齐。

最小建议是仅对隔离项目 `rnamstwwbzknwbjwdgrf` 做经批准的结构对齐，增加可空 text 的 `review_jayden`、`review_qing` 及可空 boolean 的 `is_visited`。先盘点隔离 `opening_hours` 的现有值，明确如何保留 JSONB 值或 text 序列化，再将该列与预定 text 契约对齐。该操作涉及 DDL，等待用户另行批准。本轮没有执行 SQL，也没有修改上传实现。

结构对齐后重新通过只读预检，才创建专用 fixture，并将新版小型候选部署为 Preview。之后沿用最多 40 次请求、逐请求原生 Tail 的验收门槛。任一超过 10 ms、缺失 trace、安全失败或误删均停止。无需重复历史文件尺寸和旧 Chrome 测试。

## CPU、操作数及免费额度判断

- 新版 17/30 图保存 CPU 为 **未知**，实际 R2 操作数为 **未测**。没有发生候选 Worker 重试或实际 R2 CAS 竞争。
- `4e443f4` 的源码每个不同媒体会读取一次 receipt 和一次 object HEAD，17/30 图分别对应预期 34/60 次校验读取。它们仍是代码计数，尚无本轮实际计量佐证。
- 历史 Presigned PUT 的 **10 ms 临界值**继续保留。此次预检没有提供新的云端 CPU 或额度风险实测。
- 当前没有依据决定是否进一步减少相册检查。先解决结构阻塞并取得代表性原生结果，再判断热点和必要的最小修复。

## 仍在 HOLD 的正式迁移事项

旧公开媒体 URL、正式 Supabase SELECT/RLS、旧发布队列与 cron 协调、正式后台/slug/SEO/跨模块完整契约、正式备份及可用回滚入口仍为 P0。本轮仅查询候选项目和隔离 schema，正式数据、R2、RLS、cron、DNS、Vercel 与 main 均保持隔离。

本轮交付独立报告、只读预检工具与脱敏结果，到此停止。新版结论为环境兼容 **NO-GO**，正式迁移继续 **HOLD**。
