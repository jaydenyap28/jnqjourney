# 第三阶段结果：HOLD / 当前 10 MiB 上传实现 NO-GO

续测见 [10 MiB 上传修复报告](UPLOAD-CPU-RESULTS.md)：流式独立重复 12 ms，已部署直传后备候选，等待测试 bucket 的 Preview 签名 Secrets，仍为 HOLD。下文保留此前原实现的历史验收记录。

**配置 HOLD 已解除，真实云端验收仍未通过。** 10 MiB 图片上传的原生 CPU 为 **74 ms**，超过已核实的 Workers Free **10 ms/request** 预算。收到该请求的原生 trace 后立即停止，没有继续 logout、浏览器功能测试或整站迁移。

## 可访问的 Preview

- 后台：<https://62dbbd59.jnqjourney-spot-loop-migration-candidate.pages.dev/admin/cloudflare-spot>
- 测试公开页：<https://62dbbd59.jnqjourney-spot-loop-migration-candidate.pages.dev/spot/cloudflare-loop-fixture-1>
- 稳定分支地址：<https://codex-cloudflare-free-migrat.jnqjourney-spot-loop-migration-candidate.pages.dev/admin/cloudflare-spot>

这三个地址均属于新候选项目的 Preview，不是正式站。测试 Spot 最终状态为 published；照片是生成的测试 PNG。当前页面仍是窄范围 fixture UI，不是原有完整后台/Spot 模板的替代品。

## 安全和部署边界已复核

用户明确批准后，使用 `--allow-empty-candidate-shared-fail-closed`：仅将 `jnqjourney-spot-loop-migration-candidate` 的 Production 与 Preview `fail_open` 同设 false。测试凭据、R2 binding 均只在 Preview。

每次上传前后以及原生验收停止后均检查：

- Production canonical deployment **为空**。
- Production env vars/secrets **0**，R2 binding **0**。
- Production deployment **0**；全部部署属于 `codex/cloudflare-free-migration` 的 Preview。
- 两环境均保持 Fail closed；没有绑定 `jnqjourney.com`，没有改 DNS、Vercel 或正式资源，没有升级付费。
- 正式 Supabase `vrufunuomioczocdsoer`、正式 R2 `jnqjourney-img` 均未写入。
- 实际操作只涉及测试项目 `rnamstwwbzknwbjwdgrf` 的新建 fixture 用户 / Spot **1**，及私有 bucket `jnqjourney-spot-loop-isolated-media`；没有新增 SQL。

配置时 API 接受了 10 ms CPU limit。最终项目 GET 没有返回 `limits.cpu_ms` 字段，预算依据仍是已确认的 **Workers Free 10 ms**，不能把字段缺失当成更高预算。原生 trace 才是本次 CPU 测量依据。

## 已修复的真实 Workers 兼容问题

首次原生登录 HTTP 503，经固定诊断码确认 `FETCH_REDIRECT_MODE`：原有 `redirect:'error'` 在该 Workers 运行时抛错。

修正仅涉及轻量 Spot Worker：

1. 使用 `redirect:'manual'`，显式拒绝全部上游 3xx，仍保持 fail closed，绝不将管理员凭据转发到 redirect 目标。
2. 默认 fetch 通过 `globalThis.fetch()` 调用，保留原生接收者。
3. 出站失败只暴露固定类别：receiver/cache/redirect/timeout/transport；不回显 URL、请求头或 token。
4. 新增两个定点兼容检查：模拟 Workers 拒绝 unsupported redirect mode，以及 302 不得跟随；两项分别通过。旧隔离测试仅更新 redirect 合约期望，没有重跑整套旧测试。

仅打包/上传无依赖 Worker 和静态测试编辑器，没有 Next 全站构建。为原生问题定位共产生 3 个 Preview 版本；没有 Production 版本。当前 Worker SHA-256：`e5283b7048940bdee13042ff5b58d4d05e6698ce05c0b3c38f87037189753bf0`。部署元数据标记了 dirty working tree，代码在验收后提交；没有为了更新 commit 标签再部署一次。

## 真实 HTTP / Supabase / R2 验收

以下均调用实际 Preview 和原生 R2，不再是第二阶段的替身测试：

| 操作 | HTTP / 行为 | 原生 CPU |
| --- | --- | --- |
| Supabase Auth 密码登录 | 200；HttpOnly / Secure / SameSite=Strict Cookie；JSON 无 token | 3 ms |
| 读取测试 Spot | 200 | 2 ms |
| 生成的小 PNG 上传到私有 R2 | 201；68 bytes | 2 ms |
| 编辑并保存为公开 | 200；0 次整站构建 | 3 ms |
| 匿名即时读取新 HTML | 200，包含新内容，no-store | 1 ms |
| 原生 R2 读回小图 | 200；SHA-256 与输入相同 | 1 ms |
| 匿名后台请求 | 401 | 0 ms |
| 下架 | 200 | 2 ms |
| 正常、英文、alias、HTML/TXT、公开 JSON、旧 Pages JSON | 下架后全部 404，无旧内容回放 | 有观测者 1 ms；首次 `.html` trace 未交付 |
| 下架后的匿名图片 | 401，图片不可读 | 1 ms |
| 旧版本覆盖保存 | 409 | 2 ms |
| 重新发布及匿名读回 | 200 | 各 2 ms |
| 最大 **10 MiB** 上传 | **201，但 CPU 超额** | **74 ms** |

验收脚本累计 **22 个 HTTP 请求**，状态码符合预期；**21 个请求**有按验收 ID 关联的原生 CPU 数据。`.html` 首次 trace 未交付时暂停在检查点，随后仅用一次只读诊断确认该 404 来自 Worker（诊断 trace 3 ms），并从剩余检查继续，没有重新上传小图或重复整套闭环。原生尾流共保留 **22 个事件**，其中包含该额外诊断；它不等于全账户当天请求总数，后者还包括调试与浏览器调用。

CPU 通过原生 `pages deployment tail --format json` 的 `cpuTime` 取得。尾流仅白名单保留路径、方法、状态、验收 ID 和数值时间；请求头、Cookie、正文和日志内容均不落报告。原始请求 wall time 与 CPU 分开，不用网络耗时推算 CPU。

## 明确失败：最大图片 CPU

输入为有效测试 PNG 后补零到 **10,485,760 bytes**，用于测量完整 10 MiB 请求/R2 处理成本，没有 sharp 或其他转码。该上传：

```text
HTTP status: 201
native outcome: ok
native cpuTime: 74 ms
native wallTime: 1334 ms
```

当前路径把请求 chunks 整体缓冲成 Blob 后交给 R2；大文件路径没有满足免费预算。尚未做 profiler 分解，不能把 74 ms 精确归因到某一个内部操作。也不能因为 HTTP 201 或 invocation outcome=ok，就宣称该路径在 Free 上可靠合格；运行时可能容许偶发超限，不能作为容量保证。

这是**当前大图片上传实现的 NO-GO**，不是已经证明所有 Cloudflare 免费实现都不可行。本轮按用户要求停止，没有降低原 10 MiB 功能、换付费方案或继续扩大功能适配。

## 未通过 / 剩余阻塞

- **浏览器端完整闭环未完成。** 浏览器已打开真实 Preview，但最初遇到原生登录 503；修复后程序化真实登录通过。完整浏览器编辑/上传/下架流程没有被伪称通过，CPU 超额后不再继续。
- 10 MiB 上传 CPU 超额，必须先解决并获得重新验收授权。
- 更大真实正文、多图、并发、长期流量/配额可靠性没有验证，不能用当前小 fixture 的 0–3 ms 外推全站。
- R2 bucket info 的即时汇总仍显示 0 对象 / 0 B，而原生小图读写校验已通过；该汇总存在时效差，不能据此声称实际上传没有存储/操作开销。此次共成功上传两个生成的输入，总大小约 10 MiB；计费用量以最终控制台周期数据为准。
- 先前账户核对为 Workers Free，R2 $0.00、7.44 GB；Supabase FREE 的文件存储约 0.93/1 GB，并有 grace period 结束提示。小规模测试不构成完整网站长期免费容量承诺。

临时密码桥接服务和原生尾流已关闭，临时凭据页面已关闭；测试账号密码仍只在本机 Git 忽略文件中，未提交。测试资源和 fixture 保留用于后续定位。Native acceptance 脚本在已有 CPU-HOLD 记录时会默认拒绝重新运行；显式重测开关只能在获得新授权后使用。

## 证据和复现范围

本次已提交的脱敏证据：[原生结果摘要](evidence/native-summary-2026-11-08.json)、[逐请求验收](evidence/native-checks-2026-11-08.json)、[停止后的边界复核](evidence/boundaries-2026-11-08.json)。只含 fixture 请求、状态与数值指标，不含 Auth 凭据或 Cookie。

- `artifacts/cloudflare-phase3/deployment.json`：最终 Preview、source hash、部署前后 Production 为空。
- `native-acceptance.json`：22 项真实 HTTP 状态及 CPU，停止原因 `NATIVE_CPU_LIMIT_EXCEEDED`。
- `runtime-events.json`：脱敏后的实际原生事件。
- `final-summary.json`、`post-native-boundaries.json`：结论和停止后的安全边界复核。
- `scripts/cloudflare/phase3-deploy-preview.mjs`：只部署指定分支 Preview 的保护脚本。
- `scripts/cloudflare/phase3-runtime-tail.mjs`：原生数值指标白名单。
- `tests/cloudflare-native-transport.test.mjs`：本次新增的定点兼容回归。

本轮只有新增/修改文件的静态检查，以及上述必要原生验收，没有重做全站构建、SEO 审计或已通过的本地测试套件。

[Cloudflare 原生错误说明](https://developers.cloudflare.com/workers/observability/errors/)、[CPU 与 wall time 指标及偶发超限说明](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)、[Workers Free 限制](https://developers.cloudflare.com/workers/platform/limits/)。
