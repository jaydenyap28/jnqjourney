# 正式私有图片第二阶段：权限预检停止

状态 `FORMAL_MEDIA_PHASE2_BLOCKED`。沿用 `e857a44c` 的文字编辑，Upload capability 保持 OFF；没有建桶、创建/扩大凭据、上传、部署或更改旧资源。[脱敏预检](formal-media-phase2-evidence.json)

## 实际检查

- 现有 Wrangler 身份确认账户 `41feff7cd62964f2eb33bb82508509a1`，R2 List Buckets HTTP 200，现有两个桶；目标 `jnqjourney-admin-private-media` 不存在。未扫描或读取历史图片字节。
- `GET /accounts/<account>/tokens/permission_groups` HTTP **403**，Cloudflare **9109**。无法用现有授权发现并核验仅新桶 Object Read & Write 的 API token 权限组；未盲目 POST 创建，未用账户 Admin Read & Write、旧测试桶凭据或其他身份替代。
- `GET /accounts/<account>/subscriptions` HTTP **403 / 10000**。订阅及最终账单余量 UNKNOWN，不能假称已确认 RM0。
- 官方 GraphQL Analytics HTTP 200。最新两个桶 payload 合计 **7,505,551,495 bytes**（约 7.51 GB / 6.99 GiB），不是新增副本；没有复制 4,515 张照片。这是时间点存储指标，不等于当月已计费 GB-month 或最终账单。
- 公开 Standard 免费层为 10 GB-month、1M Class A、10M Class B/月；只有实际用量在范围内才可按免费运行。本轮没有更改订阅或启用付费产品。[R2 定价](https://developers.cloudflare.com/r2/pricing/) · [官方指标口径](https://developers.cloudflare.com/r2/platform/metrics-analytics/)

## 为什么尚未启用

按用户的权限异常止损要求，本轮停在预检，没有扩大权限。现有正式 Admin 适配器仍是 OFF 的整文件上传准备路径；满足本轮新要求还需在获得最小服务器凭据后，把已验收的 Presigned PUT 技术接入正式 Admin，并增加管理员/内容修订绑定的短期授权与回执验证。不能直接打开旧的 Upload 开关冒充短期直传已完成，也未在权限受阻后开展新架构开发。

## 解除阻塞的最小人工配置

无需重新批准业务范围。需要具备 Dashboard 权限的用户，在同一 Cloudflare 账户中完成工具当前无法安全完成的凭据步骤：

1. 建立 Standard 私有桶 `jnqjourney-admin-private-media`，保持 r2.dev Disabled、Custom Domains 为空。
2. R2 → Manage R2 API Tokens，选择 **Object Read & Write**，仅选择该桶。不要选 Admin Read & Write 或 All buckets。[官方权限说明](https://developers.cloudflare.com/r2/api/tokens/)
3. 将两项值直接保存到正式 Supabase `vrufunuomioczocdsoer` 的 Edge Secrets：`FORMAL_R2_ACCESS_KEY_ID`、`FORMAL_R2_SECRET_ACCESS_KEY`。不发送到聊天，不放前端或 Git。
4. 在 Cloudflare R2 Usage/Billing 核对 Standard 当月用量及无新增收费/升级要求；若不符合，保持停止。

配置完成后从此断点继续受控代码适配与一张小图的真实上传/三模块私有引用验收，再单独决定是否开启 Upload。不能把建桶/配置 Secrets 当作图片验收 PASS。正式网站发布仍未授权，Windows Publisher不得启动。

## 当前交付状态

桶未创建；凭据未创建；上传/读回及三模块图片引用未测试，匿名私有对象读取未测试，均不计 PASS。第一阶段文字编辑未修改或重测；没有正式业务数据/RLS/Storage Public/旧 R2/DNS 操作。第三阶段发布尚不具备本轮图片前置验收。
