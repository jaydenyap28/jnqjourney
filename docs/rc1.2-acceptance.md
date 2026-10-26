# RC1.2 本地交付与待验项

日期：2026-10-26。分支：`codex/rc1.2-website-upgrades`。**LOCAL FUNCTIONAL PASS；Production NO-GO；未部署。**

本轮依用户确认先完成本地修复，当前 Supabase 实际资料、历史表 RLS 与线上发布同步全部待验。不将旧快照、模拟 SDK 或本地 HTTP 结果称为线上验收。

## 实际完成

- Spot 编辑器增加内容问题提示、保守清理预览及显式应用到表单草稿。仅去除确定的重复段落和明显 AI 对话包装，保留历史资料、代码、引文和正常短文；不自动保存、不编造事实、不自动翻译。
- 新增离线导出检查工具，区分“导出未包含 SEO 字段”与“明确为空”。只有后者生成待人工审核的 SEO 草稿。真实 Supabase 内容修订未执行。
- Spot SEO fallback 避免空白专属描述遮蔽有效介绍；英文 fallback 避免直接使用明显中文段落。坐标结构化数据接受合法零值，拒绝无效范围。公开页面 JSON-LD 统一转义 `<`；Sitemap 去重、忽略非法日期并保留 hreflang，未增加 Sitemap 数据查询。
- 配套后台及预览可读取任何主配套的既有选项，海南发布检查要求一个主配套下恰好两个 active 选项。没有创建、拆分或迁移真实配套；这不是数据库并发约束。
- 海南/Batam 等通用详情支持方案价格、单位、有效期、包含项目、照片及独立 WhatsApp 询价；采用可换行网格与原生展开区域。Tioman 移除展示层固定 RM509，优先使用同币种、每人单位的有效价格，不比较每房与每人报价。空选项编辑器不再崩溃。
- 后台修正海南上传国家路径、空价格/null 与币种处理，保留海报和图库。保存/删除确认实际影响记录；缓存失败明确返回部分成功，提供只重试刷新、不会重放数据库写入的入口。首次创建后即使刷新失败也保留新 ID，避免重试插入。
- 选项变更仅刷新所属详情；主配套变更刷新列表、Sitemap、新旧详情及既有 `travel-packages` 标签。缓存 API 仅报告 `invalidated, verified:false`，不将失效请求成功伪称独立读回成功。
- 配套详情按已配置关系链接至公开 Spot、Guide、Note 和目的地；缺少/未发布关联省略。复用原有公开数据读取器，无新增缓存层。
- WhatsApp 自定义文案仍附带所选方案与来源码；未发送任何消息。RC1.1 的 Preview 服务端只读限制保持。

## 本轮验证矩阵

| 项目 | 结果 | 证据及边界 |
| --- | --- | --- |
| 全量回归 | PASS，359/359 | `artifacts/rc1.2/test-all.log`；原 342 项保留，新增 17 项 |
| 新增定点回归 | PASS，17/17 | `artifacts/rc1.2/test.log`；包括 SDK 模拟传输、失败与恢复、SSR、内容与 SEO 契约 |
| TypeScript | PASS | `typecheck.log` 无诊断；正常构建再次完成类型检查。最初 optional sort_order 错误已修复，初始失败日志保留 |
| Lint | PASS，0 errors | `lint.log`；保留原 `app/admin/notes/page.tsx:522` 的 ref cleanup warning，新脚本/测试也完成 ESLint |
| Next.js 14.2.35 正常生产构建 | PASS，一次 | `build.log`；77/77 静态页面。离线字体替身、合成环境变量及网络拦截器生效；此 `.next` 仅供本地验证，不可部署 |
| 原缓存 HTTP 验收 | PASS，39/39 | `runtime-summary.json`；首次生成/HIT、重启、下架/重发布、中英文、价格/Widget/Affiliate 实际 HTML 值、主动刷新和故障恢复 |
| RC1.2 配套 HTTP 验收 | PASS，8/8 | `package-http.json`；海南两个选项、变价后读回、停用、Tioman 当前报价、Batam 询价、下架 404、提供方仅 GET |
| R2 故障恢复回归 | LOCAL PASS | 全量回归中的既有故障注入，输出 `r2-fault-evidence.json`；不是实际 R2 故障演练 |
| RC1/RC1.1 与无关本地工作保留 | PASS | `integrity.json`、`changes.json`；RC1.1 原始 ZIP 与 72 项冻结证据无漂移，基线文件未删除，数据/锁文件未更改 |
| 手机/桌面浏览器视觉与交互 | 待验 | Work 设置禁止本地浏览器控制；SSR/HTTP 不能替代真实布局、图片、焦点与触控验收 |
| 当前 Supabase 内容、权限/RLS、发布同步 | 待验 | 用户指定延期。`docs/rc1.2-database-readonly.sql` 仅准备，未执行 |
| 真 Vercel/CDN/多实例/外部统计与供应商实际执行 | PREVIEW REQUIRED | 本轮没有部署或云端操作；保留既有 Preview 安全前置条件 |

HTTP 合计 **47/47**，不将 RC1.1 历史的 104/104 累加为本轮结果。没有重复运行 Preview 构建或制作候选包。

配套真实响应为动态页：200 时 `x-nextjs-cache` 缺失、`Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`；停用主配套返回 404 和 `X-Robots-Tag: noindex, nofollow`，404 没有 Cache-Control。未为获得 HIT 添加缓存或关闭其他页面 ISR。完整状态与响应头保存在 `package-http.json`；旧缓存页面的 STALE/HIT 与重启证据在 `runtime-summary.json`。

## 内容证据的限制

`artifacts/rc1.2/content-reviewed/quality.json` 来自旧本地快照：547 个记录、197 个有提示，547 个 SEO 字段覆盖未知，**0 个可据此提交的 SEO 草稿**。这不是当前 Supabase 未完善景点清单；短文提示也不是必须重写的结论。

最初 `content/` 输出错误地把省略字段当成缺失，已经由 `content-reviewed/` 取代，原证据保留，不可应用其草稿。没有修改任何真实行程、Spot 文案、配套报价或历史备份资料。

## RC1.2 变更清单（相对 RC1.1 工作区，而非 HEAD）

修改 20 个原有文件：

- `app/admin/packages/page.tsx`
- `app/api/admin/travel-package-options/route.ts`
- `app/api/admin/travel-packages/route.ts`
- `app/notes/[slug]/page.tsx`
- `app/packages/[slug]/page.tsx`
- `app/sitemap.ts`
- `app/spot/[slug]/page.tsx`
- `components/AdminLocationForm.tsx`
- `components/AdminPackagePreviewClient.tsx`
- `components/GuidePageView.tsx`
- `components/RegionPageView.tsx`
- `components/TiomanOptionsEditor.tsx`
- `components/TiomanPackageDetail.tsx`
- `components/TravelPackageDetail.tsx`
- `components/WhatsAppButton.tsx`
- `lib/spot-content.ts`
- `lib/whatsapp.ts`
- `scripts/lib/offline-network-guard.cjs`
- `scripts/validate-offline.mjs`
- `scripts/verify-offline-routes.mjs`

新增 11 个文件：

- `components/PackageOptionsSection.tsx`
- `components/SpotContentQualityPanel.tsx`
- `lib/package-presentation.ts`
- `lib/server/package-publication.ts`
- `lib/server/package-relations.ts`
- `lib/spot-content-quality.ts`
- `scripts/audit-spot-quality.mjs`
- `scripts/verify-rc12-packages.mjs`
- `tests/rc1.2.test.ts`
- `docs/rc1.2-database-readonly.sql`
- `docs/rc1.2-acceptance.md`

本轮证据独立位于 `artifacts/rc1.2/`；机器清单及内容指纹见 `changes.json`、`after.json` 和 `integrity.json`。未提交、Push、部署、创建云资源、修改线上变量、写入数据库或删除 Storage。保留原有已删除文件状态及其他先前改动，不重置/覆盖。

## 成本影响与剩余上线条件

- 无新依赖、缓存层、ISR 周期、Cron 或后台任务。Sitemap 去重不增加读取；暖缓存无额外缓存文件写入的既有断言通过。
- 选项编辑仅失效所属详情，避免清空全站配套列表标签；父级变更仍使用原共享标签，必要时会刷新列表使用者。
- 通用详情新增既有选项表读取，即使没有选项也会查询；请求级实际次数受 Next fetch 去重/缓存语义影响。动态详情仍有 Vercel CPU 和 Supabase 读取开销，不宣称它具有 Full Route Cache HIT。配置关联链接时才读取对应公开集合，可能增加集合首次加载和渲染成本；没有关联则跳过。
- 未更改图片或上传到 Storage；无法量化节省金额。需在受控 Preview 中观察查询数、CPU、ISR Reads/Writes 和供应商统计，不能把本地模拟成本当成账单数据。
- 构建保留若干英文页面数据超过 128 KB 的 warning（含英文首页约 573 KB）；不是本轮新增优化范围，未靠放宽阈值处理。
- 生效方式：本轮代码、SEO fallback、展示、发布刷新与后台修复都需要未来经批准的部署。内容/SEO 字段、配套选项及关联配置原则上可走已有后台发布而不部署代码，但本轮没有执行；需先核实当前数据、权限与发布链路，保护原体验和备份。
- 上线前真实门槛：恢复只读数据库访问并核验内容/RLS/同步；确认海南实际一主两选项及真实报价；完成真实手机/桌面视觉与 WhatsApp 参数验收；确认 Vercel 额度、隔离 Preview 资源/保护配置；随后单独授权受控部署与 CDN/多实例验收。现有 RC1.1 Preview 环境阻碍没有因本轮本地通过而解除。

本轮本地修复结束，不追加全站审计、构建或打包。
