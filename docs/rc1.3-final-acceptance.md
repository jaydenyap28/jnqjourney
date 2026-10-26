# RC1.3 最终补验与收尾

2026-10-26；分支 `codex/rc1.3-website-refinements`。本轮只补验遗留项，没有重新执行 RC1.3 开发、359/54 全套测试、生产构建或打包。没有 Push、部署、生产数据库 SQL、同步任务重跑或 Cron 修改。

## 本轮实际修复

### 1. 原 Spot 503：本地启动器配置缺陷，已定位并恢复

失败路径 `/spot/black-bean-coffee-297` 返回 503，正文 `Spot temporarily unavailable.`，`noindex,nofollow`、`Retry-After:30`。同一合成资料下直接请求 `/api/spot-routing/black-bean-coffee-297` 返回 200/visible:true，因此并非资料不存在或 Supabase 配置缺失。

本地 socket 诊断捕获 Middleware 实际连接 `localhost:3000`，错误 `ECONNREFUSED`，而服务监听 `127.0.0.1:3214`。已安装 Next 源码 `node_modules/next/dist/server/next-server.js` 的 middleware URL 构造使用服务器 hostname/port。原 `scripts/rc13-local.mjs` 没有传这两个选项。

修正为 Next 与 HTTP 监听均使用 `127.0.0.1:3214`；移除原本地启动器对配套 visibility API 的固定 204 捷径。Spot 完整 Middleware→routing API→SSR 返回 **200、一个 H1、正确 canonical**；真实配套 visibility 处理器也能返回 204/404。

这是**本地验证启动器的问题**，不能据此宣称线上 Supabase 或 Vercel 已通过。生产 Middleware 的故障拒绝行为没有放宽。

### 2. Spot 旧别名：真实应用缺陷，已修复

新复核发现 `/spot/old-local-name-297` 的 page-level redirect 被 loading/流式响应包装为 **HTTP 200**，没有 Location。单独将判断提前到 Metadata 实测仍为 200，未采用该方案，也未改动加载界面。

最终在已有 `/api/spot-routing/[slug]` 中复用 `buildCanonicalLocationPath`，在流式页面启动前返回规范跳转，由现有 Middleware 发送 **HTTP 301 + Location: /spot/black-bean-coffee-297**。英文别名使用 `/en/spot/...`。隐藏、显式业务重定向与源故障仍先于规范别名判断。

此判断在可见 Spot 路由检查中增加一次既有 slug-map 读取流程；没有新缓存层。Storage/实际云端读取次数和成本仍须受控环境测量，不能称为零额外读取。

### 3. 英文 Note 识别：修复已发布判断与版本选择不一致

英文 fallback 原先先用 `some(published && slug/alias)` 判断存在，再用不带 published 条件的 `find` 取版本来源；较早的草稿别名可能污染已发布文章的 sourceVersion。另一个已发布文章的 alias 也可能抢先遮蔽规范 slug。

现在只选一次已发布记录，优先规范 slug，其次 alias，并用该记录生成版本。未发布/不存在的文章仍返回不存在；不按标题猜 slug，不创建文章，不把中文 fallback 当英文同步完成。

这是真实可复现代码缺陷，但**尚无证据证明它就是“巴拉格宗”和“Kilim Geoforest Park”两条线上任务的根因**。

## 四个关闭 Spot 与两个 Note 任务

用户最新只读结果是本轮的线上状态输入，Codex 未连接生产数据库复验：

| ID / 文章 | 用户提供状态 | 本轮判断 |
| --- | --- | --- |
| Spot 31、676 | permanently_closed；Spot was skipped during publication | 若任务处理的来源版本确为该关闭状态，属于预期不发布，应成为有原因的正常终态，不持续重试同一版本 |
| Spot 754、762 | temporarily_closed；同上 | 同样应终止当前关闭版本；将来恢复 active 后由新的来源变更触发新任务，不反复重试旧关闭任务 |
| 巴拉格宗 Note | Published Note not found | 需要任务的确切 slug、别名、来源版本及当前公开 snapshot 才能判断；目前无法认定已修复 |
| 兰卡威 Kilim Geoforest Park 相关文章 | Published Note not found | 同上；没有用相似标题或另一个景点强行匹配 |

网站公开源读取原本只选择 active Spot。实际 `publishLocationBatch` 在来源排除关闭记录时更新公开集合/索引并失效旧路径，不因没有详情上传而报错。新增隔离用例确认此正常路径，并确认来源不可用仍是失败；本地 HTTP Fixture 中四个关闭 ID 均返回 404/noindex，隐藏和故障状态也正确拒绝已暖页面。

**仓库中没有产生上述两类精确错误文案的队列 worker/数据库函数实现，也没有队列表 schema。** 因此没有新增一个未接入的“终态分类器”，没有擅自变更状态枚举、清空历史 error 或更新 synced_version。

队列拥有方的最小待办：重新只读核对 job ID/实体 ID、处理版本、当前 status、现有允许的终态和错误原因；对已确认的关闭版本用现有合法 skipped/completed+reason 表达“已处理但未发布”，保留历史，不冒称发布成功。仅来源/网络故障进入错误重试；来源重新 active 应作为新版本处理。需要取得拥有该任务逻辑的源码后再做定向修改，不执行生产修复。

本地 `data/notes.json` 没有可用的上述两个文章身份记录，它不能代替当前线上 snapshot。公共读取本身支持规范 slug 和 aliases、过滤 published；队列是否传了旧 slug/标题、文章是否下架或 snapshot 是否滞后，均仍待明确证据。

## 必要测试

| 检查 | 结果 |
| --- | --- |
| 新增收尾测试 | 7 个不同用例分别通过（先 6/6，规范路由新增后只跑该 1/1）：英文 Note canonical/alias、草稿污染、规范 slug 优先、不匹配缺失/草稿/标题、关闭记录集合发布、源故障、双语规范路由及拒绝顺序 |
| 既有 routing API 定向回归 | 仅匹配该用例执行，1/1 通过；未跑整组或原 54 项 |
| Spot HTTP | 7 个场景分别通过。首轮 6/7 暴露别名 200；Metadata 尝试仍失败，均保留证据；最终仅复核别名 1/1，真实 301。其余通过项没有重复跑 |
| TypeScript / 定向 Lint | 最终检查退出 0；不运行完整构建 |
| 真实外部故障边界 | 合成上游故障仍 503/noindex/Retry-After，恢复后 200；没有将故障当关闭跳过 |
| 提供方请求 | 本地 Fixture 记录均为 GET；本轮不写生产服务 |

证据独立保存在 `artifacts/rc1.3-finalization/`：`spot-before.json`、`routing-network.jsonl`、`server-before.log`、`server-after.log`、`spot-http.json`、`spot-http-alias-recheck.json`（失败的 Metadata 尝试）、`spot-http-alias-final.json`、各定向测试日志与 integrity/commit 记录。这些是本地合成响应/开发服务证据，不是线上或视觉验收。

## 视觉验收仍未通过

本轮只检查一次浏览器能力，返回 `Local browser use is disabled in Work settings`。未绕过限制、未生成合成截图，沿用 RC1.3 前轮已有海南 390px 前后证据，不把它扩大为全站通过。

人工补验清单：使用真实页面，在 390×844、430×932、1440×900 检查以下项目；Guide 按项目 QA 要求再补 1920×1080。等尺寸/等滚动位置截图，记录控制台和加载失败，分别标记结果。

| 页面 | 手机与桌面待验 |
| --- | --- |
| 首页 | 真实字体、标题/首屏图片、卡片/间距、导航、浮动控件遮挡与横向溢出 |
| Spot | 新旧别名实际导航、图片焦点/裁切、正文/体验分区、地图/关联入口、手机触控 |
| Guide | Hero、长短每日行程、day 导航/锚点、地图/预算/住宿、图库/视频、底部 |
| Note | 标题/正文/图集、目录锚点、视频、关联链接、中英文 fallback |
| Batam、Tioman、Hainan | 目的地/天数/参考价、7/3/2 真实选项、比较/行程、单位/有效期、图片、所选 WhatsApp 文案；只核对链接，不发送消息 |
| 后台 Spot 编辑 | 真实登录环境的筛选、正文前后对比、SEO 预览、照片操作、保存状态/冲突/同步失败；不得为验收随意修改生产行 |

## 保护、保存与部署条件

本轮开始保存当前 5,953 个非密钥文件指纹及完整 Git 状态。最终检查对比这份基线；已有 RC1/RC1.1/RC1.2/RC1.3 的 artifacts 和数据库安全方案不改，数据及依赖锁文件不变。`app/loading.tsx` 的原有删除状态保留。

收尾的本地提交采用**当前网站源码快照**：包含既有未提交的 RC1.2/RC1.3 网站代码、所需辅助源码与本轮修复，不将整份提交误称本轮新开发。凭据/`.env*`、Supabase 临时目录、artifacts/候选包、根目录原始配套图片及无关维护脚本不纳入；原文件仍保留在工作区。具体清单见本轮 source-snapshot-manifest 与 commit 记录。本地提交不触发 Vercel；没有 Push。

数据库 RLS 方案继续保留，未执行 SQL。生产数据库权限/依赖、两个 Note 任务与队列拥有方的终态修正仍待验。恢复浏览器完成上述清单后，仍需 Vercel 额度、隔离配置和独立部署授权，再按发布流程进行一次必要候选验证。本轮既不是部署候选，也没有完成真实云端验收。

本轮到此停止，不创建 RC1.4。
