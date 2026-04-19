-- =============================================
-- Supabase SQL: 简单版 - 只列出最大图片（不关联景点）
-- 在 Supabase Dashboard > SQL Editor 中运行此查询
-- =============================================

SELECT
  ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) || ' MB' AS "大小",
  name AS "Storage路径",
  SPLIT_PART(name, '/', -1) AS "文件名",
  CASE
    WHEN name LIKE '%/cover/%' THEN '封面图'
    WHEN name LIKE '%/imported/%' THEN '导入图片'
    ELSE '其他'
  END AS "类型"
FROM
  storage.objects
WHERE
  bucket_id = 'location-images'
  AND (metadata->>'mimetype' LIKE 'image/%' OR name ~* '\.(jpg|jpeg|png|webp|gif)$')
  AND (metadata->>'size')::bigint > 500 * 1024 -- 大于 500KB
ORDER BY
  (metadata->>'size')::bigint DESC
LIMIT 30;
