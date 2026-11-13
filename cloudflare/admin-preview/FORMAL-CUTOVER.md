# 正式后台与完整静态发布准备

2026-11-13 用户已报告真实 Chrome 只读安全验收全部 PASS：586 Spot、6 Note、7 Guide、详情、七项服务器 405、前后资料一致、退出后旧会话 401。不重复测试。[脱敏证据](formal-blockers-followup-evidence.json)。NAS/SMB 工作按用户要求暂停，异机加密备份未完成且作为独立待办，不再阻挡后台开发准备。正式写入、上传、发布仍 OFF。

**当前执行入口以 [2026-11-13 核心功能 OFF 准备](FORMAL-CORE-OFF-2026-11-13.md) 为准。** 以下各日期记录保留历史状态，不代表重开验收。新核心适配器仅在本地打包，未替换已验收的只读 Edge；正式计划任务已接入真实执行器入口，但仍 Disabled，未启动。

正式站基线为 Pages deployment `333e51aa-506e-4a66-a7c6-4f28e3e890a1`。本轮允许正式来源只读和 noindex Preview。现有隔离后台及 Windows 任务继续独立运行。正式写入、正式发布、DNS 和旧入口开关都需要各自批准。

## 本轮验收

**全站 Preview 已部署，正式切换仍有阻塞。** [全站 Preview](https://983aa1ec.jnqjourney-static-recovery-candidate.pages.dev) 的 Deployment 为 `983aa1ec-ed89-44a8-bc2f-191ff52142dc`。正式首页和原发布回执仍返回 200，回执 SHA-256 与备份一致。

- 正式只读投影与当前正式包的 582 条公开 Spot、58 个地区、6 篇 Note、7 篇 Guide、3 个配套、12 个选项和 402 条本地化记录逐集合对账。4 条不公开的 Spot 排除。公开内容和媒体映射与基线一致，汇率捕获更新。
- 全站 1,349 HTML、8,136 文件、4,515 同源媒体、704 个 sitemap URL、1,478 条跳转、0 Functions。线上复核 8 个 HTML 样本、公开 ID 集合、旧跳转、4 个排除 ID 的路径及 40 处修复图片 SHA-256。发布日志记录 6,022 个资产由 Cloudflare 复用、2,112 个资产上传。未重新下载旧图或逐图哈希核验。
- Windows 第一次构建因 Next 无法解析跨盘依赖中止。换同盘依赖后真实 Next 导出成功，随后补齐媒体扫描缺失的导入，从该导出接续打包。两次构建尝试进入原预算账本。过期批准修订被真实 CLI 拒绝，未发起上传。现有已关闭内容通过线上检查，尚未用新正式改动演练完整发布后的撤销。
- Chrome 桌面和手机共 36 个页面检查通过，包含搜索、地图、双语、Guide 日程与影片。另实测 Guide 单图 Lightbox 解码及关闭，Spot 多图轮播切换并解码两个不同的同源文件。旧 R2 浏览器请求为 0。31 项定点测试通过，1 项既有可选 SSR 用例跳过。[脱敏证据](formal-cutover-evidence.json)
- 正式项目 Dashboard 显示 Free 无托管备份，并提示组织宽限期已结束。实际剩余额度未知。定点匿名请求仍能读取 `locations` 内部字段与公开 Storage 指针，历史备份表同类探测返回 401。已用服务端权限实读正式后台需要的 36 个 Spot 字段及地区关联。正式后台的写入和上传依赖尚待关闭前验证。

## 构建与回执

`full-admin-release.mjs` 使用项目 `vrufunuomioczocdsoer` 的服务端 REST、Storage authenticated 路径和 `jnqjourney-img` 的 Cloudflare API GET。只落盘公开投影，私钥不传给 Next。保留现有渲染器、UI、路由和 SEO 核对。Spot 仍按 active 加 NULL 或 published 投影，Notes 按 published，Guide 使用当前权威公开集合。完整捕获核对前后表和指针。内容修订不随捕获时间变更，发布前后重读对账。

发布包从已恢复的正式包按引用复用媒体硬链接。未知、未审批和无消费者图片不能进包。新增图片仅可通过与当次内容修订绑定的本机 `media-additions.json` 审批，含 `contentRevision` 和 `images` 数组，每项含 `name`、`bytes`、`rightsEvidence`、`approvedBy`。字节放在该次运行的私有 `approved-incremental-media`。保留 10 MiB 上限、签名校验和 SHA-256 文件名。共享图片只要仍有渲染后的合法引用就保留。

准备好受 ACL 保护的正式备份目录，将 `JNQ_RECOVERY_WORKSPACE` 指向该目录，`JNQ_RECOVERY_OUTPUT` 指向其中独立的 `runs/<run-id>`，将现有 Node 依赖放在同盘的 `build-dependencies/node_modules`。两个 CLI 入口复用本机安装。按顺序执行以下命令。

```powershell
node scripts/cloudflare/full-admin-release.mjs --capture vrufunuomioczocdsoer
node scripts/cloudflare/full-admin-release.mjs --build vrufunuomioczocdsoer
node scripts/cloudflare/full-admin-release.mjs --preview vrufunuomioczocdsoer
node scripts/cloudflare/verify-full-admin-preview.mjs
node scripts/cloudflare/recovery-browser-check.mjs --final-media
```

上传只准用独立 `full-review-*` Preview 分支，复用同一 Pages 项目的静态资产。部署前确认线上 Production ID，部署后核对 canonical、Production 分支、域名及运行时配置指纹。未来队列将批准的完整修订传入 `JNQ_FORMAL_APPROVED_REVISION`，不一致会在构建前停止。回执不明时用 `--verify-preview` 查 Deployment ID，保留原提交记录。静态 Preview 的 noindex 是索引控制，直接访问固定 URL 仍可取得该版本公开内容。

## 备份和恢复边界

- 完整静态包在本机私有目录制作独立 tar，SHA-256 与媒体映射一并保留。解包到新目录并验证当前正式回执、8,136 文件与 4,515 媒体清单。
- Notes、Guide 历史版本、当前指针、slug 表、三个 R2 权威 feed 以及 R2 桶配置各有私有清单与 SHA-256。还原到新目录，逐个核对哈希与实际指针目标。另备份了已审查的 Storage 图片和关闭 Spot 独占 R2 图片。
- 数据库逻辑备份、全量 Auth/角色/ACL 和完整 Supabase 实例恢复必须独立完成。连接目标使用正式项目的直连或 session pooler，校验 TLS 与项目身份，连接凭据只留在本机安全存储。显式使用只读事务，记录 schema、数据和角色的哈希。将 Auth 配置单独导出，与 Storage 版本和原始对象清单对账。用独立 Supabase 兼容的本机恢复环境检查表、用户、RLS、外键、Storage 权威和授权登录。静态包及 JSON 恢复无法覆盖这些检查。

本机私有备份位于 `E:\JnQ-Private-Backups\production-admin-20261112`。完整静态包 tar 为 7,046,536,192 bytes。文件恢复验收覆盖 235 份 Note 历史版本、51 份 Guide 历史版本、33 个关闭 Spot 的 R2 对象和 24 个已审查 Storage 原件。正式 PostgreSQL 直连凭据未配置，自动审批拒绝 `--linked` 查询以避免连接到错误项目。当前保留了客户端 Auth 公开配置快照，未取得完整服务端 Auth 配置或逻辑 dump。恢复副本与备份仍位于同一 E 盘。

## 启用顺序与回退

1. 用户指定正式管理员 Auth UUID，分别批准编辑和发布身份。用本机 `JNQ_FORMAL_OPERATOR_AUTH_ID` 和 `full-admin-release.mjs --check-operator vrufunuomioczocdsoer` 核实账号已确认且有效。只允许后端通过正式项目 Auth 核实的 UUID，管理员 metadata 不参与判断。正式读接口覆盖真实 Spot、地区、slug、Note 和 Guide。所有写和发版入口在当前适配器返回 405。
2. 确认数据库、Auth、Storage 和 R2 的备份覆盖及恢复演练。保留权威版本和原始媒体。独立核对旧写入器是否还执行 R2 公开镜像或调用旧快照。未迁移旧写入器前不要启用旧 API 的编辑权限。
3. 批准正式 Admin 项目、前端 Origin 和正式 Edge 部署，再批准 Spot/Note/Guide 写入。Spot 使用正式主键分配及 `updated_at` 条件写，Note/Guide 使用现有不可变版本和最新指针，保持旧写入路径停用。只有已批准版本才能进入全站投影。正式资料禁止混入 95000–95099 的隔离记录。
4. 单独核准正式发布队列、Windows 任务与生产分支权限。用 [正式执行器配置](formal-publisher-settings.example.json) 的独立任务名、目录和队列。当前配置为禁用，未注册正式计划任务。沿用隔离执行器的单任务、心跳、冷却、待核对回执和失败不切换。正式队列应记录完整权威版本指纹。允许切换正式入口前，必须实测正式审批格式驱动完整 Preview 以及版本冲突、下架和恢复。
5. 确认新站不依赖旧入口、旧 Admin 写入已替换后，再逐项批准 [正式只读权限核对](../static-recovery/review/formal-storage-acl.read-only.sql)、浏览器授权收紧、Storage 公开开关、[防绕过 SQL](../static-recovery/review/static-read-boundary.draft.sql) 和 r2.dev 收口。必须先核对旧 feed 和外部合法消费者。保留所有对象。
6. 发生异常时暂停正式后台写入与队列领取，保留故障版本和不明提交的日志。优先维持当前安全版本。只回退到经最新撤销清单验证的静态包或可控维护页。权限 [安全回退](../static-recovery/review/static-read-boundary.rollback.sql) 保持草稿、桶和旧接口关闭。撤销通过重新发布传播，历史固定部署及外部下载另行处理。

[Supabase 逻辑备份和恢复](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) · [Storage 对象备份范围](https://supabase.com/docs/guides/platform/backups) · [Pages Preview 与 noindex](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

## 正式 PostgreSQL 备份入口

2026-11-12 已通过正式项目的只读逻辑备份与本机隔离恢复。使用项目 CA 做 `verify-full`，5 个文件 SHA-256 全部复核。固定 Supabase PostgreSQL 17.6 镜像在无网络临时容器内还原并匹配 62 张表、21 条 RLS 策略、17 个角色、扩展版本和 Note/Guide 版本指针。恢复容器已清理，异机加密副本待安排。完整备份及恢复回执保留在本机私有目录。

在 Supabase Dashboard 的正式项目 `vrufunuomioczocdsoer` → Connect 获取 Direct Connection 或 Session Pooler（5432）。使用同一 Windows 用户和 PowerShell 7 读取仅本机用户可访问的 `production-db.json` 和 `production-db-password.dpapi`。密码解密后只通过标准输入写入临时容器的内存文件系统。官方项目 CA 从 Database Settings 的 SSL Configuration 下载，作为客户端 `verify-full` 的信任链使用。

```powershell
$env:JNQ_RECOVERY_WORKSPACE = 'E:\JnQ-Private-Backups\production-admin-20261112'
$env:JNQ_FORMAL_PG_DPAPI_DIR = '<已保护的 DPAPI 配置目录>'
$env:JNQ_FORMAL_PG_CA_FILE = '<正式 Supabase CA PEM 绝对路径>'
node scripts/cloudflare/formal-postgres-backup.mjs --probe vrufunuomioczocdsoer
node scripts/cloudflare/formal-postgres-backup.mjs --backup vrufunuomioczocdsoer
$env:JNQ_FORMAL_PG_BACKUP_NAME = '<成功回执中的 postgres-logical-* 目录名>'
$env:JNQ_RESTORE_POSTGRES_IMAGE = '<匹配源版本的本机 Supabase PostgreSQL 镜像 ID>'
node scripts/cloudflare/formal-postgres-backup.mjs --restore vrufunuomioczocdsoer
```

备份使用已安装的 PostgreSQL 17 客户端、`verify-full`、明确项目主机或 pooler 用户名、只读事务和同步快照。完整 archive 包括业务、Auth 和 Storage metadata，另外保留 schema、无角色密码的角色定义、目录核对和 SHA-256。恢复只向临时 Docker PostgreSQL 写入，网络为 none，无对外端口，数据库与工作副本均位于 tmpfs。以 `supabase_admin` 初始化临时实例，保留归档中的原授权者。角色、ACL、RLS、表行数、主外键、扩展版本和 Storage 指针关联必须一致。异机副本应另存到获确认的加密目的地并复核哈希。[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) · [Supabase 连接方式](https://supabase.com/docs/guides/database/connecting-to-postgres)

## 全站演练与正式执行检查点

2026-11-12 后台最后准备的最新状态见 [本轮检查点](FINAL-ADMIN-PREPARATION-2026-11-12.md)。运营账号与两个禁用名单已确认。用户批准指定 Preview 分支后，真实队列的全站新增与撤销发布、Chrome 与 HTTP 验收均已通过。异机备份和正式后台启用仍待完成与批准，正式切换保持 HOLD。

- 已完成 [变更版](https://5426cbf4.jnqjourney-static-recovery-candidate.pages.dev) 与 [撤销版](https://ced4e3e3.jnqjourney-static-recovery-candidate.pages.dev)，均为 1,349 路由、582 个公开 Spot、6 篇 Note、7 篇 Guide、0 Functions、全站 noindex。Chrome 在原模板看到三项改动，测试图返回 200 并解码为 96×64。撤销后内容复原，测试图在新固定地址及 [分支别名](https://full-drill-nov12-merge.jnqjourney-static-recovery-candidate.pages.dev) 均返回 404。旧固定 Preview 保留为历史部署。三条英文路由因译文待复核暂时退出 sitemap，撤销后 sitemap 恢复 704 条。正式线上回执和 Deployment ID 保持原值。[本次脱敏证据](formal-cutover-rehearsal-evidence.json)
- 演练使用通过验收的完整公开快照。三项修改按原记录 ID 和版本哈希覆盖，其他记录保持原样。正式预览比较完整集合，任何记录移除都会生成本机 `withdrawal-review.json`，需要额外批准其精确差异摘要 `JNQ_FORMAL_APPROVED_REMOVAL_SHA256`。浏览器选中少量记录的结果不能作为完整站点输入。
- 正式 Admin 前端使用原隔离编辑界面，以 `--formal-read-only vrufunuomioczocdsoer` 生成只读包并部署至独立项目的 `read-only` 分支。只使用项目 anon key 和正式只读 Edge。正式私有运行目录已有独立凭据、日志和队列回执目录；正式任务以 Disabled 注册，远端队列未创建。编辑、上传和发布端点仍需接通正式权威来源并另行批准验收。
- 正式 Auth 管理接口确认了用户指定的运营账号，邮箱已验证且账号有效。分别生成 Editor 和 Publisher 的 UUID 清单并写入本机正式配置，两项仍为禁用。身份原值只保留在私有目录。正式 Admin 部署后仍需用真实账号验证登录与两个独立的服务端权限。
- 正式发布前核对当前 canonical、域名及部署环境，验证批准的完整修订、撤销差异、noindex Preview、当前权威资格和回退包。正式上传后核对 canonical 指向新 Deployment、线上回执匹配、首页及变更链接可用，并确认仍为 0 Functions。任务仅在全部通过后记为成功。
- 故障时停用并停止 `JnQ Journey Production Publisher`，关闭已获批准启用的 Edge 写入与队列领取，保留不明提交回执。先确认 Cloudflare Deployment ID。回退前核对当前撤销清单，保留私有权限，必要时使用维护页。待正式权限另行审批，再按上方 SQL 与依赖检查收紧匿名表读取和 Storage 访问。旧 r2.dev 另行审批。
