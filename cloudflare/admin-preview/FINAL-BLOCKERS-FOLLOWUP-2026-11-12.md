# 正式后台最后两个阻塞：执行跟进

正式写入、上传、Publisher 和公开站 Production 发布保持 OFF / 不变。未使用电脑控制、Firecrawl、付费服务、云端 DDL 或 NAS 权限修改，没有重新 dump、扫描照片或验收全站。

## 同会话只读验收

[验收页](https://read-only.jnqjourney-admin-formal.pages.dev/readonly-check) 由用户在原 Chrome 手动运行。当前尚未收到结果，状态仍为 PENDING；已确认的登录及 586 条列表不重复测试。

已检查并加固回执安全：PASS 仅含固定项目、数量和 HTTP 状态；未知 SDK / JSON 异常不再原样输出，只显示固定脱敏错误。密码、JWT、邮箱、UUID 和后台内容不进入回执。登出重放在请求前、响应后都检查旧会话尚未自然过期，避免把自然过期的 401 误计为退出保护通过。Token 仍仅在应用内短时使用。

只更新这一小型 Admin 静态包；正式 Edge 仍为只读版本 2，原服务器拒写规则不变。未重新开发编辑器或测试历史全站。实际手动读回、七项 405、退出后 401 必须收到用户结果后才记 PASS。

当前 Deployment `f21ad2ee-b1ef-4e58-9776-a36b74a5a667`，独立 Admin `read-only` Preview、noindex、0 Functions；公开站 Production 配置指纹保持不变。[脱敏证据](formal-blockers-followup-evidence.json)

## Weline 私人目录操作指南

上轮仅依据 Windows Everyone ACL 判断 NAS 有效开放范围过强，现已修正为“有效隔离未确认”。Windows 的 Samba ACL 表示不能独自证明访客或其他账号能读取，也不能用 SID 映射失败替代 NAS 权限判断。

Weline 官方区分：我的空间仅本人、公共空间供绑定用户、群组空间供组内成员。Samba 有独立当前账号和“添加路径”。以下步骤不要求改共享根目录、格式化、改 Windows 权限或更换执行身份。[三大空间](https://doc.welinecn.com/Weline%20Pro%20桌面端指南/文件管理/三大空间/) · [Samba](https://doc.welinecn.com/Weline%20Pro%20桌面端指南/Weline%20Pro%20应用/Samba/)

1. 使用本人 Weline 账号进入目标设备 → 文件管理 → **我的空间**，新建 `JnQJourney/EncryptedBackups/production-admin-20261112`。不要仅将公共目录标为隐藏，也不要放在公共/群组空间；不移动现有资料。
2. 到设备的 Samba 应用，核对“当前账号”，在 **添加路径** 中选择这个私人目录（如果当前版本提供该选项）。不为备份目录建立分享链接，不把它加入公共空间或其他人的访问路径。
3. 在 Windows 通过该账号已有的 Samba 凭据映射目录，记录界面实际给出的 UNC 与新盘符；不要猜测 `home` 根目录等于本人空间，不替换其他正在使用的映射。密码不交给聊天或脚本。
4. 用无敏感内容的探针核对本人可读写；在另一客户端不带凭据访问应被拒绝，已有非本人普通账号也不能列出或读取该目录。如设备确无其他启用账号，核对 NAS 成员列表并记录此事实，不为测试创建账号。Windows 已有登录缓存的同一映射不能冒充匿名测试。
5. 将最终目标路径和上述结论交给用户审批确认，之后才能记录本机私有权限证据并开始备份。

如果该设备不能为现有 home 路径证明个人隔离：**仅当 NAS 原生管理界面支持时**，新增独立私人 SMB 共享，例如 `JnQJourneyBackupPrivate`，存储位置选本人私人目录，唯一获准账号可读写，其他普通账号及访客拒绝，关闭分享链接。只调整新共享，不修改原 home / public。官方文档没有证明所有 Weline 型号支持任意共享级 ACL；没有此功能时请 Weline 厂商确认私人 Samba 导出方式，不自行编辑 smb.conf、启用容器 SMB 或另建未经批准的服务。

官方 FAQ 描述 Samba 不提供 anonymous 访问，但这只是产品说明，不是该 NAS 的实测结论。设备成员、路径和访问结果仍须确认。[官方 FAQ](https://doc.welinecn.com/FAQ/应用/) · [成员权限](https://doc.welinecn.com/FAQ/用户和权限/)

## 加密备份门控及执行

`formal-nas-backup.ps1` 不再将 NAS 根 owner SID、Windows ACE 数量作为唯一许可条件，也不调用 icacls / Set-Acl / 身份切换。

新增 `-NasPermissionEvidence`：必须位于原 owner-only 本机备份目录，记录用户批准的准确映射、目标、NAS 账号、个人空间/私人共享模型、分享关闭、本人读写、访客拒绝、其他账号拒绝（或已核实没有其他启用账号）。证据有效期 24 小时；未知、错误目标、未批准、字符串冒充布尔值或过期证据一律拒绝。提交的 example 全为未确认值，不能直接通过；不会根据官方文档自动填 PASS。此为人工核实的 NAS 权限证据，不冒充脚本自动探测。

脚本继续验证本机 ACL、现有备份 SHA-256、空间和实际盘符映射；从不复制明文到 NAS。归档、GPG AES-256 和密码均留在本机；密码交互式输入并经标准输入送入 GPG，禁用密码缓存。仅将密文以 CreateNew 写入新 `.partial`，读回 SHA-256 一致后改为最终名称，保留密文 SHA 和本机回执。结果不明时不覆盖或盲目重试。

成功后只删除本轮 `nas-encrypted-<UTC>/production-recovery.tar` 临时明文；删除前检查绝对路径、专属运行目录和 reparse point，原始数据库/媒体/静态备份与本机密文均保留。此为逻辑删除，不宣称 SSD 可恢复扇区已物理擦除。失败时保留 owner-only 本机归档供核对，不把失败记为成功。独立设备解密/恢复必须另有真实结果，不能用密文哈希或原本机恢复 PASS 代替。

当前尚无获准的新私人目标或访问证据，因此**本轮未创建归档、未加密、未传输 NAS 文件，异机恢复 PENDING**。

## 正式写入准备

新增纯本地 `formal-document-plan.ts`，复用原 Note / Guide payload 校验和 Note merge：分别验证自己的版本、权威版本指针、别名冲突，保留完整集合中未修改的记录及原输入；Guide 继续预算校验和 legacy 关联审查，新 Note 默认草稿。返回计划明确要求私有权威存储、服务器媒体验证、已批准公开投影，不能自动发布。没有导入正式 Edge，不能通过设置环境变量开启。

Spot 正式 identity / NULL CAS 准备沿用已有实现。私有图片仍缺获批准的正式 bucket/prefix、服务器凭据与完成登记适配；不会复用公开旧桶或隔离测试 bucket。完整网站发布器和全量基线合并沿用已有验收，正式队列/执行动作尚未启用；新增 Guide 草稿也不能直接成为构建器的公开 Guide 集合。当前只是准备，不能声称正式读写/上传/生产队列已接通。

定点结果：10 项本地只读回执及文档计划测试 PASS；17 项合成 NAS 权限/清理断言 PASS、无 NAS I/O；备份脚本语法 PASS；小型 Admin Next 构建/类型检查 PASS。这些不替代手动 Auth 验收、NAS 有效权限、加密读回或正式保存实测。

## 最少下一步

1. 用户提供验收页的真实脱敏 PASS/FAIL 文本，再更新只读验收结论。
2. 用户确认真正私有的 NAS 路径、访问检查并批准目标，再运行本机交互式加密/密文复制；独立设备恢复按真实条件执行或保留 PENDING。
3. 正式内容写入、私有图片上传、生产队列和 Publisher 分别审批；在此之前均 OFF。公开站 Production、RLS、Storage Public、DNS 和旧 R2 不变。
