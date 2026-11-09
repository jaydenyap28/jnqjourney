# 新版兼容 Preview 原生验收 · NO-GO / HOLD

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
