# JnQ Journey

JnQ Journey 是一个基于 **Next.js 14 + Supabase + Mapbox** 的旅行地图与内容管理系统。

## 功能

- 前台地图浏览（景点搜索、地图飞行、详情抽屉）
- 多媒体展示（图集、YouTube、Facebook）
- 后台管理（新增/编辑/删除、批量操作）
- 区域管理（国家、区域、父子区域）
- 批量导入（CSV/JSON）

---

## 项目结构

```txt
jnqjourney/
├─ app/
│  ├─ page.tsx                 # 前台地图页
│  └─ admin/                   # 后台页面
├─ components/                 # 业务组件 + UI组件
├─ lib/                        # Supabase / 工具函数
├─ scripts/
│  └─ bulk-import-locations.mjs # 批量导入脚本
├─ data/
│  └─ locations-template.csv   # 导入模板
└─ supabase_*.sql              # 数据库 schema / 数据脚本
```

---

## 本地开发

```bash
npm install
npm run dev
```

打开：`http://localhost:3000`

---

## 环境变量

在 `.env.local` 中配置：

```env
NEXT_PUBLIC_MAPBOX_TOKEN=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 批量导入需要（服务端权限）
SUPABASE_SERVICE_ROLE_KEY=...

# 可选：后台图片上传使用的 bucket，默认 location-images
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=location-images
```

> 注意：`SUPABASE_SERVICE_ROLE_KEY` 仅用于本地脚本，不要暴露到前端。

如果要使用后台“直接上传图片到 Supabase Storage”功能，请先执行：

```sql
\i supabase_storage_setup.sql
```

这会创建公开读取的 `location-images` bucket。后台上传走服务端接口，不需要公开写入策略。

---

## 数据库初始化顺序（新环境）

建议按顺序执行：

1. `supabase_setup_schema.sql`（基础字段补齐）
2. 其他 `supabase_add_*` / `supabase_update_*`（按需要执行）
3. `supabase_insert_*`（分地区导入种子数据）

---

## 批量导入内容（解决“手动太慢”）

### 1) 准备数据

可用两种格式：

- CSV（参考 `data/locations-template.csv`）
- JSON（数组，每项为一个 location）

### 2) 执行导入

```bash
npm run import:locations -- ./data/locations-template.csv
# 或
npm run import:locations -- ./data/your-locations.json
```

### 3) 导入字段说明（常用）

- 必填：`name`, `latitude`, `longitude`
- 推荐：`name_cn`, `category`, `region_name`, `country`, `description`, `tags`, `image_url`
- 图集：`images`（CSV 用 `|` 分隔多图 URL）

---

## 批量检查现有景点资料

可直接扫描当前 Supabase 中的 `locations`，输出一份问题清单和建议：

```bash
npm run audit:locations
```

常用参数：

```bash
# 只检查某个国家
npm run audit:locations -- --country Malaysia

# 只检查某个区域
npm run audit:locations -- --region Johor

# 额外用地址做坐标核对（会调用 Nominatim）
npm run audit:locations -- --verify-addresses
```

输出结果会写到 `data/reports/`：

- `location-audit-*.json`
- `location-audit-*.md`

当前会检查：

- 名称、区域、地址、描述、封面图是否缺失
- 经纬度是否合法
- 分类、状态是否超出预期值
- YouTube / Facebook / 图片链接格式是否可疑
- 同一区域内的重名重复景点
- 封面图与图集重复、图集为空等媒体问题
- 可选：地址与经纬度是否明显偏离

---

## 自动修正常见问题

可自动修的低风险项包括：

- `status` 统一成 `active / temporarily_closed / permanently_closed`
- `category` 收敛成 `food / attraction`
- 缺封面时，用图集第一张补 `image_url`
- 图集去重，并移除与封面重复的图片

先预览：

```bash
npm run fix:locations
```

确认后执行：

```bash
npm run fix:locations -- --apply
```

也支持按国家或地区缩小范围：

```bash
npm run fix:locations -- --country Malaysia --apply
npm run fix:locations -- --region Johor --apply
```

---

## 变现基础（联盟营销）

### 1) 数据库表初始化
执行 SQL 文件：
```sql
\i supabase_add_affiliate_tables.sql
```

### 2) 后台管理
访问 `/admin/affiliate` 管理联盟链接（Agoda/Booking/Klook 等）。

### 3) 前台展示
组件 `<AffiliateCard />` 会自动在景点详情页等位置显示相关联盟链接。

### 4) 点击追踪
点击自动记录到 `affiliate_clicks` 表，可用于分析转化。

---

## YouTube → Gemini 半自动导入（省手工）

### 环境变量

```env
YOUTUBE_API_KEY=...
GEMINI_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
# 可选：指定模型（默认 gemini-2.0-flash）
GEMINI_MODEL=gemini-2.0-flash
```

### 使用方式

```bash
# 1) 先生成待确认文件（不会入库）
npm run import:youtube:gemini -- "https://youtu.be/FsqHMUQNiGg"

# 2) 确认 data/pending-imports/youtube_xxx.json 后，再执行入库
npm run import:youtube:gemini -- "https://youtu.be/FsqHMUQNiGg" --apply
```

### 说明

- 脚本会先抓 YouTube 标题与简介
- 用 Gemini 抽取景点结构化数据
- 用 Nominatim 自动补经纬度
- 默认先输出待确认 JSON，避免误入库

---

## 生产构建

```bash
npm run build
npm run start
```

---

## 部署（Vercel）

1. 推送代码到 Git 仓库
2. 在 Vercel 导入项目
3. 配置环境变量（同 `.env.local`，不要填 service role 到前端运行环境）
4. Deploy

---

## 后续建议

- 增加“后台批量导入页面”（上传 CSV 后后台直接跑导入）
- 增加“AI 结构化清洗”流程（把文案自动转成可导入字段）
- 增加“去重策略”（同名+同区域 or 经纬度近似去重）
