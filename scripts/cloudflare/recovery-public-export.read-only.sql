select jsonb_build_object(
 'schemaVersion',1,'capturedAt',current_timestamp,'projectRef','vrufunuomioczocdsoer',
 'locations',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select id,name,name_cn,category,latitude,longitude,region_id,description,review,address,google_maps_url,opening_hours,price_info,tags,visit_date,image_url,images,image_metadata,video_url,facebook_video_url,related_note_slugs,status,publication_status,seo_title_zh,seo_description_zh,seo_title_en,seo_description_en,experience_zh,experience_en,updated_at,redirect_url,redirect_type from public.locations where status='active' and (publication_status is null or publication_status='published') and id<>450)x),
 'regions',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select id,name,name_cn,code,parent_id,description,image_url,bounds,slug,country,updated_at from public.regions)x),
 'packages',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.travel_packages p where status='published'),
 'options',(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from public.travel_package_options o where status='active' and exists(select 1 from public.travel_packages p where p.id=o.package_id and p.status='published')),
 'inventory',(select jsonb_agg(jsonb_build_object('id',id,'status',status,'publication_status',publication_status,'updated_at',updated_at) order by id) from public.locations),
 'systemMetadata',(select jsonb_agg(jsonb_build_object('name',name,'updated_at',updated_at,'etag',metadata->>'eTag')) from storage.objects where bucket_id='location-images' and name in ('_system/notes-latest.webp','_system/guides-latest.webp','_system/location-slugs.webp'))
) as payload;
