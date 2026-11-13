# 正式一键发布准备

后续安全收紧：首次执行现在还必须具备 [单任务一次性批准](FIRST-RELEASE-CONTROL-2026-11-13.md)。下文历史的全局开关步骤本身不足以执行，也不构成持续自动发布授权。

**PRODUCTION_RELEASE_READY；执行保持 HOLD。** 本轮公开站部署、全站构建、发布任务创建和领取均为 **0**。正式网站仍是 `333e51aa-506e-4a66-a7c6-4f28e3e890a1`，实际 www 发布回执 SHA-256 与既有备份相同，0 Functions。未重复历史恢复、全站 Preview 或媒体扫描。

## 当前可用

- [正式 Admin](https://read-only.jnqjourney-admin-formal.pages.dev/admin)：独立 Preview `6f00b4e2-9819-43be-9872-12208ee90acb`，noindex、0 Functions。正式 Edge `jnq-admin-formal` v25，JWT 验证开启。文字编辑、私有上传维持 ON。
- 已开启独立的**发布申请**能力。只有已确认 Publisher UUID 主动 POST 才会入队；保存草稿不入队。现有私有 Storage 保存任务、内容指纹、重试和持久回执。新 runner key 仅在受保护本机目录，Edge 仅保存其 SHA-256；前端无执行凭据。
- 并发点击通过 create-only admission slot 仲裁。同一版本去重，其他任务不能越过活动任务；新提交与失败重试共用同代仲裁。未知写入结果保留并核对，不覆盖或盲目重试。
- 真实授权目录：582 个公开 Spot、6 篇 Note、7 篇 Guide；隐藏 853、两个测试文稿和已撤销测试图片排除。**当前新增 0、修改 0、隐藏 0**；无内容差异时返回当前发布回执，不消耗构建预算。
- 用现有产物补齐绑定当前 Production 回执的不可变基线清单：1,349 路由、4,515 媒体路径。后续撤销验证同时检查固定部署及 www，不会只检查新增页面。
- 继续使用完整 React 静态构建器；选择少数变更会合并完整公开基线。继承原 UI、SEO、地区、配套、中英文及已修复媒体策略，不使用简化页面发布器。
- 旧媒体按已验证硬链接复用，Wrangler 复用同项目内容寻址资产。新增受控媒体保存身份与权利清单并使用本机哈希缓存；后续发布仍重验服务端当前回执/对象身份，避免缓存绕过撤销。当前受控增量媒体最多 200 个、每个 10 MiB；超出停止，不截断内容。保留总文件 20,000、单文件 25 MiB 的打包门控。

## 人工 HOLD 与 Windows

`JnQ Journey Production Publisher` 仍 **Disabled、未启动**。已核对单一正式 wrapper、Interactive 用户、登录及分钟触发、IgnoreNew 和 Node 24.13.0。电脑关闭或用户未登录时任务保留在私有队列，不能显示发布成功。

本机 `enabled=false`、`productionReleaseApproved=false`；服务端 `JNQ_FORMAL_EXECUTION_ENABLED=false`。正确 runner key 的真实只读请求返回 **423 FORMAL_PRODUCTION_RELEASE_HELD**，错误 key 返回 403。入口 `--check-held` 不读取队列、不取凭据、不写心跳。运行中每轮及提交前重读本机 HOLD；服务端另行校验 HOLD。

部署目标由真实 Pages API 确认为项目 `jnqjourney-static-recovery-candidate` 的 Production Branch **main**；这不涉及 Git 合并 main。实际上传前仍核对分支、当前 canonical、域名、空运行时配置和权威版本。提交前先持久化 journal；超时只查找对应 commit/Deployment ID，不重复上传。只有固定部署与 www 回执、内容、撤销和资产校验完成后才确认成功。

## 实际新增验收

- 正式 API 13 项只读检查 PASS：管理员目录、原完整集合、草稿排除、匿名拒绝、错误 runner key 拒绝、有效 key 被 HOLD、队列仍为空、公开 Production 未变。
- 初次有效 runner 请求曾返回 403：原注入 anon key 与请求校验不一致。Secret 摘要已核对；改为单独固定 Windows 公开 JWT 摘要，仍必须同时匹配 256-bit 私密 proof。原失败证据保留，不冒充首次成功。
- 真实 Chrome 桌面与手机 PASS：展开发布面板、准备发布 GET、0/0/0 摘要、HOLD 提示、未选择时按钮禁用；页面错误 0、写请求 0。**勾选并点击发布的云端测试未执行**：自动审批拒绝，理由是正式会话可能产生生产副作用。没有绕过，改用只读验收。
- 7 项新增本地回归 PASS：执行 HOLD、竞争去重、不明写入恢复、重试仲裁、内容差异、费用 fail-closed、后续增量媒体/焦点参数/富文本引用。Edge 严格类型检查与小型 Admin Next 构建 PASS。它们不等于本轮已实际发布 Production。
- 没有新增普通正式账号；普通账号云端测试仍沿用此前未获测试账号的限制，不冒充已测。

## 费用与限制

2026-11-13 05:11 UTC Cloudflare 原生 R2 指标：月内各桶保守峰值合计 **7,506,031,449 bytes**，总操作 **64,878**。这是观测值，不是 GB-month 账单或剩余额度。当前无需新增 R2 副本，首次候选无新增媒体。

原生用量不足、不完整、超时、过期或安全余量不足时构建/提交停止；全部操作按较小的 Class A 额度保守计算，另预留 10,000 次操作与 64 MiB。此应用门控不是账户硬性费用封顶，也无法控制其他使用者并发消耗。账单/订阅、Pages 账户剩余构建次数、Supabase 账户剩余额度为 **UNKNOWN**；不声称 RM0 永久保证，不升级或订阅服务。Windows 仍沿用原账本：8/日、240/月、至少 10 分钟间隔；当前账本 10 次历史尝试，未重置。本轮没有公开站构建或旧媒体上传。

官方依据：[Pages 文件/构建限制](https://developers.cloudflare.com/pages/platform/limits/)、[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[R2 免费额度与计费](https://developers.cloudflare.com/r2/pricing/)。500/月是文档的托管构建限额；不能将 Windows 的本机预算或项目部署列表当作账户实际余额。首次释放前重新读原生用量；若仪表盘出现收费/额度限制，停止，不能用付费升级继续。

## 最后一次启用批准

现在不需要为了测试创建正式变更。用户先保存真实拟发布内容，在 Admin「准备发布」核对新增/修改/隐藏摘要，主动提交申请；任务在 HOLD 中持久等待。

得到独立批准后才执行一次性步骤：

1. 读具体任务 ID、完整内容指纹、媒体与精确撤销差异；即时核对当前 canonical、免费用量和本机预算。当前 0/0/0 不应制造无意义部署。
2. 批准该首次完整网站 Production 发布后，设置服务端执行开关，并将本机 `productionReleaseApproved`、`enabled` 置 true；启用并启动既有正式 Windows 任务。队列、Editor 和 Publisher UUID 不换环境。
3. 执行器自动构建完整网站，前后核验版本，复用静态资产，部署实际 Production Branch；后台显示真实 Deployment ID、完成时间或失败回执。

未授权前禁止执行以上开关或任务启动。今后发布仍须管理员主动点击；草稿保存不会自动构建。

异常时：先禁用/停止正式任务，关闭服务端 execution 和本机 enabled；保留文字编辑、上传、任务与不明部署 journal。先查 Deployment ID，禁止盲目重复提交。回退包必须通过**最新撤销清单**，不能直接恢复可能重公开草稿/撤销图片的旧站；没有合法安全包时使用受控维护方案，不回到 Vercel 402。静态下架遵循已批准 A 政策，历史部署、缓存与第三方副本不能保证实时撤销。
