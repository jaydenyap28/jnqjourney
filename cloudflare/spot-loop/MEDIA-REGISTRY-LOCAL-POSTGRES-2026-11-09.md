# Trusted Media Registry 本机 PostgreSQL 真验

**PASS。** 审核提交 `fd5ec90` 中的 SQL 草案通过真实 PostgreSQL 17.11 验收。建议下一阶段单独批准本机 PostgREST 验证。正式迁移继续 HOLD。

Windows 本机 Docker Desktop 4.98.0 的 CLI 与 Engine 均为 29.9.2，Engine 通过 `docker_engine` 命名管道连接，运行 Linux amd64 容器。镜像来自 Docker Hub `docker.io/library/postgres:17`，本机镜像 ID 和仓库摘要均为 `sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f`。容器内服务器报告 `17.11 (Debian 17.11-1.pgdg13+2)`，版本号 `170011`。首次拉取遇到凭据助手不在 PATH，使用现有 Docker Desktop 目录补齐单次进程 PATH 后成功。

| RPC | PostgreSQL 实际结果 |
| --- | --- |
| register | PASS。首次登记和相同身份确认成功。无登记的确认重试、版本变化、撤销后的重新登记及越界 Spot 均拒绝。 |
| save | PASS。四个独立合成 Spot 各自从 NULL 版本首次保存 1、5、17、30 图，随后使用新版本原样重存。36 字段输出、旧版本冲突和缺项、重复、伪造或撤销后的身份均得到预期结果。 |
| withdraw | PASS。带版本下架后匿名公开标志为 false。合法重新发布恢复标志，触发器跳过时下架失败。 |
| revoke | PASS。撤销与下架同事务，重复撤销成功，直接清空墓碑被拒。故障注入阻止下架时，登记撤销也回滚，原引用仍可查。 |
| delete | PASS。带版本删除成功，合成外键及登记依赖级联清理。并发登记在删除先提交时被拒。触发器跳过删除返回错误。 |
| lookup | PASS。未引用时返回非公开标志，发布后为公开，下架后为非公开，撤销或未登记时返回 SQL NULL。 |

ACL 验收使用真实数据库角色。`anon`、`authenticated` 和仅继承 PUBLIC 权限的合成角色对六个 RPC 及私有表直接访问均被拒。`service_role` 可执行预期 RPC，直接改写对象版本或删除登记被拒。注入继承的默认 EXECUTE 后，DDL 因 `42501 / JNQ_RPC_EXECUTE_EXPOSED` 整笔失败。查询确认私有 schema 和 RPC 未留下，移除注入条件后原草案成功创建。

| SQLSTATE | 终次实测 | 触发原因 |
| --- | ---: | --- |
| `42501` | 27 | 权限拒绝，包括恶意默认 EXECUTE 整笔 DDL 回滚 |
| `23514` | 1 | 跨 Spot 对象 key 违反检查约束 |
| `PT400` | 1 | 旧媒体路径不符合可信媒体引用格式 |
| `PT404` | 2 | 越界或已删除 Spot |
| `PT409` | 12 | 旧版本、撤销、媒体身份冲突及未确认登记 |
| `PT503` | 5 | 触发器跳过下架或删除、撤销下架失败、更新前或更新后改写 |
| `55P03` | 1 | 双连接持锁超时，释放锁后重新保存成功 |
| `40P01` | 1 | 双连接反序锁定两个 Spot 的负对照，回滚后保存成功 |

`READ COMMITTED` 并发场景由 `pg_blocking_pids()` 确认确有数据库阻塞。save/save、save/revoke 两种先后顺序、register/delete 两种先后顺序，以及登记提交或回滚后确认重试均符合预期。SQLSTATE 计数包括故障注入和预期拒绝。成功语句计数还包括锁探测，不能当作业务测试数。

首次运行通过后，将相册测试从单一 Spot 逐步扩展改为四个独立初始 Spot，以验证每种规模均能独立完成首次保存。验收脚本增加了容器隔离断言、SQLSTATE 记录和清理核对。SQL 草案保持与审核版本一致。

两个测试容器分别为 `d552e9e438fee835027f17bac2e6a85cb43365dbae81309e7dfd07fde52eaa17` 和 `5e8879d13719141bfde4483190d49b92f470ca2b0e5816082e5af9301b134195`。启动时核验 `network=none`、无发布端口、`--rm`、数据目录为 tmpfs 且无持久挂载。清理后对两个专属 ID 分别复核，`docker ps` 返回空，`docker container inspect` 返回不存在。官方镜像保留供复验。[脱敏证据](evidence/media-registry-local-postgres-2026-11-09.json)

PostgREST 的 HTTP 角色映射、RPC 暴露与错误码映射，真实 Cloudflare CPU，以及 Supabase 云端容量和权限，均待各自验收。本次仅使用本机合成数据。
