# RC1.5 点击口径与部署交接

基准 a2091c2，独立分支 `codex/rc1.5-content-conversion`。本文件只交接本地成果，没有新建分析服务、GA 属性、数据库迁移或部署任务。

## 访问基线的含义

用户通过生产 Supabase 只读提供最近30天的内部 page_views：Spot 7,600、Guide 108、配套详情165。本轮没有独立读取生产数据库，也没有逐Spot的访问数、来源渠道、去重访客或询价结果。不能把它们叫作 Google 自然流量，不能用108/7,600计算 Spot→Guide 转化率。

## 复用现有统计

| 行为 | 现有事件/存储 | RC1.5 补全 | 如何解读 |
| --- | --- | --- | --- |
| Spot→Guide | GA `related_guide_click` | 标题附近入口与原有攻略卡片都带 `page_type=spot`、`spot_id`、`destination_type=guide`、`destination_slug`、`cta_position` | 只是点击；按页面类型过滤，避免混入其他模块同名事件 |
| Spot→相关配套 | GA `package_cta_click` | 标题附近入口与原有配套卡片带相同来源字段，目标类型为package | 来自已有真实关系；不能理解成已看完或询价 |
| 配套→WhatsApp | GA `package_whatsapp_click`，已有 `package_enquiry_start` | 配套卡片补 `package_id` 和 `cta_position=package_card`；详情/选项的已有上下文保留 | 两个事件来自同一次点击，只选前者作为主点击口径，不能相加，不能算已发送信息或成交 |
| Affiliate 外链 | GA `klook_click` / `trip_click` / `hotel_affiliate_click` / `affiliate_click`；现有 `/api/affiliate-click`→`affiliate_clicks` | GA 补稳定的 `affiliate_link_id`，原生链接直接打开，统计异步处理 | 只统计支持的普通点击；新标签/中键、拦截器、网络失败都会漏记，不能视为佣金/订单 |

`cta_position` 区分 `spot_reading_cue`、`spot_related_guide`、`spot_related_package`。同一访客可多次点击，事件数不是人数。Note 的反向关联不新增事件或分析模块。

## 最轻量的使用方式

1. 先核实既有 GA 属性是否已启用并能收数据，只确认配置存在，不打印 Measurement ID 或任何环境值。本轮未读取线上配置，尚不能宣布生产统计可靠。
2. 在既有 GA 报表/探索中按上述事件名及来源字段过滤；只登记确实要用的事件参数，如 `page_type`、`cta_position`、`destination_type`、`destination_slug`、`spot_id`、`package_id`、`affiliate_link_id`。报表配置属于后续人工步骤，本轮没有改 GA 账户。
3. 若需要比例，使用同一属性、同一时区/期间和过滤范围的 GA 会话或事件口径。例如“浏览受测Spot后发生Guide点击的会话 / 浏览受测Spot的会话”，用现有GA会话能力去重，不新建用户标识。配套→WhatsApp也在同一GA配套详情范围计算；列表卡片点击单列，不混入详情分母。
4. 上线后先建立至少一个完整观察周期，再比较改版前后。内容、渠道、季节、样本量变化要一并记录，不能仅凭点击增长断言转化提升。
5. GA未配置、被拦截或停用时，页面照常工作，新增点击不写数据库。本轮不提供没有数据支撑的转化率，也不为此新增表、服务、付费出口或复杂归因系统。

## 隐私与计数边界

- 新增 Spot 事件只显式发送内容ID、受限slug、目标类型及入口位置，不发送目标完整URL、查询串、WhatsApp正文、电话号码、邮箱或新的会话ID。新增 `affiliate_link_id` / `package_id` 也是内容标识。
- GA本身仍使用站点既有配置与自动页面上下文，这不等于匿名或零收集。现有 `GoogleAnalytics.tsx` 的 page_view 会包含完整页面URL及查询串，GA同意管理、数据保留及数据脱敏设置需单独核实；不要在站内链接添加联系人或询价正文参数。本轮没有扩大这些采集，也没有宣称完成隐私审计。
- 旧联盟API本来就包含session_id、user_agent和referrer，本轮没有新增这些字段。后续如要进一步减少采集，应先明确报表依赖、保留周期和现有隐私告知，再单独批准变更；不能把这部分旧机制宣传为完全匿名。
- 联盟API的明细插入和 `affiliate_links.clicks + 1` 是既有两步写入，汇总计数可能并发丢增量。需要对账时，应只读比较 `affiliate_clicks` 明细；本轮不改生产结构、RPC或历史计数。
- Preview保留既有只读/无统计外发保护。本地用mock验证参数；真实GA入库要在获准上线后有限DebugView核验，不能为补验绕过Preview保护。

## 已完成但未上线

- RC1.2：既有内容检查、SEO/Sitemap/结构化数据、配套选项与安全保存等，保留原实现。
- RC1.3：内容分级与预览、手机端/配套体验调整、关闭Spot及Note识别的本地收尾、备份表安全方案，沿用既有验收状态。
- RC1.4：广州本地摘要修正、卡片与详情内容优先级、真实Guide关联、发布快照读回及错误源保护。对应源码已在基准提交；是否已覆盖云端内容仍待核验。
- RC1.5：Spot前置阅读入口、真实Note反向关联、点击来源补全、联盟原生链接与44px最小触控区域。全部仍是本地代码。

内容待应用：RC1.4的5份草稿继续独立保留；RC1.5新增18项、18份SEO与6段介绍开篇，见 `spot-review-drafts.md/json`。没有一个草稿写入公开快照或生产Supabase，不可直接整篇批量覆盖。

## 下一次部署必须满足的门槛

1. **内容**：获准后只读取回选中Spot当前完整字段与updated_at，逐字段接受建议；对龟山年代、旧票价、交通和营业等未核实项按草稿要求处理。保留全文与真实体验，待单独授权后使用既有保存/发布路径。
2. **真实数据**：隔离Preview验证Spot、Guide、Note、英文页、关闭/重定向页、详情与卡片使用相同内容版本；验证RC1.4发布读回、CDN失效和外部服务异常下的ISR行为。本地Fixture的200不是生产Supabase通过。
3. **视觉/交互**：浏览器可用后按本轮报告清单，在常见手机和桌面检查排版、裁切、阅读入口、配套价格/选项、WhatsApp打开及原生联盟跳转。Preview不可执行生产写入或真实联盟计数。
4. **统计**：确认GA现有配置、隐私设置、报表字段；Preview确认没有统计外发。本地事件测试不能替代真实GA接收验证。
5. **安全**：五张备份表继续使用 [RC1.3安全方案](../rc1.3-database-safety.md)、[预检](../rc1.3-database-preflight.sql) 和 [拟议权限收紧](../rc1.3-backup-hardening.proposed.sql)，先确认真实表名及函数/Cron依赖，再单独授权执行。当前不执行SQL或重跑失败同步。
6. **额度/批准**：Vercel额度恢复、明确批准Push及一次受控Preview后才能执行。Production需另行批准；当前没有任何Push/部署授权。

回退应先记录**当时真实线上**的稳定deployment ID、配置与对应源码；a2091c2只是本地RC1.4基线，不能当作已上线版本。代码问题回到已验证的线上deployment；内容若另行发布，则保留每条修改前字段与版本，只回退确认过的字段，并按既有发布流程同步，禁止上传旧整站快照覆盖新资料。数据库权限方案的回退沿用RC1.3，不与网站代码部署捆绑执行。
