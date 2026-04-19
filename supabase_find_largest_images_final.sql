-- =============================================
-- Supabase SQL: 查询最大图片并关联景点名称（最终版）
-- 在 Supabase Dashboard > SQL Editor 中运行此查询
-- =============================================

WITH image_sizes AS (
  SELECT
    CONCAT(bucket_id, '/', name) AS full_path,
    name AS file_name,
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
-- 关联 locations 表
SELECT
  ti.size_mb || ' MB' AS "大小",
  ti.full_path AS "完整路径",
  l.id AS "景点ID",
  COALESCE(l.name_cn, l.name) AS "景点名称",
  l.name AS "英文名",
  CASE
    WHEN ti.full_path LIKE '%/cover/%' THEN '封面图'
    WHEN ti.full_path LIKE '%/places/%' THEN '景点图'
    WHEN ti.full_path LIKE '%/galleries/%' THEN '图集'
    ELSE '其他'
  END AS "图片类型"
FROM
  top_images ti
LEFT JOIN locations l ON
  l.image_url LIKE '%' || ti.file_name || '%'
ORDER BY
  ti.size_bytes DESC;
