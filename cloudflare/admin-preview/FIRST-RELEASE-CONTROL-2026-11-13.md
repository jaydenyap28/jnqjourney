# 首次 Production 发布控制

**HOLD；等待管理员真实发布申请，不是 Production 发布授权。**

2026-11-13 06:57 UTC 只读检查时，正式队列为空，待管理员提交发布申请后核对 Job ID、内容指纹和实际变更。正式发布继续 HOLD。

## 当前审批摘要

| 项目 | 实际结果 |
| --- | --- |
| Job ID / 内容指纹 | 未提交，待管理员主动申请 |
| 新增 / 修改 / 隐藏 / 新增媒体 | 尚无任务，不虚报为零差异 |
| 发布后内容 | 待任务核对；当前已部署基线 582 Spot、6 Note、7 Guide |
| 当前 Production | `333e51aa-506e-4a66-a7c6-4f28e3e890a1`；真实 www 发布回执哈希未变，0 Functions |
| 私有测试边界 | 当前公开基线不含 Spot 853、已知测试 Note/Guide 或撤销测试图；测试图片回执仍为 revoked |
| Windows | `JnQ Journey Production Publisher` Disabled，未启动 |
| 服务端 | 文字编辑、私有上传和提交发布申请开启。有效 runner key 实测返回 423 HOLD，执行授权记录为 0 |
| R2 原生观测 | 保守峰值 7,506,031,449 bytes，当月总操作 64,886 |
| 本机预算 | 8/日、240/月、至少间隔 10 分钟；当前无冷却阻塞，未新增构建 |
| 费用限制 | 账单、Pages 账户实际剩余额度 UNKNOWN；原生观测有余量不构成硬费用上限。首次实际执行前重新核对，风险不符则 HOLD |

## 已补齐的单任务保护

旧全局开关不足以约束第一次发布，已增加本机和服务器双重校验。只打开 enabled / execution 等全局开关仍不能执行。

- 明确批准的记录必须同时绑定 **Job ID、完整 payload SHA-256、权威内容指纹、公开基线指纹、当前 Production ID、真实 Production Branch、唯一 attempt**。权限最长两小时，不接受过期、未来或无限期授权。
- 本机 `approvedRelease` 必须与私有 Storage `_publication/execution-approvals/<Job ID>/<attempt>.json` 完全一致。该对象没有浏览器创建接口；目前没有创建任何实际授权记录。
- 执行器只读取批准的 `queue.job(jobId)`，不跟随 latest 或轮询领取下一条任务。每次校验/提交均检查所选任务；服务器 runner 也独立核对 ID、指纹、attempt、基线和一次性回执。
- 开始构建前为已批准的 attempt 创建独占领取记录。若进程在领取后中断，重启会保留原记录，避免同一 attempt 再次开始构建。
- 成功、失败、异常或有限核对超时后：消费一次性授权、清空本机批准并恢复 disabled、关闭服务器 execution、禁用 Windows 任务。单个收尾步骤失败不会阻止其他 HOLD 屏障，错误会保留。文字编辑、私有上传和提交申请能力不随之关闭。
- 提交结果不明时保留 journal，只核对同一 Deployment，不重复上传。崩溃中断的构建不会自动增加 attempt。重试需新的明确批准；不明部署必须先只读核对，不能用重试制造第二次提交。
- 只有相应任务确实得到批准后，才会生成可执行的 single-job 授权；审批摘要输出的是不可执行的 `awaiting-user-approval` 模板，时间字段为空。

## 只读任务核对入口

`formal-first-release-review.mjs --read-only vrufunuomioczocdsoer` 使用正式私有队列和已确认 Publisher 身份，仅 GET `/publication/review?job=<id>`，不提交发布申请或领取任务。没有任务时不会伪造变更或生成授权。

有任务时将核对：

1. 发布人属于已确认 Publisher UUID、payload 哈希、最新完整权威指纹和 queued attempt。
2. 完整基线与申请的新增/修改/隐藏明细，预计完整公开集合，新增与保留受控媒体的数量和字节。不会因只选一条而丢弃其他内容。
3. 正式 R2 当前对象身份和撤销回执；不扫描 4,515 张历史媒体。已知私有测试内容加入硬拒绝检查，不能因状态误改而加入发布包。
4. 最新权威资格下的旧基线回退差异：任何已撤销内容或未验证媒体会使旧包不适合回退。不能默认把旧 Production 作为安全回退包。
5. 真实 canonical / branch、当前 native 用量和本机预算。最终构建文件总数和实际新上传资产数量在获批构建后校验，目前不虚构。

## 本轮验收范围

8 项单任务本地测试与 7 项既有队列保护回归通过，覆盖授权绑定、崩溃后的重复领取、终态 HOLD、差异与回退核对。Edge 类型检查通过。

正式 `jnq-admin-formal` Edge v26 已部署，只增加保护和只读核对接口；没有解除服务器 HOLD。现有 Admin 静态界面无需重构或重新部署。**云端单任务实际执行与自动收尾尚未运行**，不能冒充 Production 发布验收。

## 用户下一步

在[正式后台](https://read-only.jnqjourney-admin-formal.pages.dev/admin)准备真实内容，保存后通过「准备发布 → 发布网站」主动提交申请；该操作只进入 HOLD 队列。随后核对具体 Job ID 与指纹，单独批准该任务的一次执行。此后才可设置相同的本地/服务端授权、解除该次执行 HOLD 并启动任务。

首次执行结束自动恢复 HOLD。持续自动执行今后主动提交的任务**尚未授权**，不会通过本次批准顺带开启。静态下架继续遵循 A 政策，历史缓存与旧固定部署不能提供实时撤销保证。
