# 新版兼容 Preview 原生验收 · NO-GO / HOLD

## 最新相册性能修复结果

从 `f584cd4` 继续的最小优化提交为 `400b513`：保留所有 receipt 正文校验，将重复对象 HEAD 合并为受限 LIST，截断缺项回退精确 HEAD。本地 47 项通过。新 Preview `5332ce56` 的首次 17 图保存原生 CPU **19 ms**，仍超过 10 ms；本轮在 **6/40** 停止，30 图未执行。新版 NO-GO、正式迁移 HOLD。详见[独立性能报告与原生证据](GALLERY-CPU-2026-11-09.md)。

下方原始 29 ms 与此前 2/40 记录保持不变，未用新结果覆盖，也未将尚未完成的兼容/Chrome 项目标记通过。

## 工具恢复后实际执行：隔离结构 PASS，新版 CPU NO-GO

**最新结论：新版 17 图保存的 Cloudflare 原生 CPU 为 29 ms，超过本轮 10 ms 门槛。已在第 2 次候选请求后停止；新版 NO-GO，正式迁移继续 HOLD。** HTTP 200 和 Tail outcome=ok 均不改变超额结论，未以重试或低值覆盖。历史 `3603644` 技术 GO、固定 `c592d40c` 和历史 10 ms 临界证据保留。

### 获批数据库修改和结构验收

安装连接 Supabase 后，`execute_sql` 与 `apply_migration` 均恢复。正常 MCP 重新读取隔离项目 `rnamstwwbzknwbjwdgrf`：行集 hash、3 条记录、33 列定义、约束、索引、依赖、RLS/ACL/policies、Auth 基线全部与本机快照一致。随后 **正常审批的 apply_migration 返回 success=true**，仅执行下方原有事务的四项隔离 DDL。没有使用 CLI 或其他通道绕过审批执行 SQL。

迁移后实际 catalog 检查为 36 列：`review_jayden` / `review_qing` nullable text、`is_visited` nullable boolean，`opening_hours` nullable text、无默认值。原三条记录剔除新增三列后的 hash 仍为 `fddd394725dc87f4bd072235c4fcfc9b`，新增三列及 opening_hours 均保留 SQL NULL。约束、索引、RLS/ACL/policies、Auth 结构与迁移前相同；DDL 后、原生登录前的 Auth users/sessions 仍为 1/0。PostgREST 36 列零行 SELECT 返回 **200**，不再是 42703。[结构证据及保留的历史失败](evidence/isolated-schema-alignment-2026-11-09.json)、[结构对齐后预检](evidence/compatibility-schema-aligned-preflight-2026-11-09.json)

原生验收停止后的只读查询再次确认：原三条记录数量 3、上述行集 hash 不变、调整字段非空数 0、RLS/ACL/policies 不变、Auth 用户数仍为 1、Auth 结构 hash 不变。测试登录会产生会话，本轮没有在超额后额外调用 Worker 登出。

### Preview 与隔离资料

- 新固定 Preview：[bd7af17d](https://bd7af17d.jnqjourney-spot-loop-migration-candidate.pages.dev)。真实请求使用既定分支别名，部署 ID `bd7af17d-0d90-4781-90df-d409ba376428`，Tail 与该部署关联。产品文件及包 hash 与 `4e443f4` 一致，部署 Git 元数据为 `a2442a4`；本轮只新增验收工具和报告，没有修改产品、上传架构或进行整站构建。
- 部署前后 Production canonical 均为空；最终只读确认 Production 变量/Secrets 0、R2 binding 0、部署 0，双方 Fail closed。四个 Preview Secrets 均保持 secret_text。旧固定 c592d40c 仍 success / preview。没有正式域名绑定。[部署证据](evidence/compatibility-native-deployment-2026-11-09.json)、[部署后边界](evidence/compatibility-native-post-boundaries-2026-11-09.json)
- 新建六个隔离合成 fixture：IDs 2–7，角色 editor/gallery/redirect/hidden/delete/cycle；不复用旧 fixture 1，不触及原三条记录。仅 Preview 的 allowlist 使用这些新 ID，私有 bucket 为既定测试 bucket。
- 预置 30 个不同对象路径的 68 字节合成 PNG 及 receipt，receipt 的 etag/version 取自真实 R2 REST PUT 响应。最初 PNG 的 IDAT CRC 错误在部署前本机被发现，停止预置后修正；最终样本逐 chunk 校验 CRC 并成功解压 IDAT，原错误对象在新 fixture 路径内覆盖修复。没有发起额外 Worker 上传验证。[合成资料与操作尝试计数](evidence/compatibility-synthetic-fixtures-2026-11-09.json)

### 逐请求原生证据与立即停止

| Acceptance ID | 请求 | HTTP / outcome | 原生 CPU | 原生 wall time | 结果 |
| --- | --- | --- | --- | --- | --- |
| `1794208392388-0` | POST session，真实 Supabase Auth 登录 | 200 / ok | **4 ms** | 1336 ms | 通过 |
| `1794208394627-1` | PATCH Spot 3，nullable 版本、完整可编辑字段、17 图相册 | 200 / ok | **29 ms** | 6627 ms | **超额，立即 HOLD** |

计数 **2/40**。Tail 共 2 条原生事件，Acceptance ID、method/status 对应，parseErrors/unmatchedRequests/truncatedEvents 均为 0。超额后未再发送候选 Worker 请求，只停止该 Tail 并完成只读证据核对。Tail 的非零退出码来自停止本轮子进程，不是额外请求失败。[原生事件](evidence/compatibility-native-runtime-2026-11-09.json)、[请求日志及停止原因](evidence/compatibility-native-results-2026-11-09.json)

17 图 PATCH 的 HTTP 成功已经观察到，但脚本在 CPU 门槛处停止，没有继续进行响应字段断言及公开读回，因此 **不能把 17 图保存/读取完整标记通过**。30 图、长元数据公开读取、原生 CAS、双 complete / complete-cancel、失败清理、图片匿名保护、301/302/循环/隐藏目标、双语/关闭/DELETE 及新版 Chrome 交互均未执行。本轮没有复测历史 1/5/10 MiB 上传或旧版 Chrome。

### R2、免费额度与最小后续建议

17 个不同媒体在源码成功路径上各执行 receipt GET 与 object HEAD，共 **34 次校验读取（按执行路径推断）**；Tail 没有提供逐请求 R2 操作计数，因此不能冒充原生计量或账单数据。没有发生 Worker 重试；30 图预期为 60 次校验读取，CPU 和实际操作量仍未知。

合成预置工具记录 R2 PUT 尝试 113 次（包括被中断的错误样本预置及修正），DB INSERT 6 次、PATCH 1 次。PUT 尝试数不是账单数；中断点的一次操作结果未逐项确认。最终 30 张图片及其 30 个 receipt 的 PUT 均成功。测试数据仅为小型合成对象，没有正式媒体复制，未升级方案或新建服务。

**新增实测风险是 17 图保存已经达到 29 ms，无法通过既定 Free 10 ms 预算。** 6.627 秒 wall time 与 CPU 不混用，也不根据 outcome=ok 推断平台长期会容许超额。当前不能声称新版在免费额度内可可靠运行。最低限度的下一步应单独定位相册校验循环与字段 JSON 处理的 CPU 消耗，评估能否减少未变动媒体的重复校验，同时维持签名、对象版本、私有存储和引用保护；本轮不自行重构、不删除功能、不重试测值。修复与新的有界复验需下一轮安排。

**已关闭 P0：隔离 schema 与 36 列 SELECT 不兼容。仍阻塞：新版相册保存 CPU 超额及后续原生/Chrome 验收未完成。** 正式迁移的旧公开媒体保护、正式 SELECT/RLS、发布队列/cron 协调、完整后台/slug/SEO/跨模块契约、正式备份/恢复与路由切换仍未关闭，也未获正式实施授权。本轮未连接正式 Supabase，未修改正式 R2、Production、DNS、Vercel 或 main。到此停止。

以下各节为按时间保留的历史记录，其中“DDL 未执行/工具不可用”已被本节的新实测结果覆盖。

## 检查点 2a435b8 后的工具恢复检查

本次只检查了会话工具可用性：`execute_sql` 与 `apply_migration` 仍未出现在可调用工具清单中。**工具尚未恢复，正常审批通道无法检测**；这不是一次新的审批用量拒绝，也不能说明此前用量限制已解除。具体时间记入[原脱敏证据](evidence/isolated-schema-alignment-2026-11-09.json)的 `toolAvailabilityChecks`，此前观测结果保持原样。

本机快照 SHA-256 与此前记录相同。未重新连接远端数据库，因此本轮不能确认远端结构、三条记录、RLS 或 Auth 仍与快照一致；前述结构和环境检查仅代表此前检查时刻。DDL 未执行，未通过 CLI、SQL Editor、其他凭据或工具替代执行，未部署 Preview、创建 fixture 或发起候选 Worker 请求，预算仍为 **0/40**。

既有四项隔离 DDL 授权继续有效。恢复条件仍为 Supabase 工具及正常审批通道可用，随后必须重新比较远端与快照，任一变化即停止。新版验收和正式迁移继续 HOLD；历史技术 GO 与 10 ms 临界证据保留，本次未关闭 P0，也无新增 CPU 或免费额度实测。

## 获批隔离结构修复：2026-11-09 14:30 SGT 续验

当前检查 HEAD 为 `6ce6954`，产品源码保持 `4e443f4`。用户已授权仅修改隔离 Supabase `rnamstwwbzknwbjwdgrf` 的四项字段定义；这项授权已经具备，无需重新批准相同 DDL。

**本轮停在执行工具，DDL 未执行。** `apply_migration` 的自动审批审核因用量限制未完成，明确返回 action not executed，并说明这不是安全性否决。随后连接工具从当前会话消失。未改用 CLI 或其他通道绕过审批。以下状态为执行前实测，不冒充迁移后验收。[本轮脱敏证据](evidence/isolated-schema-alignment-2026-11-09.json)

| 阶段 | 实际结果 |
| --- | --- |
| 隔离结构复核 | 3 条记录、33 列；`opening_hours` nullable JSONB、无默认值，非 SQL NULL 数为 0。三项新增列仍不存在。 |
| 转换依赖 | opening_hours 的列依赖为空，自定义触发器为空。现有 CHECK 涉及 image_metadata、publication_status、redirect_type；没有 opening_hours 约束。另有 location_id 外键引用 locations，带 DELETE CASCADE；后续 DELETE 验收只能使用新专属 fixture。 |
| 可恢复快照 | 已保存原始三条完整记录、字段/默认值/identity、约束、索引、触发器、RLS/policy/ACL 和入站外键。存于 Git 忽略的 `cloudflare/spot-loop/.dev.vars.compatibility-schema-backup.json`，不提交数据内容。未执行恢复演练。 |
| 数据校验 | 原始行集 MD5 `fddd394725dc87f4bd072235c4fcfc9b`；备份文件 SHA-256 `8a30d70f1896d95ae42858d75babfa4b8def8c31394d44d661850ceff377fc3c`。行集 MD5 仅用于事务内变更检测，不作为安全签名。 |
| RLS / Auth 基线 | locations RLS enabled、非 forced，anon 只有 SELECT grant 和 fixture_spot_read policy；Auth users 1、sessions 0。Auth 结构 hash 与 policy 摘要已存证。DDL 后未核验，不能标记为修复后通过。 |
| Cloudflare 边界 | 四个 Preview Secrets 均为 secret_text；Production canonical 空，变量/Secrets 0、R2 binding 0、部署 0。双方 Fail closed；仅隔离 bucket，managed public access false、custom domains 0，未绑定正式域名。 |
| 现有结构预检 | 仍为 33/36 列，PostgREST 400 / 42703。新版 worker 与 contract 打包 hash 仍匹配。 |
| 部署 / fixtures / 原生测试 | 全部未执行。候选 Worker 请求 **0/40**，没有新增 CPU 或 R2 操作量实测，也没有重复历史上传或 Chrome 测试。固定旧版 c592d40c 仍为成功 Preview。 |

### 已准备但未执行的事务

下面是供恢复执行时复核的事务正文，不是自动执行入口，不应加入正式项目的 migrations。只能通过恢复后的获准连接对指定隔离项目执行。执行前重新读表并核对快照；若已有任何数据或依赖变化，停止并重新评估快照，不能机械替换校验值。正式项目禁止使用。

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.locations IN ACCESS EXCLUSIVE MODE;
DO $isolated_alignment$
DECLARE opening_att record;
BEGIN
  IF (SELECT count(*) FROM public.locations) <> 3
    OR (SELECT md5(jsonb_agg(to_jsonb(l) ORDER BY id)::text)
        FROM public.locations l) IS DISTINCT FROM 'fddd394725dc87f4bd072235c4fcfc9b'
    THEN RAISE EXCEPTION 'ISOLATED_SNAPSHOT_CHANGED'; END IF;
  IF EXISTS (SELECT 1 FROM public.locations WHERE opening_hours IS NOT NULL)
    THEN RAISE EXCEPTION 'NON_NULL_OPENING_HOURS_REFUSED'; END IF;
  SELECT a.attnum, a.atttypid, a.attnotnull, a.attgenerated,
    EXISTS(SELECT 1 FROM pg_attrdef d
      WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum) AS has_default
    INTO STRICT opening_att FROM pg_attribute a
    WHERE a.attrelid='public.locations'::regclass
      AND a.attname='opening_hours' AND NOT a.attisdropped;
  IF opening_att.atttypid <> 'jsonb'::regtype OR opening_att.attnotnull
    OR opening_att.has_default OR opening_att.attgenerated <> ''
    THEN RAISE EXCEPTION 'UNEXPECTED_OPENING_HOURS_DEFINITION'; END IF;
  IF EXISTS(SELECT 1 FROM pg_depend
      WHERE refobjid='public.locations'::regclass AND refobjsubid=opening_att.attnum)
    OR EXISTS(SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.locations'::regclass AND NOT tgisinternal)
    THEN RAISE EXCEPTION 'UNREVIEWED_DEPENDENCY'; END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.locations'::regclass
    AND attname IN ('review_jayden','review_qing','is_visited') AND NOT attisdropped)
    THEN RAISE EXCEPTION 'UNEXPECTED_EXISTING_COLUMNS'; END IF;
  ALTER TABLE public.locations
    ADD COLUMN review_jayden text NULL,
    ADD COLUMN review_qing text NULL,
    ADD COLUMN is_visited boolean NULL,
    ALTER COLUMN opening_hours TYPE text USING opening_hours::text;
  IF EXISTS(SELECT 1 FROM public.locations WHERE opening_hours IS NOT NULL)
    THEN RAISE EXCEPTION 'NULL_PRESERVATION_FAILED'; END IF;
END $isolated_alignment$;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

同一事务持有排他表锁，先核验行集及 SQL NULL，再转换；SQL NULL 的 text cast 保留 NULL。任何断言或 DDL 错误都应回滚整个事务，不得忽略后继续。快照中的原结构和原记录支持人工恢复；在原三条数据且新增列全 NULL 的阶段，可经复核反向转换并移除新增列。创建测试数据后应基于快照逐项恢复，不能自动覆盖整个表或触发外键级联。

### 恢复条件与结论

1. 恢复 Supabase 连接及自动审批审核可用性，沿用既有授权，仅执行上述隔离 DDL。
2. 重读 36 列类型；比较原三条记录（剔除新增三列后的 JSON 行集）、NULL、RLS/policies/ACL 与 Auth 结构；PostgREST SELECT 必须成功。重新确认 Cloudflare 边界后才创建独立 fixture。
3. 继续新版小型 Preview 与最多 40 次请求的原生 Tail 验收；任一超过 10 ms、Tail 缺失或保护失败立即 HOLD。17/30 图、CAS、编辑器等均仍待验证。

本轮 **P0 未关闭**：隔离 schema 对齐仍未执行；正式旧媒体保护、SELECT/RLS、发布队列/cron、路由/SEO/跨模块契约、备份/恢复和切换授权等原 P0 保留。当前新版结论为 **NO-GO / HOLD（工具阻塞，尚未完成技术验收）**；历史技术 GO 不变，正式迁移继续 HOLD。没有新增免费额度可靠性证据，历史 10 ms 临界记录保留。

以下保留上一轮预检记录，DDL 等待授权的描述属于当时状态，已由本轮授权覆盖。

`4e443f4` 在隔离环境预检被现有测试库的结构差异阻断。36 列零行 SELECT 实际返回 **400 / `42703`**。修正版的云端原生验收停在部署之前，候选 Worker 请求预算使用 **0/40**。历史 `3603644` 技术 GO 和固定 `c592d40c` 验收记录保留。[本轮脱敏预检证据](evidence/compatibility-native-preflight-2026-11-09.json)

## 各阶段实际结果

| 项目 | 结果 |
| --- | --- |
| 分支和版本 | `codex/cloudflare-free-migration`，核验源码提交 `4e443f48f1cad5c652f0480c0f676d5c0c983b51`。 |
| Production 边界 | canonical 为空，环境变量/Secrets 0、R2 binding 0、部署数 0，Production 与 Preview 均 Fail closed。 |
| Preview 配置 | 四个变量 `SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`CANDIDATE_R2_ACCESS_KEY_ID`、`CANDIDATE_R2_SECRET_ACCESS_KEY` 均确认为 `secret_text`。只记录名称和类型判定。 |
| 隔离资源 | Supabase ref 为 `rnamstwwbzknwbjwdgrf`。测试 bucket `jnqjourney-spot-loop-isolated-media` 的 managed public access 为 false，自定义域名数 0。 |
| 历史部署 | `c592d40c-394e-4cbc-b842-f3cb2aa71535` 仍为 success / preview，项目 latest deployment 也仍为该版本。 |
| 小型打包 | 已复制现有 Worker、纯契约模块及测试静态资源。Worker 与 `spot-contract.mjs` 分别和源码 hash 一致，包中该模块存在。只执行小候选文件打包。 |
| 隔离数据库结构 | 现有 `locations` 为 33 列，新版固定 SELECT 需要 36 列。缺 `review_jayden`、`review_qing`、`is_visited`。`opening_hours` 实际为 JSONB，新版正式兼容契约为 text。 |
| 部署 | 因结构预检失败停在部署前。 |
| 原生验收 | 17/30 图、完整字段、CAS、complete/cancel、失败清理、重定向和新编辑器浏览器交互均为 **待验证**。新 fixture 与合成图片尚未创建。 |

源码 Worker SHA-256 为 `168496a4c55263d1e404fc1f59707b295b933316bad260665cc373f339d1963b`，契约模块为 `bed2b522c19f0863ae5b846e50ad2cbd66cdd287041bdcd9aa9453ccfcea99cf`。这两个 hash 证明打包内容，不能代替云端部署或 CPU 证据。

## 证实的阻塞及最小建议

新增的三列直接导致 PostgREST 拒绝 `4e443f4` 的 SELECT，后台与公开页面都会使用这个字段清单。`opening_hours` 类型差异还会影响“完整字段保持正确类型”的验收。此前隔离库满足旧版较短的字段清单，新版 36 列尚未完成隔离结构对齐。

最小建议是仅对隔离项目 `rnamstwwbzknwbjwdgrf` 做经批准的结构对齐，增加可空 text 的 `review_jayden`、`review_qing` 及可空 boolean 的 `is_visited`。先盘点隔离 `opening_hours` 的现有值，明确如何保留 JSONB 值或 text 序列化，再将该列与预定 text 契约对齐。该操作涉及 DDL，等待用户另行批准。本轮没有执行 SQL，也没有修改上传实现。

结构对齐后重新通过只读预检，才创建专用 fixture，并将新版小型候选部署为 Preview。之后沿用最多 40 次请求、逐请求原生 Tail 的验收门槛。任一超过 10 ms、缺失 trace、安全失败或误删均停止。无需重复历史文件尺寸和旧 Chrome 测试。

## CPU、操作数及免费额度判断

- 新版 17/30 图保存 CPU 为 **未知**，实际 R2 操作数为 **未测**。没有发生候选 Worker 重试或实际 R2 CAS 竞争。
- `4e443f4` 的源码每个不同媒体会读取一次 receipt 和一次 object HEAD，17/30 图分别对应预期 34/60 次校验读取。它们仍是代码计数，尚无本轮实际计量佐证。
- 历史 Presigned PUT 的 **10 ms 临界值**继续保留。此次预检没有提供新的云端 CPU 或额度风险实测。
- 当前没有依据决定是否进一步减少相册检查。先解决结构阻塞并取得代表性原生结果，再判断热点和必要的最小修复。

## 仍在 HOLD 的正式迁移事项

旧公开媒体 URL、正式 Supabase SELECT/RLS、旧发布队列与 cron 协调、正式后台/slug/SEO/跨模块完整契约、正式备份及可用回滚入口仍为 P0。本轮仅查询候选项目和隔离 schema，正式数据、R2、RLS、cron、DNS、Vercel 与 main 均保持隔离。

本轮交付独立报告、只读预检工具与脱敏结果，到此停止。新版结论为环境兼容 **NO-GO**，正式迁移继续 **HOLD**。
