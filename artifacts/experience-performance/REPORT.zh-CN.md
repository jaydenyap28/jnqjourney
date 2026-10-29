# JnQ Journey 首页、搜索、图片与移动端专项交付

日期：2026-10-29（Asia/Singapore）。开发基准：`4f476ac`，继承链已通过 Git 验证：`11424cb → df0623f → 4f476ac`。初始没有已跟踪文件的未提交修改；原有未跟踪图片、脚本和 artifacts 均保留，未纳入本轮提交。

## 1. 实际实施

- 首页横向 Spot 列表首次只渲染 12 张卡片，每次再显示 12 张；保留完整搜索集合、原有排序、Spot URL 和地图全部地点。卡片批次及横向位置在当前浏览器会话保存。
- 地图改用现有 Mapbox GeoJSON Source + circle Layer，移除每个地点的 React Marker DOM 和持续 pulse 动画；保留点击、名称浮层、定位、缩放和 attribution。可见圆点外另设 44px 透明命中区，重叠时选择距离触点最近的地点，待 Preview 实际点击验收。动态加载地图模块，加载中提供文本提示，失败时提供重试及列表替代入口。关闭滚轮缩放，启用合作手势，减少地图抢占页面滚动。
- 中文及英文首页只传攻略/笔记卡片实际需要的字段，不再传攻略逐日全文、图库与笔记 blocks。先用已有服务端媒体解析，再投影字段，保留已设置封面与卡片文案。
- 沿用已有 Fuse；先对预处理的名称、地区、分类和摘要做快速包含匹配，无包含结果时继续使用模糊搜索。名称命中优先。支持 Unicode 全半角、连续空格、大小写规范化，以及已有中文、英文和日文原名。
- 首页、独立搜索页及地区页复用同一搜索逻辑；新增国家、地区/城市、景点/餐厅/住宿筛选、结果数、清除条件。地区列表每批 24 项，不再在路由层静默截断为 100 项。
- 修复首页列表全局拦截左右键和 Enter；键盘处理仅在列表取得焦点时生效。搜索框为 44px、16px 字号，减少手机编辑与自动放大问题。筛选条件保留于 URL；按 Next 14 的原生 history 同步机制更新地址，返回后恢复条件。地区分页也在当前会话恢复。
- 首页卡片与 Spot 主图补充对应版面的 `sizes`。前两张首页可见卡片优先加载，其余继续使用 Next Image 默认懒加载。关闭横向卡片自动预取 Spot 页面，避免滚动列表触发额外详情预取。
- Spot 相册保留 `object-contain`，新增横向触控切图、左右键、44px 上/下一张按钮，主图复用已有 ZoomableImage 原图灯箱。横向划动与纵向滚动、点击、双指操作分开处理；滑动不会再触发兼容点击打开灯箱。
- 客户端景点重试接口收到结构不完整的成功响应时明确报错，保留当前数据，不把异常响应转换成正常的空集合。已有请求去重和服务端回退逻辑保留。

## 2. 修改前后测量

同一个本地 Next 14 开发服务器、同一份 547 个 Spot 数据；RSC `initialLocations` 前后都是 **423,497 bytes**，SHA-256 完全相同，见 `location-payloads.json`。因此改善并非通过删掉景点或缩减可搜索集合取得。用户提及的线上 586 项未连接验证。

### HTTP / 服务端输出

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| HTML 未压缩 | 3,548,580 B | 873,061 B（-75.4%） |
| HTML 本地计算 gzip | 409,588 B | 189,748 B（-53.7%） |
| HTML 元素数 | 12,832 | 1,480 |
| 图片元素 | 610 | 75 |
| HTML 中脚本标签请求 | 6 | 6 |
| 上述开发脚本文件总大小 | 8,864,736 B | 8,690,982 B |
| 本机温热 HTTP 完整响应中位数 | 336 ms | 133 ms |

每组发起四次 HTTP 请求，温热中位数取后三次，未把首次编译时间计作改善。gzip 是本地计算值，不冒充真实网络压缩传输。原始记录见 `before.json`、`after.json`；原始 HTML 保留在本地同目录，没有纳入 Git。

### 真实 Chrome 移动视口 390×844

在页面 load 后再观察 8 秒。修改后保留两个样本，展示波动，不只选择最有利结果。

| 指标 | 修改前样本 | 修改后两个样本 |
| --- | ---: | ---: |
| 浏览器 DOM | 15,610 | 1,527（-90.2%） |
| DOM 地图标记 | 547 | 0；地点由地图图层绘制 |
| FCP | 1,036 ms | 752 / 652 ms |
| LCP | 2,256 ms | 752 / 652 ms |
| CLS | 0.00479 | 0.00110 / 0 |
| Resource Timing 请求数（不含主文档） | 65 | 45 / 44 |
| 主文档 + 可观测资源 transferSize | 18,649,030 B | 17,248,665 / 15,194,834 B |
| script 发起请求数 | 7 | 8 / 8 |
| script 发起资源传输 | 13,470,731 B | 13,544,864 / 13,548,234 B |
| img 发起请求数 | 9 | 7 / 14 |
| img 发起资源传输 | 494,387 B | 167,255 / 317,776 B |
| JS heap 观测值 | 324,942,007 B | 196,517,436 / 256,345,708 B |
| Long Tasks 数量 / 合计 | 15 / 2,115 ms | 6 / 581 ms；5 / 495 ms |

这些是**真实本地浏览器观察**，不是 Fixture 性能。没有网络/CPU 限速或强制 GC；浏览器扩展、缓存、地图瓦片和开发热更新会影响结果。`transferSize` 对缓存和部分跨域资源可为 0，不能当作所有外部流量的精确账单。img 分类包含图标，且不包含 CSS/preload 发起的图片。**没有证明图片请求数或总 JavaScript 传输必然下降**；动态地图多一个脚本请求，开发模式 JS 传输略增。可明确确认的是 HTML、卡片/地图 DOM 和图片声明数量显著降低，所观察图片字节更少。

最后一轮样本后仅补充了地图尚未 ready 时的短暂加载文本；最终稳态 DOM/数据结论不受影响，但没有重测该加载文本的 paint 时序。完整原始数值和限制见 `browser-mobile.json`。

## 3. 搜索响应

使用仓库实际 547 个记录，每个关键词预热后运行 30 次，以下为 Node CPU 中位数，不代表手机端输入延迟。见 `search.json`。

| 查询 | 旧逻辑 | 新逻辑 | 结果说明 |
| --- | ---: | ---: | --- |
| 南湖 | 3.48 ms | 0.21 ms | 名称优先，保留摘要中的明确包含结果 |
| cafe mori | 6.21 ms | 0.13 ms | 找到已存名称 |
| 连续空格、大写 CAFE MORI | 9.44 ms / 0 项 | 0.07 ms / 1 项 | 修复空格导致的漏搜 |
| 湯けむり | 2.52 ms | 0.08 ms | 日文原名可搜 |
| farm | 2.93 ms | 0.12 ms | 5 项 |
| 住宿 | 2.08 ms | 0.09 ms | 分类同义词可搜索；精确分类筛选仍按 category |
| 不存在的火星景点zzzzz | 7.23 ms | 7.74 ms | 均为 0 项；保留模糊查找成本 |

搜索全程在当前数据上计算，不因输入、清除、筛选或显示更多新增云端请求，也没有异步旧请求覆盖新结果的通路。

## 4. 定向验收

- `node --experimental-strip-types --test tests/spot-exploration.test.ts tests/homepage-order.test.ts tests/image-lightbox.test.ts`：**14/14 通过**。只运行本轮搜索、首页排序/封面投影、手势及既有灯箱相关测试。已有首页测试的一条正则假设 `visit_date` 必须在 select 字符串末尾，当前基准早已有后续 `description` 字段；改成按完整字段边界检查，没有更改数据读取 select。
- 对全部修改的 TS/TSX 文件执行 ESLint：通过。
- `tsc --noEmit --incremental false`：最终通过。
- `node scripts/run-local-performance.mjs --compile`：**一次编译通过**；使用 `next build --experimental-build-mode compile --no-lint`，不执行 generate 阶段或整站静态预渲染。用于验证新动态导入和 App/Pages 共用数据边界；并非完整 build 或发布验收。随后补充地图透明命中区，最终源码再次通过 TypeScript 和该文件 ESLint，未为此重复编译；命中区实际交互仍列入 Preview 待验收。
- 编译模式首页 route manifest 列出的 JS 合计 496,884 B，逐文件 gzip 合计 154,588 B；不包含额外 layout chunk、运行后地图模块或其它资源。只有修改后数据，没有正式生产包的前后对照，见 `compiled-home-js.json`。
- `git diff --check`：通过。
- 390×844 中文首页：中/英/日搜索、连续空格、无结果、国家 Japan + food 交集（8 项）、清除（547 项）、搜索框左右键/Enter 不跳转、12→24 卡片、返回恢复 q 和 24 卡片均通过。没有横向页面溢出。
- 广州地区页：43 项总数，首次 24 项，展开全部 43 项，沙面关键词、清除、返回恢复 43 项通过，没有横向溢出。使用实际地区 slug `guangzhou-42`。
- 独立 `/search`：日文原名查询返回已存 Spot 链接。
- 430×932 英文首页：12 张首次卡片、cafe mori 搜索与英文 Spot 链接通过，没有横向溢出。
- 1440×900 中文首页：一处 H1、无横向溢出；原有地图和卡片风格保留。
- 相册组件：临时页面加载仓库 Spot 快照，并加入一张测试占位图片，只用于验证切图。实测左右键、上一张按钮、1/2→2/2、原图 object-contain（1440px 原图）、灯箱焦点移入、Tab 限制、Escape 关闭与焦点返回、44×44 关闭按钮通过。临时页面已删除且没有纳入编译/提交；这些是**组件功能证据，不是正式 Spot 路由或性能证据**。真实手指滑动未验收，手势方向/阈值由定向单元测试覆盖。

浏览器曾出现 Dark Reader 改写 SVG 属性引起的 hydration 提示、扩展自身监听器警告、开发代理 HMR 404；没有据此修改生产 UI/权限。Mapbox CSS 已在 App 和 Pages 根节点导入；扩展环境中的 CSS 检测提示仍需在干净 Preview 浏览器复核。

## 5. 保留不变

首页服务端独立读取原本已经 Promise.all 并行，公共数据已有缓存、请求合并、超时及快照回退；保留。图片已有 Next Image、默认懒加载、比例容器、焦点设置和失败占位；保留，未引入新图片服务。Spot 展示顺序与封面解析继续沿用原函数。

已有 SEO/canonical/结构化数据/站点地图、Note 视频、内容关联、WhatsApp、后台保存保护、Preview 隔离均未重新实现。没有修改 CDN、缓存 TTL、数据库结构或生产配置。非首批 Spot 不再逐张出现在首页 HTML，继续通过现有全量 Sitemap、地区入口及客户端搜索/展开发现；原有 URL 不变。

## 6. 文件

- 首页及图片：`app/page.tsx`、`components/HomePageClient.tsx`、`components/TopFloatingIsland.tsx`、`components/BottomFloatingDock.tsx`、`components/MapView.tsx`、`components/SpotContent.tsx`、`lib/home-cards.ts`、`lib/gallery-gesture.ts`。
- 搜索及地区：`components/PublicSearch.tsx`、`components/SpotSearchControls.tsx`、`components/RegionPageView.tsx`、`app/region/[slug]/page.tsx`、`lib/spot-search.ts`、`lib/server/public-location-data.ts`、`lib/client/public-data.ts`。
- 英文入口：`components/EnglishRouteAdapter.tsx`、`lib/server/english-page-data.ts`。
- 定向测试：`tests/spot-exploration.test.ts`、`tests/homepage-order.test.ts`。
- 可重复测量：`scripts/measure-home.mjs`、`scripts/measure-spot-search.mjs`、`scripts/local-browser-measure.mjs`、`scripts/run-local-performance.mjs`，以及本目录选定 JSON 和报告。

## 7. 本地提交与边界

基于 `4f476ac` 建立本轮独立功能分支并进行本地提交，最终 commit ID 见交付消息。只暂存本轮修改及选定测量记录，原有未跟踪成果不纳入提交。没有 Push、Preview/Production 部署、生产数据库写入、R2 图片覆盖/删除/迁移或旅游内容修改。临时开发/测量服务在交付前停止。

## 8. 尚待真实 Preview 验收

正式 `/spot/...` 路由必须读取权威可见性服务；本机数据库地址故意不可用，实际得到 503 `Spot temporarily unavailable.` 及 Retry-After，而非把失败伪装成正常空内容。原有保护没有放宽。因此首页→正式 Spot→相关 Guide/Note 全链路、地图点击后正常详情，以及真实多图图库，仍未完成受控 Preview 的端到端验收。

还需在授权且完成隔离的真实 Preview 上检查：线上 586 个 Spot、正式压缩 JS 与字体/Mapbox 总流量、受限移动网络下 FCP/LCP/INP、真机单指滚动/双指地图/相册划动与缩放、全尺寸竖图/横图/失败恢复、干净浏览器控制台及物理设备触控。英文首页仍保留完整轻量 Spot 搜索元数据，Next 开发模式会提示约 464 kB page data；本轮已去除正文，未为了消除该提示再引入搜索 API 或外部服务。
