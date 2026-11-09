# 10 MiB 上传修复：HOLD（2026-11-08）

2026-11-09 续测：[真实直传 Preview 验收](DIRECT-PREVIEW-2026-11-09.md)。Preview Secrets 已就绪，四个尺寸与兼容检查通过；安全回归有一个原生 CPU 事件未收到，仍为 HOLD。下文为前一轮历史记录。

仅 `codex/cloudflare-free-migration` 隔离 Preview。此前 Auth、Spot 保存、即时读取、下架和重新发布的通过结果保留；本轮没有 Next 全站构建、完整套件重测或浏览器完整闭环。

当前 [Preview 后台](https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev/admin/cloudflare-spot)，固定部署 [97cb9bd0](https://97cb9bd0.jnqjourney-spot-loop-migration-candidate.pages.dev)。后备直传已部署，**尚未通过真实上传验收**。缺少签名 Secrets 时返回 503；已知不可靠的流式入口默认停用，没有压缩或降低 10 MiB 上限。

## 原生流式 CPU

原实现改成前缀 12 bytes 签名校验 + 原生 `FixedLengthStream` / `pipeTo` → R2，不再整文件 chunks → Blob。Content-Length 必须已知且不超过 10 MiB；原生流限制实际字节长度，失败清理对象。

测量部署 `50f3962e-5eb5-47a6-8662-319d992b4113`，Worker SHA-256 `cec5c26afec46f3132317e2116a859d0ec3f1deb2645a50b7744515e11cd03a7`。

| 有效 PNG | 实际 bytes | HTTP | 原生 CPU | 原生 wall time |
| --- | ---: | ---: | ---: | ---: |
| 1 MiB | 1,048,576 | 201 | 5 ms | 1,872 ms |
| 5 MiB | 5,242,880 | 201 | 3 ms | 1,392 ms |
| 10 MiB | 10,485,760 | 201 | 4 ms | 1,280 ms |
| 独立 10 MiB 重复 | 10,485,760 | 201 | **12 ms** | 2,705 ms |

独立重复使用新进程、新登录、不同像素/hash/随机对象。PNG 均本机生成，结构/CRC 有效，另用 Python stdlib 解压核对像素长度；有效 tEXt chunk 补齐精确文件大小，没有在 IEND 后补零，没有处理用户原图。

指标来自原生 Pages tail `cpuTime`，按验收 ID 关联，非 HTTP 延迟推算。测量共 6 次 Worker 请求（含两次登录）、4 个成功图片写入，图片共 26 MiB，不代表账户总用量。尾流丢弃 headers、Cookie、body、日志文本。

**流式方案未可靠达到 Workers Free 10 ms。** 独立重复 12 ms 即判失败，即使 HTTP 201/outcome ok。不继续反复测试以低值覆盖失败。

## 已实现的直传后备链

1. 实时 Supabase 管理员身份/fixture 校验后，签发仅测试 bucket、随机 `_candidate-staging/1/…` 对象、PUT、120 秒的 SigV4 URL，签入 Content-Type 与 Content-Length；未知/超限 size 不授权。Secret Access Key 永不发往浏览器。
2. 浏览器直接 PUT 私有 R2。测试 bucket CORS 已设置为唯一分支 Preview origin、PUT、Content-Type、120 秒缓存。
3. 完成接口通过 R2 binding range GET 检查完整 size、MIME、前 12 bytes 文件签名。服务器执行 R2 内部 CopyObject 到最终随机路径，再经 binding 复核复制结果；不在 Worker 搬运大图片。
4. 验证 receipt 绑定 key、fixture、size、MIME、etag、不可变 version；Spot 保存及图片读取都核对 receipt。存在但未验证的对象不能被引用或公开。staging URL 不能覆盖最终对象。
5. 失败/取消清理 staging、ticket、receipt 和可能的最终对象；清理故障 fail closed。测试 bucket 已增加 staging/ticket 两前缀一天过期，兜底处理浏览器中断；保留原 multipart 生命周期，不删已验证图片。一天过期不代表即时清理。

管理员校验、随机路径、Spot 乐观版本保护和私有 R2 隔离均保留。预计一次成功直传为 4 次 R2 Class A（ticket、PUT、copy、receipt）、3 次验证读取 Class B，另有删除；这是代码操作计数，**不是实际计费统计**。保存/公开读取还需 receipt 与对象检查。此前账户约 7.44 GB，26 MiB 测试不能证明全站长期存储/请求均在免费额度内。未新增收费服务。

## 验收范围

- 新增流式 7 项、直传 7 项本地测试通过，另仅运行原套件中图片输入相关 1 项；新增代码定点 ESLint 通过。未重跑旧全套。
- 覆盖未知长度、超限、后续 chunk 溢出、MIME/签名、未授权、data/receipt/copy 失败清理、票据过期、未验证引用、对象 version 变化、Spot 版本冲突和下架图片保护。
- 新候选真实闸门：登录 200 / CPU 7 ms；缺少签名 Secrets 授权 503 / 6 ms；旧流式入口 503 / 5 ms；未授权 401 / 1 ms。这里只证明安全停用行为。
- **直传 1/5/10 MiB、独立 10 MiB 重复、S3 签名/Content-Length/CORS/CopyObject 原生兼容及云端安全回归尚未验证。** 本地模拟不能替代。浏览器完整闭环也未完成。
- 部署前后 Production canonical 为空；Production env vars/secrets、R2 binding、部署数均为 0，两个环境 Fail closed。未改正式 Supabase/R2、DNS、Vercel，未绑定正式域名、未合并 main。

## 阻塞及续测

Wrangler OAuth 读取 Account API Token permission groups 返回 **403 / 9109**。未创建 token、未扩大权限、未使用正式 R2 凭据。Preview 中两个签名 Secret 名称尚不存在：

- `CANDIDATE_R2_ACCESS_KEY_ID`
- `CANDIDATE_R2_SECRET_ACCESS_KEY`

已请用户本人创建 **仅 `jnqjourney-spot-loop-isolated-media` 的 Object Read & Write** 凭据，直接存入候选 Pages 项目的 **Preview Secrets**。不发聊天，不设置 Production，不升级。服务器需要复制/清理；浏览器 capability 始终仅单对象 PUT。

配置确认后，只读运行 `upload-fix-boundaries.mjs` 检查名称/类型和 Production 边界；如现有部署未包含新 Secrets，仅重部署这个小 Preview。启动 `phase3-runtime-tail.mjs --direct-upload`，依次独立运行 `upload-fix-direct-native.mjs`、`--repeat-ten`、`--security`。不记录 presigned URL；任何原生 CPU >10 ms 立即 HOLD。全部通过后才恢复浏览器完整闭环。

脱敏证据：[流式验收](evidence/upload-stream-checks-2026-11-08.json)、[原生尾流](evidence/upload-stream-runtime-2026-11-08.json)、[PNG 输入](evidence/upload-images-2026-11-08.json)、[新部署](evidence/upload-preview-deployment-2026-11-08.json)、[边界](evidence/upload-boundaries-2026-11-08.json)、[权限阻塞](evidence/upload-signing-permission-2026-11-08.json)、[真实 HOLD 闸门](evidence/upload-direct-hold-2026-11-08.json)。

参考：[Free CPU 限制](https://developers.cloudflare.com/workers/platform/limits/)、[FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/)、[R2 binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)、[presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)、[R2 token](https://developers.cloudflare.com/r2/api/tokens/)、[CORS](https://developers.cloudflare.com/r2/buckets/cors/)。
