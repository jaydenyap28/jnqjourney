-- 给 affiliate_links 表添加 note_slug 字段，支持绑定到长文笔记
-- 运行时间: 2026-05-29

BEGIN;

-- 添加 note_slug 字段
ALTER TABLE affiliate_links
ADD COLUMN IF NOT EXISTS note_slug TEXT;

-- 创建索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_affiliate_links_note_slug ON affiliate_links (note_slug);

COMMIT;
