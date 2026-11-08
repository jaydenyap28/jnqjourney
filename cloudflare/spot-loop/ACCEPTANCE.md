# 第二阶段：单个 Spot 发布闭环候选

状态：**HOLD，等待用户本人授权及隔离环境；云端真实闭环尚未证明，不能给 GO。**
没有证据证明轻量路径已经超出免费额度，因而不能将未验证误报成技术 NO-GO。若后续实测越过以下免费限制，立即报告对应 NO-GO，不升级收费、不削减原功能。

## 分支和本次范围

- 沿用 `codex/cloudflare-free-migration`，第一阶段先行提交/推送为 `4cad4f5`，没有合并 `main`。
- 新代码仅为指定隔离项目/Spot 的发布路径；没有重写 Notes、Guide、配套后台，也没有替换原有后台或完整 Spot 页面模板。
- 没有重跑第一阶段静态构建、SEO/HTTP 测试或全站审计。
- 未执行任何新增 SQL；未向正式 Supabase/R2 写入；未创建 Cloudflare 项目、bucket、付费服务或 Production 部署。

## 选定的窄路径

```text
静态测试编辑器 → 同源 Pages _worker.js → Supabase Auth /user 权限校验
                                      → 隔离 locations PATCH（版本条件）
                                      → 原生 TEST_MEDIA R2 binding
公开 Spot / JSON / 图片 → 当前 locations 状态 → 即时 SSR / 404
```

Worker 没有 npm/Node/Next/AWS SDK 依赖。不将原有 Node API 直接搬上 Workers。

- 登录通过 Supabase Auth 密码/refresh 协议。每次管理员请求都用 `/auth/v1/user` 校验 access token，要求已确认邮箱和服务器 allowlist；没有只 decode JWT 或相信客户端角色。
- 密码仅用于登录请求。会话 token 放在 `__Host-`、HttpOnly、Secure、SameSite=Strict Cookie，响应 JSON 和编辑器源码不含 token 或管理凭据。
- Cookie 写操作要求严格同源 `Origin`，不开放 CORS。service role 只用于 Worker→Supabase 的 REST 请求；R2 使用原生私有 bucket binding，不需要 S3 secret。
- 配置强制 `ENVIRONMENT=isolated-candidate`、显式隔离 Supabase ref、fixture ID→slug 清单；硬拒绝已知正式 Supabase 项目 `vrufunuomioczocdsoer`。默认写入关闭。
- 上传仅接受 JPEG/PNG/WebP/GIF，检查签名并限制 10 MiB，写入独立私有 bucket 的随机 fixture key。无 sharp 重编码、ZIP、远程图片抓取或通用文件代理。
- 保存仅 PATCH 少量 Spot 业务字段；不允许修改 ID/版本/管理字段。条件 `id + updated_at` 保证版本冲突返回 409，Worker 自己递增 `updated_at`，不依赖新增 SQL/trigger。上传成功后才能引用其 R2 路径。
- 对该 Spot，公开 HTML 从当前记录即时生成，**每次保存触发 0 次整站构建**。下架/草稿后，新 HTML、旧 alias、`.html`、`.txt`、Pages JSON 与公开 JSON 请求均先查当前状态，返回 404；异常返回 503，绝不回退旧快照。已打开页面不会被远程清空，保护对象是后续请求。
- 图片也经过当前状态检查；未发布图片仅允许已认证管理员预览。R2 测试 bucket 不应启用 r2.dev 或公共域名。
- 候选公开页是无 hydration 的轻量服务器 HTML，用来验证保存与下架机制；**不是完整原 Spot UI/双语质量策略的替代实现**。原组件和功能仍保留，尚未宣称其迁移完成。
- `_routes.json` 只让 API、Spot、Spot JSON 和候选媒体调用 Functions；编辑器 JS/CSS 等走 Pages 静态资源。候选全部 noindex。静态目录不含任何 Spot HTML/JSON 副本，因此免费额度耗尽也没有旧 Spot 文件可被 fail-open 意外回放。

## 已通过（本地隔离契约验证）

`node --test tests/cloudflare-spot-loop.test.mjs`：9/9。

1. 登录契约 → 读取 → 照片写入 R2 接口 → 保存 → 新 HTML 显示新内容和图片 → 下架后多种公开入口拒绝。
2. 未登录、非管理员、跨站请求及非 fixture ID 不得写入。
3. 正式项目、空 allowlist、错误 fixture、关闭写入开关均拒绝。
4. 旧版本保存返回 409，不覆盖后来的记录。
5. 源故障或缺少发布字段返回 503，不使用旧页面。
6. 非图片、签名不匹配、超限、外站图片、未存在对象及非允许字段拒绝。
7. alias 的真实 301 发生在当前状态检查之后；下架后 alias 404。
8. Refresh / logout Cookie 处理，不把 token 放进浏览器可读 JSON。
9. 可部署代码无 Node 依赖，配置为独立 bucket，写入默认关闭。

这些测试实际调用 Worker 的 Web Request/Response 处理器，但 **Auth/PostgREST HTTP 及 R2 binding 是隔离替身**。它们不是 Cloudflare 原生 R2、真实 Supabase Auth、浏览器或免费 CPU 验收。不得把“9 项通过”当作线上闭环成功。

定点 ESLint/语法检查通过。`npm run cf:spot:package` 只复制该窄路径到 `artifacts/cloudflare-spot-loop/out`，不运行 Next 构建。包体报告见该目录上一级 `package.json`：Worker 约 18 KB 原文、约 6 KB gzip，远小于 3 MiB；这是源码压缩大小，不是 Wrangler 远端上传测量。

## 最新公开内容来源的定点检查

2026-11-08 15:31（新加坡），仅对现有公开 R2 CDN 发出 7 个 JSON GET 请求；没有抓取全部 Spot 或查询正式管理数据。

| 来源 | 实际结果 |
| --- | --- |
| `public-data/locations.json` | HTTP 200，582 条 |
| `public-data/regions.json` | HTTP 200，58 条 |
| `public-data/spots/index.json` | HTTP 200，582 个 slug；不含已撤回 ID 450 |
| `public-data/guides.json` | HTTP 200，7 条；payload `generatedAt=2026-09-23T12:22:07.556Z` |
| `public-data/notes.json` | HTTP 200，6 条；payload `generatedAt=2026-09-29T03:34:26.893Z` |
| `public-data/i18n/en/records.json` | HTTP 200，405 条，其中 318 标记 complete |
| `public-data/guide-trip-costs.json` | HTTP 200；payload `generatedAt=2026-09-21T14:26:38.203Z` |

这已证实：第一阶段本地备份的 5 Guide / 1 Note **不能当作全量最新来源**。可读 CDN 集合也不是完整的实时权限、撤回、slug/alias 和跨集合一致性证明。

全量仍缺：当前 Supabase Storage `_system/location-slugs.webp`、所有 Spot 的实时发布/redirect 状态、当前 PostgREST `travel_packages` 与 `travel_package_options`，以及 DB/Storage/R2 的一致 revision。当前包的 3 个配套/12 个选项仅是 bundled 备份计数。

复用现有样本输出、为全量中英文和后台动态路由分别保守计入两份 HTML/RSC/JSON，模型结果 **约 5,040 文件**，低于 Pages Free 的 20,000 文件限额。这不是实际完整 export 文件数，也未证明每个文件的最终大小。现有样本 trace 的 `next-build` span 为 **27.223 秒**；没有重跑该样本。**完整版真实内容构建耗时尚未测得**，不得用线性外推冒充验收。缺少完整权威路由/发布清单前不启动一个必定不完整的全站构建。

报告：`artifacts/cloudflare-full-inventory/report.json`，下载的公开快照留在同目录 `snapshots/`；未提交这些数据副本。

## 301 / 404 / noindex 的实际机制

- 候选 fixture alias：Worker 查实时行 → 未公开 404；公开且 alias 非 canonical 时返回 HTTP 301。不会依赖 HTML meta refresh。fixture 的编辑器不开放通用 redirect 修改；完整原站的 16-hop redirect chain、Notes 跳转和英文翻译有效性仍需后续原样适配，不能称已覆盖。
- 正式旧路线的 307/308、中文/英文 canonical、全量 alias 仍由原代码定义；没有更改源站规则。
- 对静态 Pages，不存在文件时需根 `404.html`，避免 SPA 回退 200；动态隐藏/删除不能仅靠该文件，必须先有实时 gate。
- Pages `_headers` 不作用于 Functions 响应，所以 Worker 对全部响应显式加 `no-store` / `X-Robots-Tag`；候选预览全部 noindex，正式页面 index/noindex 质量策略未替换。
- **必须由用户在候选 Pages 项目 Runtime 设置 Fail closed。**官方文档明确说明 Fail open 会在免费请求额度耗尽后继续返回静态文件，可能绕过权限/下架保护。即使候选无静态 Spot 备份，完整迁移也不能接受该绕过模式。

## 当前必须交给用户本人的授权步骤

尚未运行 Wrangler 登录、读取凭据、创建资源或部署。当前停在本人授权步骤。

在你自己的终端中执行：

```powershell
Set-Location 'D:\AI Project\jnqjourney'
npx wrangler login
```

只在 Cloudflare 打开的官方页面完成授权。**不要向聊天发送密码、access token、service role 或任何 R2 secret。**登录完成后只需告知完成，后续可在同一分支继续。

真实验证还需要一个已有或可在免费配额内建立的**独立 Supabase 测试项目**（现有 locations schema、已确认的测试管理员、一个新测试 Spot）和既有 R2 账户中的**独立私有测试 bucket**。如果免费项目/存储配额不允许这些隔离资源，停下报告资源阻塞，不借用正式库/bucket，不购买容量，不执行新增 SQL。

配置要求：

| 名称 | 放置及边界 |
| --- | --- |
| `CANDIDATE_SUPABASE_REF`、`SUPABASE_URL` | 候选 Wrangler 配置里的隔离项目地址；不能是正式 ref |
| `CANDIDATE_SPOTS` | 仅测试库新 fixture ID→`cloudflare-loop-…-ID`；示例 910001 不是正式 ID，也不要求强行插入这个 ID |
| `ADMIN_EMAILS` | 候选项目服务器变量，仅隔离管理员邮箱 |
| `SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` | 用户本人放入候选项目 Preview 服务器 secret；不进 Git/前端、不经聊天。可用 Dashboard 选择 Preview 设置，避免操作现有正式项目 |
| `TEST_MEDIA` | Wrangler 中固定的 `jnqjourney-spot-loop-isolated-media` 私有 bucket binding；不要映射正式 bucket |
| `CANDIDATE_WRITES_ENABLED` | 仅隔离资源确认后设 true；源码默认 false |

后续项目应使用名称 `jnqjourney-spot-loop-migration-candidate`，Production branch 保持 `main`，仅向 `codex/cloudflare-free-migration` 分支做 **Preview 部署**。首次创建项目也不允许顺手发布其 Production 分支。不要绑定正式域名。

## 获得授权后的必测项 / NO-GO 门槛

以下均未通过；本轮没有先扩写其他后台来绕过这些门槛：

1. 真实测试 Auth 登录、刷新、退出、非管理员拒绝，浏览器中不出现任何管理密钥。
2. 在原生 Pages/R2 上执行一次小图和最大允许图片的上传、修改、保存；两次独立客户端读取新正文/照片，Spot 发布不产生构建请求。
3. 下架后从匿名客户端读取正常 URL、旧 alias、英文入口、HTML/TXT/JSON 和图片，确认无旧内容可读；上游故障返回 503。验证重新上架。
4. 观测实际部署的 Worker CPU 分布、冷启动及 10 MiB 上传 CPU；超过 Free 的 10 ms 预算且无法通过轻量路径可靠解决，则对该实现报 **NO-GO**。Node 测试 wall time 不能替代此测量。
5. 确认账户为 Free、未启用付费升级，Pages Functions 共用 100,000 请求/UTC 日额度、私有 R2 的存储/操作量及 Supabase 余量可支撑预期使用。超过请求额度时 Fail closed 将牺牲可用性来保证下架/权限保护；若实际流量在免费额度内无法满足关键可用性，则 **NO-GO**，不能自动换付费。
6. 给出真实 Preview URL 和上述验收证据后，才讨论其他后台适配。不把当前简化 fixture 编辑器或模板用于替代原功能。

## 官方依据

- [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)：独立 `_worker.js` 和 ASSETS 回退。
- [Pages routing / Fail closed](https://developers.cloudflare.com/pages/functions/routing/)：路由计费范围和免费限额耗尽行为。
- [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)：仅静态请求免费不限次；Functions 与 Workers 共用免费请求额度。
- [R2 native binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)：无 S3 凭据的读写 API、Blob 支持和强一致性。
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)：网络等待不计 CPU；鉴权/SSR/大 payload 处理仍可能越过 Free CPU。
- [Supabase password Auth](https://supabase.com/docs/guides/auth/passwords)及[服务器用户校验](https://supabase.com/docs/reference/javascript/auth-getuser)。
- [Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/)：项目 Production branch 与 Preview deploy branch 是不同设置，必须显式选择。
