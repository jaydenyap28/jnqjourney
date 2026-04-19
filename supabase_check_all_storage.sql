-- =============================================
-- 检查 Supabase Storage 所有文件（不限制 bucket）
-- 在 Supabase Dashboard > SQL Editor 中运行
-- =============================================

-- 查询 1: 所有文件按 bucket 分组统计
SELECT
  bucket_id,
  COUNT(*) AS file_count,
  ROUND(SUM((metadata->>'size')::bigint) / 1024 / 1024, 2) AS total_size_mb,
  ROUND(AVG((metadata->>'size')::bigint) / 1024, 2) AS avg_size_kb,
  ROUND(MAX((metadata->>'size')::bigint) / 1024 / 1024, 2) AS max_size_mb
FROM
  storage.objects
GROUP BY
  bucket_id
ORDER BY
  total_size_mb DESC;

-- 查询 2: TOP 50 最大的文件（所有 bucket）
SELECT
  ROUND((metadata->>'size')::numeric / 1024 / 1024, 2) || ' MB' AS "大小",
  bucket_id AS "Bucket",
  name AS "路径",
  SPLIT_PART(name, '/', -1) AS "文件名",
  metadata->>'mimetype' AS "类型"
FROM
  storage.objects
WHERE
  metadata->>'size' IS NOT NULL
ORDER BY
  (metadata->>'size')::bigint DESC
LIMIT 50;
