# Trusted Media Registry 本机 PostgREST HTTP 验收

**POSTGREST_LOCAL_PASS。** 基于 `4b9723d`，最终运行的 138 个 HTTP 场景全部通过。PostgreSQL SQL 草案和既有 17.11 验收证据原样保留。本轮只增加独立 HTTP 测试脚本、报告和脱敏证据。正式迁移继续 HOLD。

| 运行组件 | 实际版本及镜像 |
| --- | --- |
| PostgreSQL | 17.11，Debian `17.11-1.pgdg13+2`，`docker.io/library/postgres:17`，`sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f` |
| PostgREST | 14.12，`docker.io/postgrest/postgrest:v14.12`，`sha256:54000f24847d01a2c2302e0041cf0618b875c57fb48507d743cfa9aaa50bf43c` |

两个镜像均核对了本机 ID、仓库摘要和 `linux/amd64` 架构，启动使用固定 ID 与 `--pull=never`。PostgREST 固定版本来自官方发布。两容器仅加入本轮内部 Docker 网络，均没有 Docker 发布端口。PostgreSQL 数据目录为 tmpfs。Docker Desktop 未在纯内部网络发布端口，因此 Windows 端使用只监听 `127.0.0.1` 的临时 TCP 转发，经本机 Docker Engine 将 HTTP 字节转入内部网络。PostgREST 只暴露 `public`，测试凭据从本机随机生成，仅用于本轮进程和容器。[官方 v14.12 发布](https://github.com/PostgREST/postgrest/releases/tag/v14.12)

## HTTP 权限

下表各结果都对 **register、save、withdraw、revoke、delete、lookup** 六个 RPC 逐一实测。

| 角色或请求 | 实际 HTTP / 错误码 | 结论 |
| --- | --- | --- |
| 无 JWT | 401 / `42501` | 6/6 拒绝 |
| 合法合成 authenticated JWT | 403 / `42501` | 6/6 拒绝 |
| 错误签名，声明 service_role | 401 / `PGRST301` | 6/6 拒绝 |
| 过期，声明 service_role | 401 / `PGRST303` | 6/6 拒绝 |
| 合法合成 service_role JWT | 200，或预期契约错误 | 六个 RPC 的成功路径均实测 |

数据库角色查询确认 authenticator 只能切换到明确授予的三个其他角色 `anon`、`authenticated`、`service_role`。签名合法但声明未授权 `postgres` 的请求被拒，authenticator 自身也没有 RPC 权限。伪造请求体角色、请求头角色及普通用户直写 Spot 均被拒。未授权场景执行前后的 Spot、登记和启用范围状态摘要相同。

无 JWT、authenticated、service_role 三种上下文均无法直读私有 Registry。默认 profile 返回 404／`PGRST205`。设置 `Accept-Profile` 或 `Content-Profile` 尝试访问私有 schema 返回 406／`PGRST106`。真实状态和错误码列于逐场景证据。[PostgREST schema 文档](https://docs.postgrest.org/en/v14/references/api/schemas.html)

## RPC 契约与故障

| RPC | 最终实际结果 |
| --- | --- |
| register | 首次登记及相同身份确认返回 200／`true`。版本冲突、未确认及撤销后重新登记返回 409／`PT409`。 |
| save | 四个独立 Spot 分别完成 1、5、17、30 图的 NULL 版本首次保存及原样重存。36 字段、数组、对象、布尔与 NULL 值通过核对。旧版本、缺项及伪造观察值返回 409／`PT409`。 |
| withdraw | 正确版本下架返回 200。旧版本返回 409。匿名 Spot 查询不再返回下架行，合法重新发布后公开标志恢复。 |
| revoke | 首次和重复撤销返回 200。数据库确认登记墓碑与 Spot 下架均生效，已撤销引用无法重新发布。 |
| delete | 旧版本返回 409，正确版本删除返回 200，重复请求返回 404／`PT404`。数据库确认登记级联清除。 |
| lookup | 未引用或下架时公开标志为 false，引用并发布时为 true。未登记、已撤销和已删除返回 HTTP 200 及 JSON `null`。 |

触发器抑制保存返回 **503／`PT503`**。非法字段输入返回 **400／`PT400`**。版本和引用冲突返回 **409／`PT409`**，已删除 Spot 返回 **404／`PT404`**。这些结果来自实际 HTTP 响应。缓存启动后先返回 404／`PGRST202`，SQL 已应用但缓存未刷新时仍返回相同错误。执行 `NOTIFY pgrst, 'reload schema'` 后同一调用成功。额外或缺失参数继续返回 `PGRST202`，目录实测恰有六个预期签名。[PostgREST schema cache 文档](https://docs.postgrest.org/en/v14/references/schema_cache.html)

持行锁触发数据库语句超时，实测是 **HTTP 500／`57014`**。超时前后数据库状态相同。仅确认重试被拒，释放锁后的新登记成功且恰好一条记录。响应丢失用例中，客户端传输层接收了真实 HTTP 200 后丢弃响应体，应用依赖数据库确认同一身份。重试成功，改变版本重试返回 409，登记仍只有一条且身份与时间戳一致。该用例覆盖应用层响应丢失，原始 TCP 断开路径没有通过。

## 诊断和清理

首轮内部网络端口发布失败。改用回环转发后，最初的强制断开探针及随后三个短连接诊断变体曾收到 HTTP 400，其中诊断记录显示 PostgREST 的 `code` 和 `message` 为空。该现象的根因未确认。最终采用默认 HTTP 连接管理和应用层响应丢弃后，完整验收通过。较早失败保留在脱敏诊断摘要，未计入最终 138 项。

本轮六套临时栈的容器和内部网络均按本轮专属 ID 清理，并以各次标签独立复核无遗留。开启的 Windows 回环端口均复核关闭。测试数据库使用 tmpfs，凭据仅随容器和进程存在，报告中没有密钥、密码或完整 JWT。镜像保留供复验。

本轮结论限本机 PostgREST HTTP。Cloudflare 原生 CPU、远端数据库与账号实际配置、免费额度余量仍待验收。历史 29 ms、19 ms 和 10 ms 证据保留。[逐项 HTTP 证据与清理记录](evidence/media-registry-local-postgrest-2026-11-09.json)
