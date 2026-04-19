-- =============================================
-- Supabase SQL: 最大图片 + 景点名称（直接版）
-- 在 Supabase Dashboard > SQL Editor 中运行此查询
-- =============================================

-- 第一步：先看看 locations 表的 image_url 格式（可选）
-- SELECT id, name, name_cn, image_url FROM locations WHERE image_url IS NOT NULL LIMIT 5;

-- 第二步：查询最大图片并尝试匹配景点
WITH large_images AS (
  SELECT
    name AS storage_path,
    SPLIT_PART(name, '/', -1) AS file_name,
    (metadata->>'size')::bigint AS size_bytes,
    ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) AS size_mb
  FROM
    storage.objects
  WHERE
    bucket_id = 'location-images'
    AND (metadata->>'mimetype' LIKE 'image/%' OR name ~* '\.(jpg|jpeg|png|webp|gif)$')
    AND (metadata->>'size')::bigint > 500 * 1024 -- 大于 500KB
  ORDER BY
    size_bytes DESC
  LIMIT 30
)
SELECT
  li.size_mb || ' MB' AS "大小",
  li.storage_path AS "Storage路径",
  li.file_name AS "文件名",
  l.id AS "景点ID",
  COALESCE(l.name_cn, l.name) AS "景点名称",
  l.name AS "英文名",
  CASE
    WHEN li.storage_path LIKE '%/cover/%' THEN '封面图'
    WHEN li.storage_path LIKE '%/imported/%' THEN '导入图片'
    ELSE '其他'
  END AS "图片类型"
FROM
  large_images li
LEFT JOIN locations l ON
  -- 方式1: 完整 URL 包含 storage_path
  l.image_url LIKE '%' || li.storage_path || '%'
  -- 方式2: 只包含文件名
  OR l.image_url LIKE '%' || li.file_name
ORDER BY
  li.size_bytes DESC;
