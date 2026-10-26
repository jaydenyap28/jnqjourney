# RC1.1 Preview 只读安全准备

日期：2026-10-18。结论：**RC1.1 LOCAL PASS；ENVIRONMENT BLOCKED；Production NO-GO。** RC1 原始指纹、报告和失败证据保持原样；本轮只做获批准的本地安全补丁。没有 Push、Deploy、云端配置修改、资源创建、正式数据库写入或 Storage/R2 删除。

## 安全边界

- `requireAdminRequest` 在调用 SDK/Auth 前拒绝 Preview，也在 `ADMIN_EMAILS` 缺失或仅含空白/分隔符时返回 503。非空白名单仍执行 token 和邮箱校验。
- Preview 全部后台 API（App 与 Pages）、上传、预算同步、两个维护签名刷新入口均返回 `PREVIEW_READ_ONLY` / 503 / private,no-store。包括原本不走统一校验的 image-size GET。没有解锁环境变量。
- 服务端后台布局在 Preview 不挂载登录表单与 Auth Shell，避免普通操作直接调用继承的正式 Supabase Auth。
- page-view、affiliate-click 在创建 SDK 前返回 200、`skipped:true`、`reason:preview-read-only`；不是统计写入成功回报。
- App 服务端布局不挂载 Google Analytics、PageViewTracker、Vercel Analytics、Speed Insights。Pages 外壳和 GA event helper 使用 Next config 从 `VERCEL_ENV` 生成的公开布尔常量，避免 hydration 后重新启用。服务端拒绝策略不依赖此客户端常量。
- Production 有效配置下保留后台保存、发布、统计和布局行为；缺少后台白名单时明确 fail-closed 是本轮要求的有意变化。没有改变 Next 14.2.35、ISR 3600、Data Cache、tag 映射或发布顺序。

## 内部 HTTP

`internalPreviewHeaders` 仅在 Preview 转发 `_vercel_jwt` / `__vercel_protection_bypass` Cookie 和请求已有的 `x-vercel-protection-bypass`。输入请求和目标都必须精确匹配系统 `https://${VERCEL_URL}`；缺失、非标准部署域名、不同分支 alias、生产域名、第三方域名、HTTP、URL userinfo 全部拒绝。Host/Forwarded Host 不构成信任依据。

不复制应用 Authorization、其他 Cookie、Set-Cookie 控制参数或环境中的自动化 Secret。公开读回不带后台 Bearer；英文后台 revalidate 只在同源校验之后显式设置应用 Authorization。Middleware 不自动跟随重定向，HTML 读回每一跳都重新校验。Preview Package 内部查询失败也返回安全失败，Production 原有回退逻辑保留。

这是本地转发与防泄露策略通过的边界，不代表真实 Vercel 会传递相同 Cookie/Header。保护 Cookie 的平台契约、有效期、immutable URL 和 adapter 原点行为仍需真实 Preview；不允许因受保护请求失败而退回生产域名或关闭部署保护。

## 本地验收

最终结果另以本目录证据为准：`artifacts/zero-deployment-rc1.1/`。

| 项目 | 结果 |
|---|---|
| 完整 Node 回归 | 342/342，0 skipped；原 329 项保留，新增 13 项 |
| 原完整 HTTP 生命周期 | 39/39，含冷启动、失效、隐藏、英文、值级复核及恢复 |
| TypeScript | PASS |
| Lint | 0 errors，保留原 Note admin ref cleanup warning |
| 正常离线 production build | PASS，Next 14.2.35，77/77 |
| Preview production build | PASS，77/77；独立 Preview 构建标记 |
| Preview 安全 HTTP | 65/65；51 个 App 后台/上传方法、5 个 Pages API、2 个统计接口、登录页面、零 provider 调用、中英文/错误 HTML、Production 空白名单 |

新增单测枚举全部后台 handler，除纯配置读取 getter 外，SDK/文件/发布依赖调用在 guard 前发生即失败；生产正向统计/后台身份校验、空白名单、跨源拒绝、自动化 Secret 不转发、GA 布尔标记和登录布局均有断言。既有测试只补齐真实共享模块解析 seam，没有删除测试、放宽断言或修改业务数据。

Preview HTTP 实际结果：所有后台方法为 503 / private,no-store；统计为 200 / skipped / private,no-store；这批请求及登录页面合计 provider 调用 0。中英文详情/列表 200、英文错误页 404 均无统计注入。随后独立启动 Production 环境的本机服务器，空白名单 503，未增加 Auth 请求。详细状态、headers、字节数见 `preview/preview-runtime-summary.json`；原 39 项缓存状态/版本见 `runtime-summary.json`。普通 loopback Preview 不模拟真实 HTTPS Vercel Authentication，Cookie 转发策略只以真实模块的合成来源/响应测试验证，不冒称平台兼容已通过。

最初的纯 fixture 导入缺失、image-size 未覆盖、沙箱 loopback EACCES 与构建目录 EPERM 日志均保留；前两项修正，后两项使用同一离线网络 guard 在允许本机连接/写构建目录的执行环境通过。外网 fetch/socket 仍拒绝，SDK 测试只用合成 transport。离线 `.next` 含字体 mock 和占位配置，不能上传部署。

## 环境准备：只列清单，不执行

- Supabase：独立测试项目的 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`，匹配 schema、专用测试用户，`NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` 指向测试桶。不能只换桶而保留正式 Service Role。
- R2：`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET_NAME` 只授权独立测试桶的对象读写；不授权正式桶或账户管理。固定 `public-data/*` 键在测试桶保留，不把正式桶当成命名空间隔离。
- 来源：`R2_PUBLIC_BASE_URL`、`NEXT_PUBLIC_R2_PUBLIC_BASE_URL`、`PUBLIC_DATA_CDN_BASE_URL` 都指向测试对象。`NEXT_PUBLIC_SITE_URL`/`SITE_URL` 明确 Preview origin 策略，不继承正式 origin 作为内部认证目标。
- `ADMIN_EMAILS` 明确非空。GA、Gemini、YouTube、预算同步的正式配置不向 Preview 继承；非必要服务关闭。即使未来填入测试凭据，RC1.1 仍拒绝 Preview 后台/发布，不能用配置解锁。
- 既有凭据 All Environments 的继承风险、测试资源是否存在及权限、Vercel 暂停和 Supabase/R2 额度必须另行只读核实。本轮没有读取 Secret 值或改任何云端变量。

## 候选源码计划

冻结 RC1：`f48d607021818a5bbf7fa2dab5b0be88af56d391714cda46111007cda23da10f`。before.json 保留 1141 个原文件的路径/字节/哈希；新 after/integrity 只记录 RC1.1 差异。原 RC1 证据逐项复核见 rc1-evidence-integrity.json。

候选由完整 RC1 工作树基线叠加批准补丁选取，不用 HEAD 或最后 43 个文件替代。候选包含 app/components/lib/pages/types/data/public/public-data 和构建配置、package-lock；目前 894 个文件的只读清单见 candidate-plan.json，没有制作或上传部署包。

后续打包须逐文件验哈希、拒绝符号链接/路径穿越、按 POSIX 路径排序并固定归档时间戳和权限，另外计算 archive SHA256。排除 `.env*`、`.vercel`、`.git`、node_modules、离线 `.next`、artifacts、测试/证据、维护脚本和无关工作文件。依赖用锁文件在干净候选目录安装；需另行完成真实配置的候选构建，不能复用本轮产物。

## 后续批准与验收边界

额度恢复、资源隔离核实及单次部署获授权后，仅上传一次候选、构建一次，使用 immutable Preview URL，不 Push、不绑定生产域名、不 Promote。先验登录保护、跨源拒绝、正式资源零写入、noindex、Canonical/Sitemap 和内部请求，再验详情冷/暖缓存、中英文版本与 Router Cache。

首轮最多 20 个应用路径、150 次顶层 HTML/API、并发 2；预算上限 Function Invocations 300、函数 CPU 60 秒、ISR Writes 1000 个计费单位、传输 50 MB，并以实际剩余额度更低者为准。记录部署前后及观察窗口指标，区分团队和部署增量；指标延迟时以请求计数和日志辅助。

任一正式写入、保护失效、跨源凭据发送、下架复活、假成功、重复 mutation、同路径连续两次异常或预算触线立即停止，不自动重试部署、升级套餐或扩大预算。

RC1.1 只读 Preview 不验真实保存、R2 写失败恢复或第三方正式 tracking。未来隔离资源准备好后须单独设计并授权写入验收；真实多实例需实例证据，生产外层代理 CDN 需等效环境。Widget/外部 Affiliate 的正式统计标识与第三方请求仍须隔离/批准；本轮不能宣称浏览器 Router Cache、第三方执行或云端故障恢复 PASS。

成本：公开页未新增数据库查询或缓存层；Preview 取消统计挂载、跳过统计 DB 调用、拒绝后台及发布，减少该环境的统计/写入开销。直接 POST 跳过接口仍会有函数调用。内部保护转发不增加 HTTP 数，Spot 仍一次内部查询；Production 不承诺新增资源节省或账单变化。
