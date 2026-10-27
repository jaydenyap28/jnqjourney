-- RC1.5 candidate: METADATA ONLY, not a migration. Prepared 2026-10-27.
-- Not executed by Codex. Run with a separately approved read-only connection.
-- Do not paste secrets or full rows into the review report.
BEGIN TRANSACTION READ ONLY;

-- Exact SELECT contracts for the public paths. Missing package columns are a
-- release concern: existing readers may return []/null on a query error.
WITH contracts(table_name, columns, scope) AS (VALUES
  ('locations', ARRAY['id','name','name_cn','category','latitude','longitude','image_url','region_id','visit_date','description','status','images','tags','video_url','facebook_video_url','opening_hours','price_info','address','updated_at']::text[], 'public Spot and source-version contract'),
  ('locations', ARRAY['publication_status','seo_title_zh','seo_description_zh','seo_title_en','seo_description_en','experience_zh','experience_en','related_note_slugs','image_metadata','redirect_url','redirect_type']::text[], 'content/routing fields: inspect legacy fallback limits, do not silently infer compatibility'),
  ('regions', ARRAY['id','name','name_cn','country','image_url','code','parent_id','description']::text[], 'public collection'),
  ('travel_packages', ARRAY['id','slug','title_zh','title_en','destination','region_id','duration','short_description','full_description','cover_image','gallery','video_url','highlights','suitable_for','itinerary_days','included_items','excluded_items','notes','price_display','price_note','whatsapp_message','source_code','status','featured','sort_order','seo_title','seo_description','canonical_url','related_location_ids','related_guide_slugs','related_note_slugs','affiliate_link_ids','created_at','updated_at','published_at']::text[], 'exact public package SELECT'),
  ('travel_package_options', ARRAY['id','package_id','slug','name_zh','name_en','accommodation_name','accommodation_type','village_name','short_description','suitable_for','price_from','price_currency','price_unit','price_display','price_rows','included_items','excluded_items','notes','validity_label','valid_until','brochure_image','gallery','whatsapp_message','source_code','featured','sort_order','status','created_at','updated_at']::text[], 'exact public option SELECT'),
  ('affiliate_links', ARRAY['id','provider','link_type','url','clicks','is_active']::text[], 'affiliate lookup and existing counter'),
  ('affiliate_clicks', ARRAY['affiliate_link_id','session_id','user_agent','referrer']::text[], 'existing click insert; session_id must accept null')
), required AS (
  SELECT table_name, unnest(columns) AS column_name, scope FROM contracts
)
SELECT r.table_name, r.column_name, r.scope,
       c.column_name IS NOT NULL AS present,
       c.data_type, c.udt_name, c.is_nullable
FROM required r
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = r.column_name
ORDER BY r.table_name, r.scope, r.column_name;

-- Effective role privileges and RLS flags, without retrieving private rows.
-- A true SELECT privilege does not establish that the intended rows are visible
-- under RLS; verify read paths separately using the real application role.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       r.rolname,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
       has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND c.relname IN ('locations','regions','travel_packages','travel_package_options','affiliate_links','affiliate_clicks')
  AND r.rolname IN ('anon','authenticated','service_role')
ORDER BY c.relname, r.rolname;

-- Read policy definitions as metadata only. This does not modify policies or
-- revisit the five historical backup tables covered by the RC1.3 plan.
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('locations','regions','travel_packages','travel_package_options','affiliate_links','affiliate_clicks')
ORDER BY tablename, policyname;

ROLLBACK;

-- After the metadata checks pass, separately verify through existing read paths:
-- * active/published/closed/redirected Spot, source updated_at and all writers;
-- * Hainan one published parent + two active options, Tioman three, Batam seven;
-- * same-source collection/detail/Guide/Note/English/canonical and image access;
-- * existing affiliate_clicks null-session compatibility, without inserting rows;
-- * private Preview object-store/database origins; never reuse production writers.
-- No retry, queue cleanup, Cron, storage upload or permission change is authorized.
