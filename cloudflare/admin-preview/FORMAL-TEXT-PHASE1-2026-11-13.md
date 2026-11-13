# 第一阶段正式文字编辑启用：停止于真实依赖预检

结论：`FORMAL_TEXT_PHASE1_BLOCKED`。保留已通过真实 Chrome 验收的只读后台，三个 capability 全部 OFF；未执行任何正式写入或部署。[脱敏证据](formal-text-phase1-evidence.json)

## 已确认的前置条件

- 官方 Supabase 连接明确指定正式项目 `vrufunuomioczocdsoer`，SQL 身份 postgres，PostgreSQL 17.6。586 条 Spot、582 条公开，现有私有目标桶不存在，旧 `location-images` Public 标志保持 true。
- 现有五个逻辑备份文件重新核对 SHA-256 全部一致；既有离线恢复回执匹配该 archive 哈希，不重新 dump/restore。NAS 不在本轮范围。
- `locations` 与 `storage.objects` RLS 启用。service_role 保有 Spot SELECT/INSERT/UPDATE、主键 sequence USAGE、Storage CRUD 与 BYPASSRLS。未发现依赖 locations 的视图或面向浏览器的 SECURITY DEFINER 读取函数。最小权限草案没有执行，不能计为正式边界验收 PASS。
- Pages 官方 API 当前 canonical 仍为 `333e51aa-506e-4a66-a7c6-4f28e3e890a1`，uses_functions=false；www 的 `_publication.json` HTTP 200、SHA-256 匹配原备份。未构建或重验全站。

## 阻塞的精确原因

正式目录实际存在：

1. `locations_queue_publication_sync`：AFTER INSERT OR UPDATE，调用 SECURITY DEFINER `public.queue_spot_publication_sync()`。函数**无条件**将 `new.id` 和版本写入 `public.spot_publication_sync`，冲突时重新置为待同步。它没有“只存草稿不入队”的分支，也不受新 Edge 的 publication=false 控制。
2. `jnq-spot-publication-sync`：active=true，`* * * * *`，通过 `net.http_get` 调用 `jnqjourney.vercel.app`。只记录主机名，不导出 cron 中的请求凭据。
3. 旧队列已有 586 行、4 行 pending、0 行 processing。保留原样，未清空、删除、重新入队或执行处理器。

因此，即便新发布按钮、Windows Publisher、Cloudflare 发布全部 OFF，正式 Spot 保存仍会自动进入**另一条仍启用的旧发布链**。这不能满足本轮“保存不发布、发布队列 OFF”的要求。不能凭 Vercel 曾返回 402 就假设它永久无法处理任务；本轮也没有声称草稿已经泄露。

最近默认 24 小时官方日志中，locations GET 有 60 次明确 service_role 和 34 次 `supabase-js-deno/2.93.3`；后者日志未给出 JWT 角色。没有把角色缺失当作无消费者证据，也未把这些请求认定为匿名调用。旧链仍在运行时，不执行生产匿名权限 SQL来试错。

## 本轮实际状态

| 交付项 | 实际结果 |
| --- | --- |
| 私有权威初始化 | 未执行；`jnq-admin-formal-publication` 尚未创建 |
| 正式匿名边界 | 未执行；原 GRANT/RLS 保留，不能标 PASS |
| Spot/Note/Guide 正式保存 | 全部 OFF；未创建任何正式测试草稿 |
| 真实 409/重复提交 | 未执行正式验收；历史本地结果保留，不冒充正式结果 |
| 正式网站 | 原 Deployment/发布回执一致 |
| 后台 | https://read-only.jnqjourney-admin-formal.pages.dev/admin ，原只读版本保留 |
| 第二阶段图片上传 | 尚未就绪；上传及发布均 OFF |

## 继续所需的最小生产决策

需单独明确批准并核对**旧 Spot 自动发布链隔离**：暂停指定 cron，并阻止正式 Admin 的 Spot 保存进入旧队列。最直接的候选是停用该指定入队触发器并保留队列全部记录；不改其他业务表，不删除函数或资料，不扩大至 Guide/Note cron。执行前保存这两个对象的定义和配置，确认其他合法旧写入器的停用/迁移安排。涉及旧同步停用的影响必须先获得确认，不能当成本次匿名 SELECT SQL 的附带操作。

在旧链明确隔离且依赖条件满足后，从本轮断点继续：私有桶与 create-only 初始化 → 单事务最小权限 SQL → 仅文字保存部署 → 未公开草稿真实保存、409及同请求确认重试。图片上传、发布队列、Windows Publisher继续 OFF。

本轮未修改编译开关、正式 Edge、Admin 部署、生产设置、DNS、旧 Storage Public 或 r2.dev；未发起任何 Production 发布。用户原有工作区删除及未跟踪文件保留。
