# 自有旅行照片静态迁移

**STATIC_MEDIA_PREVIEW_PASS。正式迁移 HOLD。**

[最终完整媒体 Preview](https://368a3f26.jnqjourney-static-recovery-candidate.pages.dev) 的部署 ID 为 `368a3f26-1e0b-42c0-8c90-f38caa2cf84e`。完整结果见 [脱敏证据](evidence/owner-media-deployment-2026-11-11.json)。原 `921277e0` 固定 Preview 保留。

用户已确认审核清单中 4,625 个旅行 R2 对象由 Jayden 和 Connie 自行拍摄，授权继续用于 JnQ Journey。本次以 OWNER_CONFIRMED 绑定原清单 SHA-256。复制前只读刷新了公开权威来源，586 条 Spot 中 582 条可公开，4 条关闭记录继续排除。Notes、Guide、英文、费用、slug、媒体归属及引用均与审核基线核对。

4,625 个源对象已全部下载、检查格式和 SHA-256。源对象字节合计 6,889,089,430 B，去重后为 4,515 个媒体文件、6,819,501,467 B。33 个关闭 Spot 独占对象未复制，9 个共享对象按有效公开消费者保留。其他 32 个配套、24 个 Supabase、23 个外站以及 6 个不可用图片引用使用原站缺图资源，41 个视频封面保留精确核对过的提供方 URL。没有新增图片版权推定或 R2 桶。

本机最终包有 1,349 个 HTML 页面、582 份公开 Spot JSON、704 个 sitemap URL 和 1,478 条跳转。共 8,136 文件、7,039,269,641 B，最大文件 13,551,052 B，0 Functions。满足 Pages Free 的 20,000 文件、25 MiB 单文件上限；Wrangler 使用分批资产上传。账户实际免费余额 UNKNOWN。没有新增 R2 存储；此次成功下载至少发生 4,625 次源对象读取，有界网络重试的总次数未单独计量。 [Pages 限制](https://developers.cloudflare.com/pages/platform/limits/) · [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)

本次第一轮构建在页面数据采集阶段失败。原因是静态投影从旧动态网关导入字段清单，连带初始化了一个要求绝对 URL 的旧图片探针。静态适配改为直接引用同一份 SPOT_FIELDS，保留原字段排除和公开资格校验。首轮失败日志保留，第二轮复用全部媒体与编译缓存完成，Next trace 的构建时长为 62,582 ms。11 项定点测试与修改脚本 lint 通过，页面、内部链接和全部媒体哈希闸门通过。

最终包没有旧 R2 主机或旧 Supabase Storage 地址，静态 RSC 和 Pages JSON 随原 Next 渲染生成。可选 Mux 播放器 chunk 含一个固定遥测 GIF 字面量，已按精确 chunk 与 URL 标注为 SDK 字面量，并增加防止其混入 HTML/feed 的回归测试。浏览器验收继续记录实际外部请求。

Cloudflare 实际接收了该 7.04 GB 包，Wrangler 上传 7,876 文件、复用 258 文件，资产阶段 752.78 秒，无上传重试或限制错误。另两项为 headers 和 redirects 配置。部署前后 Production canonical、Secrets、binding 和自定义域名均为空，API 确认 uses_functions=false。分支别名首页、Spot 和公开 API 真实字节与新固定部署一致。

线上 2,835 项路由检查通过，覆盖全部 1,349 页、1,478 条跳转、404 和公开入口。4,515 个媒体文件均 200，大小、MIME 和 noindex 与审批包一致。初次 HEAD 未提供 Content-Length，原测试器把缺失值记为零，初次失败记录保留。补验使用 GET 响应头并立即取消正文，逐一核对真实大小。服务器没有按单字节 Range 返回 206，实际网络预取字节 UNKNOWN；未重复读取全部图片正文。23 项真实字节比对通过，包括 HTML、RSC、Pages JSON、feed、SEO 入口、三张最大真实图片和缺图资源。

Chrome 1440×900 和 390×844 共 36 次页面检查及 12 项交互通过，涵盖中英文、全部 7 篇 Guide、Spot、Note、地区、配套、首页、搜索、地图、Lightbox、影片点击加载及导航。记录 2,341 次站内请求，旧 R2 请求为 0，额外未批准外部内容图片为 0，Functions/服务端运行请求为 0，可见图片加载失败与 Hydration 错误均为 0。缺图资源实际返回 200 并可解码。另有 3 项定点回归通过，确认画廊真实解码、Spot 多图切换和地区刷新。所测 Guide 画廊去重后只有一张照片，下一张为单图循环；Spot 232 多图确实切换。跳页取消的图片请求与被测试器拦截的遥测保留在记录中。

部署前权威资料复核全部匹配。上传后复核的公开资格、Notes、Guide、英文、slug、费用和历史索引仍一致，但汇率源于期间更新，最后一项 `fx.json` 比较失败。候选继续使用标注日期为 2026-11-11 的构建时汇率。失败日志保留，未以新包覆盖。正式发布前刷新该快照或明确接受其日期。

静态公开网站和获批媒体的 Pages 部署技术已实测可行。**Production 整体切换尚未放行**，正式公开旁路与撤销政策仍有下一段的独立门槛。本轮代码和报告保留在当前分支工作区，尚未提交或推送。

正式切换仍需用户批准下架传播时限和缓存边界、历史部署处理、正式 Supabase ACL/RLS 与 Storage 私有化、关闭旧 r2.dev、Production 与 DNS。旧完整 r2.dev 外部链接会失效，需要明确接受。只读权限证据与最小收紧和安全回滚 SQL 复用前轮，正式修改未执行。Access API 403、正式 Storage 精确策略目录缺证据及自有域名缓存清除未实测的记录继续保留。静态发布无法实时撤回旧 HTML、历史部署或已经下载的副本。故障回退只能使用满足最新撤销清单的包，不能重开旧公开源。
