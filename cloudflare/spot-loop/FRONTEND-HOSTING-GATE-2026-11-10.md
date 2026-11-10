# Cloudflare Free 前端宿主验收

基线 `bce68994c794db434a7aefc0ac1538b0c8229b1e`，Next.js `14.2.35`、React `18.3.1`。正式迁移 **HOLD**。

| 关卡 | 结果 | 本轮实际覆盖 |
| --- | --- | --- |
| 真实前端宿主 | **FRONTEND_HOSTING_BLOCKED** | 两种官方动态适配器依赖解析失败。完整路由树和独立英文路由的静态构建均失败。新 Preview 页面 **0/5**，Chrome 和原生 CPU **无新样本**。 |
| 权威来源 | **AUTHORITATIVE_SOURCE_BLOCKED** | 第一关未通过，第二关未启动。来源对齐 **0/2**，私有发布/清理依赖迁移 **0/4**。 |
| 后台写入 | **ADMIN_WRITE_INTEGRATION_BLOCKED** | 前置条件未满足，第三关未启动。真实站点保存闭环 **0/7**。 |

## 实测阻塞

| 路径 | 实测结果 |
| --- | --- |
| Pages 静态导出，完整 App/Pages 路由 | 在独立副本中成功编译并通过构建内类型检查。收集页面数据时 Next 拒绝 `/api/admin/affiliate-links` 的 `force-dynamic` 与 `output: 'export'` 组合，退出码 1。 |
| Pages 静态导出，真实英文入口 | 保留真实英文组件、全局 CSS 和字体，仅在诊断副本排除其他路由。Next 在预渲染 `/en/[[...path]]` 时明确拒绝导出 `getServerSideProps`，退出码 1。 |
| OpenNext `1.20.16` | npm 官方元数据及严格依赖 dry run 均确认 peer 为 `>=15.5.29 <16 \|\| >=16.4.5`，当前 Next 14.2.35 返回 `ERESOLVE`。部署目标为 Workers。 |
| vinext `1.4.4` | npm 官方元数据及严格依赖 dry run 均确认 React peer 为 `^19.3.1`，当前 React 18.3.1 返回 `ERESOLVE`。混合路由方案还要求 React DOM、RSC 和 Vite 配套。部署目标为 Workers。 |

旧 `@cloudflare/next-on-pages` 已归档，动态路由仅支持 Edge Runtime。当前站点使用默认 Node SSR、显式 `nodejs` 路由、文件系统和私有 R2 S3 读取。换到旧适配器需要迁移这些路径，并重新验证发布门控。官方 Pages 路径为静态导出。Workers 上的两条动态路径均超出当前依赖基线。若单独评估框架升级，仍须验证真实请求与 Free CPU。[Pages 指南](https://developers.cloudflare.com/pages/framework-guides/nextjs/) · [旧适配器](https://github.com/cloudflare/next-on-pages) · [OpenNext 运行时](https://opennext.js.org/cloudflare) · [vinext 官方仓库](https://github.com/cloudflare/vinext)

新增 [构建预检脚本](../../scripts/cloudflare/frontend-hosting-preflight.mjs) 从仓库根目录运行。默认保留完整路由，`--english-only` 仅用于定位 SSR 失败。脚本使用独立目录与无效域名配置，保留构建日志和退出码。首次完整构建遇到 Windows `mkdir EPERM`，经正常权限复验得到上述框架错误。英文诊断前两次漏拷全局 CSS 及字体 CSS，补齐后取得独立 SSR 错误。这些初次失败属于验证环境和脚本问题。[构建及依赖证据](evidence/frontend-hosting-2026-11-10/preflight.json)

Cloudflare 当前公开限制为 Free HTTP CPU **10 ms**、**100,000 次 Worker 请求/日**，官方文档列出的脚本体积限制为 **64 MiB 未压缩**。本轮阻塞发生在依赖解析与构建阶段，未生成可部署包，脚本体积、启动时间、静态资源请求和动态页面 CPU 均未实测。上一轮 API 标记样本最高 5 ms，媒体 complete 历史 8 ms，缺失的 `1794278768484-11` 保持 UNKNOWN。账户实际额度余量 UNKNOWN。[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)

## 保留现有组件的最小静态与动态分离方案

1. 用现有 Next 构建链渲染公开组件。固定 CSS、字体和不含内容记录的 JS 可由 Pages 直接服务。含景点或文章内容的 HTML、内联 props、RSC 和 Pages JSON 产物放在现有私有 R2，通过统一门控按已发布版本读取。构建时生成的内容可保留 SEO 和现有 URL。
2. 复用轻量 Pages Function、现有公开投影和私有 R2 读取。HTML、RSC、Pages JSON、API、alias、图片都进入发布判断，静态例外采用显式允许列表。详情和 alias 先验证当前资格。首页等聚合快照必须验证所有嵌入内容的发布版本。无匹配版本或权威源失败返回 503，隐藏目标返回 404。新版本就绪后切换指针，旧快照仍须符合当前资格。Pages 继续 Fail closed。[Pages Functions 路由](https://developers.cloudflare.com/pages/functions/routing/)
3. 编辑表单复用现有组件及已通过的 Spot 保存协议。管理员鉴权、Registry、Edge、Bridge 与私有图片字节流程继续使用现有路径。Notes、Guide、配套等写入按各自权威协议接入。用现有发布队列合并构建请求。下架以权威状态立即阻断旧表示，正文更新在新快照生成后生效。聚合页在快照失效时可能短暂 503。

最小后续验收先做**一条已发布合成 Spot、其双语 alias 和一个含该 Spot 的真实首页快照**。验证 HTML、RSC、Pages JSON、API 与图片，切换隐藏和来源故障后再查同一组入口，包括旧构建路径。用 Chrome 和原生 Tail 测量真实动态门控，分别记录 Pages 直接静态资源与 Worker 请求。通过后才扩大到 Notes、Guide 和后台。

上一轮确认的剩余依赖仍是隔离 `travel_packages.hero_image` 缺列和 Notes 权威指针 503。四处待迁移操作为 Guide 发布回读、Guide 行程成本发布基线、英文发布回读、清理引用确认。第三关现有旧写入拒绝保持有效。正式切换仍取决于共享媒体资格与身份、所有读取和写入消费者通过隔离验收，以及正式操作的独立授权。
