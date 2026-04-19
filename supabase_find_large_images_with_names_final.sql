-- =============================================
-- Supabase SQL: 最大图片 + 景点名称（最终版）
-- 在 Supabase Dashboard > SQL Editor 中运行此查询
-- =============================================

WITH large_images AS (
  SELECT
    bucket_id,
    name AS storage_path,
    SPLIT_PART(name, '/', -1) AS file_name_only,
    (metadata->>'size')::bigint AS size_bytes,
    ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) AS size_mb
  FROM
    storage.objects
  WHERE
    bucket_id = 'location-images'
    AND metadata->>'size' IS NOT NULL
    AND (metadata->>'size')::bigint > 500 * 1024
  ORDER BY
    size_bytes DESC
  LIMIT 50
)
SELECT
  li.size_mb || ' MB' AS "大小",
  li.storage_path AS "Storage路径",
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
  l.image_url LIKE '%' || li.storage_path || '%'
  OR l.image_url LIKE '%' || li.file_name_only || '%'
ORDER BY
  li.size_bytes DESC;
