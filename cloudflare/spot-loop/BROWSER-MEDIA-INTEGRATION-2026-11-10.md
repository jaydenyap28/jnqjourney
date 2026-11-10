# Cloudflare 隔离后台与公开图片验收

**BROWSER_MEDIA_INTEGRATION_PASS。正式整站迁移 HOLD。** 基线为 `eeddfe6e9cd87348866a525aee04ab272f38b90c`。本轮在专用 [Pages Preview](https://codex-spot-media-integration.jnqjourney-spot-loop-migration-candidate.pages.dev/admin/cloudflare-spot) 接通现有隔离 Spot 后台，使用私有测试 R2 和 Supabase 隔离项目的 92017、92030 合成资料。后台部署 ID 为 `3be78ab5-1e3e-4902-b2c3-719953b3ca36`，桥接为 `8333108c-052e-4684-a0a2-51f05f3f266d`，隔离 Edge 函数版本为 9。预览设有硬截止，上传 CORS 和桥接凭据在验收后撤回。[部署证据](evidence/media-integration-2026-11-10/deployment.json)

## 后台闭环

Chrome 157.0.8103.38 通过真实 Supabase Auth 登录，选中一张 32,768 字节合成 PNG。原 Presigned PUT 走浏览器直传私有 R2，实际返回 200 并匹配 CORS，原 `complete` 返回 201，后台图片成功解码。浏览器编辑器替换 30 图相册的一张旧图，随后提交保存。Worker 使用 HttpOnly 会话把同源 PATCH 流式转发给 Edge，由 Edge 鉴权并沿用 Bridge 与 Registry 事务。数据库独立读回确认 30 张、封面和相册末尾都引用新图，刷新后可以再次编辑。上传、快照批量查询和 SQL 事务保留既有机制。

| 用例 | 实测结果 |
| --- | --- |
| 旧版本提交 | 真实 409，界面提示重新读取 |
| 权限失败 | 发送错误 Origin 的真实 PATCH 返回 403，界面显示权限提示 |
| 网络中断 | 浏览器在发出 PATCH 前注入网络失败，界面提示结果未知并要求重新读取。隔离行版本未改变 |
| 会话过期 | 模拟 Chrome 移除到期的访问 cookie，保存返回 401 并恢复登录界面 |
| 重新登录和退出 | Chrome 重新登录成功，退出返回 200，浏览器会话 cookie 清空 |

验收从几个只读或已完成的断点继续。最初脚本未接受 Tail 脱敏路径，随后一次匿名探针因参数拼写错误请求了静态 404，再次连接时一个既有后台 GET 缺失 Tail。三段原始记录保留，继续时复用了已登记的同一张浏览器上传图。首次权限探针中 Chrome 重建同源 Origin，导致一次有效的隔离重新编辑实际提交。记录保留该 200，随后让编辑器消费来自真实错误 Origin 请求的 403。完整上传及 30 图保存都使用原来的对象，无重复上传或重新执行历史保存基准。[上传记录](evidence/media-integration-2026-11-10/browser-acceptance-resumed.json) · [相册保存和回读](evidence/media-integration-2026-11-10/browser-acceptance-final.json) · [续测及安全结果](evidence/media-integration-2026-11-10/browser-acceptance-security.json)

## 真实公开字节与缓存

读取路径先用 Registry lookup 确认资格，再对 final 对象做一次 R2 GET 和对 receipt 做一次 HEAD。GET 同时提供原生身份和这次响应所用的字节流。核对两个对象的大小、ETag、原生 version 和 MIME 后，再查一次 Registry 的当前发布资格。任一项不匹配则取消字节流并返回 404。Chrome 匿名上下文实收三次 32,768 字节 PNG，SHA-256 均为 `504a06e4275dc215d811e0d9f70a32570ebc82168fce8985bf7ebbef51351631`，与选中的本机合成文件一致。[R2 GET 身份和字节流文档](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#r2objectbody-definition)

已登记但尚未引用、未登记、被覆盖、被撤销、已下架及从相册移除的旧候选 URL 均返回 404 和 JSON 错误体。合成旧式路径 `/media/locations/92030/synthetic-legacy.png` 也返回 404。正式历史 URL 的实际映射和公网旧对象另待审计。

成功和拒绝响应均带 `Cache-Control: private, no-store, max-age=0`。同一个匿名 Chrome 页面使用默认缓存模式重复请求，CDP 显示未使用内存、磁盘或 Service Worker 缓存。每次均产生独立 Cloudflare Tail，请求未返回 `CF-Cache-Status: HIT`。同一已访问 URL 在下架后立即返回 404，公开 Spot 页面也返回 404。这些结论仅覆盖本轮独立 Preview 的禁缓存设置。[响应字节及缓存证据](evidence/media-integration-2026-11-10/browser-acceptance-final.json) · [下架后的同一 URL](evidence/media-integration-2026-11-10/browser-acceptance-security.json)

## 快照竞争

在同一个实际云环境，测试器用短期签名取得真实 Bridge 快照，停在冻结 RPC 调用前执行对照操作。

| 快照后、事务前的操作 | 真实结果 |
| --- | --- |
| 用不同的 PNG 字节覆盖 final 对象 | R2 原生 version 和 ETag 改变。旧快照与 Registry 一致，保存仍返回 200。随后匿名 GET 读取到新原生身份，取消对象流，返回 404 |
| 撤销被引用对象 | Registry 撤销并下架，版本推进。分别用旧版本、当前版本和同一份旧对象快照提交，两次均返回 409 / `PT409`。行保持下架，匿名 GET 返回 404 |

R2 与 PostgreSQL 各自提交。快照后的覆盖可使数据库保存一个已失效引用，读取层拒绝提供异常字节，编辑端仍需提供修复失效引用的流程。最后一次资格查询与字节送达之间仍有时间窗。已完成的下载和已开始传输的有效旧字节无法在撤销后收回。原先 TCP 中断的未解释 HTTP 400 仍未解决，本次网络故障在请求发出前注入。

## 原生 CPU 与收尾

| 路径 | 原生 Cloudflare CPU |
| --- | ---: |
| 浏览器 Presign / 原有 complete | 3 / **8 ms** |
| 30 图保存转发 / Bridge | 2 / 4 ms |
| 刷新后重新编辑转发 / Bridge | 1 / 3 ms |
| 下架保存转发 / Bridge | 1 / 2 ms |
| 成功的匿名图片 GET | 3–4 ms |
| 拒绝的图片 GET | 1–2 ms |
| 覆盖和撤销用真实 Bridge 快照 | 4 / 2 ms |

记录共 45 条后台及媒体 Worker、6 条 Bridge 原生事件。一次既有后台 GET 的 CPU 为 **UNKNOWN**。成功的匿名图片 GET 使用 1 次 R2 GET、1 次 receipt HEAD、2 次 Registry lookup。30 图保存的 Edge 函数内耗时 1,445 ms，含网络等待。Edge 原生 CPU 和账户实际免费额度为 **UNKNOWN**。原有 complete 单次 8 ms 仍需保留为余量较小的观察值。[后台与媒体 Tail](evidence/media-integration-2026-11-10/runtime-ui.json) · [Bridge Tail](evidence/media-integration-2026-11-10/runtime-bridge.json)

本机和两端项目级临时桥接密钥已删除，测试 bucket 恢复原有 PUT-only CORS，仍无公共域名。两套 Tail 与 Chrome 验收进程均退出。部署快照有 30 分钟硬截止，Production 仍为空且配置一致。冻结 SQL 哈希与基线相同。测试保留两条已下架的合成 fixture 及相关证据对象。[隔离与清理证据](evidence/media-integration-2026-11-10/final-boundaries.json) · [证据核对](evidence/media-integration-2026-11-10/verification.json)

下一步公开网站迁移清单

1. 核对实际历史媒体 URL、已分发公开对象和引用关系，给历史内容建立受同一发布门控的映射，并制定失效与回滚流程。
2. 在隔离站点接入正式后台界面，验收照片替换、撤销、冲突修复和保存结果不明时的恢复。
3. 用代表性公开路由验收双语 URL、301/404、sitemap 与结构化数据，单独评估缓存及下架时效。
4. 核实真实流量下 R2、Registry 和 Edge 额度余量，确认上传完成路径有足够 CPU 余量，再准备备份、切换和回滚方案供审批。
