-- =============================================
-- Supabase SQL: 查询最大图片并关联景点名称（v2 - 修复匹配）
-- 在 Supabase Dashboard > SQL Editor 中运行此查询
-- =============================================

WITH image_sizes AS (
  SELECT
    CONCAT(bucket_id, '/', name) AS full_path,
    name AS storage_path,
    -- 只提取文件名（不含路径）
    SPLIT_PART(name, '/', -1) AS file_name_only,
    bucket_id,
    (metadata->>'size')::bigint AS size_bytes,
    ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) AS size_mb,
    metadata->>'mimetype' AS mimetype
  FROM
    storage.objects
  WHERE
    bucket_id = 'location-images'
    AND (
      metadata->>'mimetype' LIKE 'image/%'
      OR name ~* '\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$'
    )
),
-- 找出最大的 50 张图片
top_images AS (
  SELECT * FROM image_sizes
  ORDER BY size_bytes DESC
  LIMIT 50
)
-- 关联 locations 表 - 用两种方式匹配
SELECT
  ti.size_mb || ' MB' AS "大小",
  ti.full_path AS "完整路径",
  l.id AS "景点ID",
  COALESCE(l.name_cn, l.name) AS "景点名称",
  l.name AS "英文名",
  CASE
    WHEN ti.storage_path LIKE '%/cover/%' THEN '封面图'
    WHEN ti.storage_path LIKE '%/places/%' THEN '景点图'
    WHEN ti.storage_path LIKE '%/galleries/%' THEN '图集'
    WHEN ti.storage_path LIKE '%/imported/%' THEN '导入图片'
    ELSE '其他'
  END AS "图片类型"
FROM
  top_images ti
LEFT JOIN locations l ON
  -- 方式 1: image_url 包含完整的 storage_path
  l.image_url LIKE '%' || ti.storage_path || '%'
  -- 方式 2: image_url 只包含文件名
  OR l.image_url LIKE '%' || ti.file_name_only || '%'
ORDER BY
  ti.size_bytes DESC;
