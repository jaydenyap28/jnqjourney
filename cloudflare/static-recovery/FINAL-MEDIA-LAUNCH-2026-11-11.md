# JnQ Journey 静态站媒体与正式上线检查

**公开站 BLOCKED · 媒体切换 BLOCKED · Supabase 安全 BLOCKED。正式上线 HOLD。** [原验收 Preview](https://921277e0.jnqjourney-static-recovery-candidate.pages.dev) 的发布回执在两次演练前后匹配。它仍是 1,349 页、3,621 文件、0 Functions 的验收基线。全量媒体候选尚未发布。

上一轮 P0 补丁和脱敏记录已提交为 `37154bb`。本轮复用同一静态渲染与发布架构。数据、HTTP、缓存和部署证据见[脱敏汇总](evidence/media-final-2026-11-11/summary.json)。

## 媒体归属、体积和实际依赖

| 类别 | 结果 | 发布决定 |
|---|---|---|
| 公开来源 URL | **4,775/4,775** 对账，合并相同对象的焦点等展示变体后是 4,709 个身份。扫描已有 3,621 文件中的 3,387 个文本文件，含 HTML、JSON、RSC、JS、CSS、XML。又发现 42 个输出特有图片身份，合计 **4,751 个待审核对象**。序列化 feed 或预加载中的引用不等于用户实际发出了该请求 | 逐个标明来源、公开所有者、输出引用及允许的用途。当前没有可核实的对象级批准清单，**允许复制 0 个**。既有公开引用、200、文件名或水印不充当授权 |
| R2 候选 | **4,657/4,657** 条确切公开引用对象匹配正式 R2 LIST 元数据。七次有界列表读取。合计 **6,949,330,473 bytes**，最大 **13,551,052 bytes**，超过 25 MiB 的为 0。没有读取这些 R2 对象正文 | 符合单文件限制。全量复制、实际字节校验、公开权利和撤销状态仍待验收 |
| 非 R2 候选 | 94 个对象，含 52 个源身份和 42 个输出特有身份。本机 Chrome 原地址解码 **88 个**，另有 **2×404、1×503、3×UNKNOWN**。可读图片合计 45,769,894 bytes，最大 3,814,946 bytes。出错对象来自 i.ibb.co，涉及 Spot 22、Spot 232、地区 66、地区 84 和两篇 Guide。之前的 Hokkaido、Timba-Timba 两张 UNKNOWN 不在本轮失败清单中 | 第三方与供应商图片需许可。YouTube 缩略图可在批准后保留提供方入口，勿自动复制。已知坏价目图使用上一轮补丁。其他缺图以已核准原图或明确缺图处理解决 |
| 关闭 Spot 的孤立对象 | **33 个**。本次冻结公开来源和输出均无它们的引用，已有每条关闭 Spot 各一个匿名 HEAD 200 的证据 | 从清单排除，保留原始对象。临时关闭与永久撤销的业务含义不同 |
| 多模块共享 | **9 个**有明确跨模块的公开消费者。关闭与公开消费者在本次精确匹配范围内无重叠 | 普通下架仅移除撤销的页面引用，其余合法所有者可保留。对象自身被撤销时所有引用和新包字节均须移除 |
| 草稿、隐藏、私密和撤销 | 未发布数据及整桶无归属对象数量未知。正式 Registry 在上一轮只读查询不存在。未发现可信的完整媒体权利与撤销记录 | 继续排除。先核实公开候选本身是否与私密或撤销对象重合。未经证实的对象不能通过审批门槛 |

工作区 `artifacts/cloudflare-static-media-final/public-media-review.csv` 提供对象身份哈希、公开原地址、内容所有者、输出引用数及审核栏。私密工作表保留原 4,775 条变体与输出文件关系。提交的证据只记录关闭对象计数与经过脱敏的身份。

Pages 静态仍是优先路径。按 R2 一对象一文件是 **8,278 文件**，如 94 个非 R2 对象也获准同样打包则最多 **8,372 文件**，均低于 20,000。已测字节加原包约 **7.22 GB**，未包括非 R2 失败对象和可能的变体。7.22 GB 的首次真实上传耗时、完整对象可读性和平台可用额度尚未实测。已有部署器 180 秒超时需要按获批包大小和实际吞吐调整，并在结果不明时先查部署回执。静态请求无需 Functions。备选只考虑专用公共 R2 Standard 桶加自有媒体域名，源桶和未审核对象保持隔离。R2 复制、存储与访问计量，实际账户余量未知，不能承诺 RM0。现阶段不需要选择或开通该备选。[Pages 限制](https://developers.cloudflare.com/pages/platform/limits/) · [Pages 静态请求计价](https://developers.cloudflare.com/pages/functions/pricing/) · [R2 定价](https://developers.cloudflare.com/r2/pricing/)

本地适配将英文公共 feed 内 **14 条**旧 R2 来源地址映射到 **8 个**已有站内 feed 文件。按实体 ID 核对旧 Spot alias，原来源和历史内容哈希留在捕获记录。公开交付引用不再携带旧字节的哈希。已用真实输入核对全部 14 条和 8 个目标。原包仍有 **3,248 个文本文件**包含旧 R2 主机字面量。批准图片后应在生成内容时替换确切 URL，保留焦点，生成新的 HTML、RSC、JSON、SEO 和 feed。避免对已有 RSC 直接做变长字节替换。最后逐文件扫描旧 R2、Supabase 公共 Storage、未知媒体及遗漏引用，并让 Chrome 验证新站 Spot/Note/Guide 的实际同源解码。全量图片替换与这项新站验收仍受审批清单阻塞。

本地 `recovery-media-release-gate.mjs` 绑定当前清单 SHA-256。每项决定需要所有者对应、证据和批准者，静态副本还需精确字节 SHA-256、大小和内容寻址路径。该脚本可在新 run 目录检查静态文件数量、文件大小、内容身份和旧入口残留。当前 `owner-approved-media.json` 不存在，4751 项均待决。3 项定点测试通过。脚本的审批格式检查不能代替所有者判断。

## 正式 Supabase、Storage 和旧 R2

本轮只读 HEAD 证实 `anon` 可见 **582 条 active 和 4 条关闭 Spot**，对内部字段 `review_jayden` 及关闭记录的 `images` 查询均返回 200。无 API key 的请求为 401，公开 anon key 仍可用。Notes 和 Guide 的最新指针、版本快照，以及抽样 `location-images` 图均可无登录访问。即使使用 `/object/authenticated`，当前 anon 对两份版本文档仍得到 200。旧 r2.dev 的 locations、guides、notes 三个 JSON feed 也返回 200。没有读回这些对象的正文。源码显示 Notes/Guide 写入器序列化整份记录集合，公开文档可能暴露未过滤的记录，实际草稿数量未查。[脱敏 HEAD 证据](evidence/media-final-2026-11-11/summary.json)

最小关闭顺序如下。

1. 先在隔离环境把构建输入切到受信任的服务端导出，只给构建端访问，保留字段白名单和 `active`、`NULL/published` 现有语义。已有 `jnq_public_spots` 的 SQL 草案按每次最多 20 个 ID，使用 `SECURITY INVOKER`，仅服务端身份可执行。正式权限关闭前核对静态生成器、现存读调用方、写入流程和备份。当前匿名捕获脚本在撤销 SELECT 后需要这个替代来源。
2. 各调用方验收后，另行批准事务执行 `public.locations` 的 `PUBLIC/anon/authenticated` SELECT 撤销。核对列级及继承权限，验证 anon 和普通 authenticated 均读不到记录、内部字段和受保护 RPC，同时受控导出和现有授权写入仍工作。现有草案不应因静态浏览成功就直接执行。[既有正式 SQL 草案](../spot-loop/review/public-read-gate.formal-cutover.sql)
3. 把构建所需的指针、版本文档和可公开的图片消费迁往合适的受控读端或静态文件。经批准再将混合 `location-images` 设为 private，并收紧该桶适用的匿名和普通登录 `storage.objects` 读策略，检查 public、authenticated 和曾签发链接三条路径。仅撤 RLS 无法保护仍处于 public 的对象 URL。不要动其他桶策略和授权写入。[Supabase Storage 访问模型](https://supabase.com/docs/guides/storage/buckets/fundamentals) · [Supabase Data API 权限](https://supabase.com/docs/guides/api/securing-your-api)
4. 保持 `jnqjourney-img` 原图。待新候选所有媒体及 feed 可用、外部热链失效已获接受、旧 Preview 处置已明确，再单独审批关闭旧 r2.dev。从匿名上下文核对实际对象和旧 feed 拒绝，同时新静态图能解码。不要用重新开放整个原桶作为回退。[R2 公共入口](https://developers.cloudflare.com/r2/buckets/public-buckets/)

## A 下架实测与 B 停站条件

**A 演练未通过。** 使用同一个隔离 Pages 项目的两个新分支，各发布两份合成静态包。计时从合成权威状态的撤销开始。没有复制真实媒体，也没有重建 1,349 页基线。

| 策略 | 实测 |
|---|---|
| `max-age=0, must-revalidate` | 撤销包部署阶段 **11.7 秒**。别名已返回版本 2 发布回执。预热过的详情、公开详情 JSON 和图片在撤销后 **738 秒（12 分 18 秒）** 仍为 `200 HIT` |
| `no-store` | 撤销包部署阶段 **11.3 秒**。确认实际响应为 `no-store`。同三条 URL 在撤销后 **526 秒（8 分 46 秒）** 仍为 `200 HIT` |

两次演练中新固定部署的已撤销图片都返回 404。别名上没有预热的英文详情、旧跳转、RSC、Pages JSON 和详情 API 均为 404。首页、列表、sitemap 和共享图片仍正常，Chrome 成功解码共享合成图。两个旧固定部署仍提供撤销前的同一字节。演练预检拒绝了过期回退包和带撤销标记的故障包，两个拒绝均发生在上传之前。用户缓存、旧哈希和 alias 上的旧字节未因此收回。**尚未观察到所有受测入口共同通过的时间，不能说已满足 30 分钟目标，也不能外推正式域名会在同一时间内清除。** 正式放行前在获准控制的域名测试预热后更新、显式缓存清除及旧域名可达性。[Pages 缓存说明](https://developers.cloudflare.com/pages/configuration/serving-pages/) · [固定 Preview 与分支别名](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

**B 可评估，未验收。** zone API 确认 `jnqjourney.com` 为 active 的 Free Website，WAF 规则查询返回 403、错误码 10000，空位未知。Cloudflare Free 提供 5 条自定义规则。可用一条默认关闭的整站 Block 规则应急覆盖受 Cloudflare 代理的 `www` 和 apex 请求，不调用 Workers 或 Pages Functions。配置前确认代理、主机跳转顺序、规则空位及授权值班人员，演练先暂停入口再恢复安全版本。启用时正常读者也无法访问。Zone WAF 不能覆盖 Cloudflare 管理的 `pages.dev`、旧 `r2.dev`、Supabase 域名及读者已经保存的字节。分别需要 Preview 访问策略、原桶关入口、Supabase 最小权限，以及明确的历史缓存边界。[Cloudflare WAF 自定义规则](https://developers.cloudflare.com/waf/custom-rules/#availability)

## 正式审批和回滚清单

1. **先审批媒体证据和下架政策。** 所有者按清单身份批准可公开的对象、供应商许可、允许保留的提供方链接、明确缺图和撤销项。另选 A 或 B，明确范围和允许的延迟。媒体权利未明确前保持候选 BLOCKED。
2. **生成一次最终隔离 Preview。** 捕获新权威版本，构建站内媒体、页面和 feed，核对文件数量/体积/字节，确认旧主机依赖为零，验收 Chrome 和所有撤销表示。成功前保留原 1,349 页 Preview。准备无已撤销内容的可重新上传回退包或维护页，并检查备份 SHA-256。
3. **审批封堵旁路及旧部署入口。** 完成获准的 Supabase SELECT、Storage 和旧 r2.dev 变更。正式部署的 `pages.dev` 别名、预览分支别名及旧哈希单独受控，验证拒绝，不依赖站点 WAF 或 noindex 保护其内容。外部旧 r2.dev 链接失效须单独接受。
4. **批准 Production 与 DNS。** 保存现有 DNS 与 Pages 配置。先关联 `www.jnqjourney.com` 并确认 TLS，再按批准的记录切换，apex 用保留路径/查询的 301 到 www。正式包审核 canonical、robots、sitemap、hreflang、ads.txt、索引资格和 0 Functions。新站主域、静态 API、共享媒体、旁路拒绝、旧地址和回退入口逐一复核。[Pages 自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)
5. **故障时保护撤销状态。** 上传前检查回退包及其媒体清单与最新撤销清单一致。只有成功的历史 Production 部署可使用 Pages 回滚，Preview 不可充当一键回退。首发故障优先使用已审阅安全回退包或获准的停站措施。旧 Vercel 已记录 402，DNS 恢复到它不能提供有效网站。保持闭合的 ACL 和媒体入口，失败包、未知上传结果先核对回执再处理。[Pages 回滚](https://developers.cloudflare.com/pages/configuration/rollbacks/)

本轮产生四份合成 Preview 部署和本地适配，正式 Supabase、R2、WAF、Vercel、DNS 与 Production 没有写入。独立后台与动态代理保持在本轮范围之外。
