# RELEASE-READY：最终工程准备

2026-10-31（新加坡）。功能基准`111beff`，分支`codex/home-search-mobile-performance`。结论：**本地工程准备完成；真实Preview未验收，Production NO-GO。** 本轮没有新增旅游功能、Push、部署、构建、云端变量修改、生产数据或权限写入；仅新增发布工具、修复工程检查和读取五表目录元数据。

## 已准备好

- `df0623f → 4f476ac → 845b469 → a2217ea → 01e7331 → 111beff`全部在当前祖先链。RC1.3 `f69d446`、RC1.4 `a2091c2`、RC1.5 `58f9a4b/11424cb`也完整继承。RC1.2原工作区由`f69d446`保存，31项路径均在该提交和候选中；没有缺失、盲目合并或覆盖。
- 复核并复用Preview既有保护：测试ref/URL/public Key一致性；拒绝Service Role、R2写凭据、GA ID、同步/AI凭据；实际后台/发布/同步handler早退；统计跳过；私有Storage工厂不构造高权限客户端；Klook/联盟metadata自动请求关闭；全站HTTP noindex、robots禁止抓取；隔离配置缺失时启动拒绝。现有9项隔离测试通过，证据是本地合成范围。
- 新增 [可复用入口](release-check.md) `npm run release:check`，只读、无需生产管理员密钥，明确区分通过/失败/未验收，复用质量规则，抽样核对中英Spot的HTTP/Canonical/robots/Sitemap资格，并覆盖公开页、Guide、Note视频入口、配套和联系链接。默认不连接任何站点，不将582个Active等同Sitemap数量。
- 修复两项工程检查漂移：Preview测试加载器补上新快照模块；`release:bundle`按现行reader检查独立版本快照，不再强制携带已停用的逐Spot归档。新增7项脚本测试通过；没有借机修改产品逻辑。

## 必须等真实Preview验收

目前没有本候选的新Preview deployment及其配置/测试角色证据。因此不能确认云端已隔离、测试数据实际可读、匿名角色确实无写/RPC能力、素材完全来自独立源，或云端没有额外Cron/Webhook/邮件/构建命令。代码可拒绝已知危险配置，不能证明自定义域名、CNAME、public Key的真实归属。

需用获准的新Preview构建验收实际serverless打包、测试schema/RLS读合同、非空样例及发布状态、中英文路由、真实字体图片/手机布局、视频播放和WhatsApp上下文；浏览器网络须确认无GA/Insights/Klook自动外发和生产数据库请求。现有Mapbox默认token和bundled生产公开素材不能当作已隔离；使用批准的测试token/素材或受控阻断。不得用旧`.next`、旧截图或Fixture通过代替。

## 当前真实Production阻碍

**五张历史备份表风险已由2026-10-31只读目录核验确认：**

| public表 | 当前OID | RLS | anon/authenticated |
| --- | ---: | --- | --- |
| hainan_package_merge_backup_20261006 | 46956 | 未启用 | 表ACL含读取及写入/删除等权限 |
| spot_content_backup_20261009 | 47045 | 未启用 | 同上 |
| spot_content_backup_20261013_evening | 47360 | 未启用 | 同上 |
| spot_content_backup_20261013_lijiang_hangzhou | 47428 | 未启用 | 同上 |
| spot_northeast_backup_20261013 | 47319 | 未启用 | 同上 |

未读取历史表正文，也未向匿名接口试写。只读ACL/RLS、owner、列ACL、策略、依赖和函数签名证据见 [元数据记录](../artifacts/release-readiness/backup-metadata.json)；查询使用`BEGIN TRANSACTION READ ONLY`并`ROLLBACK`。本次五表无列级ACL覆盖、无策略，owner均postgres；service_role有BYPASSRLS。网站运行源码无这五表的直接引用；目录依赖仅见自身约束/默认值，public函数字面扫描未见引用。**这支持新版网站不依赖五表公开读取，但不能排除动态SQL、其他schema函数或外部任务。**

原 [RLS方案](rc1.3-database-safety.md)、[默认回滚草案](rc1.3-backup-hardening.proposed.sql)保留。静态复核：恰好五表、排除业务表、表/列ACL撤销、ENABLE而非FORCE RLS、事务及短超时、默认ROLLBACK均具备；不是已经在PostgreSQL执行验证的迁移。草案仍为空名单，不会因本轮发现表名就自动执行。

正式执行前必须：独立核实五表及OID/owner未漂移、排查外部/动态依赖、保存schema-only与原始表/列ACL及RLS恢复脚本、确认管理读取仍有效、获得单独权限变更授权。事务内失败直接ROLLBACK；提交后的回退只能逐项恢复原授权和RLS状态。原ACL曾经宽松，恢复公开访问或DISABLE RLS必须另行授权，不能为了回退方便`GRANT ALL`。Supabase说明RLS和grants共同控制公开访问，[官方RLS文档](https://supabase.com/docs/guides/database/postgres/row-level-security)亦提示高权限角色及视图可能绕过RLS。

除五表风险外，Production放行还缺：真实Preview通过、生产公开读合同/关键配套状态与当前版本一致性确认、明确的候选完整commit、新生产构建与部署证据、真实稳定回退deployment及负责人、独立Production批准。旧任务只有在证据表明仍影响当前公开版本时才成为阻碍；不能把几条历史error或缺翻译本身无条件升级成发布故障。

## 需要人工授权的操作

1. 配置或核实独立测试资源/角色权限和变量作用域，处理branch/team/integration覆盖；不Reveal/导出密钥。若需要新资源，须先批准。
2. Push及一次受控Preview部署/新构建；授权与Production分开。保护中的Preview由获准人员提供访问与验收方式，不向验收脚本塞保护token。
3. 五表权限收紧或回退、测试数据写入/发布演练、真实统计接收测试，各自单独批准，不捆绑执行。
4. 关键项通过后再批准Production部署/推广及其回退。Preview推广可能产生使用Production配置的新部署，不能把Preview构建通过视为生产产物已验收。[Vercel推广说明](https://vercel.com/docs/cli/promote)

## 可留到上线后

七篇Spot待审稿和其余内容完善、非阻断英文翻译、更多旅行资讯、统计效果观察、历史任务整理及非关键视觉润色均不再追加到本轮。未经核实的内容继续现有fallback/noindex；不强行开放索引、不自动发布草稿、不重启优化Cron。时计台疑似错图在原待审记录中保留，内容负责人决定替换，不在发布工程中重新编排媒体。

本轮定向验证仅覆盖新验收工具、当前包追踪合同和已有Preview保护。合成HTTP/NFT测试证明检查器会发现错误，不证明候选已在线通过；本轮未对真实Preview执行HTTP/浏览器验收，未进行完整构建。至此停止本地功能迭代，下一步是按明确边界补真实环境证据，而非继续增加本地旅游版本。
