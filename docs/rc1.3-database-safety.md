# RC1.3 数据库安全方案（未执行）

2026-10-26。本轮没有连接或修改生产 Supabase，没有重跑同步任务或启用 Cron。

## 当前证据

用户独立连接确认五张历史备份表存在权限/RLS 问题，但本地 migrations、API、后台和维护脚本没有这五张表的确切名称。不能由“源码未找到”推断线上数据库函数、Cron、Edge Functions 或其他项目没有依赖。

四个 Spot、两个 Note 英文同步失败任务缺少当前任务 ID、状态、来源版本、错误分类与后续成功记录，本轮保持待验。源码中的英文 fallback/noindex 是正常产品行为，但不能据此将某条失败任务认定为刻意跳过。

## 执行前条件

1. 管理员使用只读连接执行 `rc1.3-database-preflight.sql`，获得精确 schema/name/oid/owner、表及列 ACL、RLS flags、策略、角色继承和依赖元数据。另存 schema-only 备份和原始权限恢复脚本，不向共享报告导出历史正文、密钥、函数正文或 cron.command。
2. 按五个确切表名检查 pg_depend、view/materialized view/rule、SQL/PLpgSQL 函数；预检只返回候选函数签名及 SECURITY DEFINER 标记。动态 SQL、外部 Edge Functions、Cron 定义和其他项目由管理员另行检查。SECURITY DEFINER 可能绕过 RLS，存在未解决的公网 RPC 暴露则 NO-GO。
3. 核实 service_role BYPASSRLS、owner、继承角色权限与业务使用路径。浏览器 authenticated 若有合理备份读取需求，应迁至经过鉴权的服务端管理入口。
4. 保存每表和每列原始 GRANT（含 grantor、grant option）、RLS flags、策略和只读行数/内容摘要。确认正式业务表不在名单内。执行前再次比对 OID、owner、ACL，漂移则停止。
5. 将草案空 allowlist 填成且仅成五张审核过的备份表；获得独立生产变更授权后才能执行。本轮不执行。

## 收紧与兼容性

`rc1.3-backup-hardening.proposed.sql` 是审阅草案，不在自动迁移目录。空名单会失败，末尾默认 ROLLBACK。

采用短锁超时和一次事务；撤销 PUBLIC、anon、authenticated 的全部表级权限及历史列级 SELECT/INSERT/UPDATE/REFERENCES；ENABLE RLS，不 FORCE、不删除资料、不改 owner、不新增宽松策略。保留 service_role/owner 的既有管理能力。表 RLS 无法代替 SECURITY DEFINER/RPC、角色继承和外部任务审查。

不修改全库 default privileges，以免影响未来业务表；未来备份的默认权限须按实际创建角色另案处理。源码没有直接备份表引用仅是低风险迹象，真实依赖未核实前不能认定兼容。

## 验证与回退

事务内核对 ACL/RLS；任一步失败 ROLLBACK。获准提交后，分别以真实 anon/authenticated 验证表与列的读取/写入均拒绝，检查可疑 RPC；service_role 验证原有只读备份用途。比较管理员前后行数/摘要，保留所有数据。抽查公开首页、Spot、Guide、Note、配套和后台读取，不为测试修改正式行。

回退必须逐项恢复已保存的原始表/列 GRANT、grant option、grantor 与 RLS flags，不能 `GRANT ALL TO anon, authenticated`。原策略未变无需重建。恢复 DISABLE RLS 或其他已知暴露需要明确回退授权；优先修复依赖。没有原 ACL 备份禁止执行。

## 六个同步任务的判定

先确认实际队列表与列名，再只读导出任务/实体 ID、状态、attempts、创建/结束时间、source/synced version 和脱敏错误类别，不导出 payload/header/token。

| 分类 | 必要证据 | 处理 |
| --- | --- | --- |
| 历史失败已替代 | 更晚成功任务且最新公开版本等于来源 | 标记历史，不重跑 |
| 刻意跳过 | 明确 disabled/hidden/no-source/fallback reason，符合当前发布意图 | 记录原因，不将 skip 当同步成功 |
| 当前故障 | 最新版本仍落后或页面失败，且没有后续成功 | 提供单项修复/恢复方案，另行执行授权 |
| 证据不足 | 只有旧 error 行，没有时间或版本链 | 保持待验，不自动重试 |

53 个地图链接只核验当前发布链路，不重复修补。三个已完善 Spot 不覆盖。Spot 优化 Cron 保持停用。
