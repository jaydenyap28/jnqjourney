# 静态恢复上线阻塞收敛

## 1. 当前能否上线

**HOLD。** [现有静态 Preview](https://921277e0.jnqjourney-static-recovery-candidate.pages.dev) 保留 1,349 页、3,621 文件、0 Functions。本轮没有重建或部署。真实 Chrome 阻断所有站外请求后，首页、Spot、Note、Guide 和两条同源 JSON 仍返回 200，列表包含 582 条 Spot，没有发起 Supabase REST 请求。测试仍记录 45 次被拦截的旧 R2 域名请求。已生成的页面与收紧数据库读权限兼容。媒体交付和下一次内容发布仍依赖旧入口。

## 2. 上线门槛

在同一个候选中验证所有已知公开旁路均可关闭，且批准公开的页面、索引和媒体仍能正常访问。新版固定部署已经能移除撤销内容，但旧固定部署、边缘缓存、正式数据库与旧媒体入口仍需处理。

| 入口 | 确切证据和最小收紧 |
| --- | --- |
| Supabase 表及 RLS | 正式目录记录 `public.locations` 赋予 `anon`、`authenticated` 表级 SELECT，36 列无单独 ACL。启用的 `Public can read locations` 向 PUBLIC 执行 `USING (true)`。两者共同允许读取关闭 Spot 及内部字段。既有投影草案撤掉浏览器角色的 SELECT，新增草案用限制型 SELECT policy 防止旧宽松 policy 与未来 GRANT 再度开放数据。 |
| View 与 RPC | 正式目录证据未发现依赖视图。现有 `validate_spot_redirect()` 返回 trigger，无法作为读取入口，正式项目当时无 `jnq_public_spots(bigint[])`。已有只供服务端使用的投影保留 active 且 publication_status 为 NULL 或 published 的记录。新增草案拒绝有有效 SELECT 的依赖视图和已发现的公开 SECURITY DEFINER 读函数。目录源码搜索对间接或动态依赖有局限。 |
| Supabase Storage | `location-images` 的 public 标志允许直读已知对象路径。此前 Notes、Guide 的指针与快照实际匿名公开，携带 anon key 访问 authenticated 路径也曾返回 200。后者的具体 Storage policy 与有效 ACL 尚未取得。已备好只读目录 SQL。先迁移消费者，再通过 Storage 管理接口将桶设为 private；限制型 policy 仅收紧该桶，其他桶维持原权限。 |
| 旧 R2 feed | 正式 `jnqjourney-img` 的 managed r2.dev 入口独立公开，已有 JSON/feed 和关闭 Spot 图片的匿名访问证据。收紧 Supabase 不会关闭此入口。使用已批准媒体白名单和站内 feed 替代后再关闭旧入口。 |

真实隔离 PostgreSQL 17.11 已通过 **31/31** 项，覆盖 ACL、拒绝默认 EXECUTE 暴露的 DEFINER 函数和依赖视图、缺少 service_role 写权限中止、隐藏内部字段与关闭记录、保留 NULL 公开状态、阻止目标桶浏览器读、保留其他桶读权限，以及服务端数据库和对象表读写。临时容器无网络、无端口、仅 tmpfs，已清理。此结果验证服务端管理员的数据权限。真实 Supabase Storage HTTP、Auth 以及未来后台登录和写入仍未验收。现有 `recovery-sources.mjs` 依赖匿名数据库和公开 Storage/R2，切换前必须验证服务端权限下的导出、构建及回执。 [Supabase Storage 访问模型](https://supabase.com/docs/guides/storage/buckets/fundamentals)

复用 4,775 条源 URL，对账后为 4,751 个公开引用身份。4,657 个 R2 对象已匹配真实清单，3,323 条有可核对的历史发布回读证据。另有 33 个关闭 Spot 独占对象排除，9 个跨模块共享对象须以所有合格消费者计算。明确私密或撤销的全桶总数 UNKNOWN。41 张官方视频缩略图有精确视频 ID 对应，只允许继续以原视频提供者链接展示。上传和历史发布记录不能授予转载许可。当前无已批准复制对象。人工判断只需按下列来源处理。

- 4,625 个旅行 R2 对象按站方自有或获授权的图片集合确认一次，另行列出撤销或许可例外。
- 32 个配套 R2 对象按供应商或配套确认同站转载范围。
- 24 张旧 Supabase 图、23 张可读取的 i.ibb 图，分别按来源集合确认。
- 6 个缺图例外。Spot 22、232 返回 404，北海道／山形／东京攻略图返回 503，地区 84、66 及哈尔滨／雪谷／长白／北京攻略图为 UNKNOWN。可确认同一原图后补回，或统一批准缺图呈现。

长期优先将获批图片随 **Pages 静态包**部署。仅加入已量过的 R2 对象时预计 8,278 文件，加上其余所有来源的保守上限为 8,372 文件，低于 20,000。已量对象最大 12.92 MiB，低于单文件 25 MiB。约 7.22 GB 首次上传及非 R2 文件仍需实测。在现有混合桶上增加公共自有域名虽不产生额外存储副本，但会为已知混合对象键新增公开入口。单独公共桶完整复制时，已量原件和副本的并存峰值下限为 **13.90 GB**，保持一个完整计费月就超过 10 GB-month 免费存储约 3.90 GB-month。真实账单受每日存储、并存时间、其他对象及账户用量影响，余额 UNKNOWN。Pages 方案不新增 R2 副本。 [Pages 限制](https://developers.cloudflare.com/pages/platform/limits/) · [R2 定价](https://developers.cloudflare.com/r2/pricing/)

下架演练复用隔离部署 `b4c87404` 与 `bae9901c`。新版固定地址通过 13 项响应检查。旧固定地址仍公开。新分支别名的控制面已指向新版，但下架 **29 分 45 秒**后，普通请求的旧中文 HTML、详情 JSON 和 PNG 仍从旧部署字节命中 `CF-Cache-Status: HIT`，`Age: 1785`。带独立查询参数的诊断及未预热路径获得新版。同一 Chrome 对别名的两次响应显示边缘 HIT，CDP 未观测到浏览器缓存或 Service Worker 命中。使用同一回环域名切换两个真实固定部署时，同一 Chrome 从旧版 200 变为新版 404。这验证了模拟站点源切换。真实自有域名、TLS 和 zone purge 未实测。证据记录响应哈希、部署映射及 CF-Ray。该 30 分钟窗口未通过。

只读 Pages API 确认旧测试部署已无别名、新部署持有测试分支别名、项目无 Production canonical 或自有域名。Access API 返回 200，首屏无此项目应用，保护效果仍需隔离测试。Pages 的 Preview Access 用于保护预览固定地址，项目根 pages.dev 与自有域名需独立配置。历史非最新 Preview 支持删除，分支最新部署须先替换。自有域名按 URL purge 只清理对应 zone 中的缓存，不能清理 Cloudflare 自有的 pages.dev、旧 r2.dev、浏览器副本或第三方下载。 [Preview 保护与删除](https://developers.cloudflare.com/pages/configuration/preview-deployments/) · [按 URL 清除缓存](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/)

## 3. 待批准与待测

**用户批准**包括分组图片许可和撤销范围、缺图处理、允许的下架时限和缓存边界。正式 Supabase ACL/RLS、Storage 私有化、关闭旧 R2 公共入口、历史部署处理、Production 与 DNS 切换需各自明确授权。不得把包含撤销内容的旧包或重新公开旧源作为回滚方案。

**技术验收**包括正式 Storage 策略目录复核，隔离 Supabase 真实 HTTP 检查 anon/普通用户拒绝、管理员认证读写及受控内容导出。随后只构建已批准媒体的最终包，核对完整对象、HTML/JSON/元数据引用、缺图和 Chrome 解码，再在隔离范围实测 Access、旧固定地址清理和自有测试域缓存清除。切换顺序为替代包可读、依赖切换、关闭旧入口、复查未授权字节与页面。回滚使用经最新撤销集合核验的干净包，若无法证明则先撤下受影响内容。

本机复现命令为 `node scripts/cloudflare/recovery-visibility-local.mjs --isolated-local-sql` 和 `node scripts/cloudflare/recovery-media-exceptions.mjs`。传播采集器复用既有演练记录，超过原 30 分钟截止时间后拒绝重跑。报告证据位于 [本轮证据](evidence/launch-cutover-convergence-2026-11-11.json)。
