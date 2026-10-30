# 48 个 noindex Spot：规则溯源、内容审核与候选修复

核验日期：2026-10-30，新加坡时间。开发基准 `a2217ea`，继承 `845b469`。未 Push、部署、读取生产密钥或写入生产数据；未重跑性能测试、全站构建或历史审计。仅检查本轮 48 项、对应生产源码和必要调用链。所有内容修改均是独立草稿，未写入应用内容文件或数据库。

## 结论与更正

**48 项目前均应保留 noindex，无立即解除项。不需要为了 Active 总数把 Sitemap 强制扩到 582。** 生产有明确的内容质量资格函数，48 项的公开 API 返回值与该函数逐一复算全部一致。介绍短与缺中文 SEO Title 相关，但 SEO Title 不在实际资格条件里；不是缺 Title 直接造成 noindex。

上一轮仅凭本地生成器覆盖 582 ID，提出“582 全部解除 noindex”的验收目标不充分，本报告撤回该目标。`a2217ea` 的规范 URL 修复仍然有效并保留。本轮确认的真实代码问题是：当前本地候选丢失了实际生产已经使用的质量门槛及 Sitemap 的英文旁路保护；恢复原有政策，不另创 SEO 系统、不放宽阈值。

## 生产来源及具体触发路径

Vercel 只读 `get_deployment(www.jnqjourney.com, withGitRepoInfo=true)` 返回当前 alias 指向：

- Production deployment：`dpl_D5gGquUGKSKwo17wBUFP8XXVAdUE`，READY，source=git。
- Git commit：`85d47509ae25fa622f3c246afc555cd19849b549`，main。
- 从 GitHub 按该确切提交读取以下公开项目源码，未依赖本地过时的 origin/main，也未访问环境变量或云端配置密钥。

| 生产文件 | 实际作用 |
| --- | --- |
| [lib/spot-quality.ts](https://github.com/jaydenyap28/jnqjourney/blob/85d47509ae25fa622f3c246afc555cd19849b549/lib/spot-quality.ts) | `evaluateSpotQuality()` 输出 indexable，score 仅为诊断值，不是“满6分放行” |
| [app/spot/[slug]/page.tsx](https://github.com/jaydenyap28/jnqjourney/blob/85d47509ae25fa622f3c246afc555cd19849b549/app/spot/%5Bslug%5D/page.tsx) | 质量不通过时 Meta robots/googlebot 为 noindex, follow |
| [详情 API](https://github.com/jaydenyap28/jnqjourney/blob/85d47509ae25fa622f3c246afc555cd19849b549/app/api/spots/%5Bslug%5D/route.ts) | 相同函数输出 `X-JNQ-SEO-Indexable: 0/1` 及质量分数 |
| [middleware.ts](https://github.com/jaydenyap28/jnqjourney/blob/85d47509ae25fa622f3c246afc555cd19849b549/middleware.ts) | 根据详情 API 的 0 添加 HTTP `X-Robots-Tag: noindex, follow` |
| [lib/server/public-location-data.ts](https://github.com/jaydenyap28/jnqjourney/blob/85d47509ae25fa622f3c246afc555cd19849b549/lib/server/public-location-data.ts) | Sitemap 查询 active，再过滤 published/null 与相同质量函数 |
| [app/sitemap.ts](https://github.com/jaydenyap28/jnqjourney/blob/85d47509ae25fa622f3c246afc555cd19849b549/app/sitemap.ts) | 禁止完成英文翻译的记录把被排除的 Spot 重新加入任一语言 |

以上相关源码的只读副本位于 `production-source/`。恢复到 `lib/spot-quality.ts` 的内容与部署版本逐字相同（忽略 CRLF/LF）；`build-review.cjs` 有一致性断言。

### 既有资格规则：五条满足任意一条

正文长度 D = 去 HTML、折叠空白后 description/review 的较大长度；E = experience_zh 同样清理后的长度；M = 封面与 images 中唯一 URL 数。V = 有 visit_date；P = address/opening_hours/price_info 任一非空；视频与 Note 也仅检查字段非空。

| 分支 | 条件 |
| --- | --- |
| 较完整体验 | E≥120、M≥2、V |
| 较完整正文 | D≥300、M≥2、V、P，且有视频或 M≥4 |
| 紧凑正文 | D≥220、M≥4、V、有视频、P |
| 已编辑体验 | D≥180、E≥60、M≥2 |
| Note 支持 | 有关联 Note、D≥180、M≥2 |

**没有检查中文 SEO Title，没有统一“少于300必定不收录”的规则，也没有按 score 简单切线。** `lib/spot-content-quality.ts` 是后台编辑建议（分类字数提醒、SEO fallback 提醒等），不能与这个布尔索引门槛混为一谈。本轮没有把它的低字数建议升级为禁止索引。

## 四种状态分开记录

| 状态 | 判定含义 | 这48项当前结果 |
| --- | --- | --- |
| Active | 数据库业务 status=active；并不判断内容质量 | 全部 active，依据用户最新 Supabase 只读核验。本轮没有重复查数据库 |
| 可公开访问 | 既有发布与重定向规则允许，详情存在，正式页面正常响应 | 全部可以；上一轮规范页200、自指Canonical；本轮公开详情 API 48/48为200 |
| 允许索引 | 公开页面通过既有内容门槛，并满足健康数据来源、语言等技术条件 | 全部不允许；本轮函数复算 false 与生产资格头0、分数48/48一致 |
| Sitemap 资格 | active、published/null、质量通过，并使用规范URL；英文还需翻译完整，不允许别名/故障/低质量旁路 | 这48项目前全部不符合 |

48 项公开详情中的 publication_status 均为 null：这是既有规则允许公开的旧记录，不等于 draft/hidden，也不自动等于可索引。实际读取/门槛路径中未发现为这些记录单设的显式 `noindex` 字段或 ID 黑名单。线上明确的 noindex 是质量函数计算后的输出；若未来存在不经过这些路径的外部 SEO 人工指令，应另据证据处理，不能由本轮推断其不存在。

## 48 项复算结果

公开详情请求时间：2026-10-30 **12:48:46–12:48:53**（新加坡时间），数据来源响应头均为 supabase；部分请求命中现有缓存，时间与缓存头保留在 `public-capture.json`。这些是公开 API 结果，不冒充逐行新数据库查询。原始介绍均值205.75字符，与用户约205相符；生产函数清理后均值202.85。46项原文小于300，46项缺中文SEO Title，均与用户线索一致。原文352为300字符，清理后293，因此统计口径必须注明。

所有记录 E=0、没有关联 Note，故体验/Note 三条分支都不成立。它们虽然都有访问日期、视频和实用字段，但这些字段非空不保证内容事实已核实。

| 组别 | ID或数量 | 未通过条件 |
| --- | --- | --- |
| D≥300 | 221，D=504 | M=1，五条分支均要求至少2项媒体；增加SEO Title或扩写无助于解决 |
| D<180 | 346、351、365、546、604、639 | 正文不足其他正文分支起点，也没有体验/Note支撑 |
| 180≤D<220 | 39项 | 不满足紧凑正文220/较完整正文300；没有体验/Note支撑 |
| 220≤D<300 | 352（293、M=3）、483（222、M=3） | 紧凑正文需要M≥4；没有体验/Note支撑 |

完整逐项姓名、Canonical、字段数、门槛原因、优先级和下一步见 **[CHECKLIST.zh-CN.md](CHECKLIST.zh-CN.md)**；每个分支具体缺什么见 `review-checklist.json`。不得复制、裁切同一照片或填写虚假体验/关联Note来凑阈值。函数把URL数视作媒体数，本轮未改变该已部署规则，也不把URL数当成逐图人工验收。

### 应解除与应保留

- **立即解除：0项。** 没有在现有内容下被程序错误判成false的证据。
- **优先编辑后再评估：480故宫、357浅草寺、375森之时计。** 已读官方资料，有具体新增事实和现有媒体可利用。生成描述追加及SEO草稿，未生成个人体验。三项仍为noindex，模拟通过不等于批准。
- **其余45项：继续noindex，按清单补证或决定保持短记录。** 高价值候选和身份不清项分别列出，不能把所有页面都当成必须扩写的内容债务。346地区/坐标与地址冲突，546泛地址，639正文已明确门店资料不足，589老访问与夜市时效、566房型体验主张等，均优先核实而非解除。

三项草稿见 **[DRAFTS.zh-CN.md](DRAFTS.zh-CN.md)** 与 `content-drafts.json`，含旧 description SHA256、已读来源、需要人工复核的原有主张。官方来源包括 [故宫导览](https://www.dpm.org.cn/Visit.html)、[浅草寺雷门](https://www.senso-ji.jp/guide/guide01.html)/[本堂](https://www.senso-ji.jp/guide/guide04.html)、[新富良野王子酒店店铺页](https://www.princehotels.co.jp/shinfurano/restaurant/morinotokei/)。没有自动导入命令，也没有修改任何真实内容记录。

## 必要代码修复与定向验证

1. 从确切生产版本恢复 `lib/spot-quality.ts` 原函数，阈值、分数、文本清理与五条分支完全不变。
2. Spot Metadata、详情API、既有routing GET 使用相同门槛；保留新候选 middleware 的一次请求方案、无缓存权威可见性判断、fallback noindex、英文完整性与 Preview 隔离。没有恢复生产旧middleware的第二次整份详情请求。
3. Sitemap reader 恢复一次 active 品质字段清单查询，使用既有 Preview 安全 key helper；保留 `a2217ea` 的 slug 与显式别名优先。没有逐Spot请求，没有将卡片摘要当完整介绍。没有新表、新服务或缓存结构。
4. 品质清单请求失败时抛错，不用未知质量下的582、旧547或空结果假装成功生成 Sitemap；现有 Next 再验证可处理生成失败。定向测试验证抛错，不冒称已验收真实生产 ISR 保留/恢复。
5. 恢复英文完成翻译不能重新加入被质量门槛排除的源Spot的保护。

验证：

- `node --test tests/spot-index-eligibility.test.cjs tests/sitemap-spot-identity.test.cjs`：**8/8通过**。覆盖五条分支、边界、SEO Title无关、薄/合格/fallback在Metadata/API/routing/middleware一致、单次清单查询、draft/hidden排除、错误抛出、英文不旁路、a2217ea别名/slug回归、582个合格合成记录不被首页分页截断。
- `node artifacts/spot-index-review/build-review.cjs`：48/48生产分数与资格复算匹配，3项草稿可审阅，恢复函数与部署源码一致。
- 修改应用文件 ESLint：通过。
- `npx tsc --noEmit --incremental false`：通过。
- 无全站构建、性能重测、Fixture故障恢复冒充生产验收。测试合格合成582项只是无硬截断回归，不是要求真实582项收录。

## 正确的发布后验收规则

**当前数据及政策未变时，预期中文 Spot Sitemap 维持534个，而不是582个。** 本轮没有重新全量核验其余534详情；534基于现有线上Sitemap证据及用户总数，本轮专项确认48应排除。不能把“534”硬编码为永久门槛，更不能仅比较数量不比较资格与URL。

部署后应核对：中文Spot集合 = 当次 active ∩ 可公开发布 ∩ 通过原有质量函数的记录，URL为实际Canonical且不重复、不含别名/故障页；本次48在内容未批准更新前全部继续noindex并排除。API、HTML与HTTP资格输出须一致；英文不得把它们重新加入，Preview全站noindex保持。

若将来三项草稿被人工批准、经原有发布流程更新且其他数据不变，旧函数模拟显示可以新增3项，届时数量可能为537；这只是有条件的规划值，**本轮没有发布它们，不应现在期待537，更不应无条件期待582**。真正发布后还需核对事实、完整内容快照和正式响应，不能以字符达标代替编辑审核。

2026-08-09的547回退快照风险仍按上一轮单独记录，本轮未覆盖冻结产物；它也不能用来决定内容索引资格。完成本轮本地提交后停止，不自动开展下一轮内容发布、快照更新或新版本。
