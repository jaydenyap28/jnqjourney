-- =============================================
-- Supabase SQL: 查询最大图片并关联景点名称
-- 在 Supabase Dashboard > SQL Editor 中运行此查询
-- =============================================

-- 第一步：先查看一下 locations 表中 image_url 的格式，方便我们关联
-- SELECT id, name, name_cn, image_url FROM locations WHERE image_url IS NOT NULL LIMIT 10;

-- =============================================
-- 查询 1: 找出最大的图片，并尝试匹配景点（如果路径匹配）
-- =============================================
WITH image_sizes AS (
  SELECT
    CONCAT(bucket_id, '/', name) AS full_path,
    name AS file_name,
    bucket_id,
    (metadata->>'size')::bigint AS size_bytes,
    ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) AS size_mb,
    metadata->>'mimetype' AS mimetype,
    metadata->>'lastModified' AS last_modified
  FROM
    storage.objects
  WHERE
    metadata->>'mimetype' LIKE 'image/%'
    OR name ~* '\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$'
),
-- 找出最大的 50 张图片
top_images AS (
  SELECT * FROM image_sizes
  ORDER BY size_bytes DESC
  LIMIT 50
)
-- 尝试关联 locations 表（注意：这取决于你的 image_url 格式）
SELECT
  ti.full_path,
  ti.file_name,
  ti.size_mb,
  ti.mimetype,
  l.id AS location_id,
  l.name AS location_name_en,
  l.name_cn AS location_name_cn,
  l.image_url AS location_image_url
FROM
  top_images ti
LEFT JOIN locations l ON
  -- 尝试几种可能的匹配方式（根据你的实际路径格式调整）
  l.image_url LIKE '%' || ti.file_name || '%'
  OR l.image_url LIKE '%' || ti.full_path || '%'
ORDER BY
  ti.size_bytes DESC;

-- =============================================
-- 查询 2: 简单版 - 只列出最大图片（不关联景点）
-- =============================================
-- SELECT
--     CONCAT(bucket_id, '/', name) AS full_path,
--     name AS file_name,
--     ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) AS size_mb
-- FROM
--     storage.objects
-- WHERE
--     metadata->>'mimetype' LIKE 'image/%'
--     OR name ~* '\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$'
-- ORDER BY
--     (metadata->>'size')::bigint DESC
-- LIMIT 20;

-- =============================================
-- 查询 3: 查看所有 locations 的 image_url 格式
-- =============================================
-- SELECT id, name, name_cn, image_url FROM locations WHERE image_url IS NOT NULL LIMIT 20;
