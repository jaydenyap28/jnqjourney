-- Add package-level supplier metadata that is never exposed to public readers.
create table if not exists public.travel_package_internal (
  package_id bigint primary key references public.travel_packages(id) on delete cascade,
  supplier_ref text,
  supplier_package_name text,
  internal_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.travel_package_internal enable row level security;
revoke all on table public.travel_package_internal from anon, authenticated;

insert into public.travel_packages (
  slug, title_zh, title_en, destination, region_id, duration,
  short_description, full_description, cover_image, gallery,
  highlights, suitable_for, itinerary_days, included_items, excluded_items,
  notes, price_display, price_note, whatsapp_message, source_code,
  status, featured, sort_order, seo_title, seo_description, canonical_url,
  related_location_ids, related_guide_slugs, related_note_slugs,
  affiliate_link_ids, published_at
)
values (
  'hainan-5d4n-sea-land-air',
  '海南 5天4夜｜海陆空臻享之旅',
  'Hainan 5D4N Sea, Land & Air Experience',
  'Hainan, China',
  (select id from public.regions where lower(name) = 'hainan' and lower(country) = 'china' order by id limit 1),
  '5天4夜',
  '吉隆坡直飞琼海，5天4夜串联博鳌、三亚、海花岛与海口，安排南山海上观音、天涯小镇、槟榔谷等景点，并加入直升机飞行、三亚湾豪华游艇与海底餐厅用餐体验。',
  E'这条海南 5天4夜路线把观光、美食和体验型行程放在同一趟旅程里，从吉隆坡直飞琼海后一路走访博鳌、三亚、海花岛与海口。\n\n除了南山海上观音、天涯小镇、槟榔谷黎苗文化旅游区、海花岛与海口骑楼老街，也加入约 1 公里直升机飞行体验、豪华游艇游三亚湾，以及亚龙湾海底餐厅用餐。\n\n参考价格约 RM2,388++／人起，不同出发日期的机位、酒店与最终报价可能调整；查询时请提供预计日期、人数与儿童年龄。',
  'https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/466-1775296770693-3408f78b-af17-460c-a38d-4bf212bd7f4b-4-3-6--wa-b1726b1d-b024-4627-8c85-01b3c1e5ce4d.webp',
  '[
    {"url":"https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/461-4-99c86307-89a5-4235-8417-63b76f20c132.webp","alt":"海南南山文化旅游区海上观音","caption":"JnQ Journey 海南实拍｜南山文化旅游区（海上观音）","sort_order":0},
    {"url":"https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/477-1775184795950-a7348dee-b0b0-41d1-b4e5-68fc47560919-img-6473--6cb0c440-4c39-4c9e-8121-78508a3b97c0.webp","alt":"海南三亚天涯小镇","caption":"JnQ Journey 海南实拍｜天涯小镇","sort_order":1},
    {"url":"https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/471-1775187607434-20ab6fee-8ec1-4e5a-af9e-9567aff0b7ef-4-3-5-04e48913-0960-4f0d-9ea2-f6e81ac74fb3.webp","alt":"海南槟榔谷黎苗文化旅游区","caption":"JnQ Journey 海南实拍｜槟榔谷黎苗文化旅游区","sort_order":2},
    {"url":"https://pub-8ecf7356fcc84618a26557ed36fc53a1.r2.dev/locations/2026-05-31/466-1775296778145-375d9aac-236a-48c0-901b-bcf94140e81e-4-3-5--wa-20fcdfce-e572-4a6c-b602-b82e8c529c5a.webp","alt":"海南亚龙湾海底世界餐厅","caption":"JnQ Journey 海南实拍｜亚龙湾海底世界餐厅","sort_order":3}
  ]'::jsonb,
  '[
    "吉隆坡 KUL 直飞琼海 BAR，含 23KG 托运行李",
    "约 1 公里直升机飞行体验",
    "豪华游艇游三亚湾，啤酒与软饮畅饮",
    "亚龙湾海底餐厅用餐体验",
    "南山海上观音、天涯小镇、槟榔谷、海花岛与海口骑楼老街",
    "海南四大名菜、南山素斋、黎家宴、鲍鱼鸡煲、椰子鸡等特色餐"
  ]'::jsonb,
  '["情侣出游","家庭旅行","朋友团体","想一次体验海南观光、美食与特色项目的旅客","希望机票、酒店、交通和主要行程一次安排好的旅客"]'::jsonb,
  '[
    {"title":"吉隆坡 → 琼海","summary":"参考航班 HU498 12:15–15:25，抵达琼海博鳌机场后开始海南行程。","items":["前往博鳌乐城","博鳌湾的故事","入住琼海指定酒店或同级","餐食：机餐／晚餐"]},
    {"title":"琼海 → 三亚","summary":"从琼海前往三亚，安排南山、观光列车与海边小镇行程。","items":["南山文化旅游区（海上观音，含电瓶车）","三亚旅游铁路观光列车","天涯小镇","海里里咖啡（饮品自理）","入住三亚指定酒店或同级","餐食：早餐／午餐"]},
    {"title":"三亚海陆空体验","summary":"这一天集中安排直升机、海底餐厅与三亚湾游艇体验。","items":["直升机飞行体验约 1 公里","亚龙湾海底餐厅享用午餐","豪华游艇游三亚湾","啤酒／软饮畅饮","自由欣赏三亚湾风光","入住三亚指定酒店或同级","餐食：早餐／午餐"]},
    {"title":"三亚 → 海花岛","summary":"体验黎苗文化后前往海花岛，继续安排乐园、美食街与夜间灯光行程。","items":["槟榔谷黎苗文化旅游区（含电瓶车）","海花岛 1 号岛","童世界海洋乐园＋表演","明清美食街","婚礼庄园灯光秀","入住海花岛指定酒店或同级","餐食：早餐／午餐／晚餐"]},
    {"title":"海花岛 → 海口 → 琼海 → 吉隆坡","summary":"最后一天经海口返回琼海博鳌机场，搭机返回吉隆坡。","items":["海口骑楼老街","前往琼海博鳌机场","参考航班 HU497 16:40–20:10","餐食：早餐／午餐／机餐"]}
  ]'::jsonb,
  '[
    "往返机票＋税费",
    "23KG 托运行李",
    "4 晚指定酒店或同级",
    "行程所列早餐、午餐及晚餐",
    "行程用车",
    "中文导游服务＋基本小费",
    "行程所列景点门票",
    "机场接送",
    "旅游保险"
  ]'::jsonb,
  '["可选项目","行李小费","个人消费","其他未提及的旅游活动或费用"]'::jsonb,
  '[
    "参考航班、景点顺序、酒店、餐食及体验项目可能因出发日期、航班、天气、当地运营及实际安排调整，最终以出发前确认资料为准。",
    "直升机飞行体验参考距离约 1 公里，实际体验内容与执行条件以当地安排为准。",
    "参考价格中的 ++ 所涉及附加费用，请以最终报价明细为准。"
  ]'::jsonb,
  '约 RM2,388++ / 人起',
  '不同出发日期价格会有所不同；机位、酒店、房型及 ++ 附加费用以查询时的最新报价与最终确认为准。',
  E'你好，我从 JnQ Journey 看到「海南 5天4夜｜海陆空臻享之旅」，想查询最新出发日期和价格。\n\n预计日期：\n成人：\n儿童及年龄：\n房间数量：\n其他要求：\n\n来源：JNQ-HAINAN-5D4N',
  'JNQ-HAINAN-5D4N',
  'published',
  false,
  30,
  '海南5天4夜旅游配套｜吉隆坡直飞琼海・三亚海陆空体验｜JnQ Journey',
  '海南5天4夜旅游配套，吉隆坡直飞琼海，行程覆盖博鳌、三亚、海花岛与海口，并安排直升机、三亚湾游艇、海底餐厅、南山海上观音与槟榔谷等体验。约 RM2,388++／人起。',
  'https://www.jnqjourney.com/packages/hainan-5d4n-sea-land-air',
  array[461,466,471,477]::bigint[],
  array[]::text[],
  array[]::text[],
  array[]::bigint[],
  now()
)
on conflict (slug) do update set
  title_zh = excluded.title_zh,
  title_en = excluded.title_en,
  destination = excluded.destination,
  region_id = excluded.region_id,
  duration = excluded.duration,
  short_description = excluded.short_description,
  full_description = excluded.full_description,
  cover_image = excluded.cover_image,
  gallery = excluded.gallery,
  highlights = excluded.highlights,
  suitable_for = excluded.suitable_for,
  itinerary_days = excluded.itinerary_days,
  included_items = excluded.included_items,
  excluded_items = excluded.excluded_items,
  notes = excluded.notes,
  price_display = excluded.price_display,
  price_note = excluded.price_note,
  whatsapp_message = excluded.whatsapp_message,
  source_code = excluded.source_code,
  status = excluded.status,
  featured = excluded.featured,
  sort_order = excluded.sort_order,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  canonical_url = excluded.canonical_url,
  related_location_ids = excluded.related_location_ids,
  related_guide_slugs = excluded.related_guide_slugs,
  related_note_slugs = excluded.related_note_slugs,
  affiliate_link_ids = excluded.affiliate_link_ids,
  published_at = coalesce(public.travel_packages.published_at, now()),
  updated_at = now();

insert into public.travel_package_internal (
  package_id, supplier_ref, supplier_package_name, internal_notes, updated_at
)
select
  id,
  'TEMP_TRAVEL',
  '海南 5天4夜 海陆空臻享之旅',
  '["内部供应商：Temp Travel。供应商名称、原始联络方式和任何可让顾客绕过 JnQ Journey 的资料不得出现在公开页面。","公开报价参考约 RM2,388++／人起；不同出发日期重新向供应商确认。"]'::jsonb,
  now()
from public.travel_packages
where slug = 'hainan-5d4n-sea-land-air'
on conflict (package_id) do update set
  supplier_ref = excluded.supplier_ref,
  supplier_package_name = excluded.supplier_package_name,
  internal_notes = excluded.internal_notes,
  updated_at = now();
