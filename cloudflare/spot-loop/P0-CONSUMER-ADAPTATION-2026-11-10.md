# P0 consumer adaptation

**P0_CONSUMER_ADAPTATION_BLOCKED。正式迁移 HOLD。**

基线 `38338b922a20c797a9e3d02df1c01e8cc1c8bb11`。本轮已实施读取适配，并用真实 Next 组件、隔离 Supabase 和新 Pages API Preview 验证。尚未完成真实站点的 Pages 前端部署和完整后台写入闭环，没有关闭正式公共入口。

| 范围 | 实际完成 | 尚未通过 |
| --- | --- | --- |
| 7 个后台客户端 | 列表、编辑、地区、Notes、Guide、Affiliate、Klook 均改用真实管理员鉴权 API；七页均实际收到 locations 200。Notes/Guide/Affiliate 的间接 locations join 也改走受保护接口。 | 完整「加载—编辑—保存—刷新」为 **0/7 完整通过**。Notes 权威来源失败、图片与发布路径尚未全部连接。当前候选的旧写入 API 明确返回 503，防止绕过 Registry 或产生半次保存。 |
| 4 个公开 reader | public-data-resolver、public-spot-resolver、public-location-data、english-page-data 均移除直接匿名表读取与旧内容 fallback，使用服务端投影/受控来源。 | 全页面表示矩阵未通过；首页依赖的隔离配套结构不完整；完整详情、sitemap、RSC/Pages JSON、双语首页尚未完成最终验收。 |
| 8 类公开 feed | locations、regions、guides、notes、spots/index、spots/detail、英文 records、guide-trip-costs 已提供受控兼容读取路由，基本读取路径均取得成功响应。detail 以 API 实际返回的 canonical slug 验证。 | 发布回读与清理等操作消费者仍有旧公共入口依赖，见下表。不能据此关闭整桶 r2.dev。 |
| 真实组件 | Chrome 157 实测搜索、地区索引、Guide 索引、Notes 索引、英文 Notes 正文显示、无新增 JS 异常。 | 测试在本机隔离 Next 14 副本进行；Cloudflare 只承载新 API Preview。历史图片未验证的映射返回 404，不能算图片加载通过。 |

[脱敏汇总](evidence/p0-consumers-2026-11-10/summary.json) · [七页浏览器记录](evidence/p0-consumers-2026-11-10/browser-final.json) · [中文组件](evidence/p0-consumers-2026-11-10/public-components.json) · [英文最终补测](evidence/p0-consumers-2026-11-10/public-english-after-cache.json)

## 实际代码

- `lib/admin-location-read.ts` + `/api/admin/locations` GET：服务端 `getUser()` 与 ADMIN_EMAILS 检查，完整管理员字段、region/affiliate 关系，200 条分页、最多 50 页；拒绝浏览器 SQL select 和任意 resource。响应 private/no-store。匿名 401，非管理员逻辑回归 403；真实 authenticated JWT 直接读旧表仍为 403/42501。
- `lib/server/public-spot-projection.ts`：内部 ID 游标清单最多 50×200 条，投影严格按 **1–20 ID** 分批调用既有 `jnq_public_spots`，失败整次拒绝，不返回半批结果。校验 32 字段白名单、active 与 NULL/published 语义；地区子对象另做显式投影。候选严格绑定隔离库与 92061/92062。
- 四个 reader、公开 API、兼容 `/public-data/[...path]`、英文页面都使用上述来源。移除公开内容的 CDN/bundled 恢复路径和跨请求持久缓存。英文保留实际 `entityType=page` 的 Notes 翻译记录；最终补查返回 200、6 条 Notes 翻译。
- `controlled-media.ts`、现有媒体 resolver：精确替换已知 host 的图片与 JSON feed 地址；保留关联、数组和 metadata 键。受控图片由既有 Registry 字节门控核对 native identity，未验证的历史 key 不放行。没有按文件名推断消费者。
- `image-size` 实际支持受控相对路径，改用管理员鉴权与固定来源，拒绝任意地址代理。实测匿名 401、合法图片 68 bytes、169.254.169.254 请求 400。

冻结 Registry SQL 未修改，LF SHA-256 仍为 `b221473d7f08dd28bcee736928b7e34b1a16f3191723f5decd025709972008f1`。没有改写 Presigned PUT、complete、CopyObject、Registry 保存 RPC 或 Identity Bridge 核心。

## 新 Preview 与实际原生数据

API Preview：<https://codex-p0-consumers.jnqjourney-spot-loop-migration-candidate.pages.dev/public-data/guides.json>。部署 ID `f62a26a3-64a3-4eb9-96f1-f4e9d8229532`；两小时期限至 **2026-11-10 14:32:28 SGT**。过期拒绝；两个合成景点已收尾下架。本机测试站和 Tail 已停止。

| 标记请求 | 原生 CPU |
| --- | ---: |
| 公开投影，NULL 发布 | 3 ms |
| regions / guides / notes / 英文 records / trip-costs | 各 1 ms |
| 真实合成 PNG GET，68 bytes、SHA-256 匹配 | 5 ms |
| 字段注入、旧静态 JSON、静态 HTML 拒绝 | 各 1 ms |
| 隐藏后投影为空 | 3 ms |
| 隐藏图片拒绝 | 5 ms |
| 新 HEAD 元数据路径 | 4 ms；2 R2 HEAD、2 RPC |

**13 条标记请求均有真实 Tail，最高 5 ms。** 组件读取还产生了未带标记的请求，不能把 13 当作总 Worker 请求数，或宣称整个网站 CPU 全部合格。前七条旧解析器未保存操作计数，R2/RPC 操作数为 UNKNOWN，不能从 CPU 推算。后续请求有原生操作日志。账户免费余量、Edge CPU、本轮总请求数均 UNKNOWN。历史 complete **8 ms**、17 图 **29/19 ms** 和上一轮缺失 Tail `1794278768484-11` 全部保留。

首段图片请求的 Tail 将文件名脱敏为 `REDACTED.png`，首次脚本因此停止。只读核对相同 Acceptance ID 的 5 ms 原始事件后，安全断点恢复仅发送余下拒绝用例，未重跑已通过七项。[首段](evidence/p0-consumers-2026-11-10/native-acceptance.json) · [续段](evidence/p0-consumers-2026-11-10/native-resumed.json) · [13 条 Tail](evidence/p0-consumers-2026-11-10/runtime-events.json) · [新 HEAD 与 HTTP](evidence/p0-consumers-2026-11-10/http-checks.json)

首次登记因 fixture 未启用被正确拒绝，未增加 service_role 权限。只读确认两条新记录 hidden、登记为零后，经明确指定隔离项目的官方连接执行了受控 enrollment DML，再独立验证新合成对象并登记。初次预检读取了错误的 allowlist 字段；续段已改读真实 CANDIDATE_SPOTS，逐个核对八个固定快照，保留初次不完整记录。固定旧部署与本轮 ID 无重叠。没有新 DDL。

## 旧引用替换结果与剩余依赖

离线产物位于 `artifacts/cloudflare-p0-consumers/replacement/`，生成脚本 `consumer-reference-map.mjs`。记录了 **690 个不同 URL path** 的替代路径、消费者与字段位置，其中 **10 个**跨模块共用。原始 reference-kind 算法把 Spot 索引/详情当成两类，曾计为 12；证据保留该诊断并给出标准化的 10。

输入覆盖 582 条已捕获公开景点索引、2 份代表性详情、6 篇 Notes、7 篇 Guide，以及带明确历史标签的 58 条地区、3 个配套、12 个选项快照。地区与配套不是本轮正式实时导出，完整私有内容与外部热链仍 UNKNOWN。所有历史对象 identity 均标为 UNVERIFIED，本轮没有读取或复制正式图片。[逐 key 差异与消费者](evidence/p0-consumers-2026-11-10/reference-replacements.json) · [已生成替代文件的摘要与哈希](evidence/p0-consumers-2026-11-10/replacement-output-hashes.json)

| 仍需处理的操作消费者 | 关闭公共入口后的具体风险 |
| --- | --- |
| `lib/server/r2.ts` Guide 发布回读 | 仍使用公共 URL 验证，可能写入成功但回读失败。 |
| `lib/server/public-guide-trip-cost.ts` 发布辅助流程 | 仍从 CDN/静态数据建立写入基线，不能在入口关闭后用旧基线覆盖新预算。 |
| `lib/server/localization-publisher.mjs` | 英文发布确认仍访问公共 R2 URL。 |
| `/api/admin/storage-cleanup` | 仍依赖公共 feed 核对引用；必须改成私有权威读取并保持失败停止。没有运行清理。 |

读适配候选统一阻止旧 Next 管理写入，避免把这些未完成路径当作成功保存。现有独立 Edge/Bridge 媒体验收部署不使用该 Next guard，历史技术 GO 保留。没有删除后台功能，也没有将重型 Node API 放到 Workers。

共享图片必须按所有显式消费者的当前资格处理，一个 Spot 下架不能自动撤销仍被公开 Notes/Guide/地区使用的对象。此轮只完成关系与替换产物，尚未实现这些历史对象的完整共享资格和身份登记；目前拒绝字节，未自动撤销、删除或重新登记共享对象。

`jnqjourney-img` 的正式 r2.dev 仍 enabled。外部旧完整 URL 不受站点 DNS 控制；关闭后，差异表中的已知外链及未发现热链会失效，不能承诺其永久兼容并同时即时撤销。

## 明确的剩余阻塞

1. **隔离配套结构**：真实查询为 HTTP 400、SQLSTATE 42703，明确缺少 `travel_packages.hero_image`。首页真实渲染因此失败；没有补空数组或回退正式快照。其他完整列差异尚未完成精确对齐。
2. **Notes 权威来源**：真实后台 `/api/admin/notes` 为 503，权威存储指针不可读取。停止此部分保存与完整加载验收；没有创建桶、复制私有稿件或改权限。
3. **真实后台写入集成**：现有站点表单的旧发布/上传链尚未全部接入已通过的独立媒体闭环。读取成功不等于七项保存通过；当前模式明确 503。
4. **Pages 前端宿主**：本轮 Next 实时读取用动态 HTML/RSC 和英文 SSR 验证正确性，不能直接当作 Pages 静态包部署。完整前端、HTML/RSC/Pages JSON 和实时门控的宿主适配仍需实施与隔离验收。没有把静态构建快照称为实时撤销。
5. **历史媒体与操作消费者**：690 条映射尚无完整 native identity/共享资格；上述四处操作依赖未解除。正式入口仍可绕过候选状态规则，继续 HOLD。

英文初次编译出现 Pages/RSC `server-only` 不兼容，其后发现 React 18 Pages 无 `cache()`。已分别修正为受守卫的服务端模块、RSC 请求内 memo/Pages 直接实时读取；最终英文 Notes 200。86 个实际客户端 JS 未发现 service_role 明文或私有投影 RPC。Next 提示英文 Notes 页数据约 **304 kB**，其移动端与大内容成本未验证。

[英文最终截图](evidence/p0-consumers-2026-11-10/english-notes-final.png) 可见缺图状态与部分卡片标题裁切；没有将「正文返回 200、无 JS 异常」标成视觉验收通过。本轮不扩展修改版式。

最终 14 项本地测试通过；网站源码限定范围 TypeScript **exit 0**。早先全工作区检查未通过，包含临时副本及既有未跟踪字体生成文件；适配自身的 Promise 查询链、类型与回调问题已修正，未删除该用户文件。ESLint 0 errors、2 条既有 hooks warnings。[测试](evidence/p0-consumers-2026-11-10/unit-tests.log) · [类型范围](evidence/p0-consumers-2026-11-10/typecheck-result.json)

完整 586-ID 公共索引按当前代码预计需要 3 次 ID 清单查询、30 次投影 RPC，另加地区/slug 来源。这是代码推导，非正式流量实测；真实并发、数据库负载和免费额度余量未确认。当前 1–5 ms 的桥接样本不能证明整站 RM0 稳定性。

下一步最小动作：先完成必要的**隔离**配套/权威内容 fixture 对齐，连接真实后台表单的既有保存协议及私有发布回读，然后完成真实 Pages 前端与共享图片资格。只补未通过路径。上述通过后才准备正式引用替换、正式 ACL 和关闭 r2.dev 的独立审批；本轮不进入正式切换。回退仍应保留私有入口和隐藏/撤销状态，不能把重新开放整桶当作安全自动回滚。

收尾：92061/92062 均 hidden；测试 bucket 私有；无新 Secret；未删除不确定对象；本轮进程和 4401 监听为零。Production canonical/变量/R2 binding 仍为空。正式 Supabase、R2 对象、DNS、Vercel、main 没有本轮写入或部署。[权限及边界](evidence/p0-consumers-2026-11-10/final-boundaries.json) · [隔离目录](evidence/p0-consumers-2026-11-10/isolated-final.json) · [清理](evidence/p0-consumers-2026-11-10/cleanup.json)
