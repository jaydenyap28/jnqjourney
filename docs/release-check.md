# 轻量发布验收入口

此工具做上线准备与只读HTTP冒烟，不构建、不部署、不写数据库、不读取`.env`或管理员密钥、不执行维护任务。复用现有Preview隔离测试和`evaluateSpotQuality()`；历史Fixture发布/刷新脚本包含POST，不适合作为真实线上只读验收入口。

运行时需支持项目现有`.ts`模块的原生类型剥离；本轮使用现有Node.js 24运行，无新增依赖。

## 本地准备

```powershell
npm run release:check
```

核对必需提交的祖先关系、RC1.2原31项路径、现有Preview隔离测试，以及五张已识别备份表在网站运行源码中的字面引用。默认完全不发网络请求。JSON记录`candidateCommit`和证据范围，默认保存到新的`artifacts/release-readiness/check-*.json`，已有输出拒绝覆盖。

`PASS`=该条检查在标注范围内通过；`FAIL`=观察到明确矛盾；`UNVERIFIED`=缺少目标、权限、环境或人工证据。底层Node入口退出码为0/1/2，未验收不会当成功；机器流程应保留JSON的状态和证据范围。所有本地合成测试都标注`LOCAL_SYNTHETIC`，不能升级成真实Preview证据。

本地工作树与HEAD不一致时会单独标记未验收。提交完整性失败时不继续运行HTTP检查；工具没有合并、重置、发布或修复生产的能力。

## 获准创建Preview之后

先满足 [已有隔离要求](rc1.5-preview-isolation.md)：专用测试Supabase URL/ref/public Key、真实只读授权、独立测试快照/素材origin、无Service Role或其他写凭据、无GA ID、精确deployment origin、全站noindex、构建命令无维护脚本。测试项目的函数、Cron、Webhook、邮件及外部集成须另外核验。只检查变量名称/作用域，不Reveal或导出值。

复制 [示例路由配置](release-smoke.example.json)，把路由和`allowedResourceOrigins`改成**已经批准的独立测试数据与素材来源**。示例是现有公开内容的路径参考，不会创建测试数据；不能仅通过把Production资源加入允许列表来声称隔离。包含首页、Guide、Note、配套、中英Spot，并选一个合格和一个noindex Spot。`video:true`只用于确实含视频的页面。

```powershell
npm run release:check -- --base-url https://YOUR-EXACT-PREVIEW.vercel.app --environment preview --routes docs/YOUR-REVIEWED-ROUTES.json
```

只请求同站页面、`robots.txt`、`sitemap.xml`及现有公开Spot详情/路由API。所有请求固定GET、不带cookie/授权头、不跟随重定向；API/admin路径不能作为用户路由输入。收到访问保护、401/403或跳转时标记未验收，不索要或转发保护凭据。

检查可见HTML而非RSC脚本文字、Canonical、HTTP与Meta robots、原质量门槛、当前语言routing资格和Sitemap成员关系。英文可收窄、不可扩大源Spot资格；无582个收录指标。ID450不得在Sitemap出现。Preview必须有HTTP全站noindex且robots不宣传Sitemap。不会自动下载图片、加载视频、运行JS、点击联盟或WhatsApp，也不向真实统计接口发POST。

视频检查只确认有效的单条视频/watch入口，不把页脚频道链接当成播放器。WhatsApp检查只确认安全链接及配置要求的上下文。真实播放、图片/字体、手机交接、浏览器外联、数据库角色权限、云端配置归属、部署commit仍单列未验收，必须补独立证据。HTTP全通过也不是Production批准。

## 一次获准的新构建之后

```powershell
npm run release:bundle
```

复用原部署追踪检查器，检查实际英文serverless NFT清单是否包含4个仍使用的共享fallback和**当前reader指向的版本快照**。`111beff`后不再要求归档的547个逐Spot文件。该检查不触发构建，也不证明`.next`属于本候选；需先核对构建日志、候选完整commit及部署ID。本轮没有重建或验收旧`.next`。

## Production

Preview关键项、五表安全处理及回退条件有结论，并获独立Production授权之后，使用同一入口检查明确目标：

```powershell
npm run release:check -- --base-url https://www.jnqjourney.com --environment production --routes docs/YOUR-REVIEWED-ROUTES.json
```

Production部署域名与正式Canonical不同的情况，在路由配置中显式设置`canonicalOrigin`；Preview一律要求Canonical属于本次精确deployment origin。工具不自动辨认云端目标commit，也不会推广部署。回退对象必须是当时记录的真实稳定Production deployment，不能用本地提交号代替；代码回退不会自动回退数据库或共享CDN内容。
