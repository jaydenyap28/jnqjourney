# Presigned PUT Preview 验收 · 候选技术 GO

安全回归补测与真实 Chrome 闭环均已通过。技术 GO 仅适用于当前隔离 Preview 的 Spot 发布流程，正式迁移仍待单独授权。

## 断点续验（2026-11-09，新加坡时间）

### 原生尾流调查

原始验收 ID `1794187562183-33` 的 409 在 HTTP 记录中保留，归档的 23 条尾流事件里没有该 ID，也没有未关联的 409 可供核对。原采集进程已关闭，Preview 元数据没有持久观测或 Logpush 配置。Pages 实时尾流不保存历史事件，因此原始 CPU 无法恢复。 [Cloudflare Pages 日志文档](https://developers.cloudflare.com/pages/functions/debugging-and-logging/)

检查了本机 Wrangler 与旧采集器。旧命令未设显式采样率或状态过滤，旧解析器静默吞掉 JSON 解析异常，只检查三种 header 拼写，并直接覆盖文件。它在 `exit` 时收尾，不能确认 stdout 已排空。已有证据不足以区分上游尾流丢失、采样、解析或写入问题。

新采集器按验收 header 过滤，不添加采样率，使用 UTF-8 流解码和不区分大小写的 header 查找，原子写入独立快照，并记录解析失败、截断、关联失败和告警计数。续验以单次 journal 保护 409 补测，等待匹配的原生事件后才继续。新尾流 **30/30** 条请求均关联，解析错误、截断、未关联请求和告警计数均为零。

### 安全回归补齐

登录与读取 fixture 的原生 CPU 分别为 4 ms 和 2 ms。检查到当前版本 `2026-11-09T01:26:04.195+00:00`、公开状态及既有已验证图片后，仅发出一次使用旧版本的 PATCH。新请求 `1794188154311-2` 返回 **409，CPU 3 ms**。原始请求的 CPU 字段仍为空。

| 新补测 | HTTP | 原生 CPU |
| --- | ---: | ---: |
| 匿名读回已验证图片，SHA-256 与原输入一致 | 200 | 3 ms |
| 下架 | 200 | 2 ms |
| 下架后的匿名页面 | 404 | 1 ms |
| 下架后的匿名图片 | 401 | 1 ms |
| 重新发布 | 200 | 2 ms |
| 重新发布后的页面和图片，图片 SHA-256 复核 | 各 200 | 各 2 ms |

安全阶段共 10 个新 Worker 请求，CPU 1–4 ms。四次历史尺寸上传与 S3 兼容检查原样保留。 [安全补测记录](evidence/direct-resume-acceptance-2026-11-09.json)

### Chrome 完整闭环

在本机无头 Chrome `157.0.8103.38` 中，以独立管理员和匿名浏览器上下文操作原有 UI。真实登录、空文件提示、选择并上传 128 KiB 有效 PNG、上传成功提示与预览解码、Spot 保存、新标题和图片的匿名读取、下架、重新发布、登出均通过。浏览器实际 PUT 到 R2 返回 200，CORS 允许该 Preview origin。下架后的匿名页面和图片分别返回 404 和 401，重新发布后恢复。登出返回 200，会话复查返回 401。浏览器页面异常计数为零。

20 个浏览器 Worker 请求全部关联原生 Tail，CPU 为 0–7 ms。上传授权 3 ms，完成验证 7 ms，保存 4 ms。测试结束时隔离 fixture 已重新发布，标题恢复为原值，保留本次验证图片。 [浏览器脱敏记录](evidence/direct-browser-acceptance-2026-11-09.json) · [新原生尾流](evidence/direct-closure-runtime-2026-11-09.json)

### 边界与判断

停测后复核 Production canonical 为空，部署、环境变量和 R2 binding 均为零，两个环境均 Fail closed。整个续验使用原 Preview、隔离 Supabase 和测试 R2，保留原 Presigned PUT Worker。 [停测后边界](evidence/direct-closure-boundaries-2026-11-09.json)

当前 Spot 候选通过技术验收。历史 1 MiB 的完成验证 **10 ms** 仍是已观测最高值，正好碰到门槛。本次证据涵盖有限的隔离样本，长期流量、并发及完整网站配额仍未验证。正式迁移仍为 HOLD。

## 首次验收记录（保留）

2026-11-09（新加坡时间）。代码基线 `9a0af83`，分支 `codex/cloudflare-free-migration`。只重新打包、部署原有小型 Preview；没有改 Worker 架构或做全站构建。当前 [Preview 后台](https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev/admin/cloudflare-spot)，固定部署 [c592d40c](https://c592d40c.jnqjourney-spot-loop-migration-candidate.pages.dev)。

1. **只读边界：通过。** 两个签名变量均为 Preview `secret_text`，没有查看密钥值。部署前后及停测后，Production canonical 为空，环境变量/Secrets、R2 binding、部署数均为零；两个环境均 Fail closed。候选未绑定正式域名。所有操作仅使用候选 Pages、隔离 Supabase fixture 和私有测试 R2，未调用写入正式域名、DNS、Vercel、Supabase 或 R2 的操作。
2. **Preview 部署：通过。** 部署 ID `c592d40c-394e-4cbc-b842-f3cb2aa71535`，Worker SHA-256 `656e5e7b23d80143e3b810055e1e572462b5ac6867dc20b581c8131bfad8029c`，与既有候选相同。未改 main、未新增收费服务。
3. **真实上传与兼容：通过；安全回归的 CPU 证据不完整。** 四个有效 PNG 均为 R2 PUT 200、授权和完成验证 201。独立 10 MiB 用新进程、新会话及不同图片/对象。下表 CPU 来自指定部署的原生 Runtime Tail `cpuTime`；直传耗时是客户端 wall time，图片正文没有经过 Worker。

| 图片 | 授权 CPU | 完成验证及 CopyObject CPU | 直传耗时 |
| --- | ---: | ---: | ---: |
| 1 MiB | 5 ms | **10 ms** | 218 ms |
| 5 MiB | 5 ms | 8 ms | 339 ms |
| 10 MiB | 4 ms | 6 ms | 464 ms |
| 独立 10 MiB | 4 ms | 7 ms | 1,412 ms |

实际 R2 兼容验证：允许的 Preview CORS preflight 204，其他 origin 403，带正确 Origin 的实际 PUT 返回允许该 origin 的响应头。错误 MIME、错误 Content-Length、用 PUT URL 发 GET 均返回 403。四个有效样本完成验证并取得 receipt，确认服务器端 CopyObject 路径可用。

实际安全检查：未授权 401，未知/超限大小 400，已上传但未验证的图片不能写入 Spot（400）；错误签名完成返回 415，匿名读该图片 404，原票据再使用返回 403。未用票据取消返回 200。此处检查清理接口行为及不可访问性，没有另做独立的 bucket 对象盘点。已验证图片保存到隔离 Spot 返回 200（6 ms）。旧版本保存返回 409，但验收 ID `1794187562183-33` **没有收到对应的原生 CPU 事件**。脚本以 `NATIVE_CPU_NOT_OBSERVED` 停止，继续等待原事件仍未收到，未重放请求。后续验证图片字节读回、下架保护与恢复发布未运行。停止时隔离 fixture 已保存通过验证的图片，本轮尚未发出下架请求。

共 34 个 HTTP 请求，其中 24 个 Worker 请求、10 个直达 S3；收到并关联 23 条原生事件，已观测 CPU 为 0–10 ms。未观察到超过 10 ms 的事件，缺失的 409 请求 CPU **未知**。1 MiB 的完成验证已碰到预算上限，小样本无法证明长期有余量。测试写入的有效图片共 26 MiB；未测整站配额，未启用付费服务。

4. **浏览器完整闭环：未开始。** 第三阶段缺少一次必须的原生 CPU 证据，保持 HOLD，未进行浏览器登录、编辑、下架、重新发布或登出。
5. **判断：本轮验收 NO-GO。** 当前阻塞是尾流证据缺失，并非已证实 Presigned PUT 超预算。下一步应先确保检查点可取得完整的原生事件，再从未通过的安全检查继续；已通过的四个尺寸和兼容项目无需重跑。没有授权正式迁移。

脱敏证据：[逐请求验收](evidence/direct-acceptance-2026-11-09.json)、[原生 Runtime Tail](evidence/direct-runtime-2026-11-09.json)、[部署](evidence/direct-deployment-2026-11-09.json)、[部署后边界](evidence/direct-postdeploy-boundaries-2026-11-09.json)、[停测后边界](evidence/direct-final-boundaries-2026-11-09.json)。不含密钥、Cookie、签名 URL 或原始日志正文。
