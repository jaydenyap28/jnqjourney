# Vercel 可用性诊断与 Spot 隔离兼容补丁

正式迁移继续 **HOLD**。`3603644` 的历史隔离技术 GO 和对应固定 Preview 保留。本轮兼容补丁通过 12 项新增合成测试，云端验收状态为待验证。补丁目前保存在 `codex/cloudflare-free-migration`，当前线上 Preview 仍是之前的 `c592d40c` 部署。[历史验收](DIRECT-PREVIEW-2026-11-09.md) · [此前 P0 审计](PRE-PRODUCTION-READONLY-AUDIT-2026-11-09.md)

## Vercel 402 的实际原因

2026-11-09 的已登录 Vercel 项目控制台显示团队 **Deployments Paused**。暂停提示明确写明 Fluid Active CPU 超出 Hobby fair use，起始日为 **2026-11-08**，结束日为 **2026-12-08**。日期是控制台展示值，精确 UTC 解除时间尚不可得。[脱敏诊断记录](evidence/vercel-402-diagnosis-2026-11-09.json)

| 分类 | 本轮证据 | 判断 |
| --- | --- | --- |
| 计费或额度 | 控制台明确指出 Fluid Active CPU 超额。Usage 选定窗口显示 Oct 9 10pm–Nov 8 9pm，CPU 11h39m，指标区显示 12h，并显示临时 3x limits until Dec 4。Billing charges API 返回 404 `costs_not_found`。 | **已确认 CPU 额度暂停**。所选用量窗口、临时额度与触发时实际计量无法完整对齐，尚不能解释 11h39m 与 12h 的精确差异。未取得欠费或未付发票证据。 |
| Deployment / 平台限制 | Project API 返回 `live=false`，正式部署 `dpl_Bek49CY6VcSSMN86hoZTNp2vLhtf` 为 READY / production / `7cee63d`。团队界面标记 Paused。 | **已确认平台暂停交付**。READY 表示构建产物存在，服务仍受团队暂停控制。 |
| 项目、域名与别名 | `www.jnqjourney.com` alias 指向上述正式部署，项目一致。apex、www 和默认域名均 verified，apex 指向 www。 | 已检查的映射正常，没有发现 alias 错配、域名未验证或 404 部署丢失的证据。 |
| 其他原因 | 正式域名、默认域名和三个已知 Production 部署 URL 均实测 402 `DEPLOYMENT_DISABLED`。接口显示默认 Vercel host 有认证保护，但 HTTP 此次先返回 402。 | 没有发现可用的旧部署恢复入口。未获得恶意封禁、应用代码异常或 DNS 故障导致此次 402 的证据。 |

三个被检查的 READY Production 产物分别对应 `7cee63d`、`c7c4e965` 和 `dea655a1`。部分标记 rollback candidate，但均返回 402。部署记录中的 rollback 标识不能证明恢复后可服务或与当前数据兼容。[HTTP 结果](evidence/vercel-402-http-2026-11-09.json)

### 零新增月费的恢复选项与副作用

| 选项 | 可执行步骤与前提 | 副作用 / 授权边界 |
| --- | --- | --- |
| 等待控制台列出的暂停结束 | 用户在 12 月 8 日核对 Team pause banner 与 Usage。若限制已解除，先用部署 URL 只读验证首页、Spot、状态 API、后台及 sitemap，再决定是否需要平台提供的恢复操作。 | 等待期继续停站，精确解除时刻和是否自动恢复尚未知。恢复后现有 cron 和真实流量会继续消耗 CPU，临时 3x 限额页面列出的截止日又早于暂停结束日，需要核对届时额度。 |
| 对当前限制申请事实核对 | 用户检查团队 Usage 中 Fluid Active CPU 的准确窗口、资源明细、12h 临时上限、pause end 时间，以及已有 Support case 的最终结论。携带当前 READY、`live=false`、402 和上述读数，要求平台说明解除条件。 | 需要平台处理时间。用户已告知第二次免费解除被拒，现有信息不足以承诺能再次豁免。发送工单需要用户明确授权，本轮仅提供核对清单。 |
| 平台确认解除后恢复原服务 | 只有控制台明确允许恢复且用户授权后，才执行它提供的恢复步骤，再核对真实 HTTP。 | 会重新开放正式流量与旧发布任务，并可能再次触发额度。此次未执行 Resume、unpause、promote 或 redeploy。 |
| 使用旧 READY 产物回滚 | 暂停解除后，先验证目标产物与当前 DB、slug、公开投影的兼容性，再由用户批准回滚。 | 当前三个目标都不可服务。旧版本可能恢复旧路由、缓存与权限行为，回滚还可能改变自动别名分配状态。此次没有执行回滚。 |
| 继续免费 Cloudflare 迁移准备 | 在隔离环境关闭下列 P0，建立可用回退并演练后，提交具体切换方案。 | Spot 候选尚不能承接整站与共用后台。正式路由、数据/权限/任务和域名操作需另行授权。 |

当前没有已验证的“立即、零费用、仅改 alias 即可恢复”的入口。控制台可手动核对位置为 Team Usage、项目 Overview 的 pause banner、Team Support 既有工单，以及项目 Deployments/域名详情。此次未读取或请求新的密钥。[Vercel 402 说明](https://vercel.com/docs/errors/deployment_disabled) · [Hobby 超额规则](https://vercel.com/docs/plans/hobby) · [项目暂停与恢复](https://vercel.com/docs/projects/managing-projects)

## 本轮兼容实现

1. **数据契约与状态。** 新增轻量 `spot-contract.mjs`，完整选择当前正式表的 36 个列名，保留 JSONB、数组、布尔、日期、坐标和可空文本类型。可空 `updated_at` 使用 `is.null` 条件写，已有版本仍精确比较。支持安全整数 ID 及其数字字符串表示，超出 JavaScript 安全范围时拒绝来源。兼容 `temporarily_closed`、`permanently_closed`、`inactive` 和显式空 status，缺失/未知状态继续拒绝。关闭且无 redirect 的公开请求返回 404。新 DELETE 同样要求版本匹配，删除记录后页面和私有图片返回 404，对象字节保留用于引用审计。
2. **相册与编辑。** 保存校验对封面和相册 URL 去重，17/30 张合成相册分别只作 34/60 次 receipt 与 object 检查。最大 60 张的边界保留，保存 JSON 有界提升至 256 KiB，测试覆盖超过 64 KiB 的 30 图元数据。提供可编辑完整字段 JSON、多图顺序上传、空 publication_status 保留及上传中保存阻止。API 类型和相册行为已测试，新增编辑器交互尚未经过浏览器验收。
3. **完成 / 取消竞争。** 对 ticket 的 `etagMatches` 条件 PUT 原子选择唯一处理者。重复完成在 receipt 可验证时返回相同对象，processing 期间的竞争请求返回 409。cancel 只能删除 staging，无法删除已验证最终对象。完成流程在尝试 receipt 写入后遇到不确定响应时保留最终对象，供重试核对，避免错误清理。已验证但未保存到当前行的媒体只允许管理员预览，匿名不再可读。
4. **URL 与双语样本。** 加入最长 16 跳的隔离重定向解析，保留第一跳 301/302，拒绝循环与越界目的地，隐藏的最终 Spot 不会成为公开跳转目标。Notes 仅接受服务端显式声明的 `cloudflare-loop-*` 隔离路径，正式 Notes 可见性接入仍是阻塞。双语 alias 与 canonical 保留，图片读取 alt/图注并转义。英文 hreflang 只有在测试侧声明的英文源版本匹配当前行时生成，源版本变化后移除。Preview blanket noindex 持续有效，正式翻译 hash/质量 gate、sitemap、结构化数据与跨模块模板仍待适配。

Presigned PUT 的签名算法函数与 `3603644` 逐字比较一致，SHA-256 为 `8399cfcca9029601c76f3d36ce14a117b845e3af3d3ccd0a6ffbfdbb928e7c4e`。仍使用单对象、短期 PUT、私有 staging、binding 验证与服务器端 R2 CopyObject。打包器加入纯契约模块，部署前检查它与打包副本的 hash。[实现](worker.mjs) · [类型与路由契约](spot-contract.mjs)

R2 官方确认条件 PUT 不满足时返回 null。合成存储模拟了该原子性，但云端 CAS 兼容、失败语义和额外 CPU 开销还需要新路径原生验证。processing/cancelled 票据依赖现有一天生命周期过期；不自动抢占 processing，避免对不确定的已完成对象再写或删除。receipt 尝试失败且实际上未写入时，可能留下私有、不可引用的最终对象，需要受控 reconciliation，不能直接标记清理完全通过。[R2 条件操作](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations)

## 新增验证与边界

12 项新增合成单元测试全部通过，涵盖字段类型、空版本、关闭状态、安全 ID、17/30 图、256 KiB 内元数据保存、删除保护、重定向链与循环、同票据并发完成、complete/cancel、模糊 receipt 写入和语言版本门槛。ESLint 定点检查通过，Git whitespace 检查通过。原套件的 mock 只同步了新的 ticket 保留契约与本地模块导入，未重跑既有整套验收。[新增定点测试](../../tests/cloudflare-compatibility.test.mjs) · [脱敏结果](evidence/compatibility-unit-results-2026-11-09.json)

这些测试运行于本机 Node 与合成 Supabase/R2，输出的本机耗时不作为 Workers CPU。此次未部署修正版 Preview，因此**没有新的 Cloudflare CPU 或真实免费额度结论**。历史 Presigned PUT 1 MiB 完成验证 **10 ms** 临界值继续保留，四次上传、原生记录和 Chrome 结果没有重置或用新低值覆盖。此次 Vercel 读数属于新实测平台证据。

### 新路径的有界验证清单

后续受控 Preview 版本可在独立 fixture 上执行以下批次，合计最多 40 次候选 Worker 请求。30 个小 PNG/receipt 的隔离造数应在开始前固定完成并校验，禁止接触正式媒体。通过后也只归入该新版本的结果。

- 预检确认隔离 schema 具有 36 列、fixture allowlist、Production 为空，再部署这个小型候选并启动原生 Tail。
- 17/30 张不同对象相册的 PATCH、HTML、单图访问，长元数据保存，实际关闭与恢复状态。校验 JSON 字段与完整图片数量。
- 单张小 PNG 的同 ticket 双 complete 与 complete/cancel，已保存对象在竞争后仍可读取。原生条件失败、模糊 receipt 和对象保留情况必须单独记录。
- 新建专用可删除 fixture 的一次 DELETE，双语 alias、301/302 和已配置的隔离 Notes 目标。整合路径缺少可见性权威时保留阻塞。
- 原生 CPU 任一超过 10 ms、事件缺失、对象误删、错误公开或请求数达到 40 即停止。无需重复 1/5/10 MiB 和独立 10 MiB 的历史尺寸验收。

## 安全迁移契约与剩余阻塞

| 等级 / 状态 | 必须满足的正式契约 | 当前缺口 |
| --- | --- | --- |
| P0 阻塞 | 所有媒体引用都经过验证与当前发布状态检查，旧 URL 的访问策略明确 | 旧 `r2.dev`/外链/正文媒体仍公开，正式共享对象消费者尚未完整盘点。候选继续拒绝把旧媒体直接写成已验证引用。完整下架保护待验证。 |
| P0 阻塞，需要用户授权 | 正式 Supabase SELECT 按公开状态与管理员权限执行，缺 allowlist 时拒绝管理，浏览器无 service role | 本轮仅保留上次审计中匿名 `USING true` 的已知风险。正式 RLS、授权、Auth 列表与旧后台连接契约均未改动。 |
| P0 阻塞，需要用户授权 | 一个权威写入端与发布版本，旧 cron/翻译/优化/投影任务不覆盖新提交 | 新候选仍未接正式 `spot_publication_sync`、全站索引和 Next cache。关闭、隐藏、删除在跨模块公开投影上的语义还需隔离恢复演练。 |
| P0 阻塞 | 原 URL、正式 slug/alias、英文翻译新鲜度、质量 gate、sitemap 和跨模块依赖完整保留 | fixture allowlist 未升级为正式 slug 权威。bigint 超安全范围仍拒绝。创建、批量管理、原后台全部交互、富正文/视频/地图、图片焦点和正式 SEO 全契约未完成。 |
| P0 阻塞，需要用户授权 | 有可用回滚入口及一致版本备份 | Vercel 团队 CPU 暂停已确认，旧 Production URL 均 402。正式数据和 Storage/R2 字节备份、恢复演练、单写窗口、路由与任务开关须另行批准。 |
| P1 待验证 | 修正版在 Free 内运行，有界重复请求和清理可靠 | 30 图保存即使去重仍有 60 次内部读操作，CAS 每次处理额外增加一次 Class A，约 4 次增至约 5 次/成功新上传。票据保留、私有最终对象 reconciliation 和峰值存储需计入。当前原生 CPU、R2/Supabase 网络字节与并发余量均未知。 |

本轮到此停止。下一步应先选择 Vercel 恢复核对路径或批准上述隔离新路径验证。正式备份、恢复、权限调整、发布任务切换及正式路由仍需单独授权。
