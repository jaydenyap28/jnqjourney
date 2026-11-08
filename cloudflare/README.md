# Cloudflare 零月费迁移候选：阶段 1

当前结论：**静态兼容样本通过，完整迁移未通过验收，禁止作为正式站替代品。**

基线：2026-11-08 拉取的 `origin/main`，`7cee63d00a603992456eba71cc4b526a80d8ab25`。
独立分支：`codex/cloudflare-free-migration`。没有提交、推送、Production 部署、DNS 改动或数据库写入。

## 已实现及验收

- 在 `artifacts/cloudflare-candidate/source` 生成独立 Next.js `output: export` 样本。原 `app/api`、Pages API、Middleware、后台、公开内容和正式配置都保留在原仓库；样本输出单独排除无法静态执行的服务器入口。这不是删除功能的正式迁移方案。
- 样本覆盖中英文 Guide / Notes、中文 Spot、地区、Tioman / Batam / Hainan 配套与选项、后台列表和部分编辑/预览路由。动态路由参数在样本副本中枚举，后台客户端页面通过服务器包装器静态输出。
- 构建环境变量白名单隔离；不读取或复制 `.env.local`，不向子进程传 service role、R2 secret 或 Cloudflare token。浏览器 Supabase 客户端使用不可访问的 `candidate.invalid` 占位，所有 API 写请求在本地预览返回 405。原后台 API 没有代理至正式站。
- 构建完成 50 个静态页面/路由产物；打包 442 个文件，无超过 25 MiB 的文件、无扫描规则命中的凭据特征。扫描不是对所有未知秘密的数学保证；本候选同时通过环境隔离避免注入秘密。
- 11 个公开样本验证标题、单一 H1、正式域名 canonical；检查双语 sitemap、robots、404 及 301/307/308 样本规则。保留实际 Next 静态导出 HTML、JS、RSC 和 Pages JSON 资源。
- 17 项本地 HTTP 定点检查通过：样本 200、重定向、真实 404、API 不可用、POST 拒绝。未进行全站浏览器审计，也未验证 Cloudflare 边缘运行时。
- 候选全站附加 `X-Robots-Tag: noindex, nofollow`，用于防止测试域名被索引；页面内原 canonical/语言/robots 元数据保留。正式发布不能直接沿用此预览头。
- 修复原 `requireAdminRequest` 的缺口：`ADMIN_EMAILS` 缺失时拒绝访问，不再允许任意已登录账户获得管理员 API 权限。没有改变正式环境配置。
- 16 项隔离测试通过（真实 Supabase SDK/Auth/PostgREST 流程使用模拟 HTTP；发布 Worker 使用模拟 RPC/Cloudflare HTTP），没有正式数据写入。定点 ESLint 无错误/警告；候选 TypeScript 检查和 Next 构建通过。

本地只读地址：`http://127.0.0.1:8788`，进程停止后可用 `npm run cf:preview` 重启。
**没有线上测试地址：环境没有可用 Cloudflare API 授权或 Wrangler 登录配置，未尝试创建项目、登录或部署。**

## 自动合并发布的代码候选

`publication-outbox.sql` 是**未应用**的 Supabase 迁移，必须先在独立克隆库验证。它不是已经上线的保存后自动发布功能。

1. Spot/地区/配套/选项/affiliate 数据表事务触发器，以及 Supabase Storage `_system/` 文档变更触发器，只累计 revision。图片对象上传不触发整站构建。
2. 单行事务锁原子认领 revision；15 分钟安静窗口、2 小时最长合并窗口、30 分钟最小尝试间隔。Worker 每 30 分钟运行；实际发布时间还受构建耗时及额度限制。
3. 每 UTC 日最多 8 次、每 UTC 月最多 240 次**自动构建尝试**，失败也占次数。到限保留待发布变更，等下一可用窗口；这些额度不包含手动/代码推送和账户其他项目的构建。
4. 服务端 Worker 只提交 `codex/cloudflare-free-migration` 到名称以 `-migration-candidate` 结尾的项目，并检查该分支不是项目 Production 分支。创建部署 API 返回 ID 后，后续轮询该部署。
5. 只有 `deploy` 阶段成功且预览站 `/_publication.json` 证明公开快照 revision 足够新，才确认已发布。构建期间的新保存继续保留；失败保留变更。提交结果未知时保留锁，要求运维核对，避免盲目重试浪费构建次数。
6. SQL 默认 `enabled=false`；Worker 默认 `PUBLICATION_ENABLED=false`、无公开调度 API；RPC 只授权 `service_role`，对 anon/authenticated 无执行权限。

SQL 的事务竞争、触发器覆盖、RLS 和额度跨日/月边界**尚无真实 PostgreSQL 验收**；本机没有可用 PostgreSQL/克隆库。现有测试没有宣称覆盖这些数据库语义。

## 剩余关键工作及阻塞

| 要求 | 当前状态 / 必须验证的条件 |
| --- | --- |
| 全部原 URL、公开内容和 SEO | 样本只枚举部分路由。需权威且一致的最新公开快照/状态/slug/alias 清单，生成全量参数并检查 sitemap 覆盖；当前使用 2026-10-30 公开备份，不能声称等同最新正式内容。 |
| 301/404/noindex 实时状态 | 样本仅证明静态状态/规则可保留。原 Spot Middleware 实时读取隐藏、删除、redirect chain、英文翻译有效性；Pages 静态规则不能替代该检查。必须接入经过验证的轻量动态 gate，防止等候重建时继续展示已隐藏内容。 |
| 原后台 CRUD、图片上传、Guide/Notes/配套编辑 | 原源码保留，样本可输出界面；管理员 API、Supabase 写入、R2 上传、导入/下载/清理等服务器功能尚未迁移到 Cloudflare。样本保存/上传不会工作。不能把管理员 UI 静态输出当作后台迁移完成。 |
| 保存后自动更新 | outbox/Worker 代码已有，尚未应用或启用。需在克隆库验证，再接入权威快照构建和部署版本回执；样本不会生成虚假的 `_publication.json` 来冒充新内容发布。后台发布状态/额度/错误反馈 UI 尚未接入。 |
| Next.js 动态适配 | 当前是 Next 14.2.35、App/Pages 混用，含 `next/cache`、ISR、Node fs、AWS SDK、sharp、archiver 和动态 API。需要选择并实测 Worker 适配/拆分方案。没有证据证明现有完整服务器包满足免费限制，也没有证据足以宣称免费路线绝对不可行。 |
| 零月费 | 没有新增依赖或付费服务。Pages 样本大小通过；完整后台还需实测 Workers Free 10 ms CPU / 3 MiB gzip / 100,000 请求每日限制，以及现有 Supabase/R2 配额。不可承诺无限流量/存储。达到免费限额应延迟/拒绝，不能自动升级付费。 |
| 线上候选 | 缺 Cloudflare 账户授权、隔离的 Git 集成 Pages 候选项目和 Supabase 测试库。不得借用正式数据完成写测试。 |

不要启用 Worker 或 SQL 开关，直到权威内容构建、动态 gate、管理员 API 和隔离环境验收完成。
目前纯 Pages 静态托管**不能独立承载关键动态功能**；不以删除功能、依赖已暂停 Vercel 的 API 或引入月费作为替代方案。

## 重现及证据

在不存在 staging 目录的干净工作区依次执行：

```text
npm run cf:prepare
npm run cf:build
npm run cf:package
npm run cf:verify
npm run test:cloudflare
npm run cf:preview
node scripts/cloudflare/verify-static-candidate.mjs --http
```

准备器拒绝覆盖已有 staging；要重新准备，先保留/重命名旧目录。无需为了检查脚本再次构建。
产物和记录：

- `artifacts/cloudflare-candidate/source/out/`：静态预览目录，含 `_headers`、`_redirects`、`404.html`。
- `artifacts/cloudflare-candidate/manifest.json`：基线、样本范围、备份版本、未完成项。
- `artifacts/cloudflare-candidate/package-result.json`、`verification.json`：打包和页面/HTTP 验收。
- `artifacts/cloudflare-candidate-build.log`、`cloudflare-targeted-tests.log`、`cloudflare-lint.log`、`cloudflare-types.log`：构建、测试、定点 lint 和类型检查。

初次本地尝试分别遇到 Windows 沙箱创建目录/网络隔离限制和样本包装器错误；包装器修正后候选构建通过，本地 HTTP 服务及验收在相同主机上下文通过。未做重复全站构建。

## 官方依据（2026-11-08 查阅）

- [Pages 静态 Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)：静态 export 路线。
- [Pages 免费限制](https://developers.cloudflare.com/pages/platform/limits/)：500 次构建/月、20,000 文件、单文件 25 MiB、20 分钟构建超时。
- [Workers Free 定价](https://developers.cloudflare.com/workers/platform/pricing/)与[限制](https://developers.cloudflare.com/workers/platform/limits/)：100,000 请求/日、10 ms CPU、3 MiB 压缩包上限。
- [创建 Pages 部署 API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/)：Git 分支部署及返回 deployment ID，需预先授权 Git 仓库。
- [Cloudflare 当前 Next.js 指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)：当前推荐 vinext（beta），不能直接假设与现有项目完全兼容。
- [OpenNext Cloudflare](https://opennext.js.org/cloudflare)：涉及 App/Pages/ISR 支持及免费包体限制；其 Next 14 支持说明同时含“支持最新 minor”和“Q1 2026 退出支持”的过时冲突，不能据此承诺本项目在当前版本受支持。需锁定具体适配器版本实测。
