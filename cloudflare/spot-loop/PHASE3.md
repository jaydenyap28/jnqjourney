# 第三阶段：真实免费 Preview 验收

**后续结果：用户已批准共享 Fail closed 设置；该阻塞已解除。修正版真实 HTTP 小图闭环通过，但 10 MiB 上传实测 CPU 74 ms，当前仍 HOLD。最新完整结果见 [PHASE3-RESULTS.md](PHASE3-RESULTS.md)。下文是授权前的历史记录。**

当前 **HOLD**。沿用 `codex/cloudflare-free-migration`；尚无 Preview 部署或真实浏览器闭环验收结果。

## 已核实与已建立

- 复用本机缓存的 Wrangler **4.158.0** 及用户已有 OAuth，没有再次登录。`npx --no-install` 无法解析既有缓存时直接运行已安装的 Wrangler 入口，没有重装工具。
- Cloudflare 当前 Workers 方案为 **Free / $0**，10 ms CPU / request、100,000 requests / UTC day。开始操作时 dashboard 显示当日 Workers 请求 0。
- 既有 R2 账户当前周期 **$0.00**，存储 **7.44 GB**，Class A **19**、Class B 约 **66.42k**；少量隔离 fixture 有免费余量。没有升级、订阅或添加计费服务。
- 新建私有 bucket：`jnqjourney-spot-loop-isolated-media`，APAC、Standard；r2.dev disabled，无自定义域名。正式 `jnqjourney-img` 仅读取汇总用量，未写入或修改。
- 新建 Pages 项目：`jnqjourney-spot-loop-migration-candidate`，Production branch=`main`，**还没有任何 deployment**，未绑定正式域名。
- Wrangler 4.158.0 首次将 Pages project create 转交新版 Workers 并失败，未部署。按 CLI 明确给出的 `--force` 原生 Pages 创建入口成功；后续命令不再带该兼容参数。
- Supabase CLI 原有授权可用，组织 `JNQ Media` 显示 **FREE**。当前组织已有正式项目和独立的 `jnqjourney-preview`，本阶段复用后者，未申请第三个项目、创建付费分支或暂停现有项目。
- 测试项目固定为 **`rnamstwwbzknwbjwdgrf`**；只读 OpenAPI 确认 `locations` 具备候选所需所有列。未访问正式项目 `vrufunuomioczocdsoer` 的数据库或 Auth 数据。
- 在该隔离项目中新增本次随机 fixture Auth 用户及 **Spot ID 1 / `cloudflare-loop-fixture-1`**，初始为 draft。真实 Supabase Auth 密码登录 HTTP **200**。没有修改已有记录或执行新增 SQL。
- 管理 API 凭据仅通过官方 CLI 在私有子进程中取得并用于服务器请求，不写配置、日志或浏览器；随机测试密码位于 Git 已忽略的 `.dev.vars.spot-loop-session`，不得提交或打印。
- 未重跑第一、第二阶段已通过的本地测试；只检查了本轮新管理脚本语法/lint。

## 阻塞：Cloudflare 不允许仅 Preview 设置 Fail closed

针对新测试项目的 **Preview-only** PATCH 被 Cloudflare 拒绝：

```text
HTTP 400 / code 8000066
You must set the `fail_open` property value equally for production and preview environments.
```

这与用户“不得修改 Production”的边界存在冲突。因此暂停配置/部署，没有自动修改新候选项目的 Production 设置，也没有退回 Fail open。

已向用户提出具体选择：仅允许这个**尚无 Production 部署的新项目**两个环境同时 Fail closed，随后仍只部署 Preview；或保持原禁止范围并暂停部署。生产站、生产库、生产 bucket 和正式域名均不在变更范围。

`phase3-configure-preview.mjs` 已准备受显式开关保护的修正，**未经同意不执行** `--allow-empty-candidate-shared-fail-closed`。它仅会改变新项目 Production 的 `fail_open`，不会向该环境添加测试 secrets/binding 或创建 Production deployment；其余配置逐项保持。

## 尚未通过

- Preview Fail closed 的实际生效与部署后复核。
- Cloudflare Preview URL（尚无部署，不把项目保留域名冒充可用测试地址）。
- 真实浏览器登录、编辑、原生 R2 图片上传、保存、匿名即时读取、下架和重新发布。
- Workers CPU 分布、真实请求数、10 MiB 上传的原生运行成本；没有把本地耗时或 HTTP wall time 当成 CPU。
- 完整免费方案可靠性。组织仍显示 grace period 已结束的历史用量警告；当前余量有利于小范围测试，但不构成长期全站容量承诺。

## 继续执行的边界

获明确允许后，仅配置此候选项目的共享 Fail closed；其他 secrets 与 R2 binding 只放 Preview。部署分支必须是 `codex/cloudflare-free-migration`，不能是 `main`。部署前后检查 `canonical_deployment` 仍为空，且部署结果 `environment=preview`。

随后才执行浏览器与免费 CPU 验收。超过免费配额或出现无法消除的关键功能兼容问题时停止，不启用付费能力、不写正式资源。其余 Notes/Guide/配套后台仍未扩写。

只读/隔离证据留在 `artifacts/cloudflare-phase3/`：`supabase-preflight.json`、`fixture.json`、`preview-config.json`。这些报告不含密码、API keys 或 session tokens。
