# JnQ Journey RC1.3 本地交付记录

2026-10-26 · 分支 `codex/rc1.3-website-refinements` · **本地代码改进已完成；视觉验收未完整完成；部署 NO-GO。**

从用户指定的 `codex/rc1.2-website-upgrades` 创建本地分支，保留其全部未提交内容。没有提交、Push、Preview/Production 部署、依赖升级、生产数据库修改、同步任务重跑或 Cron 启用。改动仍为本分支工作区的未提交文件。RC1/RC1.1 冻结证据与 RC1.2 证据不修改、不打包。

## 真正完成的改进

| 范围 | 已证实的缺口 | 本轮行为与价值 |
| --- | --- | --- |
| Spot 内容检查 | RC1.2 只有统一的短文提示，后台列表不能筛选正文/SEO 缺陷 | 按景点、住宿、餐饮、咖啡馆分别给出人工复核提示；缺正文、待核对、建议、未发现规则问题分级。短文和独立 SEO 缺失仅为建议，不禁止保存、不自动扩写 |
| 批量发现、逐项编辑 | 原列表仅可筛媒体/联盟缺口 | 用户主动点击才读取正文/中文 SEO 并在浏览器静态分析；可筛短文、重复、AI 残留、语言混用、疑似无效链接、SEO、未检查项。可用 #ID 精确查找。改变筛选后清空旧选择，避免隐藏选项进入批量范围 |
| 编辑前后对比 | 清理面板只有清理后文本 | 展示载入时原文与当前草稿，另列保守清理建议；只有明确采用才改表单，仍须另行保存。个人体验区与介绍区保持分开 |
| SEO 编辑 | 只有输入框，难以判断 fallback 的最终文案 | 中英文各自展示搜索结果文案预览，复用原 `spotSeo`，说明是否含 fallback；不生成批量 SEO、不改网页原有 SEO 策略 |
| Spot 保存 | 完整表单没有版本条件；写入成功后若 slug/发布失败可再次提交；传输异常也可盲重试 | 完整表单 PATCH 附上载入的 updated_at，以原子条件更新阻止陈旧草稿覆盖；冲突返回 409。成功更新主动推进版本。立即锁住连点；已写入/结果未知时暂停重提并保留草稿、提供已保存记录的新窗口入口。仅明确缺列错误才做兼容重试 |
| 内容内链 | 中英文 Spot 将双方地区 null 误认为匹配；同一 Note 的别名和规范名重复推荐 | 只有真实相同地区或明确 Spot 关联才推荐配套，中英文共用规则；Guide 的 Note 推荐按规范 slug 去重，保留原配置顺序 |
| 配套转化 | 手机实看通用详情首屏没有报价说明、直达方案入口；自定义 WhatsApp 文案可能漏主配套名 | 首屏展示既有 price_display 或查询提示、方案数量与比较锚点；无选项但有行程时直达每日行程。标题可自然换行。自定义询价文案仍携带主配套、所选方案、来源码，无重复追加 |
| 数据库安全 | 本地缺少精确备份表名和实际依赖链 | 提供只读预检 SQL、默认回滚的权限/RLS 草案、兼容性条件、验证和逐项 ACL 回退要求；不执行迁移 |

咖啡馆分类仅用于编辑建议：复用既有 food 分类及名称/标签中的明确 cafe/coffee/咖啡线索，不变更任何已存分类。长度提示阈值为景点 160、住宿 120、餐饮 80、咖啡馆 60 字符；这不是质量合格线。语言与链接检测属于静态启发式，可能有误报，不代表远端链接可用性或事实核验。

按需内容检查若受数据库返回上限影响，未读取的记录标记未检查，不冒充全部已检查。缺列/权限错误保留现有列表并明确提示，不自动降级成大量“缺失”记录。运行中的数据不得用旧快照覆盖。

完整表单版本保护不需要新数据库字段；仍须线上只读确认所有其他写入来源（含批量操作、外部任务）都维护 updated_at，不能宣称覆盖所有外部写入竞争。其他写入者若不推进版本，需另行修复其版本维护方式。

## 检查后保留

- RC1.2 的 SEO fallback、Sitemap、JSON-LD、canonical/hreflang 与未完成翻译 noindex 逻辑保留；本轮不重建。定向用例覆盖既有 Spot 下架/别名路由；本机 Guide/Note/英文 Note HTTP 检查通过。
- 海南既有一主两子选项结构保留；本地合成数据的两个选项、不同价格单位及独立询价均通过。没有迁移或拆分线上资料；实际线上两选项仍待只读核验。
- Tioman 的专用选择器、价格规则和每日内容保留。Batam/海南通用选项继续复用 RC1.2 组件。没有修改价格、费用、供应商、行程或优惠条件。
- Guide/Note 的主体排版、首页、照片管理、后台配套页面不盲目改版。未取得完整浏览器证据的地方不按源码猜测做视觉调整。
- 不重复处理已完善的三个 Spot 和 53 个地图链接，不处理旧内容队列，不运行 Spot 优化任务。

## 浏览器与截图证据

本轮前半段成功运行了本地浏览器并确认 **390×844** 海南手机首屏：无横向溢出，旧版缺报价提示/比较入口；改后可见已有报价说明、方案数量与比较入口，WhatsApp URL 含主配套与子选项。图片与价格均为明确标注的本地样例，不是实际供应商资料。

| 截图 | 路径 |
| --- | --- |
| 海南手机前 | `artifacts/rc1.3/hainan-390-before.jpg` |
| 海南手机后 | `artifacts/rc1.3/hainan-390-after.jpg` |

继续执行后浏览器工具返回 `Local browser use is disabled in Work settings`，未绕过限制。**桌面前后截图、430px、首页/Spot/Guide/Note/配套列表、Batam/Tioman、后台 Spot/配套的完整视觉与交互验收未完成。** 未将 HTTP 或源码分析冒称浏览器验收；原计划的后台样例适配器未实际用于验收，已移除。

截图使用离线字体替身和合成配套，真实中文字体度量、照片加载/裁切、手机触控、键盘/模态框、浮动遮挡、CLS 与真实网络首屏性能仍待验。没有发送 WhatsApp 消息。

## 必要测试与证据

| 项目 | 结果与边界 |
| --- | --- |
| 定向 Node 用例 | **54 个不同用例已分别通过**，涉及 RC1.3、RC1.2、admin-locations、spot-content-network、spot-localization-authoring、guide-attraction-display；没有运行全部 359 项 |
| 初轮问题及恢复 | 初轮 51/54：两项新增测试的模拟返回形状与锁定 SDK 的 maybeSingle 行为不符；一项 loopback 被沙箱拒绝。修正模拟后仅重跑两组 18/18；之后保存版本推进调整仅重跑保存组 8/8。初轮日志保留，未删除失败用例或放宽断言 |
| TypeScript | `typecheck.log`，退出 0，无诊断；最终代码检查完成 |
| 定向 Lint | 改动的业务/测试/开发脚本退出 0，无诊断，`lint.log`；没有重复全站 Lint/构建 |
| 定向 HTTP | **7/7 个场景分别通过**：海南两选项/询价/单位/比较入口，Batam 七选项，Tioman 三选项，配套列表，Guide/Note，英文 Note fallback，本地写请求拒绝。初轮两项受本机旧 fetch 缓存影响，仅清理 `.next-rc13/cache/fetch-cache` 后复核 Batam/Tioman 2/2。`http.json` 保留初轮，`http-package-recheck.json` 是该两项恢复结果 |
| 补充 HTTP 冒烟 | 首页 200；后台两个入口 200 仅表示未登录壳可达；Spot 在本地离线路由环境返回 503/noindex，**不计通过**。`smoke.json`。真实 Spot 路由行为仅有定向隔离用例通过，仍需浏览器/真实环境复核 |
| 保留既有成果 | 初始 5,926 个非密钥文件指纹逐项比对，既有文件未缺失；既有 artifacts、data/public-data、依赖锁文件未变化。包含 RC1/RC1.1/RC1.2 的 172 个重点冻结证据文件；详见 `baseline.json`、`integrity.json` |
| 生产构建/全量审计/打包 | 按用户要求均未运行 |

HTTP 是隔离 Next 开发服务与合成 PostgREST 资料，不等同 Vercel/CDN、多实例、生产数据库或最终报价验收。该本地命令禁用所有写请求并拦截服务端外网，开发输出独立于 RC1.2 `.next`，结束后停止。

## 关键文件

- `app/admin/page.tsx`：按需检查、问题筛选、#ID、选择范围。
- `lib/spot-content-quality.ts`、`components/SpotContentQualityPanel.tsx`：分类与静态分级、对比。
- `components/SpotContentEditor.tsx`：SEO 结果预览；`components/AdminLocationForm.tsx`：接入及安全保存状态。
- `app/api/admin/locations/route.ts`、`lib/admin-locations.ts`：版本条件、冲突和未知写入结果。
- `lib/content-relations.ts`、`app/spot/[slug]/page.tsx`、`components/EnglishRouteAdapter.tsx`：有依据的内容关联与去重。
- `components/TravelPackageDetail.tsx`、`components/PackageOptionsSection.tsx`、`lib/whatsapp.ts`：首屏决策入口与询价上下文。
- `tests/rc1.3.test.ts`、`tests/admin-locations.test.cjs`：内容、关联、询价和条件保存用例。
- `scripts/rc13-local.mjs`、`scripts/verify-rc13-local.mjs`：本轮只读本地验证，依赖 `artifacts/rc1.3/browser-fixture.json` 合成数据；不用于部署。

## 数据库待办与进入下一阶段条件

详见 `docs/rc1.3-database-safety.md`、`docs/rc1.3-database-preflight.sql`、`docs/rc1.3-backup-hardening.proposed.sql`。草案不在迁移目录，目标名单为空且默认 ROLLBACK，未执行、未通过实际 PostgreSQL 验证。

备份表的精确五表名单、函数/view/Cron/外部任务依赖、PUBLIC/anon/authenticated 的表及列 ACL、RLS 策略、service_role 和继承角色均需当前只读连接核实。目录名称模糊搜索只能寻找候选，可能漏掉非 backup/archive 命名的表，不能当作最终名单。保留所有数据，依赖和原始 ACL 未核实禁止执行。

四个 Spot、两个 Note 错误任务与 53 个地图链接的当前发布链路，按最新版本/后续成功/明确跳过理由判断；没有实时记录时保持待验，不自动重试。Spot 优化 Cron 维持停用。

下一阶段适合先完成**剩余本地视觉验收与生产只读核验**。当前不适合部署：需恢复本地浏览器能力、补桌面与全部重点手机页面证据，确认真实图片/字体/交互；核实数据库依赖与同步、外部写入版本维护；等待 Vercel 额度与隔离配置就绪，并获得单独部署授权。届时按发布流程完成一次必要的候选验证，不能拿离线开发服务或 RC1.2 旧构建直接上线。

本轮不再追加全量审计、构建或候选包。
