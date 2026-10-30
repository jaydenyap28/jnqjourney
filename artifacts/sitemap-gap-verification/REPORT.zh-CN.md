# Sitemap 534 / 582 定向核验与必要修复

公开 HTTP 核验时间：2026-10-30 11:58–12:01（新加坡时间）。开发基准 845b469。仅公开 HTTP GET 与本地代码检查；没有读取生产密钥、写生产数据、Push、部署、性能测量或全站构建。

## 结论

需要一项局部代码修复：当前候选按双语展示名称重新生成 Sitemap slug，会产生与详情 Canonical 不同的 URL。ID 覆盖 582 不等于 582 个规范 URL。已改为：显式编辑别名优先，其次合法且 ID 匹配的公开快照 slug，最后沿用名称回退。没有改动发布状态或索引政策，也没有覆盖冻结快照。

线上 48 项缺口另有明确现象：48/48 均可公开访问，规范页 HTTP 200、H1 一处、Canonical 自指，但 Meta robots、googlebot 及 X-Robots-Tag 均为 noindex, follow。公开详情 API 845 还返回 X-JNQ-SEO-Indexable: 0；Sitemap 内的对照项 851 为 index, follow。因此当前 Active 582 与线上可索引数量不是相同口径。不能把这 48 项作为单纯漏写 XML 而强行补进当前线上 Sitemap。

## 根因归类

- 数据源缺项：排除。公开 API、CDN 索引均为同一批 582；48 项详情 JSON 均 200，live routing 均 visible:true。CDN 详情 publication_status 均为 null，按候选既有规则属于允许发布的旧记录；未把 null 猜成逐行数据库发布状态。用户提供 Active 统计，本轮不访问数据库。
- 当前线上产物与候选不一致：已确认输出契约不同。线上 buildId=xURAbZQf_u1CwbdrjfnVl；详情页/接口没有候选新增的内容版本标记；线上详情 API 索引头为 0，候选路由使用 true/false；线上 Sitemap 含 lastmod、/disclaimer 和 /packages/hainan，与候选生成规则不同。可判定差异位于线上部署产物及其 SEO 资格/ISR 输出，不能归咎于 845 的 12 项卡片限制。没有读取云端部署记录，故不声称知道线上确切 Git SHA 或旧规则为何选择这些记录。
- 缓存：Sitemap HIT、age=1300；多项规范页 STALE。845/604 再次公开 GET（附查询参数与请求 no-cache）仍 noindex，age 已约 48/116 秒。说明单靠等待一份旧缓存过期没有足够证据能解决；本轮没有绕过所有平台缓存，也没有 purge 或修改缓存策略。旧部署与缓存的精确责任比例尚未确认。
- 当前候选真实缺陷：不是遗漏 ID，而是 URL 身份。当前 582 项中有 110 项在无显式别名时，展示名称拼接结果不同于已有快照 slug；缺失 48 项中直接涉及 221、337。例如 221 旧候选生成 old-cruise-ship-jetty-kijal-old-cruise-ship-jetty-kijal-221。此缺陷已定向修复，不将 110 项都冒称为已实际抓取验证的生产故障。

## 48 项逐项结果

以下规范 URL 均实际 GET，200、H1=1、Canonical 自指；HTTP 与 HTML 都 noindex, follow。公开资格依据为当前 Active 公共集合、公开详情存在及 live routing visible:true。可公开访问与当前可索引资格分开记录。15 个列表旧 slug 返回 streamed 200 跳转指令，另请求其规范页后得到下表结果；没有将这些旧别名当规范页通过。

| ID | 名称 | 规范 URL | HTTP | 当前 noindex | 公开资格 |
| --- | --- | --- | --- | --- | --- |
| 221 | Old Cruise Ship Jetty Kijal 旧码头 / Old Cruise Ship Jetty Kijal | [/spot/old-cruise-ship-jetty-kijal-221](https://www.jnqjourney.com/spot/old-cruise-ship-jetty-kijal-221) | 200 | 是 | 允许旧记录 null；visible:true |
| 336 | 八音盒博物馆 / Otaru Music Box Museum | [/spot/otaru-music-box-museum-336](https://www.jnqjourney.com/spot/otaru-music-box-museum-336) | 200 | 是 | 允许旧记录 null；visible:true |
| 337 | LeTao小樽洋菓子铺 / LeTAO Pathos | [/spot/letao-pathos-337](https://www.jnqjourney.com/spot/letao-pathos-337) | 200 | 是 | 允许旧记录 null；visible:true |
| 340 | 幸运小丑汉堡 / Lucky Pierrot | [/spot/lucky-pierrot-340](https://www.jnqjourney.com/spot/lucky-pierrot-340) | 200 | 是 | 允许旧记录 null；visible:true |
| 342 | 金森红砖仓库 / Kanemori Red Brick Warehouse | [/spot/kanemori-red-brick-warehouse-342](https://www.jnqjourney.com/spot/kanemori-red-brick-warehouse-342) | 200 | 是 | 允许旧记录 null；visible:true |
| 343 | 函馆山夜景 / Mount Hakodate Night View | [/spot/mount-hakodate-night-view-343](https://www.jnqjourney.com/spot/mount-hakodate-night-view-343) | 200 | 是 | 允许旧记录 null；visible:true |
| 344 | 金森神社 / Kanemori Shrine | [/spot/kanemori-shrine-344](https://www.jnqjourney.com/spot/kanemori-shrine-344) | 200 | 是 | 允许旧记录 null；visible:true |
| 346 | 白银瀑布 / Shirogane Falls | [/spot/shirogane-falls-346](https://www.jnqjourney.com/spot/shirogane-falls-346) | 200 | 是 | 允许旧记录 null；visible:true |
| 347 | 银山温泉街 / Ginzan Onsen Street | [/spot/ginzan-onsen-street-347](https://www.jnqjourney.com/spot/ginzan-onsen-street-347) | 200 | 是 | 允许旧记录 null；visible:true |
| 351 | 道产子ぷりん / Dosanko Pudding | [/spot/dosanko-pudding-351](https://www.jnqjourney.com/spot/dosanko-pudding-351) | 200 | 是 | 允许旧记录 null；visible:true |
| 352 | 阎魔殿 / Enma-do | [/spot/enma-do-352](https://www.jnqjourney.com/spot/enma-do-352) | 200 | 是 | 允许旧记录 null；visible:true |
| 353 | 汤泽神社 / Yuzawa Shrine | [/spot/yuzawa-shrine-353](https://www.jnqjourney.com/spot/yuzawa-shrine-353) | 200 | 是 | 允许旧记录 null；visible:true |
| 357 | 浅草寺 / Senso-ji Temple | [/spot/senso-ji-temple-357](https://www.jnqjourney.com/spot/senso-ji-temple-357) | 200 | 是 | 允许旧记录 null；visible:true |
| 358 | 雷一茶 / Kaminari-Issa | [/spot/kaminari-issa-358](https://www.jnqjourney.com/spot/kaminari-issa-358) | 200 | 是 | 允许旧记录 null；visible:true |
| 364 | 新仓山浅间公园 / Arakurayama Sengen Park | [/spot/arakurayama-sengen-park-364](https://www.jnqjourney.com/spot/arakurayama-sengen-park-364) | 200 | 是 | 允许旧记录 null；visible:true |
| 365 | 金鸟居 / Kanadorii | [/spot/kanadorii-365](https://www.jnqjourney.com/spot/kanadorii-365) | 200 | 是 | 允许旧记录 null；visible:true |
| 367 | 山中湖平野の浜 / Hirano no Hama | [/spot/hirano-no-hama-367](https://www.jnqjourney.com/spot/hirano-no-hama-367) | 200 | 是 | 允许旧记录 null；visible:true |
| 369 | 藏王温泉街 / Zao Onsen Street | [/spot/zao-onsen-street-369](https://www.jnqjourney.com/spot/zao-onsen-street-369) | 200 | 是 | 允许旧记录 null；visible:true |
| 374 | 精灵露台 / 精灵露台（Ningle Terrace） | [/spot/ningle-terrace-374](https://www.jnqjourney.com/spot/ningle-terrace-374) | 200 | 是 | 允许旧记录 null；visible:true |
| 375 | 珈琲 森の時計 | [/spot/mori-no-tokei-cafe-375](https://www.jnqjourney.com/spot/mori-no-tokei-cafe-375) | 200 | 是 | 允许旧记录 null；visible:true |
| 376 | 白须瀑布 | [/spot/shirhige-waterfall-376](https://www.jnqjourney.com/spot/shirhige-waterfall-376) | 200 | 是 | 允许旧记录 null；visible:true |
| 377 | 伝説のすた丼屋 札幌駅前店 / Densetsu no Sutadonya Sapporo Ekimae | [/spot/densetsu-no-sutadonya-sapporo-ekimae-377](https://www.jnqjourney.com/spot/densetsu-no-sutadonya-sapporo-ekimae-377) | 200 | 是 | 允许旧记录 null；visible:true |
| 379 | 美瑛神社 / Biei Shrine | [/spot/biei-shrine-379](https://www.jnqjourney.com/spot/biei-shrine-379) | 200 | 是 | 允许旧记录 null；visible:true |
| 387 | Flexstay Inn Hakodate Station | [/spot/flexstay-inn-hakodate-station-387](https://www.jnqjourney.com/spot/flexstay-inn-hakodate-station-387) | 200 | 是 | 允许旧记录 null；visible:true |
| 389 | 歌舞伎町 / Kabukicho | [/spot/kabukicho-389](https://www.jnqjourney.com/spot/kabukicho-389) | 200 | 是 | 允许旧记录 null；visible:true |
| 410 | 薄野 / Susukino | [/spot/susukino-410](https://www.jnqjourney.com/spot/susukino-410) | 200 | 是 | 允许旧记录 null；visible:true |
| 411 | 札幌时计台 / Sapporo Clock Tower | [/spot/sapporo-clock-tower-411](https://www.jnqjourney.com/spot/sapporo-clock-tower-411) | 200 | 是 | 允许旧记录 null；visible:true |
| 412 | 湯けむり食堂しろがね / Yukemuri Shokudo Shirogane | [/spot/yukemuri-shokudo-shirogane-412](https://www.jnqjourney.com/spot/yukemuri-shokudo-shirogane-412) | 200 | 是 | 允许旧记录 null；visible:true |
| 413 | 和乐足汤 / Warashiyu Footbath | [/spot/warashiyu-footbath-413](https://www.jnqjourney.com/spot/warashiyu-footbath-413) | 200 | 是 | 允许旧记录 null；visible:true |
| 478 | 前门大街 | [/spot/qianmen-street-beijing-478](https://www.jnqjourney.com/spot/qianmen-street-beijing-478) | 200 | 是 | 允许旧记录 null；visible:true |
| 480 | 故宫博物院 | [/spot/forbidden-city-beijing-480](https://www.jnqjourney.com/spot/forbidden-city-beijing-480) | 200 | 是 | 允许旧记录 null；visible:true |
| 481 | 烟袋斜街 | [/spot/yan-dai-xie-jie-beijing-481](https://www.jnqjourney.com/spot/yan-dai-xie-jie-beijing-481) | 200 | 是 | 允许旧记录 null；visible:true |
| 483 | 中央广播电视总台光华路办公区（央视总部大楼） | [/spot/zhong-guo-zhong-yang-dian-483](https://www.jnqjourney.com/spot/zhong-guo-zhong-yang-dian-483) | 200 | 是 | 允许旧记录 null；visible:true |
| 546 | 卓睿大酒店 | [/spot/zhuo-rui-da-jiu-dian-dali-hotel-546](https://www.jnqjourney.com/spot/zhuo-rui-da-jiu-dian-dali-hotel-546) | 200 | 是 | 允许旧记录 null；visible:true |
| 566 | 香格里拉爱慕唯色藏风客栈 | [/spot/ai-mu-wei-se-ke-shangri-la-hotel-566](https://www.jnqjourney.com/spot/ai-mu-wei-se-ke-shangri-la-hotel-566) | 200 | 是 | 允许旧记录 null；visible:true |
| 569 | 龟山公园 | [/spot/gui-shan-gong-yuan-shangri-la-569](https://www.jnqjourney.com/spot/gui-shan-gong-yuan-shangri-la-569) | 200 | 是 | 允许旧记录 null；visible:true |
| 589 | Jodd Fairs | [/spot/jodd-fairs-589](https://www.jnqjourney.com/spot/jodd-fairs-589) | 200 | 是 | 允许旧记录 null；visible:true |
| 590 | 考山路 | [/spot/khao-san-road-590](https://www.jnqjourney.com/spot/khao-san-road-590) | 200 | 是 | 允许旧记录 null；visible:true |
| 591 | 邢泰记 | [/spot/xing-tai-ji-591](https://www.jnqjourney.com/spot/xing-tai-ji-591) | 200 | 是 | 允许旧记录 null；visible:true |
| 599 | Kai Bae View Point | [/spot/kai-bae-view-point-599](https://www.jnqjourney.com/spot/kai-bae-view-point-599) | 200 | 是 | 允许旧记录 null；visible:true |
| 600 | Kai Bae Beach | [/spot/kai-bae-beach-600](https://www.jnqjourney.com/spot/kai-bae-beach-600) | 200 | 是 | 允许旧记录 null；visible:true |
| 602 | 白沙滩 / 白沙滩（White Sand Beach） | [/spot/white-sand-beach-602](https://www.jnqjourney.com/spot/white-sand-beach-602) | 200 | 是 | 允许旧记录 null；visible:true |
| 603 | Naga Residence | [/spot/naga-residence-603](https://www.jnqjourney.com/spot/naga-residence-603) | 200 | 是 | 允许旧记录 null；visible:true |
| 604 | Fire Tiger by Seoulcial Club | [/spot/fire-tiger-by-seoulcial-club-604](https://www.jnqjourney.com/spot/fire-tiger-by-seoulcial-club-604) | 200 | 是 | 允许旧记录 null；visible:true |
| 639 | 易佳韩食馆 | [/spot/yi-jia-korean-restaurant-639](https://www.jnqjourney.com/spot/yi-jia-korean-restaurant-639) | 200 | 是 | 允许旧记录 null；visible:true |
| 805 | 阿卜糖水铺 | [/spot/abu-dessert-shop-805](https://www.jnqjourney.com/spot/abu-dessert-shop-805) | 200 | 是 | 允许旧记录 null；visible:true |
| 844 | 鱼乐手工坊 | [/spot/yule-handicraft-workshop-844](https://www.jnqjourney.com/spot/yule-handicraft-workshop-844) | 200 | 是 | 允许旧记录 null；visible:true |
| 845 | 碧山书局 | [/spot/bishan-bookstore-845](https://www.jnqjourney.com/spot/bishan-bookstore-845) | 200 | 是 | 允许旧记录 null；visible:true |


## 修复与定向验证

- app/sitemap.ts：复用公开 slug，不再把双语展示字符串当 URL 身份；合法 ID 校验与显式别名优先。
- lib/server/public-location-data.ts：Sitemap 投影保留 slug。
- tests/sitemap-spot-identity.test.cjs：4/4 通过，覆盖双语重复、编辑别名优先、缺失/非法/错 ID 回退、582 项独立于首屏分页。
- 本地实际中文生成器 + 公开 582 副本 + 无需密钥读取的公开别名表：582 个唯一 Spot URL；本次 48 项均与其实际线上 Canonical 一致。实际当前 routing GET、middleware、generateMetadata 的离线调用对 48 项不再给出 noindex。数据读取与 live visibility 使用捕获替身；英文集合为空/alternate reader 使用替身，不能当真实 Preview、完整英文 Sitemap 或生产验收。
- 修改文件 ESLint：通过；npx tsc --noEmit --incremental false：通过。未重跑性能、历史回归、故障恢复 HTTP 或全站构建。

## 547 项故障回退风险与安全更新方案

当前 resolver 顺序是 CDN → Supabase → 本地快照。CDN 正常时 582，不会因 Supabase 单独故障退到 547。两者均不可用时，实际纯 resolver 合约检查返回 static-fallback 547：相对当前 Active 集合缺 36 项（808–839 不含 831、844、845、849、850、851），还含已撤下的 450。列表数量净少 35；不是少 39。详情索引同样旧，较新景点不在本地明细集。

这会使新生成的首页/地区/搜索集合遗漏景点；但不能声称所有故障中的线上 Sitemap 一定恰好变成 547：Next ISR 可能保留旧成功产物，而 Sitemap 的英文集合读取在配置 CDN 且服务失败时会抛错；访客详情还有 live gate，权威路由服务失败会先给 503/noindex，而非允许旧快照复活已隐藏条目。静态集合本身没有新鲜度检查，可能被缓存至后续刷新。

必要安全方案（只提出，未执行）：在独立的、带日期/来源/哈希清单的候选快照目录生成一整套只读公共数据副本：locations、regions、spots/index、全部完整详情 JSON、别名身份表；先验证 582 ID 集一致、36 新项有完整详情、450 不在公开索引、Canonical 一致，再通过单独的数据维护变更切换回退集合。保留现有 2026-08-09 冻结包及回滚副本。不要运行轻量卡片→完整详情的替代生成来填空，不覆盖图片、封面或顺序，不上传 R2。若无权威状态证据，不把旧快照当作可重新发布的依据。

## 部署后验收条件

1. Production 公共集合未变时，中文 /spot/ Sitemap 必须为 **582 个唯一 Active Spot ID、582 个规范 URL**，与 API/CDN/index 集合双向差集为空；不是整个 XML 只有 582 URL。英文及其他页面另计，不能为凑数新增未完成翻译。
2. 本次 48 项规范页全部 HTTP 200、H1=1、单一自指 Canonical；Meta robots、googlebot、HTTP X-Robots-Tag 均无 noindex，且 routing 的可索引资格为 true、来源为健康 CDN/Supabase。只恢复 XML 而页面仍 noindex 不算通过。
3. 显式别名必须优先，221/337 必须没有双语重复路径；旧别名应在候选 pre-response guard 返回实际 301 到 Canonical，不以 streamed 200 代替。Sitemap 不得收录别名、重定向页、hidden/draft、已关闭/撤下记录（如 450）或故障页。
4. 核实实际部署产物确为本轮修复后的候选，并在平台正常重建/再验证后复核 Sitemap 及页面响应；本轮未作缓存清除、云端配置修改或发布操作。若旧 noindex 仍在，停止 SEO 放行并检查实际部署版本/路由资格规则，不追加无证据的数据库或缓存改造。
5. 隔离 Preview 的全站 noindex 是既有保护，应保留。Preview 检查集合与规范路径，不能用移除 Preview noindex 来模拟 Production 通过。
6. 547 冻结回退风险另列为数据维护项；本轮代码修复不宣称消除了双源故障时的数据完整性风险。

证据文件：public-check.json、canonical-check.json、production-contract.json、canonical-mismatches-before.json、candidate-check.json。全部原始 HTTP 页面留在本地同目录；未加入应用或上传。
