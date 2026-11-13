# 正式后台核心功能：OFF 准备交付

状态：`FORMAL_CORE_OFF_PREPARED`，不是正式写入或发布已启用。正式只读验收为 **PASS（用户 2026-11-13 真实 Chrome 回报）**，不重复执行。586 Spot、6 Note、7 Guide、Spot 详情读取成功；七项写入/删除/上传/发布为 405，资料前后一致，登出后旧会话为 401。[只读回执](formal-blockers-followup-evidence.json) · [本轮脱敏证据](formal-core-off-evidence.json)

## 已实现的核心代码

| 功能 | 实现与边界 |
| --- | --- |
| 正式保存 | `formal-api.mjs`、`formal-mutations.ts`、`formal-services.ts` 复用原校验器与编辑器。Spot 新增由数据库分配主键，更新使用实际 `updated_at` 的 NULL/等值条件；Note、Guide 各自使用不可变文件、最新指针和独占锁。服务器每次验证 Auth 会话与 UUID，Editor/Publisher 分离。 |
| 幂等和冲突 | 每次逻辑保存有持久 mutation ID；服务器先保留私有意图，同一 ID/内容仅执行一次。响应丢失或提交结果不明不重做数据库操作，提供仅原管理员可读的回执。版本冲突 409；未知提交 503 并保留证据。Spot 和 slug 分两步，未完成的当前版本 slug 会阻止发布，不能宣称跨 Storage/DB 原子。 |
| 私有图片 | 复用已验收 Admin 的 R2 签名及实际文件验证代码，加入独立正式桶/前缀和服务器 Secret 名称；本轮未配置凭据或建桶。实际上传验证大小、签名、MIME、SHA-256、ETag，并保存仅服务端可写的私有回执。保存引用时检查回执及实时 HEAD；预览和构建重读真实字节并验证 SHA/ETag。撤销或身份不符拒绝；不开放公共图片代理。 |
| 完整网站发布 | `formal-publication.mjs` + `formal-queued-build.mjs` 使用已验收 `buildFullStaticPackage`。默认完整已批准公开基线加所选变更，保留其余 Spot、Note、Guide、地区、配套、双语与 SEO；新增私有媒体按当次修订增量处理，复用现有静态资产。当前已隐藏/删除的记录不能从旧基线复活；移除差异需精确确认。其他模块权威来源变化时停止并要求刷新基线。 |
| 执行器 | `run-formal-publication.mjs` 调用既有 Node 构建器、Wrangler 和同一 Pages 项目。检查实际 Production 分支、当前 Deployment、域名及 0 Functions 配置。单任务锁、每天 8 次/月 240 次/至少间隔 10 分钟，上传前写本地 journal；结果不明只查 Deployment ID，不盲重传。只有真实部署字节、权威版本及私有 live 回执全部通过才报告成功。 |
| 原后台体验 | 复用现有 Spot 表单、Note 长文编辑、Guide 编辑、搜索/排序/草稿预览及图片控件。权限取自服务器，界面按独立 capability 禁用；保存不构建，发布独立按钮。原组件保留。物理删除仍禁用，使用隐藏/下架再重新发布。Affiliate 等其他模块不在本轮新增。 |

`formal-runtime.mjs` 编译期三个 capability 全部 false，环境变量单独改为 true 也不能启用。已验收的只读 Edge v2 和 Admin 固定部署未替换；本轮没有正式数据库写入、图片上传、Pages/Edge 部署、DNS 或旧入口修改。

## 本地验证与实际运行状态

- 36/36 定点合成测试通过：三模块校验、NULL/旧版本、数据库条件更新、保存幂等、并发保留锁、结果不明、私有图片身份及撤销、完整基线合并、下架差异、执行器上传前 journal、预算和中断恢复。
- 严格 Edge 依赖图 TypeScript 检查通过；OFF Edge 28 个模块打包成功。SHA-256 见证据。
- 真实现有 Next 14 Admin 组件构建及类型检查通过：12 个静态路由、306 文件、0 Functions；本地独立 `frontend-managed-off` 产物 **未部署**。没有重新构建公开网站、重新验收历史图片或旧 Preview。
- 新的最小权限 SQL 仅在独立合成 PostgreSQL 17.11、无网络/无端口/tmpfs 容器测试。anon/authenticated 的表/内部列读取为 42501，私有 Storage 无可读行、INSERT 42501、UPDATE/DELETE 0 行；service_role 路径保留，旧 Storage Public 标志不变。继承授权残留使整笔 SQL 回滚。临时容器已删除。**这不是正式 SQL 已执行或真实环境 ACL 已通过。**
- Windows 正式任务 `JnQ Journey Production Publisher` 的入口已更新为真实 wrapper；实际状态 **Disabled**。`enabled`、`formalWritesEnabled`、`formalUploadsEnabled`、`formalPublishingEnabled` 均 false，未启动任务。
- NAS/SMB 按用户要求暂停。现有本机逻辑备份与离线恢复结果保留；异机加密备份仍未完成，是独立待办，不作为本轮后台准备门槛。

## 最短生产启用顺序（每阶段需另行批准）

### 1. 先启用文字编辑

用户批准：创建仅服务端使用的私有 Storage `jnq-admin-formal-publication`、最小匿名读取边界及一次性权威副本初始化，然后部署并仅开启文字写入。前置步骤如下：

1. 明确项目 `vrufunuomioczocdsoer`，核对已确认 UUID allowlist、现有备份回执、原 Note/Guide 指针和完整公开基线的当前版本；不再做全量备份或媒体扫描。
2. 确认私有桶、服务端权限及既有依赖后，按 [候选 SQL](review/formal-private-boundary.draft.sql) 单事务执行。它撤销 `locations` 浏览器表/列 SELECT，增加 restrictive 防护和私有新桶限制；不删除数据，不切换旧 Storage Public 或 r2.dev。权限断言或依赖不符即回滚停止。**正式项目目前宽松匿名 SELECT 尚未收紧；在此之前不得开放新的正式草稿写入。**
3. 使用 `formal-bootstrap.mjs` 的受批准入口复制原 Note/Guide 权威版本与指针、原 slug map 和完整 live 基线到新私有桶。八个对象均 create-only 并逐字节读回；旧来源和指针不改写，冲突/不确定结果停止，不覆盖。
4. 保持 JWT 验证、服务器 UUID 和已批准 Origin。仅发布获准的 writes 编译开关和 `JNQ_FORMAL_WRITES_ENABLED=true`，确认私有权威/匿名边界状态；上传与发布继续 false。部署对应真实组件静态 Admin。定点验证正式真实记录的保存/读回/409，需要该阶段明确写入授权。

服务端运行时每次写入前检查私有桶及新鲜 anon 42501 拒绝，不信任浏览器或仅依赖“已批准”标志。若权限 SQL 无法安全通过，文字写入保持 OFF，既有只读后台继续可用。

### 2. 单独启用私有图片上传

用户批准：独立正式私有 R2 桶 `jnqjourney-admin-private-media`，只限此桶的读写凭据和 `_admin-formal-drafts` 前缀；确认无 r2.dev/公共自定义域名，再仅配置服务器 `FORMAL_R2_ACCESS_KEY_ID`、`FORMAL_R2_SECRET_ACCESS_KEY`。开启对应编译/环境 upload 开关并定点实际上传、引用、草稿隔离和身份变化拒绝测试。新图片需提供来源/使用权证明，不把其他来源默认为用户原创。

正文编辑不依赖新 R2 桶就绪；包含新的私有图片引用时必须先完成本阶段。10 MiB 上限保持，未知或不确定对象保留不删除。不能用本地合成测试代替正式上传验收。

### 3. 最后单独启用网站发布

用户批准：正式发布队列、服务器 runner 密钥及 Windows 正式任务启动、完整静态 Production 发布。管理员主动选定版本和移除差异后才能入队；仅保存草稿不入队。

1. 安全生成独立 runner key，仅将其哈希配置 Edge，明文只留本机私有目录。确认完整私有 baseline、原 582 公开 Spot 和所有合法模块、媒体复用路径、当前部署及正式分支。
2. 切换对应 publication 编译开关和服务器环境设置；本机 `supportedReleaseEnvironment` 明确 production，独立任务/目录/日志及授权执行器配置正确。沿用已有已确认 Publisher UUID；不授予浏览器部署密钥。
3. 先核对任务动作和所有准备条件，再显式 Enable/Start。电脑离线任务留队，界面显示等待执行器；不显示假成功。
4. 真实上传后检查固定部署和 www 的 `_publication.json`、受影响链接、版本、撤销路径、新图及 0 Functions，再原子保存私有 live 回执并读回；后台获得 Deployment ID 和成功状态。若提交结果不明，先查已有部署，不重发。

以上三阶段可以分开批准；本轮没有执行其中任何正式启用。旧 Storage Public、旧 feed 和 r2.dev 的彻底收口仍是独立变更，需已有消费者切换、范围核对与单独授权；不伪称旧公开入口已关闭。

## 停止与安全回退

- 立即关闭相应 Edge capability，部署 OFF 版本；Disable/Stop 正式 Windows 任务，阻止新写入/领取，不销毁队列、锁或未知 journal。保留现有只读后台和公开静态站。
- 查询 mutation/Deployment 实际结果后再人工处理不确定状态；不重复新增 Spot、不抢占未知文档锁、不删除可能已确认的媒体。
- 保持私有边界，不恢复匿名表读取或旧公开权威指针。必要时从已验证备份还原到**私有**新版本，核对最新状态后再切换。
- 静态网站回退必须重新核对当前撤销清单、合法媒体及完整集合；不直接恢复可能带回撤销内容的旧包，不以 Vercel 402 站点为回退目标。

## 未验证与不可消除的限制

本轮不执行生产保存/上传/发布，因此不能标记正式核心闭环 PASS。R2、PostgreSQL、Storage 指针和 Pages 不具有跨系统原子事务；发布前后检查降低风险，不能消除检查与切换之间的竞争。采用已批准 A 静态重新发布，下架传播和历史浏览器/固定 Preview 缓存不保证实时，也不保证 30 分钟。不能撤回第三方下载副本。

本轮没有 Cloudflare CPU 或 Edge CPU 新实测；实际账户免费余量 UNKNOWN。8/240/10 分钟是本机保护，不是官方剩余额度。私有不可变版本、意图及队列会增长；无自动删除/付费升级。请求 JSON 1 MiB、文档 8 MiB、队列快照 16 MiB、新私有图片 10 MiB、单次保存最多 60 个私有图片引用、单次发布最多 200 个增量媒体；超限明确失败，不静默丢内容。大批图片可以分批准备、审核后发布。

参考核对：[Supabase Storage 权限](https://supabase.com/docs/guides/storage/security/access-control)、[Edge 身份验证](https://supabase.com/docs/guides/functions/auth)。本轮沿用固定依赖，不升级 Next/React/Supabase CLI，不启用新服务。
