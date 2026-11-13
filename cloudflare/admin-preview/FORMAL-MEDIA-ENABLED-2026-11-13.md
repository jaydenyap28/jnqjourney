# 正式私有图片：FORMAL_PRIVATE_MEDIA_PASS

从 `624afd2c` 恢复。用户已建立 `jnqjourney-admin-private-media`，确认仅此桶 Object Read & Write，并直接配置正式 Edge Secrets。本轮未读取/导出 Secret 明文到本机、浏览器源码或 Git。

[正式 Admin](https://read-only.jnqjourney-admin-formal.pages.dev/admin) · [当前固定部署](https://2438f6ed.jnqjourney-admin-formal.pages.dev/admin) · [脱敏证据](formal-media-enabled-evidence.json)

| 项目 | 实际结果 |
| --- | --- |
| 私有桶 | Standard；r2.dev Disabled；Custom Domains=0。只有此新桶配置了精确 Admin Origin 的 PUT CORS。旧桶未改。 |
| 最小凭据 | 用户 Dashboard 确认桶限定 Object Read & Write；服务器真实签名请求原正式桶 HEAD 得到 403，合法新桶 PUT/GET/HEAD/CopyObject 成功。控制面 Token policy API 仍不可读，没有冒充 API 已取得完整策略。长期 Secret 只在 Edge 内使用。 |
| 短期上传 | 浏览器只获得随机 staging key、PUT、120 秒、签入 Content-Type/Content-Length/If-None-Match 的 URL。原生 Chrome 三次 PUT 同一张自制图，分别取得三个内容授权；同 URL 重复 PUT 412，错误 MIME 和过期签名真实 S3 HTTP 403。原整文件代理上传入口 405。 |
| 完成校验 | staging 真实字节 SHA-256/文件签名/MIME/大小 → 条件源 ETag CopyObject → final 字节与 HEAD → 私有 master/owner/内容版本回执。浏览器无 final 写入授权。单文件限 10 MiB，未知/错误类型或超限先拒绝授权。 |
| 引用和版本 | Spot、Note、Guide 各自保存与读回。新引用要求管理员所有权和正确目标/expectedVersion 的票据；保存按实际数据库/权威版本检查，成功后另写可信内容修订绑定。跨内容回执、缺回执、旧内容版本、他人 actor、撤销引用均拒绝。已保存且未变化的图片仍核对当前所有权/对象身份。 |
| 私有读取 | 返回图片前核对当前私有回执、所有权、实时 HEAD 与实际 GET 的 MIME/签名/SHA/ETag。匿名 S3 为 400 XML InvalidArgument，没有图片；匿名 Edge 为 401；撤销后字节 404。所有后台字节 private/no-store。 |
| 原后台 | 保留原 Spot/Note/Guide 表单。客户端适配单文件直传并保留回执，焦点 fragment 正确处理。Note 上传期间暂停自动保存、上传结束重新排程，避免内容版本竞争。没有公开站重建。 |

## 真实验收范围

一张本机生成的 PNG：96×64，684 bytes，SHA-256 `f9dce8bd73884fd12f1dedaff14302fd1415fc8358da672937b8b5d8eeeb8f98`。真实 Chrome 在正式 Admin Origin 下完成 S3 PUT、CORS 和图片解码；服务器读取的实际字节哈希一致。没有使用旧照片或第三方图片。

受限端点只允许已确认管理员、这张小图、既有三个私有测试草稿。正式 Upload 在整个准入验收期间保持 OFF；累计 **50 项不同准入检查**通过后才开启。随后 **15 项实际正式接口检查**通过，包含 Upload ON、文字 ON、发布 OFF、超限/错误 MIME 拒绝、合法授权及取消、取消后不能 complete、旧代理拒绝、临时端点 405、原内容与网站回执不变。

他人回执验证是云端同一授权核心使用固定非 owner actor 的拒绝检查，加本地双 actor 测试；没有擅自创建第二个正式账号，不将其冒充第二账号 Chrome 登录。匿名真实请求已实际拒绝。

测试仅修改原有私有验收 Spot 853、测试 Note 和测试 Guide。图片在三模块保存成功后进行一次正式私有回执撤销，确认所有字节/引用拒绝，再从三个草稿移除引用，确认文字保存继续正常。测试 Spot 最终 hidden，两个文稿仍 published=false。新图及暂存对象保留私有用于核对，未误删对象。

原 586 条业务数据摘要一致；公开 Spot 仍 582。原 6 篇 Note、7 篇 Guide 与初始化原件逐记录一致。旧 Cron=false、Trigger=D，旧队列 586 条/4 pending、摘要 `98de9b1575bd544533acd732ac5bf7de` 不变；新发布任务为 0，原 Storage Public 不变。

## 保留的失败与断点恢复

1. 首次负向 Chrome 探针未记录到预期的可读状态，仅产生一条客户端尝试，状态永久 UNKNOWN；未登记图片即停止并保持 Upload OFF。后续改用真实 S3 HTTP 状态验证签名错误，Chrome 正确 MIME 上传仍必须实际 200；未伪造原事件状态。
2. 第二次已完成三个真实上传、完成回执及 SHA/Chrome 解码，但匿名探针只预设 401/403，因此对实际 400 XML 误判。保留失败回执；独立读取确认不是图片后，从已验证的三个回执恢复，仅完成后续安全及引用检查，没有重新上传。
3. 本地旧测试曾因构造 S3 transport 早于注入 fake fetch 而失败，已修正测试初始化顺序。两个受影响旧断言单独通过；不重复原 36 项。新协议六组逻辑测试、严格类型和真实 Admin 构建通过。

这些失败均未通过放宽认证、文件验证或 CORS 来解决。准入端点已关闭；临时 Auth 会话仅本地范围退出，不改密码、不发邮件、不建账号，Token 不留档。签名 URL 只在授权响应和当前请求内存中使用，不写日志/回执/Git/localStorage。

## 当前部署与费用边界

- 正式 Edge `jnq-admin-formal` v18，verify_jwt=true；源码 SHA-256 `ff89dd35214c0647cae13d2ccc0981cb5e7cfd0b84351fdeb130dc93157cfa16`。
- Admin 当前 Deployment `2438f6ed-35f0-4f1a-a9fc-f3df7730f27d`，noindex、0 Functions。第一次准备部署 `9f34adc8-85e4-48dd-8ce9-a75e99c80ea0` 保留为历史。第二次仅修正本轮 Note 自动保存排程依赖。
- 公开站保持 `333e51aa-506e-4a66-a7c6-4f28e3e890a1`、0 Functions，www 发布回执 200、哈希与原备份相同。没有 Production 发布、DNS、旧 R2、NAS 或全量媒体操作。
- 官方 GraphQL 当月各桶峰值的保守合计为 7,506,028,517 bytes，已观测全部 R2 操作为 64,836。预留 1 MiB/1000 操作后仍低于 Standard 公开免费层，才允许本轮有界测试。该指标不是最终账单；订阅/发票余量 UNKNOWN。[R2 定价](https://developers.cloudflare.com/r2/pricing/)
- 10 MiB 是实际授权/读回硬上限，不是本轮大文件性能结论。本轮只验证 684 bytes；Edge 原生 CPU、长期吞吐和账户最终费用未重新测量。暂存和不可变回执会增长，没有设置可能删除不确定事务对象的自动生命周期；后续需按已确认完成/撤销状态处理清理与容量，不保证永久 RM0。

## 下一步与回退

可以进入第三阶段一键发布的独立授权。当前 publication=false，Windows Production Publisher **Disabled**，正式发布没有启用。第三阶段须把新增私有媒体及可信版本纳入完整静态发布、核对最新撤销状态和部署回执；不得因本轮图片 PASS 自动发布。

需要暂停时运行 `formal-media-release.mjs --stop vrufunuomioczocdsoer`：关闭 Upload 与临时验收，保留文字写入、私有权限、对象、已验证/不明回执。不要重开旧自动链、公开桶或清空历史 pending；公开站没有被本轮改变，无需回退它。
