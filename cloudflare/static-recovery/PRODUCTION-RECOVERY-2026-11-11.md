# 正式静态恢复执行记录

**PRODUCTION_DEPLOYED，DNS_BLOCKED。jnqjourney.com 尚未标记 PUBLIC_SITE_LIVE。**

可浏览的 [Cloudflare Production](https://jnqjourney-static-recovery-candidate.pages.dev) 已上线。部署 ID 为 `088f1889-0c3d-4c7a-a012-771a35decb61`，固定地址为 [088f1889](https://088f1889.jnqjourney-static-recovery-candidate.pages.dev)。使用 Pages API 实际返回的 Production branch `main` 发布。源码仍在开发分支，没有合并 main。验收版本和映射已推送为 `74fd49a`，Production 包装和发布脚本为 `5aee044`。 [执行证据](evidence/production-2026-11-11/summary.json)

## 已完成的恢复

- 保留已验收的 1,349 个页面、4,515 个同源媒体和全部历史路由，沿用 4,625 个 OWNER_CONFIRMED 对象、33 个关闭 Spot 对象排除、85 处缺图、41 个原提供方缩略图引用。
- 生产包保持 8,136 文件、约 7.04 GB、0 Functions。只改 headers、robots、五份汇率 JSON 和发布回执，所有 HTML 字节及每页 noindex 原样校验。当前合法 sitemap 为 **704** 条，按页面质量资格核对。canonical 统一 www，hreflang 和 Schema 保留；ads.txt 返回 200，没有启用真实广告脚本。
- 已只读刷新正式公开来源。586 条 Spot 中 582 条公开，4 条关闭；Notes、Guide、英文、slug、费用及媒体资格与成功版本一致。汇率更新到本轮捕获版本。Production 浏览器通过默认 HTTPS 证书校验，未使用忽略证书选项。
- 使用本机硬链接复用原包，替换配置前断开对应链接，原成功包保持完整。8,136 文件 SHA-256 清单保存于本机及 [回退清单](evidence/production-2026-11-11/accepted-package.sha256.json)。没有重新下载图片或构建全站。
- Cloudflare 只上传 **7 个**更新文件、复用 **8,127 个**资产，上传阶段 **0.98 秒**。Production canonical 指向本次部署，uses_functions=false。
- Production 的首页、Spot、Note、Guide、中英文、图片、robots、sitemap、ads.txt、404、旧 Spot 301 及真实字节检查通过。Chrome 桌面和手机共 12 个页面通过，图片解码正常，页面错误和旧 R2/Vercel/Supabase 请求为 0。

## 正式域名阻塞和需要本人完成的操作

两个域名已通过官方 Pages Custom Domains API 登记。www 和 apex 均处于 pending，尚未通过 DNS/域名验证。最后实测两个正式域名仍返回 **402 DEPLOYMENT_DISABLED**。

现有 Wrangler OAuth 对 DNS API 和 zone redirect rules API 均返回 **403 / 10000**。浏览器工具无法可靠确认 Windows 当前 URL，安全控制已停止 UI 操作。这是实际工具能力阻塞。

请在 Cloudflare 控制台完成下列已获授权的切换，无需发送任何密钥。

1. 进入 `jnqjourney.com → DNS → Records`，先导出 DNS 备份。只处理根域 `@` 与 `www` 的网站 A、AAAA、CNAME 记录。将其替换为 **CNAME → jnqjourney-static-recovery-candidate.pages.dev**，代理开启，TTL 自动。保留 MX、SPF、DKIM、DMARC 和其余 TXT/子域记录。
2. 进入该 zone 的 `Rules → Overview`，使用 apex 到 www 的 Redirect Rule 模板，或创建 Single Redirect。条件为 `http.host eq "jnqjourney.com"`，目标使用动态表达式 `concat("https://www.jnqjourney.com", http.request.uri.path)`，状态 301，开启 Preserve query string。确认没有相反方向的 www 到 apex 规则。
3. 回到 `Workers & Pages → jnqjourney-static-recovery-candidate → Custom domains` 查看两个域名验证。它们已经登记，无需另建 Pages 项目。完成后复验 www 首页/深层路径、apex 301、证书、手机及全部 SEO 入口，只有通过才标记 PUBLIC_SITE_LIVE。

## 旧入口和权限

**R2 收口仍未执行。** 已保存 `jnqjourney-img` 桶、managed r2.dev 和自定义域名配置快照。managed r2.dev 仍开启。4,625 个源对象已有经过哈希验证的本机副本；全桶原始对象备份尚不完整。已知依赖还包括旧 Preview、旧 public-data feed、历史构建来源及尚未独立恢复的后台发布回读。新公开包已经不依赖这些入口，原有消费者和备份未全部确认前保持原始对象与访问开关。

**Supabase 收口仍未执行。** 已有 31/31 PostgreSQL、27/27 隔离 HTTP 和回滚证据保留。正式 locations、Storage 权限及 Auth 未修改。原后台还没有独立发布，公开静态站的 /admin 为 404，未将后台恢复作为公开站部署前置条件。当前不应撤销尚有旧客户端依赖的权限。收紧和安全回滚草案均在 review 目录，未来验证完整依赖后执行。

正常正式 Storage 只读目录查询再次被自动审批拒绝，理由是使用此前被拒绝的 `--linked` 通道。SQL 未执行。若继续此取证，需要明确批准官方 CLI 在全新空工作目录中使用 `--linked --project-ref vrufunuomioczocdsoer` 执行已准备的 BEGIN READ ONLY 查询；不能借用不明确的仓库关联或其他凭据绕过。

**历史入口单独记录。** 已保存三个项目的 27 个 Preview 固定部署、分支别名及项目根 pages.dev 清单。Access API 403 不再重试。正式域名仍 402，尚未进入域名恢复后的旧入口变更，本轮删除数量为 0。旧非最新部署可按备份和当前 Production 状态逐项删除，最新分支需替换或单独控制。不能把 URL purge 当作删除旧固定部署、关闭 r2.dev 或撤回第三方下载。

## 发布和回退

本次采用 A，通过静态重新发布更新或下架，不承诺 30 分钟硬保证。保存当前包、权威来源 manifest、媒体映射和文件哈希。未来回退必须先按最新撤销清单核对包与图片，不能恢复已撤销内容或重新开放旧数据源。首发没有更早的成功 Production 可一键回滚，故保留当前可重传 Production 包。Vercel 402 不作为回退目标。

Cloudflare 账户实际剩余额度 UNKNOWN。此次复用既有静态资产，没有新 R2 副本、付费服务或套餐升级。正式域名恢复仍等待上面的 DNS 和 301 设置，安全收口状态与公开站可用状态分别报告。
