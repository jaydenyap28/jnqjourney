# JnQ Journey 静态恢复候选 — 2026-11-11

**PUBLIC_STATIC_READY（独立 Preview 候选）**

**ADMIN_PENDING**

**PUBLICATION_PENDING**

**正式整站迁移：HOLD。** READY 不代表正式安全切换已获批准。

可访问 Preview：<https://921277e0.jnqjourney-static-recovery-candidate.pages.dev>。全部响应 noindex；未绑定正式域名。部署 ID `921277e0-81c7-46a0-ae65-c869a4f3e947`。

## 已实施的公开网站

从参考提交 `473cb06775b310ddf55cc64ef4f1007ca8b9f4c8` 建立独立分支 `codex/cloudflare-static-recovery`。复用四个静态候选脚本，通过 `--recovery` 进入完整站点模式；没有升级 Next/React，没有重做 Snapshot Hosting、Registry、Edge/Bridge 或历史 CPU 验收。

真实原 Next 14.2.35 页面和 React UI 在独立 staging 中构建。根目录 app、原后台和正式 API 未被改写。仅 staging 适配为捕获公开数据、普通文档导航、静态英文 SSG、静态 JSON feed、原地图/相册/视频组件。原 Vercel Analytics/Speed Insights 和 Preview AdSense 脚本不进入该候选。保留原 AdSense 元信息/ads.txt 及根代码，正式广告启用仍需独立检查，不在 Preview 实投。

| 内容 | 实际权威公开资料及输出 |
|---|---|
| Spot | 586 条目录记录；582 active、publication_status SQL NULL 可公开；2 permanently_closed、2 temporarily_closed 排除。没有把全部 NULL 隐藏 |
| Spot 页面 | 582 中文 + 582 英文有效路径；沿用现有英文翻译质量/noindex 门槛，不把未审核翻译视为合格英文内容 |
| 地区 | 58 条地区；中英文目录、国家及地区页各 60 个路径 |
| Notes | 6 篇 published Notes，列表及真实长文详情，中英文保留原组件 |
| Guide | 7 篇权威公开 Guide，列表及详情、中英文，保留行程/预算/住宿/地图/影片 |
| 配套 | 3 个 published 配套、12 个 active 选项；Batam 7、Hainan 2 有原详情模板，Tioman 3 保留在原父页面内，未伪造独立详情 |
| 其余 | 首页、搜索、About、Contact、政策、404、历史 alias、静态公开 API/feed 兼容入口 |

当前共 **1,349 个有效 HTML 页面，1,478 条显式跳转，706 个符合现有索引资格的 sitemap URL**。404 另计。完整清单：[URL Inventory](evidence/url-inventory-2026-11-11.csv)。

数据来自明确指定正式项目的只读目录/公开字段查询、当前 Supabase Storage 权威指针以及当前已发布语言/费用 feed。捕获时间 `2026-11-11T01:49:46.349Z`；最终只读复核 `2026-11-11T02:52:06.740Z` 八类来源仍一致。不是 2026-10-30 fallback。Guide 使用原公开权威集合（草稿另存），Notes 只保留 published=true。没有下载私有内容或写入正式来源。跨平台单事务一致性不作保证。

新增链接交叉检查发现并修复静态兼容遗漏：

- 将真实 HTML 中按显示名/英文名生成的 212 个 Spot alias，依据公开 ID 映射到权威 canonical。
- 4 个 Hainan 无 ID 链接依据实际 slug 表和公开 ID 对应关系补跳转；不是按图片文件名猜测。
- 修复 About 的 guides/destinations 索引旧链接。
- 补入 `/en/packages`；`/en/disclaimer` 复用现有 noindex 的 translation-missing 政策模板，链接回原文，没有编造英文政策。
- 9 个没有原英文详情模板的配套选项使用 **302 到真实中文详情**，没有伪造英语版本。
- 共增加 229 条有来源的跳转。最终 1,349 页内部链接扫描 **0 个未解析目标**。其他未知 slug 仍 404。

## 纯静态证明与免费限制

最终产物 `artifacts/cloudflare-static-recovery/deploy`：

- **3,621 文件，226,642,240 bytes，最大文件 2,620,264 bytes**。
- 初次完整构建原生 Next trace 为 46,919 ms；有实际路由遗漏后进行一次修正构建，最终 trace **53,506 ms**。一次受限环境 EPERM 通过正常执行权限解决。该耗时来自本机，不冒充 Cloudflare 构建耗时。
- HTML 正文、CSS、JS、字体、JSON、静态 RSC `.txt`、Pages JSON 均为文件。Next Build ID `eJ1kXw-B4EBhzS3pmybYs`。
- **0 Functions、0 SSR Runtime、0 R2 binding、0 环境 Secrets**。无 `_worker.js`、functions 目录、动态 `_routes.json` 或 admin 路由；Wrangler 未上传 Worker bundle。
- `/api/locations` 和 `/api/spots/:slug` 是 `_redirects` 的静态 200 rewrite，读取实际文件。Affiliate/FX 使用静态 feed；浏览器不依赖正式 Vercel API、Supabase 数据查询或动态 RSC 服务。
- 新 Direct Upload 项目 `jnqjourney-static-recovery-candidate` 无 Git 自动部署；上传前后 Production canonical 为空、Production 部署数为 0、无自定义域名及 Secrets/bindings。

官方 [Pages 限制](https://developers.cloudflare.com/pages/platform/limits/) 为 Free 20,000 文件、单文件 25 MiB、Git 构建 500/月及 20 分钟超时；本候选在文件和跳转上限内。1,478 条跳转加两个 rewrite，低于 [静态/动态跳转限制](https://developers.cloudflare.com/pages/configuration/redirects/)。[纯静态请求免费且不限量](https://developers.cloudflare.com/pages/functions/pricing/)，不占 Workers 每次访问 CPU 预算。本轮没有 Tail/CPU 探索。

**实际账户剩余构建量、R2/Edge/Mapbox 免费余量 UNKNOWN。** 不把成功上传当作完整账单或未来流量保证。正式图片仍访问既有公开来源，费用/可用性仍受这些来源影响；没有新增正式 R2 存储。英文首页约 589 kB、英文地区目录约 154 kB 的 Next page-data 警告保留，尚未进行长期负载或完整移动性能基准。

## 实际验收

脱敏证据：[汇总](evidence/acceptance-2026-11-11.json)、[完整旧版 HTTP](evidence/http-full-before-link-fix-2026-11-11.json)、[修正版增量 HTTP](evidence/http-delta-2026-11-11.json)、[最终字节核对](evidence/bytes-2026-11-11.json)。

| 项目 | 结果与范围 |
|---|---|
| 构建 / 类型 / lint | Next export 成功；最终修正后的 tsc --noEmit exit 0；staging lint exit 0，4 条既有 img 警告。未把原仓库所有不相关测试重复跑一遍 |
| 本地全量完整性 | 1,349 页单 H1、title/canonical、合法 hreflang 目标、公开数据 ID、582 份详情 JSON、无关闭记录页面/alias、无私有 Spot 字段及管理密钥、文件上限检查通过 |
| HTTP | 首版 1,347 页 + 1,249 跳转 + 8 探针，共 **2,604/2,604**；最终新版新增 2 页 + 229 跳转 + 8 探针，**239/239**。明确复用旧结果，没有谎称最终版再次全量请求 |
| 真实文件字节 | 最终 Preview **19/19** SHA-256 一致：HTML、静态 RSC、Pages JSON、两个兼容 API、公开 feed、sitemap、robots、真实 404 |
| Chrome | Chrome 157.0.8103.40；1440×900、1920×1080、390×844、430×932。原 UI 38 次完整页面访问，全部 7 Guide 有桌面/手机检查；修正版另 14 次关键页面访问通过 |
| 交互 | 首页地图 582 → 搜索后 1 标记；独立搜索结果正常文档跳转；地区选择/刷新 39 个 Spot 链接；Guide 日程跳转；真实 Mapbox 图/文字后备；1800×1013 图片解码、Lightbox/键盘退出；真实多图 Spot 轮播；影片点击创建隐私 iframe |
| 页面安全 | 隐藏/关闭记录不在捕获公开索引、页面或 alias 中；新产物无 service_role/R2 Secret；无同源资源 HTTP 错误或 Hydration/ChunkLoadError。静态运行本身不代表未来撤销实时生效 |
| SEO | 706 sitemap 项与当前 metadata 索引资格一致；noindex 页不加入。所有 Preview 响应额外 noindex，robots 全站 Disallow。保留原 Article/Breadcrumb 等 schema，未添加虚构 FAQ/Offer |

浏览器测试器失败原始记录保留在本机 artifacts：手机在地图异步初始化前读标记数、误假定一个真实单图 Guide 必须有第二张、补测误拦截必需 YouTube iframe API 导致 Event。定点修复测试器后相应检查通过，没有为取得 PASS 修改 Router 或掩盖网站异常。视频初始化通过；广告、部分第三方辅助请求被测试器阻断，**连续视频播放/真实广告交付不计 PASS**。浏览器取消的字体/图片请求与真实 404 分开保留。

部分截图保存在 `artifacts/cloudflare-static-recovery/screenshots`，例如 `home-1440.png`、`guide-china-dali-shangri-la-lijiang-11d10n-390.png`、`guide-map-390.png`、`gallery-decoded-390.png`。未改版视觉。地图使用原代码中的既有公开 token；本轮**没有读取 .env.local**。

原网站 Batam 父页 canonical 使用 apex `jnqjourney.com`，其余多数为 www；保留该单项差异，正式切换前需确定统一主域规则。

## 媒体真实缺口与正式 P0

来源精确引用清点 **4,775 个图片 URL，4,723 个为旧 r2.dev；9 个 URL 跨不同内容模块共享**。另有 769 个首屏/实际 HTML img 引用做 HEAD：766 HTTP 200、1 HTTP 404、2 UNKNOWN。没有将所有图库都谎称验证过字节/原生身份。

已知 404 是 Pulau Kapas 页面引用的 `i.ibb.co/r2FHQynR/...png`；两项 UNKNOWN 为旧 Hokkaido 区域和 Timba-Timba 区域图片连接结果。其他正常图片与原 fallback 机制保留。没有根据文件名编造替代图片，也未修改原始资料。所有历史媒体的 Registry 当前身份/撤销状态仍 **UNVERIFIED_FORMAL_MEDIA**。

正式 `jnqjourney-img` 的旧公开入口未关闭，公开 Supabase 旁路亦未改动。旧 r2.dev 完整 URL 不受新站 DNS 控制，无法承诺保持其永久兼容并同时即时撤销。共享图片必须以所有合法公开消费者对账，不能因一个 Spot 下架删除仍由 Note/Guide/地区/配套使用的对象。

**纯静态 + 每次访问不查资格 + 实时撤销旧 HTML/公开图片，当前不能同时保证。用户尚未批准放弃实时撤销，因此正式切换继续 BLOCKED/HOLD。** 不能用本轮可浏览的 Preview 越过这一条件。

## 后台和发布：如实区分

**ADMIN_PENDING**：原 Spot/Notes/Guide 编辑器、Auth、CRUD 和后台源码完整保留；历史隔离 Presigned PUT、Registry、Edge/Bridge、30 图技术验收不重跑、不改变。当前独立产品后台实际完成 Spot/Note/Guide 保存验收 **0/3**，没有把显示 UI 或旧技术 GO 算成独立后台完成。Note/Guide 的权威写入与版本协议不能复用 Spot RPC 冒充。下阶段应先打包原组件静态 admin，再对合法隔离 fixture 完成各模块真实登录/保存/读回/失败验证。

**PUBLICATION_PENDING**：增加 `npm run cf:recovery -- --deploy-preview` 的本地一键入口：新 run 目录、互斥锁、内容/代码去重、10 分钟间隔、8 次/日与 240 次/月本地预算、失败计数、完整构建验证后才部署、来源复核、成功回执与不确定结果只读复核。子阶段实际通过；新总控执行了语法/--check，未无意义再跑一次全站来宣称总控自动化验收。

没有后台发布按钮到 outbox/CI 的真实联通；没有执行 publication-outbox DDL/cron；浏览器没有 Deploy Hook、Cloudflare Token 或 service_role。部署失败保留先前版本，但这会保留旧内容，**不是紧急下架方案**。本地 runner 的锁/预算不是云端多实例发布权限模型。

修改/发布/紧急下架、备份和安全回滚步骤见 [README](README.md)。原 complete CPU 8 ms 的历史风险不被本轮静态成功覆盖；未来恢复 admin 后仍需真实大图与原生预算验收，不能用小图外推。前台当前完全不需要 Function CPU。

## 正式恢复仍需的最小动作（本轮未执行）

1. 用户决定可接受的静态发布/下架传播政策，或单独授权一个可实测的紧急阻断机制；在此之前不能批准正式上线。
2. 对正式数据库/权限/权威文档/私有媒体做完整安全备份及独立恢复演练。本轮公开捕获只是静态发布输入，不是完整备份。
3. 完成共享媒体所有者和旧 JSON/feed 消费者的正式替换方案；受控替代入口全部验证后，再单独批准正式匿名 SELECT/RLS 及旧 r2.dev 开关。明确哪些外部旧链接将失效。
4. 独立 admin 的 Auth/权限/写入逐项验收；接通经过鉴权、合并、限额及失败恢复的显式发布任务。草稿保存不触发整站构建。
5. 修复/确认已知历史图片与 canonical 差异；从最新权威公开数据重新构建正式候选，审核正式 robots/索引/AdSense 配置。
6. 用户分别批准 Production 发布和域名/DNS 切换；保留可恢复且不包含已撤销内容的前版。当前脚本只允许 Preview，不会执行这一步。

没有执行正式 Supabase/R2 写入、公开开关更改、DNS/Vercel/Production/main 操作、付费升级或 Firecrawl 调用。Preview 部署 metadata 指向参考 commit 并带 dirty=true；当前交付提交保存实际适配器，部署回执/Build ID/字节 SHA-256 对应真实产物，不为美化 metadata 额外部署。
