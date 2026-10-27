# RC1.5 Preview 安全隔离收尾

日期：2026-10-27。基准：`11424cb`，分支：`codex/rc1.5-release-candidate`。本轮仅收紧既有Preview边界，没有RC1.6、新业务功能、Push、部署、生产配置/数据库/存储修改、Cron启用、草稿应用、完整构建或候选包。此前提交和验收证据保留。

## 当前证据与实际风险

用户通过Vercel连接提供的**变量配置元数据**显示：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_GA_MEASUREMENT_ID`有development/preview/production共享范围；R2变量只见development/production。它证明需要检查作用域，不证明实际值相同，也未排除分支、团队共享变量、集成或自定义环境覆盖。本轮没有获取Vercel变量值、密钥或生产数据，也没有把上述元数据升级为“已验证线上泄漏”。

实际源码风险：

- `11424cb`的Spot路由必须用Service Role；公开配套、配套可见性、联盟读取优先选Service Role。Guide/Note、slug-map、价格亮点和Klook配置的公开渲染还可能通过私有Storage读取。即使公开接口只有SELECT，服务器持有正式Service Role仍有越过RLS/误用的风险。
- 既有App/Pages后台API、上传、保存、删除、重发布、预算同步和统计端点已有Preview早退。它们不是“安全隔离数据库”的替代物；任意直接浏览器请求也不受本站API保护，测试Key的数据库权限仍要真正只读。
- 既有GA、Vercel Analytics/Speed Insights和事件helper在Preview关闭，但Klook原始widget代码仍会执行外部脚本；`/api/affiliate-preview`会自动请求联盟URL获取图片，可能造成供应方请求/点击噪声。关闭GA并不能覆盖这些路径。
- `getSiteUrl`原先优先共享`NEXT_PUBLIC_SITE_URL`/`SITE_URL`，可能输出正式站canonical/结构化数据；`robots.ts`仍allow并给出sitemap，且没有全站统一Preview noindex。原有Spot个别noindex不能代表Guide、Note、首页、配套和英文Pages都受保护。

## 本地已完成的修复

| 改动 | 文件与行为 |
| --- | --- |
| 配置拒绝检查 | `scripts/lib/preview-isolation-policy.cjs`由`next.config.mjs`载入。标准Preview必须明确测试项目ref及匹配URL，使用publishable或legacy anon类型Key；拒绝Service Role、R2写凭据、GA ID、预算同步secret、OpenAI Key。诊断只给变量名/规则，不输出值 |
| 匿名公开读 | `lib/server/supabase-read-key.ts`及Spot路由、公开Spot/集合authoritative reader、配套/选项、配套可见性、联盟读取共用规则：Preview只取匿名Key，即使误继承Service Role也不选它；Production原有Key选择不变 |
| 私有源不碰高权限客户端 | Guides/Notes/slug-map/价格亮点/Klook私有Storage factory在Preview返回null，预算管理factory拒绝；已有公开CDN或本地fallback继续使用。不是给anon开放`_system`私有文件 |
| 低层发布再拦截 | R2 `assertR2Env`和localization publisher入口在Preview拒绝，即使误传完整写配置也不构造SDK或写对象。公开HTTP快照读取不依赖R2写凭据 |
| 外部统计噪声 | Klook Preview仅显示禁用占位，不输出原widget代码、不触碰DOM/执行脚本；affiliate-preview早退，不自动访问供应方URL。原生联盟链接仍可被人主动打开，供应方可能计数，Preview验收不得点击正式联盟链接 |
| SEO来源与索引 | Preview的`getSiteUrl`只信精确`VERCEL_URL`，不采用共享正式SITE_URL；`next.config.headers`全路径附加`noindex,nofollow,noarchive`；robots disallow所有且不宣传sitemap。Production规则不变 |

这不是网络防火墙或数据库权限修改。测试ref及独立CDN origin需要管理员核实归属；代码只能校验一致性和拒绝源码中已知正式来源，不能证明任意自定义域名、CNAME或公开Key一定属于测试资源，也不能证明RLS只读。JWT role检查不验证签名或项目归属。

## 必须调整的Vercel设置

以下是**待人工执行**清单，不是已修改状态。不运行`env pull`或导出环境文件，不在日志、聊天、截图、进程参数中显示变量值。Production原变量保持原值及目标；将跨环境共享项拆开配置，检查所有branch-specific覆盖、Team shared变量、Marketplace集成及Custom Environment继承。Vercel文档说明分支专属项优先于通用Preview项，不能只看顶层列表。[官方环境变量文档](https://vercel.com/docs/environment-variables)

| 变量名称 | Production | Preview目标状态 | Development |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 正式项目，保持 | **仅Preview**的独立测试项目URL，不用正式项目或别名 | 独立本地/开发项目，解除正式共享 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 正式public Key，保持 | 与测试URL同项目的publishable/legacy anon Key；不能填secret/service_role | 仅开发public Key |
| `JNQ_PREVIEW_SUPABASE_PROJECT_REF`（新增非密钥配置） | 不需要 | 管理员核实的专用测试项目ref；与URL严格一致；拒绝已知正式ref | 不需要 |
| `SUPABASE_SERVICE_ROLE_KEY` | **只保留Production** | **不设置，取消Preview/候选分支/共享继承**，不以空占位或另一个高权限Key绕过 | 若开发必要也只用独立项目Key，绝不能沿用正式值 |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | **只保留Production** | **不设置**；本轮只读验收不需要测试GA属性 | 不设置或独立非正式属性；不得共享正式统计 |
| `R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` | 正式写凭据保持 | **不设置**。本轮只读Preview甚至不持有测试R2写凭据 | 必要时使用单独开发桶的最小权限凭据 |
| `R2_ACCOUNT_ID`、`R2_BUCKET_NAME` | 保持 | 本轮只读模式可不设置；若留非敏感配置也只能是独立测试桶，不能使其变成可写Preview | 独立开发桶 |
| `PUBLIC_DATA_CDN_BASE_URL` | 保持 | 推荐设置到事先由获准流程准备好的**独立测试快照存储**，保持`public-data/*`结构；不是正式桶的子目录 | 独立开发公开源或本地fallback |
| `R2_PUBLIC_BASE_URL`、`NEXT_PUBLIC_R2_PUBLIC_BASE_URL` | 保持 | 如需则均指向同一独立测试源；不是必须连同R2写凭据一起配置 | 独立开发源 |
| `JNQ_PREVIEW_PUBLIC_DATA_ORIGIN`（新增非密钥配置） | 不需要 | 只要配置以上任一公开快照变量就必须设置，值为管理员核实的独立测试源origin；三个变量的origin必须一致 | 不需要 |
| `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`、`SUPABASE_STORAGE_BUCKET` | 保持 | 只对应测试项目的桶；不依靠同名`location-images`证明隔离。私有`_system`读取已关闭 | 开发项目桶 |
| `NEXT_PUBLIC_SITE_URL`、`SITE_URL` | 正式站，保持 | 推荐**不设置**，让`VERCEL_URL`决定Preview origin；若设置必须是这一次精确deployment origin，不能用正式站或分支alias | 本机origin |
| `VERCEL_ENV`、`VERCEL_URL` | 平台提供 | 平台原生`preview`及精确deployment hostname；不手工伪装为production，不创建自定义“测试环境”规避guard | 平台/本机正常值 |
| `JNQ_BUDGET_SYNC_SECRET`、`OPENAI_API_KEY` | 必要的正式配置保持 | **不设置**；配置检查拒绝，预算同步/AI生成API本来也会Preview早退 | 仅明确授权的开发配置 |
| `ADMIN_EMAILS` | 保持 | 不设置或空；不是主要隔离机制，后台本身已禁用 | 仅开发白名单 |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | 保持 | 地图启用时必须使用独立公开测试token并限制允许域名/用量；源码当前有公开共享token fallback，**缺省不能视为地图已禁用**。若不使用测试地图，须在受控环境阻止地图外联并接受地图未验 | 开发token |

`JNQ_PREVIEW_READ_ONLY`不是管理员开关，由Next配置根据`VERCEL_ENV`编译，不能手动设0放开Preview写入。其他正式凭据、SMTP/邮件服务、支付、Cron、Webhook、队列或外部集成若在Vercel层存在，也不要挂入此Preview；当前源码未发现邮件发送SDK、`functions.invoke`、外部队列投递或Vercel Cron配置，但这不代表云端没有独立任务。

环境修改不会追溯移除**旧部署**持有的凭据。正式开始前还需检查旧Preview的可访问性与保护，必要时由管理员另行批准禁用/删除不安全旧部署；若出现过真实泄漏再走独立轮换程序。本轮未禁用部署、未轮换凭据、未改Production。安全设置完成并获准后必须用新配置重新构建一次Preview，不能直接使用上轮本地`.next`或旧Preview产物。

## 匿名只读测试数据方案

推荐新建独立测试Supabase项目，只准备与公开读取合同相符的最小schema及审定公开样例。不要直接完整复制正式项目：避免同时复制Auth用户、私人Note草稿、历史备份、pg_cron、Edge Functions secrets、Webhook、Database Functions或队列消息。测试项目创建、种子数据写入和任何RLS/GRANT变更属于以后另行授权，本轮没有执行。

Preview使用现有`NEXT_PUBLIC_SUPABASE_ANON_KEY`变量承载测试public Key，不要求Service Role。Supabase官方说明publishable Key受数据库权限/RLS约束，secret/legacy service_role属于高权限服务器凭据；**匿名不等于只读**。[Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys)

需要在测试项目确认：

- 匿名角色仅能SELECT必要公开表/列/公开测试记录；`locations`至少满足路由所需`id,publication_status,redirect_url,redirect_type`，及详情/集合字段，`travel_packages`限published，`travel_package_options`限active。RLS隐藏记录返回不存在，不能为让页面通过而开放所有行。
- `regions`、`affiliate_links`及Guide公开预算需要的SELECT合同按 [候选元数据预检](rc1.5-candidate-db-preflight.sql) 和实际reader核对；无法读取时应修复测试权限或样例，不恢复Service Role。
- anon/authenticated不具备不需要的INSERT/UPDATE/DELETE、Storage写/删除和危险RPC执行权限；核对views是否绕过RLS、`SECURITY DEFINER`函数以及Auth注册/邮件设置。当前只读Preview不登录，不以管理员token验证公开路径。
- Guide、Note、slug-map、英文overlay和公开预算优先从独立的**公开测试快照**读取；私有`_system`集合不授予anon。已禁用私有reader的价格亮点/Klook/slug-map可能采用bundled fallback，需明确版本差异，不能用fallback通过来证明测试数据完整。
- 照片URL、视频、原生联盟URL、WhatsApp目标也需要使用已批准的测试样例。现有bundled JSON仍可能包含正式公开图片URL与供应方链接；缺省布局fallback不是“零生产网络”。若要求完全不触达正式素材，应事先将测试快照所有素材改到独立测试桶或本地资源，并用获准的网络策略约束；本轮没有批量改内容或下载素材。

## R2未配置会怎样

| 情况 | 实际行为 | 验收含义 |
| --- | --- | --- |
| R2写凭据、account/bucket全部未设置，公开测试CDN也未设置 | 不在配置检查中要求R2；Guide/Note/i18n/地区等有本地bundled读fallback，部分功能为旧快照；私有Storage不再读取 | 可做局部布局检查；不是当前线上内容通过 |
| 只有独立公开测试CDN配置，没有R2写Key | HTTP读取公开`public-data/*`，不创建S3 writer；可用于只读完整内容验收 | 推荐路径，测试源必须可用/字段完整；不需要R2写权限 |
| 配置了公开CDN但错误/超时 | RC1.4保留的错误源保护仍生效；部分页面会失败而不偷偷用旧集合，具体源返回/ISR行为仍需Preview核验 | 属于测试源配置问题，不能用“HTTP200旧快照”掩盖 |
| 有正式/未核实公开CDN，或URL与批准测试origin不同 | 配置检查拒绝 | 先修设置，不部署 |
| 任意R2写Key被Preview继承 | 配置检查拒绝；低层R2/翻译发布入口也拒绝 | 不允许靠上传功能成功来验收 |
| Spot/配套所需测试DB URL/public Key/ref缺少或不匹配 | 配置检查拒绝；匿名RLS/列不符时路由503/404或集合为空 | R2缺少不是这里的根因；必须测试读合同及实际数量 |

当前`next.config`对图片仍允许源码既有的公共主机；公开图片GET不会得到R2写Key，但可能消耗正式流量。部署前素材替换/限网是独立检查，不能把新origin字段当作防火墙。

独立测试图片域名还必须匹配现有Next Image白名单：使用R2测试公开主机时，应把`R2_PUBLIC_BASE_URL`或`NEXT_PUBLIC_R2_PUBLIC_BASE_URL`设为相同测试源，供既有remotePatterns生成测试host。只配`PUBLIC_DATA_CDN_BASE_URL`并不自动允许任意图片主机。核对图片响应而不只看JSON能否读取。

## Cron、队列、邮件与发布边界

- `vercel.json`只有framework配置，`package.json`的build只是`next build`，源码没有本轮自动启动Cron/邮件/队列任务的配置。维护/迁移/优化脚本不纳入Preview的Install/Build/Postbuild命令；Vercel项目层覆盖命令须人工确认，不能运行npm维护脚本作为构建步骤。
- App后台及Pages后台、R2上传、图片删除、批量发布、signed revalidate、AI草稿、预算同步由已有Preview早退保护。测试遍历实际handler，确保误继承凭据时也在SDK/文件/发布调用之前返回。公开统计API回`skipped:true`，不写page_views/affiliate_clicks。
- Supabase Cron/Edge Functions、外部MoneyBot、生产同步队列可能独立运行；网站Preview不会停止这些任务。要核对**测试项目**没有正式Webhook/计划任务/队列/邮件配置，也不得将外部任务目标改为Preview。本轮不重跑四个Spot/两个Note历史失败、不清错、不启用停用Spot优化Cron。
- Klook自动脚本和联盟metadata预取已关闭；主动打开WhatsApp/联盟链接仍可能触达真实系统，验收只看安全参数或测试链接，不发送真实信息，不访问正式联盟计数URL。Mapbox、视频服务也有独立请求/用量，不把“本站统计关闭”说成“没有任何第三方请求”。

## 如何证明没有生产写权限

1. 管理员在Vercel界面只确认变量名、target、branch、自定义环境/共享继承关系，不Reveal/导出值。确认本候选Preview没有Service Role、secret、R2写Key或同步/AI凭据；确认公开URL和非秘密测试ref对应独立项目，正式变量保持Production-only。
2. 使用已授权的**只读元数据查询**核对测试项目table grants、RLS/policies、views、RPC EXECUTE及Storage权限；核对public Key类型和所属项目。不能通过向生产表试INSERT来证明“应该失败”，本轮也不向测试库试写。
3. 配置检查在Next配置载入时拒绝不安全组合，且异常只出现变量名；确认没有通过Custom Environment或手工VERCEL_ENV绕过。此检查结果不替代数据库授权证据。
4. 获准的Preview上线后，在受保护的deployment URL验证全部mutation/AI/同步端点被拒绝；统计返回skipped，网络面板没有GA/Insights/Klook脚本或联盟metadata外发。只读页的Supabase请求只指测试项目；内部保护头不被转发到正式站或第三方。
5. 使用Vercel/Supabase测试项目日志确认仅预期GET/SELECT和缓存读取；不要把完整Authorization、cookie、URL查询参数或用户数据收集到验收包。Production日志/审计若有已授权的只读查看，可核对没有相关写入，但“没看到日志”本身不证明绝无权限。

## 正式开始Preview前最小清单

- [ ] Vercel额度可用，明确批准本候选Push和一次受控Preview；Production未授权。
- [ ] 完成上表作用域调整与branch/team/integration覆盖检查；独立测试Supabase ref已核实，Preview高权限凭据为空缺。
- [ ] 测试anon SELECT/RLS、无写/危险RPC权限已有只读元数据证据；公开快照/素材位于独立测试存储并可读，配套数量及状态正确。
- [ ] 使用精确deployment origin，SITE_URL不指正式站；全站响应noindex、robots disallow，访问保护保留。Canonical/英文hreflang/结构化数据检查指向Preview而不把它当正式站。
- [ ] 既有后台/发布/同步/统计保护生效，GA/Insights/Klook/affiliate预取不外发；没有生产任务、邮件或队列目标挂到测试项目。
- [ ] 用新Preview配置做一次构建，核对Spot→Guide/Note/相关配套→WhatsApp参数及真实图片字体；无匿名RLS引发的空配套缓存/错误404。18份草稿不应用。
- [ ] 记录候选commit、Preview deployment ID、真实稳定Production回退ID和未验项；旧不安全Preview访问性有明确处理结论。不自动promote，不把Preview检查当Production批准。

## 本轮验证与状态

新增隔离定向测试9/9，受影响源码Lint及TypeScript通过。测试只使用合成配置/SDK mocks，覆盖实际App/Pages后台handler、公开读Key选择、继承凭据早退、R2/翻译发布、外部脚本及SEO配置。没有运行旧359/54项、完整生产构建、部署或数据库查询；旧候选通过结果作为历史证据保留，不冒充新Preview实测。

本地证据在`artifacts/rc1.5-preview-isolation/`。当前判定：**先完成云端隔离设置与测试角色只读核验，才可请求执行Preview。** 用户提供的当前共享范围若仍生效，新配置检查会有意拒绝启动；这属于安全阻断，不能用恢复正式Service Role绕过。
