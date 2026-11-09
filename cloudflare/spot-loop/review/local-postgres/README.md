# 独立 PostgreSQL 真验准备

**状态：本机 PostgreSQL 17.11 真验通过。** 复验使用 Windows 本机 Docker Engine。所需镜像须已存在，由操作者核对官方来源、版本、架构和镜像 ID。若当前终端找不到 `docker`，只需将已安装 Docker Desktop 的 `resources/bin` 目录加入本次进程 PATH。[版本、镜像与真实结果](../../MEDIA-REGISTRY-LOCAL-POSTGRES-2026-11-09.md)

1. 核对本机 Docker Desktop 处于 Linux containers 模式。确认本机 `docker_engine` 命名管道可用，并记录已审核的官方 PostgreSQL 17 镜像 ID。运行脚本要求该镜像 ID，使用 `--pull=never`。
2. 阅读 `fixtures.sql`、上一层的 `trusted-media-registry.draft.sql` 和 `run.mjs`。脚本只接受 Windows 本机命名管道，以无网络容器、无端口映射、临时内存数据目录启动。容器内 `psql` 走 Unix socket。本地临时角色使用合成数据和容器内信任认证。连接参数由脚本固定，运行时不接收数据库 URL。
3. 获批后，在仓库根目录运行以下命令，将占位镜像 ID 换成实际审核值。

   ```powershell
   node cloudflare/spot-loop/review/local-postgres/run.mjs --approved-local-sql sha256:<reviewed-local-image-id>
   ```

4. 脚本先验证恶意继承默认 EXECUTE 能使整笔 DDL 回滚，再正常应用草案。检查实际 `PUBLIC`、`anon`、`authenticated`、`service_role` 权限、六个 RPC、合成外键级联和 1/5/17/30 图快照。双连接在 `READ COMMITTED` 下通过 `pg_blocking_pids()` 确认阻塞，随后验证保存、撤销、重新发布、注册及删除的交错。反序锁两个 Spot 的负对照应产生 `40P01`，长锁负对照应产生 `55P03`，事务回滚后均须恢复可用。触发器跳过或改写变更时应返回 `PT503` 并保留原状态。
5. 保留运行时 PostgreSQL 版本、测试结果、失败 SQLSTATE 与对应场景。正常和失败路径均由 `finally` 清理本次容器 ID，容器使用 `--rm` 和 `tmpfs`。若进程被强行终止，先用本机 Docker 检查标签 `jnq.local-postgres=true`、镜像 ID 和本次容器 ID，仅删除已核对的本次容器。清理后确认容器不存在。全程只使用合成资料。

## 独立 PostgREST 权限测试

本机 PostgREST 14.12 HTTP 验收已通过。复验使用 `node cloudflare/spot-loop/review/local-postgres/postgrest.mjs --approved-local-http`，并预置脚本中的两个固定镜像。脚本用专属内部 Docker 网络及 Windows 回环转发。PostgreSQL 和 PostgREST 均不发布 Docker 端口。[实际结果、镜像摘要与清理](../../MEDIA-REGISTRY-LOCAL-POSTGREST-2026-11-09.md)

SQL 会话的 `SET ROLE` 与 HTTP 身份切换和 schema cache 分别验证。复验时在 Docker 内部网络连接新的合成数据库。HTTP 入口只监听 `127.0.0.1`。使用本机临时生成并销毁的 JWT Secret。创建独立 `authenticator`，仅授予测试所需角色切换权限。`db-schemas` 仅暴露 `public`，`db-anon-role` 使用 `anon`。配置和容器的生命周期与合成数据库一起清理。[PostgREST 角色切换](https://docs.postgrest.org/en/stable/references/auth.html)

| HTTP 场景 | 应验证的结果 |
| --- | --- |
| 无 token、普通 `authenticated` token、伪造签名 token 调用六个 RPC | 全部拒绝，无记录改变。分别记录 PostgREST 的实际状态和错误码。 |
| 直接访问 `registry`、切换 `Accept-Profile` 或 `Content-Profile` | 私有 schema 不可访问，包括持合成服务端 token 的 HTTP 请求。 |
| 合成 `service_role` token 调用六个 RPC | 按合约成功或拒绝。验证 `NULL` 作为显式参数、RPC 名与参数精确匹配、JSON 返回形状、`PT400/PT404/PT409/PT503` 映射。 |
| schema cache 加载与异常重试 | 暂未加载时失败，刷新后仅发布预期签名。截断或丢失响应的登记只能使用同一身份确认，不产生新登记。 |

只有 PostgreSQL 真验和角色边界获得实际结果后，才能重新讨论远端隔离 DDL。PostgREST 真验需要独立记录，Cloudflare CPU 及 Supabase 额度仍各有后续验证。
