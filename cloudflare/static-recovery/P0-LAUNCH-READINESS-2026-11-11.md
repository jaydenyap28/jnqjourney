# JnQ Journey 正式上线前 P0 检查

**正式上线 HOLD。** [原静态 Preview](https://921277e0.jnqjourney-static-recovery-candidate.pages.dev) 保留 1,349 页、3,621 文件和 0 Functions。现有站点两域名于 2026-11-11 13:07（新加坡时间）均返回 `402 DEPLOYMENT_DISABLED`。候选仍有旧媒体公开旁路和下架政策两项安全门槛。

基线 `2ce2e88f0ddfa6eaebb4ce702a67806689cbfce3`。检查与补丁位于 `codex/cloudflare-static-recovery`，详见[脱敏证据](evidence/launch-p0-2026-11-11/summary.json)。

## 图片处理

| 来源及字段 | 本轮实测 | 处理 |
|---|---|---|
| Pulau Kapas，Spot 232 的 `price_info.infoImages[0]` | HEAD 和 GET 均 404；GET 返回 1,031 字节的 180×180 PNG 错误响应 | 本地补丁显示中英文不可用提示，保留票价文字、其他价目图及原始资料。恢复原图需有可验证的同一素材或用户明确确认的新版价目图 |
| Hokkaido，地区 47 的 `image_url` | Node HEAD/GET 超时，真实 Chrome 200 并解码 1536×2048 WebP | 保留原 URL 和焦点定位 |
| Sabah，地区 77 的 `image_url`，Timba-Timba | Node HEAD/GET 超时，真实 Chrome 200 并解码 640×480 PNG | 保留原 URL |

三项引用经指定正式项目的只读 SELECT 确认。原 2 个 UNKNOWN 和独立 Chrome 结果均保留。`PriceInfoImage` 只对已确认的确切 URL 预先显示提示，其余图正常显示，实际加载失败时在该卡片显示提示。修复随下一次获准构建生效，现有 Preview 字节未替换。

4 项定点测试通过，包括真实 React 服务端渲染、中英文提示和正常图片分支。修改文件 lint 和定点 TypeScript 通过。根目录全量 TypeScript 纳入历史 artifacts/Deno 实验文件而失败，原错误留在本机日志。按本轮范围复用原构建证据，未执行新 Next 构建。公开内容复核依次通过数据库、Guide、Notes、slug、英文、费用和历史索引，随后发现 FX 快照有变化。正式候选须重新捕获汇率和内容。

## 旧 R2 的实际暴露

Cloudflare GET 证实正式 `jnqjourney-img` 的 `pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev` 已启用，桶没有已连接的自定义域名。Cloudflare 将 r2.dev 作为限速的开发入口，访问规则和缓存控制需使用自定义域名。原桶若同时开放两个入口，关掉其中一个不会关闭另一个。[R2 公共访问说明](https://developers.cloudflare.com/r2/buckets/public-buckets/)

| 类别 | 实际证据 | 正式处理 |
|---|---|---|
| 已公开引用的照片 | 原 4,723 条 r2.dev 来源 URL 加实际 HTML 消费证据，按同一 origin/path 去掉焦点和查询参数后，得到 **4,657 个**有公开引用的 R2 对象候选。未逐个确认长期公开权利 | 只允许所有者明确确认长期公开且无撤销记录的对象进入发布清单 |
| 已下架或关闭内容引用 | 2 条永久关闭、2 条暂时关闭的 Spot 在本次查询的 `image_url`、`images`、`infoImages` 中共引用 **33 个**没有捕获到公开消费者的 R2 对象。每条 Spot 抽 1 个做匿名 HEAD，**4/4 返回 200** | 先排除这 33 个对象。业务关闭与图片权利是两个状态，恢复公开需重新核对。结果不外推到其余 29 个对象的实时 HTTP 状态 |
| 应私密或已撤销 | 数量 **UNKNOWN**。正式库无 `jnq_media_private`，本轮未读私密草稿、未做整桶清点。可匿名访问的已关闭 Spot 图片不能据此判为权利撤销，也不能据此批准长期公开 | 缺权利证据、存在撤销、私密或来源不明的对象一律不进入发布清单。发现撤销与公开消费者重叠时，撤销优先，清理所有引用 |
| 多模块共享 | **9 个** R2 对象有明确跨模块引用，已公开与关闭 Spot 引用的交集在本次精确匹配范围内为 0。双语页、首页、地区索引等是消费者，不能充当额外所有者 | 记录所有者与所有消费页面。普通 Spot 下架可保留其他内容仍合法引用的图片。图片本身被撤销时须从每个消费者移除 |

33 个对象的身份哈希与归属保留在证据中。未读取它们的图片正文。原桶的未归属对象、草稿附件、历史部署、外部引用和已缓存副本仍需单独对账。旧 r2.dev 还承载公开 JSON feed，关入口前必须替换或明确停用实际消费者。正式 Supabase 直接匿名读取旁路沿用上一轮未关闭的状态，本轮目录 SELECT 没有重新认证 RLS，也不能证明关闭后旧链接安全。

**推荐的最低成本路径**是把经批准的公共媒体作为普通 Pages 静态文件随站点发布，保留原始对象。按现有引用量，每对象一文件约 **8,278 个站点文件**，其中现有站点 3,621 个、候选 R2 图片 4,657 个。还须计入其他来源与必要变体，并实测全部单文件和包体、上传时长、浏览器加载。Pages Free 上限为 20,000 文件、单文件 25 MiB。只复制获批对象，以对象键、来源与 SHA-256 逐一对应，所有 HTML、JSON、静态 RSC、metadata 和 feed 指向新静态路径。此做法的访问请求不需要 Worker，也不增加对 R2 的浏览器读请求。完整复制和容量验证尚未做。[Pages 限制](https://developers.cloudflare.com/pages/platform/limits/) · [静态请求费用](https://developers.cloudflare.com/pages/functions/pricing/)

若经验证媒体包无法纳入 Pages 上限，备选是只存获批副本的独立 R2 Standard 桶，绑定自己的媒体子域，保持该桶 r2.dev 关闭。只在剩余额度、权利、ACL 和内容清单经核实并获准后使用。现有原桶绑定公开域名会继续暴露混合内容，因此不能用它替代隔离。R2 Standard 每月包含 10 GB-month、100 万 Class A、1,000 万 Class B，复制和读回分别消耗操作额度，实际账户余量 UNKNOWN。[R2 定价](https://developers.cloudflare.com/r2/pricing/)

原桶公开入口应按 **替代路径可用 → 验证图片字节、引用和 feed 消费者 → 批准断开外部旧链接 → 关闭 r2.dev → 验证旧对象和 feed 均拒绝** 的顺序处理。外部完整 r2.dev URL 不受站点 DNS 或 WAF 控制，无法从本站保留其原地址跳转。现有 Preview 暂保留作验收证据，入口关闭后它的历史图片依赖也会失效。切换方案须明确接受这一点，或先验证等价归档。

## 下架政策待选择

| | A · 静态重新发布 | B · 静态发布加紧急阻断 |
|---|---|---|
| 正常下架 | 权威状态变更 → 合并发布任务 → 捕获新版本 → 构建并验证所有引用 → 上传完整版本 → 清理受控缓存并检查旧入口 | 同 A |
| 建议验收目标 | 从有值班人员确认的请求起 **30 分钟内**使正式站新请求读不到内容。未做完整演练，当前只是提议。上一轮本地构建 53.5 秒不包括值班、排队、部署、清缓存或核查 | 重大事件确认后 **5 分钟内**启动预先演练的 Cloudflare Zone WAF Block，并从外网验证主域拒绝。也是待实测目标，不能把规则保存成功当作已传播 |
| 失败处理 | 构建或部署失败会延长旧内容可见时间。超过目标立即升级人工处理，按已批准的控制面手段暂停售站，直到有安全版本。没有值班或有效停站能力时，不能承诺 30 分钟上限 | 用一条默认关闭的整站规则作为紧急开关，先阻断 apex/www 经代理的访问。逐页挡详情会漏掉首页、搜索、地区、静态 RSC/Pages JSON、API 与图片。确认新版清除了全部引用后再恢复访问 |
| 成本与复杂度 | 0 Functions，无每请求 Worker CPU。需要值班、构建额度与缓存清单。8 次/日和 10 分钟本地限制要纳入目标演练，不能靠无限重试 | Zone WAF 评估规则，不调用 Pages Functions，新增 Workers CPU 预算为 0；Cloudflare 平台内部耗时未测。Free 有 5 条自定义规则、无正则，预留 1 条，实际空位 UNKNOWN。额外维护授权、规则顺序、入口覆盖与演练。触发时整个正式站会暂时不可用 |
| 无法保证 | 下载、浏览器已缓存的字节、搜索引擎缓存、旧部署哈希 URL 和第三方链接的删除。`must-revalidate` 及 CDN purge 仅影响相应后续请求 | 同 A；Zone WAF 另外无法覆盖独立的 `r2.dev`、`pages.dev` 和 Supabase 域名。须在正式启用前处理所有替代入口，旧 R2 开关仍须单独授权 |

[Cloudflare WAF Free 可用性](https://developers.cloudflare.com/waf/custom-rules/#availability) · [按 URL 清除 Cloudflare 缓存](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/)

普通旅游内容接受经演练的传播延迟时，A 最省维护。若同意紧急情况暂停整个正式站，B 增加一个无需 Worker 的止损入口。两种政策都无法撤回已被他人保存的字节。必须做到即时撤回的素材应保持私有。选择 A 或 B 需要用户明确批准，并明确适用内容和剩余缓存限制。两者均未生效。

## 正式 SEO、部署与回滚

1. **主域建议 `https://www.jnqjourney.com`。** 当前公开 DNS NS 属 Cloudflare；不以公开 CNAME 无响应推断控制台记录。下次本地构建将已确认的 Batam apex canonical 及其由同一字段生成的 OG/结构化数据统一到 www，保持路径。正式获准后在正确 Cloudflare zone 配置 apex → www 的 301，保留路径和查询参数。域名跳转使用 [Single Redirect](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-root-to-www/)，页面 alias 继续用 Pages `_redirects`。先确认 Pages 域名关联和 TLS，再切 DNS，核查 HTTP/HTTPS 和循环。[Pages 自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)
2. **索引分开验收。** 冻结候选 sitemap 有 706 个唯一可索引 URL，643 个页面保留自身 noindex，hreflang 目标均是有效可索引页面。三条实际 Preview 响应回执、robots、ads.txt 都为 200 且有 noindex，字节匹配。正式发布用独立审核产物，允许抓取公开页面和 `/ads.txt`，移除全站 noindex，同时保留单页 noindex、静态数据非索引和真实 404。重验 sitemap 的 www canonical、有效双语 alternates 和无 noindex URL。提供不可直接部署的[正式配置草案](evidence/launch-p0-2026-11-11)。正式入口与项目 `pages.dev` 备用入口要分别核对，旧哈希 Preview 需批准限制访问或归档。`noindex` 只控制索引。[Pages Preview 索引行为](https://developers.cloudflare.com/pages/configuration/preview-deployments/#preview-indexing-by-search-engines)
3. **AdSense 先验证再启用。** 当前 `/ads.txt` 纯文本格式与站点发布者 meta 一致，Preview 无广告加载脚本。正式发布检查 apex `/ads.txt` 通过 301 到 www 后返回 200，并确保 Google 爬虫可读取 HTTP/HTTPS 路径。用户需在 AdSense Sites 确认站点和 ads.txt 状态。独立批准后再恢复正式脚本并验证中英文模板，含当前 English Pages 模板没有广告脚本的路径。账户获批及投放状态 UNKNOWN。[Google ads.txt 抓取要求](https://support.google.com/adsense/answer/7679060?hl=en)
4. **发布及回滚。** 保留本地静态包 SHA-256、批准的媒体白名单、来源版本、DNS 和 Pages 配置，以及经授权的数据库和媒体恢复备份。正式包验证无 `_worker.js`、Functions 或动态路由绑定。上线后确认 canonical、sitemap、ads.txt、图片、静态 API、旧入口和无 Functions。Pages 只可回滚到成功的历史 Production 部署，当前独立项目没有这样的版本，Preview 不能作为一键回滚目标。首次切换前准备一个经审阅、无应下架内容的可重新上传回退包或维护页，记录恢复 DNS 的具体目标。当前 Vercel 402，回退到旧 DNS 只会恢复旧故障。以后只回滚到不含任何当前撤销内容的版本，保持 r2.dev 关闭，不通过重新开放混合桶来止损。[Pages 回滚](https://developers.cloudflare.com/pages/configuration/rollbacks/)

## 最小上线清单

| 决策 | 条件 |
|---|---|
| 已解决 | 两张旧 UNKNOWN 可解码。已确认坏价目图有本地提示修复。Batam 主域归一和 robots 分离草案已准备。冻结产物 0 Functions 已复核 |
| 可由用户接受 | 原价目图缺失提示、公共旅行资料的有界重新发布时延、外部旧 r2.dev 完整链接失效、已下载或第三方缓存无法收回。接受范围与时限需明确 |
| 仍阻塞 | 两种下架政策均未获批准。未完成媒体权利白名单、所有消费者替换、混合桶旧入口切断、正式匿名数据库旁路和旧部署访问处理。紧急传播或人工止损、备份恢复、最终 SEO 产物未验收 |
| 获准后顺序 | 选择 A/B → 审核媒体归属、公共副本和正式读取边界 → 独立备份与恢复演练 → 用最新来源生成正式审阅包并做一次安全验收 → 批准媒体入口和权限变更 → 批准 Production 与 DNS 切换 → 验证旧旁路失效及回退条件 |

本轮远端操作限于已知 URL 的有界读取、Cloudflare 配置 GET 和 Supabase SELECT。发布、DNS、权限、计费和对象状态保持原样。
