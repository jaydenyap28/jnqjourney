# SNAPSHOT_HOSTING_POC_BLOCKED

基线 `838a1fc664901164d32b652e7b9d1c12278546c4`。Pages Tail 就绪检测和独立 canary 已通过。Chrome 加载了真实 Next 14 首页、中文 Spot 文档、Spot RSC 预取响应和私有 PNG。第二次 Speed Insights 脚本请求没有原生事件，验收按止损条件停在桌面浏览器阶段。正式迁移继续 **HOLD**。

## 复用与隔离

使用原 Preview `f86d4e0e-365d-4f5a-8064-b1a6455e0949`、Build ID `7BrLBp7VG6kKxJ92ODa_n`、335 个既有资源和原私有 R2 前缀。预检核对了部署别名、有效期、隔离 Supabase、私有 Bucket、manifest 和八个快照的字节长度、ETag 与 SHA-256，并复核合成媒体、receipt 及 Registry 身份。无重新部署、重新构建或快照上传。原 Preview 到期时间为 `2026-11-10T10:27:22Z`。

canary 发出时合成 fixture `92061` 仍为 hidden。canary 通过后，用 CAS 将这一隔离 fixture 暂时还原到原修订 A 的字段和时间戳，并验证完整公开投影哈希与旧 manifest 一致。此步骤只用于精确重现旧修订。收尾再次经 CAS 恢复 hidden，读取确认状态，关闭浏览器与 renderer，删除本轮 Tail 会话。边界前后均确认 Production 配置及 canonical deployment 为空、Fail closed、测试 Bucket 私有。

## 原生观测

验收工具通过官方 Pages Tails API 为指定 deployment 创建短期会话。`trace-v1` WebSocket 确认打开并发出初始化帧后才允许派发请求。按已登记的 Acceptance ID 关联请求，证据只保留必要的请求元数据和原生 CPU。历史证据和本轮日志分开。 [Pages deployment Tails API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/subresources/tails/methods/create/)

| 请求 | HTTP | 原生 CPU |
| --- | ---: | ---: |
| 原始首页 `1794299298797-0` | 200 | **UNKNOWN** |
| 本轮只读 hidden Spot canary `1794300078835-0` | 404 | 1 ms |
| Chrome 首页 HTML | 200 | 3 ms |
| Chrome 中文 Spot HTML | 200 | 2 ms |
| Chrome 中文 Spot RSC 预取 | 200 | 4 ms |
| Chrome PNG 两次 | 200 | 7 ms、6 ms |
| Chrome 第二次 Speed Insights `1794300089955-14` | 404 | **UNKNOWN** |

本轮发送 **15** 次动态请求（1 条 canary、14 条 Chrome 请求），关联 **14** 条原生事件，观测最大 **7 ms**。累计 **16/30** 次动态预算，含原始请求。另有 **76** 次浏览器静态资源请求，均返回 200，未带 Function 门控响应头。5 次跨域请求在浏览器本地拦截。收到的原生事件没有解析错误、截断或未关联记录。第二次 Speed Insights 请求的原生事件在截止时间内未到达，原因未知。两个 UNKNOWN 独立保留，验收停止后未补发请求。

## 验收边界

| 检查 | 结果 |
| --- | --- |
| 真实 Next 14 页面 | Chrome 157 桌面显示首页合成内容，并收到中文详情完整文档和 PNG 响应。全路径尚不能判通过。 |
| Hydration 和客户端导航 | 停止前无捕获到的 React 页面异常。已有 RSC 是预取，点击后观测到新的 HTML 文档请求。客户端同文档导航、完整 Hydration、英文、双语 alias、移动端和刷新未通过验收。验收器本地增加同文档断言，避免把预取算成成功导航。 |
| HTML、RSC、Pages JSON、API | 已观察到首页 HTML、中文详情 HTML、中文 RSC 和 PNG；hidden canary 拒绝中文详情。未完成各表示字节与版本断言，也未覆盖全部隐藏、关闭、撤销、异常查询、旧静态路径和权威源故障。 |
| 修订生成与切换 | 复用已生成的修订 A。新版内容重新渲染、写入私有 R2 与自动切换未执行。 |

当前不扩大至真实 586 条 Spot、Notes 或 Guide。最小后续动作是隔离试点中排除与验收无关的 Vercel 探针，定位为何点击加载完整文档，再从保留断点核对客户端导航、剩余表示、撤销和第二修订。完整门控、原生观测和修订切换通过前，正式切换继续阻塞。

[本轮请求日志](evidence/snapshot-hosting-tail-recovery-2026-11-10/acceptance-tail-recovery.json) · [本轮原生事件](evidence/snapshot-hosting-tail-recovery-2026-11-10/runtime-events-recovery.json) · [原验收报告](SNAPSHOT-HOSTING-POC-2026-11-10.md)
