**SNAPSHOT_HOSTING_POC_BLOCKED**

本轮基线 `b13d1bbe0420c6c0484041e7640180e78f619b25`。真实 Next 14 客户端导航问题已经定位并在本机和隔离云端验证修复。完整发布门控和第二修订仍未验收，续段停在缺失原生 Tail 的 canary。正式迁移继续 HOLD。

导航根因位于响应头。仓库安装的 Next `14.2.35` 在 `fetch-server-response.js` 中使用 `contentType === RSC_CONTENT_TYPE_HEADER`，常量为 `text/x-component`。旧 Function 附加 `; charset=utf-8`，因此 Next 进入整页导航分支。本机对照使用同一批真实 Next HTML、RSC、JS 和 CSS，只有这一响应头不同。旧类型导致 document ID 和 `performance.timeOrigin` 改变，修正后均不变。未修改 Next Router 内部代码。

根 Layout 和 Pages `_app` 原本都会注入 Vercel Analytics 与 Speed Insights。本轮仅在独立 renderer 副本移除两组组件，并加入 React `useEffect` 探针。App 探针记录真实 pathname、router 是否存在和 timeOrigin，Pages 探针确认真实客户端提交。所需的一次成功 renderer 编译生成 Build ID `voTUxzUwYFr1dxq3Q-Ntv`。之前一次编译遇到 Windows EPERM，准备脚本的格式断言和局部变量问题也已定点修正。没有升级依赖。

旧部署、原八份私有快照和既有合成媒体的只读预检通过，fixture 起始为 hidden。更新后的一个 Preview 为 `763e3adf-a713-4049-bb47-22322152df15`，335 个静态资源共 24,330,864 bytes。新 HTML、RSC 与资源使用同一 Build ID。原部署和证据保留。测试结束 fixture 为 hidden，此链接随后会按硬到期策略失效。 [Preview](https://codex-snapshot-poc.jnqjourney-spot-loop-migration-candidate.pages.dev)

| 实际检查 | 结果 |
| --- | --- |
| 首页 | Chrome 157 桌面显示真实首页合成内容，HTML 43,937 bytes，SHA-256 与私有 manifest 一致，原生 CPU 3 ms。 |
| 中文点击导航 | 在首页 useEffect 探针就绪后点击真实链接。document ID `a27732c3-833b-4300-a6f4-f9ef27bbd500` 和 timeOrigin `1794304079775.6` 均保持不变。网络类型为 fetch，RSC 24,336 bytes，哈希与修订一致，原生 CPU 2 ms。目标 pathname 的探针已经提交。 |
| 英文、alias、移动端 | 英文 alias 实际返回 301，原生 CPU 4 ms。移动端 canonical 页面和刷新到达 Pages useEffect。已计量的刷新 HTML 33,125 bytes，哈希与修订一致，原生 CPU 5 ms。首次自动跟随 301 的 canonical 请求漏过原路由拦截器，补计请求和 UNKNOWN。 |
| 图片真实字节 | 两次 68-byte 合成 PNG 响应经 SHA-256 比对，与既有私有媒体一致，原生 CPU 分别为 5 ms 和 **10 ms 临界**。最后一次刷新图片因测试器关闭 context 被取消，状态与 CPU UNKNOWN。 |
| Hydration 异常 | 已捕获的 pageerror、Hydration、ChunkLoadError 均为空。最后一次刷新图片未完成，因此不将整个刷新加载流程标为通过。截图保留在本机测试目录，未据此宣称完整视觉验收。 |
| 其他业务请求 | `/api/affiliate-links` 实际两次返回 404，原生 CPU 1 ms、0 ms。这个合成 Preview 未承载 Affiliate 模块，这两次纳入预算。 |

浏览器主动阻断了 5 条范围外的 Next 预取，分别为 `/region`、`/guide`、`/notes`、`/packages`、`/region/malaysia`。日志保留路径、查询和未发送到 Cloudflare 的标记，并单独记录相应预取警告。范围内 RSC、API、HTML 和图片均进入真实请求流程。没有将这些阻断记为成功。更新后的页面没有产生 Vercel Analytics 或 Speed Insights 请求。

| 计量 | 数量 |
| --- | ---: |
| 历史累计，维持原记录 | 16 |
| 本轮第一条首页 canary | 1 |
| 本轮浏览器续段，含自己的 hidden canary | 10 |
| 浏览器自动跟随 301 的额外 canonical 请求 | 1 |
| 剩余门控续段的 canary | 1 |
| 本轮总计 | **13 / 36** |
| 历史与本轮合计 | **29** |
| 本轮 Chrome 动态请求 | **10**，其中 9 条由路由拦截器登记，1 条自动重定向补计 |
| 本轮 Chrome 静态资源派发 | **90**，88 条确认 HTTP 200，2 条在 context 关闭时没有完整结果 |
| 成功按 Acceptance ID 关联的本轮原生事件 | **9** |

两个额外的原生事件被当时的采集器计入 `ignoredEvents`，原元数据未保留，不能恢复或分配其 CPU。不可将它们当作额外两次请求再次计数，也不能将未知值推定为低 CPU。本轮动态计数已包含未拦截的 301 跟随请求以及被取消的图片请求。

必须保留的 UNKNOWN 如下。

| Acceptance ID 或请求 | 状态 | 原因 |
| --- | --- | --- |
| 历史 `1794299298797-0` | HTTP 200，CPU UNKNOWN | 原证据保持不变。 |
| 历史 `1794300089955-14` | HTTP 404，CPU UNKNOWN | 原证据保持不变。 |
| 本轮 `1794303913693-0` | HTTP 200，CPU UNKNOWN | WebSocket 已 open，但 canary 原生事件缺失。 |
| 本轮 `1794304086038-9` | HTTP UNKNOWN，CPU UNKNOWN | 测试器过早关闭 context，图片请求被取消。 |
| 自动跟随英文 alias 的 canonical 请求 | HTTP 200，CPU UNKNOWN，无独立 Acceptance ID | Playwright route 仅拦截重定向链首请求。最终页面的 200 由浏览器导航返回值确认。 |
| 本轮 `1794304352347-0` | HTTP 404，CPU UNKNOWN | 正文已完整读取、WebSocket 已 open，仍无原生事件。依止损规则停止。 |

测试器已修正两个客户端顺序问题。Node fetch 在响应头到达时即可返回，现改为先读取有界正文再等待 Tail。浏览器现等待真实图片加载与队列结束后才关闭 context，canonical 页面直接访问，alias 由禁止自动跟随的探针检查，并增加浏览器网络清单。采集器后续会保留有界的脱敏未关联事件，避免再丢弃迟到事件元数据。这些收尾与重定向修正没有重新执行完整云端 Chrome 测试，续段被新的 canary 缺失阻止。完整读完正文后仍有缺失，因此响应消费顺序无法解释全部 Tail 问题，采样或会话传播等原因尚未确认。

已通过的本地回归有三个测试，覆盖十类内容路径对无资格投影的拒绝、旧路径和异常查询、Next 14 精确 RSC MIME、对象 native version 不符以及上游失败。它们模拟可信投影和 R2，不代表远端 SQL 或 Cloudflare CPU。真实浏览器对照则使用实际 Next renderer 字节。

尚未执行的云端检查包括中文 HTML 直达、Pages JSON、两个公开 API 的哈希和版本、中文 alias、异常旧路径与查询、权威源故障、hidden/关闭/撤销矩阵，以及第二次内容修订的实际生成、manifest 发布和版本切换。八个新修订 A 的表示已生成并私有回读，但只有表中页面和图片取得了本轮云端证据。本轮没有生成修订 B，也没有证明自动发布队列可用。

执行曾在部署前被中断。该段没有候选请求和新部署，已生成部分本地表示，可能存在未完成的私有快照写入，未对这些不确定对象执行删除。随后确认 fixture hidden，再以独立前缀继续。本轮复用既有合成媒体，未创建新媒体登记。恢复原修订 A 时，仅对合成 fixture 使用 CAS 重现其字段与时间戳，并比对完整投影哈希。收尾另行只读确认 `92061` 为 active、hidden。

三个短期 Tail 会话均已删除。末次边界检查仍为 Production 空配置、空 canonical、Fail closed 和测试 Bucket 私有。本机 renderer、测试器以及 4417/4419 监听均已退出。没有创建新的共享密钥。

当前证据支持 Next 14 与此快照方案能够完成真实 Hydration 和客户端导航，无法支持停止 Router 兼容路线的判断。但 **10 ms 图片临界值、Tail 不稳定及尚未执行的门控/修订检查** 阻止技术 PASS。暂停扩大至 586 条 Spot、Notes、Guide，正式切换继续 HOLD。后续最小动作是先找出 canary 为何在已 open 的会话中仍不可观测，再在保留本轮 13 次计数和全部 UNKNOWN 的前提下规划剩余有界验收。

[脱敏证据目录](evidence/snapshot-hosting-navigation-2026-11-10/) · [前轮报告](SNAPSHOT-HOSTING-TAIL-RECOVERY-2026-11-10.md)
