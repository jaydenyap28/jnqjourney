# 正式后台只读验收与上线准备

正式业务写入、上传及发布全部 OFF。公开站保持 Production `333e51aa-506e-4a66-a7c6-4f28e3e890a1`，部署前后已核对 canonical、域名、Production 分支及配置指纹不变。未修改正式 RLS、Storage Public、DNS 或旧 R2 开关。

## 已部署的只读界面

[正式后台](https://read-only.jnqjourney-admin-formal.pages.dev/admin) · [固定部署](https://48d4052d.jnqjourney-admin-formal.pages.dev)

- Deployment `48d4052d-1a9c-4984-bede-c4de6a822648`；独立 Admin 项目的 `read-only` Preview、noindex、0 Pages Functions，Admin Production canonical 仍为空。
- 页面明确显示「正式后台 · 只读模式」。生成包中的新增、保存、删除、上传、发布、字段修改控件禁用；资料查看、Note/Guide 选择及主列表搜索筛选保留。原有编辑器源文件没有删除或改写，未来可通过新的经批准构建恢复。
- 采用 TypeScript AST 修改生成副本，避免通过粗略替换遗漏同类控件。原编辑处理函数仍在，浏览器本地写包装和服务端硬性拒绝分别保留。
- 正式 Edge `jnq-admin-formal` 版本 2、JWT 验证开启。仅调整受信任 Admin Origin 的 CORS，使浏览器能读取非 GET 被拒绝时的真实 405；任何非 GET 仍在服务器身份核验后、业务处理前拒绝。没有启用任何变更路径。
- 小型 Admin 的真实 Next 14 构建和类型检查通过；10 项既有身份/发布边界测试、4 项新增只读 UI/正式写入准备测试通过。没有重建公开全站，也没有扫描历史照片。
- 实际 HTTP：验收页 200 / noindex；受信任 Origin 的 DELETE 预检 204；匿名后台资料读取 401；正式公开首页 200。[脱敏证据](formal-admin-acceptance-evidence.json)

## 真实账号验收状态

用户已亲自在正式 Chrome 登录，并确认真实景点列表 586 条。运营者 UUID 已按此前用户确认分别列入服务端 Editor / Publisher allowlist，UUID 不在公开构建包或本报告中。

本轮电脑工具能够识别该 Chrome 窗口和 Admin 地址，但输入操作返回 `GetCursorPos: Access is denied (0x80070005)`；后续截图/状态又报告窗口 minimized。截图曾为全黑。没有读取浏览器凭据、创建正式普通账号或用另一身份绕过该限制。

因此真实 Spot 详情、6 Note、7 Guide、七项实际带会话拒写、退出后未过期 Token 重放验收尚不能记为 PASS。既有服务端只读来源证据、本地身份测试、用户确认的列表与这些浏览器验收分别记录。

新增 [同会话只读安全验收页](https://read-only.jnqjourney-admin-formal.pages.dev/readonly-check)，供当前登录浏览器继续：

1. 读取真实 Session、586 条 Spot、6 Note、7 Guide 和一个真实 Spot 详情。
2. 对固定写入、删除、上传、发布路径发出空的被拒请求，必须全部为服务器 405；前后再次读取并逐字比较三类资料。
3. 用户最后单独点击退出；确认退出前 Token 仍未过期，再重放旧 Token，必须 401。Token 只由应用自己的 SDK 获取并留在临时函数内，不出现在工具、URL、控制台、回执或文件中。

该页面未运行或未收到实际结果前，以上仍为 PENDING。没有额外获准的正式普通账号；其真实云端 403 测试继续 PENDING，本地普通身份拒绝测试不冒充此项。

## NAS 加密备份

用户选择的 NAS 映射有效，剩余 760,365,510,656 bytes，空间足够。实际共享根目录及新目标目录仍有 Everyone ReadAndExecute；新目标目录为空。

尝试仅收紧新建空目标目录的个人 ACL，未改共享根目录。PowerShell `Set-Acl` 报缺少 `SeSecurityPrivilege`；仅操作 DACL 的 `icacls` 又报 NAS 个人 SID 无法映射。最终只读复核为 protected ACL、3 条 Allow、仍含 Everyone、文件数 0。

**NAS 加密备份未完成，未向 NAS 传输明文或密文，也未要求用户提供加密密码。** 已请求用户在 NAS 自身权限界面限制该目录到个人账号。不会提高 Windows 权限、更换身份或放宽目录安全要求。

已准备 `scripts/cloudflare/formal-nas-backup.ps1`：

- 运行时显式传入获批准的本机目录、NAS 目录和共享映射；验证本机 owner/SYSTEM ACL、NAS 个人 ACL、空间、原数据库 5 文件与静态 tar/映射既有 SHA-256。
- 只归档已有 PostgreSQL/Auth/角色/ACL/Storage metadata 备份、权威版本与指针、已备份 R2/Storage 原件、静态 tar、映射、配置及恢复回执；排除构建缓存、执行器密钥和数据库密码。不重新 dump 或扫描 4,515 张媒体。
- 在受保护本机目录交互式设置新密码，字符仅通过标准输入交给 GPG AES-256，禁用对称密码缓存；不放命令参数、环境变量、临时密码文件、日志或 Git。
- 仅复制密文 `.partial`，从 NAS 读回 SHA-256 一致后改为最终名，并复制密文 SHA 文件。失败保留证据，不宣称成功。
- 此脚本只完成语法审查，**尚未进行真实加密/复制验收**。独立设备解密与恢复仍 PENDING；原本机 PostgreSQL 及文件恢复 PASS 证据继续保留。

## 正式写入准备与仍未开启的部分

- `formal-write-plan.mjs` 是纯本地准备，不被正式 Edge 引入，不执行 I/O。新增 Spot 不接受客户端 ID，由正式数据库 identity 分配，默认 draft；不使用 92000–92999 / 95000–95099 隔离保留 ID。修改必须明确 NULL/非 NULL 版本，要求条件写返回恰好一条；隐藏独立为 hidden，不把旧 NULL 发布状态批量变为草稿。
- Note / Guide 版本匹配准备拒绝缺失和过期版本。实际启用仍须复用各自 normalization、不可变版本、独占锁、最新指针、失败读回和不确定结果核对协议；不能以 Spot 保存代替。
- 正式 Storage `location-images` 仍 Public。未批准新的私有权威写入范围和 R2 私有暂存范围，故图片上传和新草稿文件不能启用。隔离测试 bucket 不可改名后直接复用为生产。
- Windows `JnQ Journey Production Publisher` 实查仍为 Disabled。本次增强禁用保护入口，要求写入、上传、发布三个配置全部 false。该任务动作仍只是 OFF 检查，**不是已接通的生产发布器**。真实队列、领取、生产动作仍须另批；不能仅启用计划任务就宣称生产发布可用。
- 正式发布必须继续使用完整公开基线合并已批准变更，保留原 582 个合法公开 Spot 与其他内容，精确撤销差异及回退资格核对沿用既有验收。

## 后续功能差异

当前独立 Admin 尚未开放旧项目的 Affiliate 设置、Klook Widgets、地区管理、旅游配套、报告、Storage 清理，以及 Guide 的部分价格/实际支出专用预览、英文自动生成。原功能源码仍在。本轮不开发这些功能；已能服务端读取部分关联链接不等于完整 Affiliate 管理已恢复。

## 分别批准的生产操作

1. 在真实只读会话、备份及恢复条件具备后，批准正式 Spot / Note / Guide 的具体写入适配与启用；保留 UUID 鉴权、版本控制、审计和故障关闭。
2. 单独批准正式私有图片暂存、完成验证、引用与公开机制；不得在公开旧桶前缀中保存私密草稿。
3. 单独批准生产队列与 Windows 真实执行动作、生产部署权限及启用；继续 8/天、240/月、10 分钟冷却，失败不替换当前公开站。
4. 另批正式 RLS / Storage Public / 旧 R2 收口，不与后台按钮启用合并为默示授权。

当前正式只读浏览器验收 PENDING、NAS 异机备份 BLOCKED，正式编辑/上传/发布均保持 OFF，不标记生产写入 CUTOVER_READY。
