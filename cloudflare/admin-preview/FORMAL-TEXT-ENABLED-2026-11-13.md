# 正式文字编辑第一阶段：PASS

用户授权起点 `5f6b5485`。本轮只启用文字保存，不启用图片上传、发布队列或 Windows Publisher。

- 后台：[正式 Admin](https://read-only.jnqjourney-admin-formal.pages.dev/admin)。沿用原 Origin/分支名称以兼容现有 Auth；名称中的 read-only 不再代表当前文字编辑能力。
- Admin 部署：`edbb7b42-c9c0-4008-b7d1-42269ed3fe12`，Preview、全站 noindex、0 Functions，原表单与编辑器。
- 正式 Edge：`jnq-admin-formal` v8，verify_jwt=true；逐请求正式 Auth 与既有 UUID allowlist。writes=true，uploads=false，publication=false。
- 真实保存验收：29 项断言 PASS，使用官方 Auth API 建立且仅撤销本次独立会话；未发送登录邮件、未改密码、未创建账号、未输出或保存 Token。是实际正式 Edge/数据库/Storage 请求，不是模拟或 Chrome 重验。

## 旧链隔离

原始 Cron 全配置（包含可能敏感的请求配置）、Job ID、Trigger/函数定义和状态已保存到现有受保护的本机 `production-publisher/text-activation-20261113`。文件不进 Git。

`cron.alter_job` 仅将 Job 1 / `jnq-spot-publication-sync` 置为 active=false；随后单事务仅 DISABLE `public.locations.locations_queue_publication_sync`，没有 DROP。没有运行中 Cron、待发送旧请求或正在执行的旧 SQL；已完成的最近旧请求为 402。停用后最后一次 Cron 起始时间保持 `2026-11-13T02:45:00.030806Z`，未出现新调度。

旧 `spot_publication_sync` 始终 586 行、4 pending、0 processing；按 Spot ID 排序的全行 JSON MD5 始终 `98de9b1575bd544533acd732ac5bf7de`。其余 Cron/Trigger 配置摘要不变，未处理、删除、重试或重新入队任何历史记录。

## 私有权威与权限

新桶 `jnq-admin-formal-publication` public=false。原 Note 6 篇、Guide 7 篇、slug 和完整公开基线先与当前正式来源核对一致，再 create-only 初始化八个对象并逐字节验证。原始 `location-images` 指针/版本均未改写。

正式依赖检查无 locations 依赖视图或公开 DEFINER 读取路径；service_role 的数据、sequence 和 Storage 权限保留。实际匿名调用日志没有证明仍有活跃匿名消费者；独立后台与完整构建器已用服务端来源，公开站为静态。按既有草案单事务撤销 locations 浏览器 SELECT，并新增 restrictive 表读取与新私有桶策略；没有更改其他业务表或旧 Storage 的 Public 标志。API 实测匿名直读 401/403 + SQLSTATE 42501，未授权 Edge 读取 401。

## 实际文字保存

新增未公开 Spot **853**，完成新增、读取、修改、同 mutation ID 重复确认、旧版本 409、隐藏、slug 保存与读回。最终 hidden。新增一篇 Note 和一篇 Guide 私有草稿，各完成新增、编辑、读回、409、重复请求原回执；published=false。

原 586 条 locations 的全行摘要与操作前一致；原公开 Spot 集合仍 582 条。测试后总数为 587，Admin 私有 Note/Guide 各多一篇测试草稿，原文保留。新 `_publication/jobs` 数为 0。上传和发布真实请求均 405。只保存资料，不构建或部署公开站。

### 保留的中途失败与修复

1. CLI Secret 设置会递增函数版本，首次检查错误地假设 v2 仅加 1。立即关闭 writes，未保存任何业务资料；通过官方 get_edge_function 将远端源码与本地 97 KB 包逐字核对一致，再以代码包摘要恢复，未重复部署掩盖不确定状态。
2. 首个合成 Spot 缺少正式必填 latitude/longitude，422 / PostgreSQL 23502，0 条记录插入，旧队列未变。保存失败回执并关闭 writes 后，确认约束与数据状态；仅补全合成坐标后恢复。没有放宽数据库约束、增加权限或修改公开记录。
3. 新入口的 capability 参数曾被 TypeScript 推断为全 false，补充类型标注后严格检查 PASS。改动不改变生成 JS，SHA-256 仍与实际部署逐字一致：`fc14b50b5afec201c6ef850ea72aeb640d3599efc9f90363799254b0d2bfe7ae`。

未重跑 36 项历史测试、全站 Preview 或旧媒体检查；仅构建一次受改动影响的小型 Admin 静态包并完成严格类型检查。

## 网站与下一阶段

正式网站 canonical 仍为 `333e51aa-506e-4a66-a7c6-4f28e3e890a1`、0 Functions；www 发布回执 200 且 SHA-256 与原备份一致。五份已有备份哈希与既有离线恢复回执核对通过，未重新 dump。NAS 不在本轮范围。

可申请第二阶段私有图片上传，但本轮未创建正式私有 R2 桶或写入凭据，尚不能上传。发布队列和 Production Publisher 继续 OFF/Disabled；旧 Storage Public、r2.dev、DNS 未改。下一阶段须另行批准正式私有 R2 范围、服务器凭据及上传验收。

如需暂停文字编辑，运行 `formal-text-deploy.mjs --disable-writes vrufunuomioczocdsoer`，保留私有权限、资料和不明提交回执。不要为回退新后台而自动重开旧 Cron/Trigger或匿名权限，也不处理旧 pending。旧对象恢复须另行核对并获批。公开静态站无需回退，因为本轮未发布。
