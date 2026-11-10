# SNAPSHOT_HOSTING_POC_BLOCKED

本轮基线 `6e57cc629d3fcf8cc00d292a1c7304a7eb9a656f`。现有 Next 14 Node renderer 成功生成首页和双语 Spot 的真实内容。专用 Cloudflare Preview 首个首页请求返回 **HTTP 200**，但 Runtime Tail 缺失。按止损条件停在这一请求，正式迁移 **HOLD**。

Preview 部署 `f86d4e0e-365d-4f5a-8064-b1a6455e0949`。此部署使用隔离 Supabase 和私有测试 R2。验收已结束，fixture 恢复 hidden，部署设有到期时间。当前链接仅作记录。 [独立 Preview](https://codex-snapshot-poc.jnqjourney-spot-loop-migration-candidate.pages.dev) · [部署及收尾证据](evidence/snapshot-hosting-2026-11-10/acceptance-resumed.json)

| 检查 | 实际结果 |
| --- | --- |
| 真实 Next 构建与渲染 | `next build` 和 `next start` 成功。真实首页 HTML 含 Spot canonical 链接和合成内容。中文详情、英文详情、首页/详情 RSC、英文 Pages JSON、两个原有公开 API 共生成 **8 个表示**，全部经私有 R2 字节回读及 SHA-256 验证。 |
| 静态资源 | 部署 **335 个** JS、CSS、字体和图标文件，共 **24,353,892 bytes**。公开资产包没有 HTML、RSC 或 Pages JSON 文件。`_routes.json` 对 `/*` 启用 Function，仅排除明列的资源路径。静态资源的实际浏览器加载和绕过 Function 尚未实测。 |
| 原生 CPU | **1** 次专用动态请求，Acceptance ID `1794299298797-0`，首页 HTTP 200，**CPU UNKNOWN**。原生 Tail 记录数 **0**。浏览器额外动态请求 **0**，静态验收请求 **0**。没有用耗时或历史 CPU 填补。 |
| 发布门控 | 版本约束、别名白名单和拒绝旧静态路径已实现。云端只收到已发布首页请求，浏览器导航、Hydration、下架、重新发布、故障和异常表示均未验收。 |

首轮私有对象回读停止于 ETag 断言。只读复核确认管理 API 在 gzip 响应中返回 `W/` ETag，44,124 bytes 与原文件 SHA-256 相同。续段仅规范化 HTTP ETag 表示并复用已注册的合成 PNG。两段原始证据均保留。首个云端请求之前使用了固定 Tail 等待时间，未观测到 WebSocket 已连接的确认，因此无法区分连接时序与其他采集故障。Wrangler JSON 模式没有打印连接就绪行。 [初段](evidence/snapshot-hosting-2026-11-10/acceptance.json) · [原生 Tail](evidence/snapshot-hosting-2026-11-10/runtime-events.json)

## 生成和版本切换

`snapshot-renderer.mjs` 在独立无凭据副本编译原路由、布局、前端组件和客户端 bundle。仅替换渲染输入，使用从隔离 RPC 取得的单一合成 Spot 投影，其他集合为空。该输入范围专用于本次测试。`snapshot-release.mjs` 取得真实 HTTP HTML、Flight RSC 和 Pages JSON 字节。当前 Next Build ID 与资源绑定，同一 Node 构建可重复渲染不同内容版本。

生成器在捕获前后核对当前投影哈希。各表示先写入隔离私有 R2 的修订前缀并回读。最后写 manifest，其中记录投影哈希、Spot ID、更新时间、Build ID 和每个对象的内容哈希、字节长度、ETag 与 native version。门控每次实时读已授权公开投影，以当前哈希选择 manifest，再检查 R2 对象身份并流式返回。新版本没有完整 manifest 时返回 503。已隐藏详情返回 404，含该 Spot 的旧首页失效。Registry 媒体字节路径复用原有身份与发布检查。

验收脚本包含下一修订的实际生成与切换步骤。首次请求因 Tail 缺失停机，这次只发布了 **1 个修订**。后续可将同一生成器接入已有发布队列，由已确认保存事件触发有界合并和自动渲染。发布过程以 manifest 写入作为完成点。正式系统还需确定聚合页面所有嵌入内容的资格和版本，处理状态变化发生在一次请求读取途中的窗口，并验证浏览器的客户端导航缓存行为。

当前不扩大至全站。下一步仅修复 Tail 就绪确认，先证实新连接能对真实首页取得独立原生事件，再完成本轮未执行的 Chrome、各表示、状态和第二修订检查。原 Acceptance ID 的 UNKNOWN 保留。新旧私有对象保留用于复核，合成 fixture 恢复 hidden。Production 空配置、Fail closed 和测试桶私有状态已在部署前后核对。
