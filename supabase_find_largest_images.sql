-- =============================================
-- Supabase SQL: 查询 Storage 中最大的 20 张图片
-- 在 Supabase Dashboard > SQL Editor 中运行此查询
-- =============================================

-- 注意：此查询需要使用 service_role 权限才能完整访问 storage.objects 表

SELECT
    bucket_id,
    name AS file_name,
    (metadata->>'size')::bigint AS size_bytes,
    ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) AS size_mb,
    metadata->>'mimetype' AS mimetype,
    metadata->>'lastModified' AS last_modified,
    CONCAT(bucket_id, '/', name) AS full_path,
    CONCAT(
        'https://',
        (SELECT raw_app_meta_data->>'host' FROM auth.users LIMIT 1), -- 需要根据你的项目调整
        '/storage/v1/object/public/',
        bucket_id,
        '/',
        name
    ) AS public_url
FROM
    storage.objects
WHERE
    metadata->>'mimetype' LIKE 'image/%'
    OR name ~* '\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$'
ORDER BY
    (metadata->>'size')::bigint DESC
LIMIT 20;

-- =============================================
-- 更简化的版本（只返回大小和路径）
-- =============================================

SELECT
    CONCAT(bucket_id, '/', name) AS full_path,
    name AS file_name,
    ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) AS size_mb
FROM
    storage.objects
WHERE
    metadata->>'mimetype' LIKE 'image/%'
    OR name ~* '\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$'
ORDER BY
    (metadata->>'size')::bigint DESC
LIMIT 20;

-- =============================================
-- 查询指定 bucket 中的大文件
-- =============================================

-- SELECT
--     CONCAT(bucket_id, '/', name) AS full_path,
--     ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) AS size_mb
-- FROM
--     storage.objects
-- WHERE
--     bucket_id IN ('cover', 'places', 'galleries')
--     AND (metadata->>'mimetype' LIKE 'image/%' OR name ~* '\.(jpg|jpeg|png|webp|gif)$')
-- ORDER BY
--     (metadata->>'size')::bigint DESC
-- LIMIT 20;

-- =============================================
-- 按 bucket 分组统计文件大小
-- =============================================

-- SELECT
--     bucket_id,
--     COUNT(*) AS file_count,
--     ROUND(SUM((metadata->>'size')::numeric) / 1024 / 1024, 2) AS total_size_mb,
--     ROUND(AVG((metadata->>'size')::numeric) / 1024 / 1024, 2) AS avg_size_mb,
--     ROUND(MAX((metadata->>'size')::numeric) / 1024 / 1024, 2) AS max_size_mb
-- FROM
--     storage.objects
-- WHERE
--     metadata IS NOT NULL
-- GROUP BY
--     bucket_id
-- ORDER BY
--     total_size_mb DESC;
