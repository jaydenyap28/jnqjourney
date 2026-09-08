# Bilingual name audit

Inspected 2026-09-08T06:47:51.537Z. No source data changed.

## Evidence and limits

Read-only https://www.jnqjourney.com/api/locations returned cdn-cache: 575 Spots and 58 Regions. Read on 2026-09-08; the response carries no snapshot generatedAt. Initial sandbox-only local API used the 2026-08-09T12:25:35.284Z fallback; network-authorized public API verification supersedes that inventory. 23 saved Langkawi proposal rows are reported separately and may predate the targeted cleanup. data/langkawi-targeted-patch.json and current Guide overrides remain untouched.

## Existing schema

- Raw Locations and Regions: name (canonical/original), name_cn (optional localized). No name_en / english_name column is needed.
- Lightweight PublicLocation/PublicRegion and nested region: name already contains both names as Chinese / original. No payload fields added.
- Spot detail: name and name_cn, with an existing snapshot adapter.
- Guide: title / shortTitle; attraction.displayName is editorial and takes precedence over canonical Spot name. spotId, spotSlug, displayOrder and enabled are identity/order fields, not presentation fields.
- Stays: linked Spot name/name_cn; accommodationStays[].displayName or legacy stay string.
- Aliases/tags are not evidence for creating a translated name.

## Classification

A = natural bilingual (only explicitly supported pairs); B = original-name only; C = suspicious Chinese translation (review candidate, never a proven machine translation); D = needs manual review. Unreviewed Chinese names remain unchanged. Production rows and historical proposal rows are counted separately; proposal rows must not be added to the production total.

| Source | A | B | C | D |
|---|---:|---:|---:|---:|
| spot | 6 | 164 | 25 | 380 |
| region | 6 | 0 | 0 | 52 |
| Langkawi proposal | 6 | 8 | 1 | 8 |

## Preservation

- Dream Forest Langkawi
- MAHA Tower
- Gua MAHA & GM Farm Seafood Restaurant
- FB Cafe - Napolitan Pizza
- Che Ta Chicken Rice Store
- Chuan Bar Izakaya - Japanese Fusion
- Golden Bamboo Cafe
- Villa Paddy
- Airis Sanctuary Resort Langkawi
- Crab Langkawi Farm and Restaurant
- Tanjung Rhu Mangrove Jetty

These explicit original-only choices are applied only at presentation time. Unknown business translations are not automatically removed. Guide displayName still wins, including custom editorial aliases; a safely separable bilingual override becomes two lines.

## Region examples

| Source / ID | Name | Chinese field | Primary | Secondary | Class / reason |
|---|---|---|---|---|---|
| production public API (cdn-cache) / 1 | 柔佛 / Johor |  | 柔佛 | Johor | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 2 | 吉隆坡 / Kuala Lumpur |  | 吉隆坡 | Kuala Lumpur | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 28 | 哥打巴鲁 / Kota Bharu |  | 哥打巴鲁 | Kota Bharu | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 78 | 亚庇 / Kota Kinabalu |  | 亚庇 | Kota Kinabalu | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 79 | 仙本那 / Semporna |  | 仙本那 | Semporna | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 86 | 云顶 / Genting Highlands |  | 云顶 | Genting Highlands | A: Natural bilingual pair explicitly covered by the request / saved curated data |

The inspected Genting record says 云顶, not 云顶高原; existing trusted wording is retained.

## Full classified inventory

| Source / ID | Name | Chinese field | Primary | Secondary | Class / reason |
|---|---|---|---|---|---|
| production public API (cdn-cache) / 807 | 有巢别院 / Youchao Villa |  | 有巢别院 | Youchao Villa | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 806 | 塔川书院 / Tachuan Academy |  | 塔川书院 | Tachuan Academy | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 805 | 阿卜糖水铺 / Abu Tong Sui Shop |  | 阿卜糖水铺 | Abu Tong Sui Shop | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 804 | 南湖书院 / Nanhu Academy |  | 南湖书院 | Nanhu Academy | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 803 | 陵园路梧桐大道 / Wutong Avenue |  | 陵园路梧桐大道 | Wutong Avenue | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 802 | 德基广场 / Deji Plaza |  | 德基广场 | Deji Plaza | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 801 | 石象路 / Shixiang Road |  | 石象路 | Shixiang Road | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 800 | 燕雀湖水杉林 / Yanque Lake |  | 燕雀湖水杉林 | Yanque Lake | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 798 | 夫子庙秦淮河 / Confucius Temple Qinhuai Scenic Area |  | 夫子庙秦淮河 | Confucius Temple Qinhuai Scenic Area | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 797 | 中华门 / Zhonghua Gate |  | 中华门 | Zhonghua Gate | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 795 | 栖霞山 / Qixia Mountain |  | 栖霞山 | Qixia Mountain | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 794 | 金陵小城 / Jinling Xiaocheng |  | 金陵小城 | Jinling Xiaocheng | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 793 | 牛首山佛顶宫 / Foding Palace |  | 牛首山佛顶宫 | Foding Palace | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 792 | 牛首山文化旅游区 / Niushou Mountain Cultural Tourism Zone |  | 牛首山文化旅游区 | Niushou Mountain Cultural Tourism Zone | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 791 | 新街口古南都弘嘉逸居酒店 / Grand Yiju Hotel Xinjiekou |  | 新街口古南都弘嘉逸居酒店 | Grand Yiju Hotel Xinjiekou | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 790 | 秀里水镇 / Xiuli Water Town |  | 秀里水镇 | Xiuli Water Town | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 789 | 碧山村 / Bishan Village |  | 碧山村 | Bishan Village | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 788 | 塔川 / Tachuan |  | 塔川 | Tachuan | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 787 | 卢村观景台 / Lucun Viewing Platform |  | 卢村观景台 | Lucun Viewing Platform | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 786 | 宏村外稻田 / Hongcun Rice Fields |  | 宏村外稻田 | Hongcun Rice Fields | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 785 | 宏村风景区 / Hongcun Scenic Area |  | 宏村风景区 | Hongcun Scenic Area | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 784 | Tokyo Town @ Cameron |  | Tokyo Town @ Cameron |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 783 | Lata Iskandar |  | Lata Iskandar |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 782 | 海南妹 / Hainan Highlands Kopitiam |  | 海南妹 | Hainan Highlands Kopitiam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 781 | Cameron Valley Tea House 1 |  | Cameron Valley Tea House 1 |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 780 | Highlands Spice |  | Highlands Spice |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 779 | The Lord's Cafe |  | The Lord's Cafe |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 778 | 大红草莓园 / Big Red Strawberry Farm |  | 大红草莓园 | Big Red Strawberry Farm | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 777 | Parkland Suites |  | Parkland Suites |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 776 | 三宝万佛寺 / Sam Poh Temple |  | 三宝万佛寺 | Sam Poh Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 775 | 和平小食 / He Ping Xiao Shi Breakfast & Steamboat |  | 和平小食 | He Ping Xiao Shi Breakfast & Steamboat | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 774 | 浓乡美食轩 / Nong Xiang Restaurant |  | 浓乡美食轩 | Nong Xiang Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 773 | Cameron Centrum |  | Cameron Centrum |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 772 | Kedai Kopitiam Kopi Kaw Kaw |  | Kedai Kopitiam Kopi Kaw Kaw |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 771 | Agro Market |  | Agro Market |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 770 | Kea Farm |  | Kea Farm |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 769 | Boh Tea Centre (Sungei Palas Garden) |  | Boh Tea Centre (Sungei Palas Garden) |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 768 | 玉蜂谷蜜蜂园 / Ee Feng Gu Bee Farm |  | 玉蜂谷蜜蜂园 | Ee Feng Gu Bee Farm | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 767 | Green View Garden |  | Green View Garden |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 766 | Melaka Fort |  | Melaka Fort |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 765 | 天城室内游乐园 / Skytropolis Indoor Theme Park |  | 天城室内游乐园 | Skytropolis Indoor Theme Park | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 764 | Genting SkyWorlds Theme Park |  | Genting SkyWorlds Theme Park |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 763 | Taman Pinggiran Sungai Marong |  | Taman Pinggiran Sungai Marong |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 761 | 清水岩庙 (逢来仙境) / Chin Swee Caves Temple |  | 清水岩庙 (逢来仙境) | Chin Swee Caves Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 760 | Windmill Upon Hills |  | Windmill Upon Hills |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 759 | 三公炭火火锅 / San Gong Charcoal Hotpot |  | 三公炭火火锅 | San Gong Charcoal Hotpot | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 757 | 云顶天城世界购物中心 / SkyAvenue |  | 云顶天城世界购物中心 | SkyAvenue | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 756 | 云顶高原 / Genting Highlands |  | 云顶高原 | Genting Highlands | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 755 | The Riviera Melaka |  | The Riviera Melaka |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 753 | 又见马六甲 / Encore Melaka |  | 又见马六甲 | Encore Melaka | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 752 | 粉色教堂 海峡清真寺 / Melaka Straits Mosque |  | 粉色教堂 海峡清真寺 | Melaka Straits Mosque | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 751 | 七记茶楼 / 7 Warna Kopitiam |  | 七记茶楼 | 7 Warna Kopitiam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 750 | 马六甲河畔 / Melaka River |  | 马六甲河畔 | Melaka River | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 749 | 圣保罗教堂 / Church of Saint Paul |  | 圣保罗教堂 | Church of Saint Paul | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 748 | 荷兰广场 / Dutch Square |  | 荷兰广场 | Dutch Square | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 746 | Lulala Cendol |  | Lulala Cendol |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 745 | 陈金福土产店 / Tan Kim Hock @Jonker Walk |  | 陈金福土产店 | Tan Kim Hock @Jonker Walk | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 744 | Mamee Jonker House |  | Mamee Jonker House |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 743 | 鸡场街 / Jonker Walk |  | 鸡场街 | Jonker Walk | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 742 | 阿嬷好料 / Ah Ma Ho Liao |  | 阿嬷好料 | Ah Ma Ho Liao | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 741 | 生命之河 / River Of Life |  | 生命之河 | River Of Life | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 740 | 竹林小圈 / Bamboo Hills |  | 竹林小圈 | Bamboo Hills | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 739 | 罗摩衍那洞 / Ramayana Cave |  | 罗摩衍那洞 | Ramayana Cave | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 738 | 黑风洞 / Batu Caves |  | 黑风洞 | Batu Caves | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 737 | 国家动物园 / Zoo Negara |  | 国家动物园 | Zoo Negara | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 736 | Hill & Heal |  | Hill & Heal |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 735 | 南峇山 / Gunung Lambak Recreational Forest |  | 南峇山 | Gunung Lambak Recreational Forest | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 734 | 普陀村 / Putuo Village |  | 普陀村 | Putuo Village | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 711 | 天马道场 |  | 天马道场 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 710 | Gerbang Laut Pulau Mawar |  | Gerbang Laut Pulau Mawar |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 709 | Pantai Tanjung Resang |  | Pantai Tanjung Resang |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 708 | Pantai Bandar Mersing |  | Pantai Bandar Mersing |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 707 | 笨珍壁画街 / Pontian Mural Street |  | 笨珍壁画街 | Pontian Mural Street | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 705 | 小木屋•厨房 / Xiao Mu Wu |  | 小木屋•厨房 | Xiao Mu Wu | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 704 | 费大厨 |  | 费大厨 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 703 | 中大码头 |  | 中大码头 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 702 | 粤海第一关纪念馆 |  | 粤海第一关纪念馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 701 | 御茶楼 |  | 御茶楼 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 700 | 六运小区 |  | 六运小区 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 698 | 风马民谣 |  | 风马民谣 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 697 | 天美·TimmyApartment (广州太古汇石牌桥地铁站店) |  | 天美·TimmyApartment (广州太古汇石牌桥地铁站店) |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 696 | 探鱼 |  | 探鱼 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 695 | 米谷书店 |  | 米谷书店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 693 | 观巢 |  | 观巢 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 692 | 故市商店 |  | 故市商店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 691 | 江南西 Spa 禅风民宿 |  | 江南西 Spa 禅风民宿 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 690 | 陶陶居 |  | 陶陶居 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 689 | 粤剧艺术博物馆 |  | 粤剧艺术博物馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 688 | Ginstar |  | Ginstar |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 687 | 王子餐吧 |  | 王子餐吧 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 686 | Mottle |  | Mottle |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 685 | 民璞记 |  | 民璞记 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 684 | 沙面岛 |  | 沙面岛 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 683 | 沙溪古镇 |  | 沙溪古镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 682 | 名门海鲜餐厅 / Ming Men Seafood Restaurant |  | 名门海鲜餐厅 | Ming Men Seafood Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 681 | Mataking Island |  | Mataking Island |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 680 | Timba-Timba Island |  | Timba-Timba Island |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 679 | 仙本那星巴克 / Starbucks Semporna |  | 仙本那星巴克 | Starbucks Semporna | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 678 | 詹全记 / Cham Chuan Kee Restaurant |  | 詹全记 | Cham Chuan Kee Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 675 | Neo Paly Hotel |  | Neo Paly Hotel |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 674 | 发记鱼杂粉 / Fatt Kee Seafood Restaurant |  | 发记鱼杂粉 | Fatt Kee Seafood Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 672 | Pantai Manis Tanjung Sedili |  | Pantai Manis Tanjung Sedili |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 671 | Jason Bay Public Beach |  | Jason Bay Public Beach |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 670 | Pantai Tanjung Buluh |  | Pantai Tanjung Buluh |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 669 | Pantai Tanjung Balau |  | Pantai Tanjung Balau |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 668 | Pantai Batu Layar |  | Pantai Batu Layar |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 667 | Desaru Public Beach |  | Desaru Public Beach |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 666 | Punggai Bayu Impian Campsite |  | Punggai Bayu Impian Campsite |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 665 | 四湾岛旧码头 / Jomis Old Jetty |  | 四湾岛旧码头 | Jomis Old Jetty | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 663 | Yard & Co |  | Yard & Co |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 662 | 六湾神庙村 |  | 六湾神庙村 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 660 | Bamboo Walk @Sebana Woods |  | Bamboo Walk @Sebana Woods |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 659 | Kopi Ping |  | Kopi Ping |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 657 | Airdence |  | Airdence |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 656 | Hooga Cafe |  | Hooga Cafe |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 655 | Sabah Tea Resort |  | Sabah Tea Resort |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 654 | Poring Hot Spring |  | Poring Hot Spring |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 653 | Chill@1850 |  | Chill@1850 |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 652 | Pekan Nabalu |  | Pekan Nabalu |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 651 | Peranggi View Point |  | Peranggi View Point |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 650 | The Cloud Kinabalu Glamping & Homestay |  | The Cloud Kinabalu Glamping & Homestay |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 649 | 小陈巴巴 / Bw Bus Restaurant |  | 小陈巴巴 | Bw Bus Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 648 | 甜屋酒店(西华路彩虹桥地铁站店) |  | 甜屋酒店(西华路彩虹桥地铁站店) |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 647 | 潮漫酒店(北京国贸大望路站店) |  | 潮漫酒店(北京国贸大望路站店) |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 645 | 老西子·杭帮菜(西湖音乐喷泉店) |  | 老西子·杭帮菜(西湖音乐喷泉店) |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 644 | 石屋洞 |  | 石屋洞 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 643 | 理安寺 |  | 理安寺 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 642 | 猫猫寺 |  | 猫猫寺 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 641 | 湖滨步行街 |  | 湖滨步行街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 640 | 清河坊 |  | 清河坊 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 639 | 易佳韩食馆 |  | 易佳韩食馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 638 | 水乐洞 |  | 水乐洞 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 637 | Bukit Keluang |  | Bukit Keluang |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 636 | 海龟巷 / Turtle Alley |  | 海龟巷 | Turtle Alley | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 635 | Jambatan Angkat Kuala Terengganu |  | Jambatan Angkat Kuala Terengganu |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 634 | Pesisir Payang |  | Pesisir Payang |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 633 | Zahon Cafe |  | Zahon Cafe |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 632 | Terengganu State Museum |  | Terengganu State Museum |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 631 | 水晶清真寺 / Masjid Kristal |  | 水晶清真寺 | Masjid Kristal | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 630 | Mayang Mall |  | Mayang Mall |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 629 | 炭烧瓦煲鸡 / Restoran One Warisan |  | 炭烧瓦煲鸡 | Restoran One Warisan | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 628 | 登嘉楼唐人街 |  | 登嘉楼唐人街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 626 | 浔坞水宴 |  | 浔坞水宴 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 625 | 乌镇民宿 |  | 乌镇民宿 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 624 | DJ Citi Plaza Hotel & Suites |  | DJ Citi Plaza Hotel & Suites |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 621 | Tengku Tengah Zaharah Mosque |  | Tengku Tengah Zaharah Mosque |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 619 | 邢九二咖啡店 / Heng 92 Kopitiam |  | 邢九二咖啡店 | Heng 92 Kopitiam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 618 | 文荣茶餐室 / Restoran Weng Yong |  | 文荣茶餐室 | Restoran Weng Yong | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 617 | 顺风饭店 |  | 顺风饭店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 616 | 嘉荫堂 |  | 嘉荫堂 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 615 | Whisper 姑苏私语·露台雅舍 |  | Whisper 姑苏私语·露台雅舍 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 613 | 日落长廊 |  | 日落长廊 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 612 | 三号仓库 |  | 三号仓库 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 610 | 石库门 |  | 石库门 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 609 | 唯庭世纪酒店(上海静安火车站店) |  | 唯庭世纪酒店(上海静安火车站店) |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 608 | 伦敦烘焙小镇(上海旗舰店) / Amam Lonbakery Town |  | 伦敦烘焙小镇(上海旗舰店) | Amam Lonbakery Town | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 605 | Mercure Koh Chang Hideaway |  | Mercure Koh Chang Hideaway |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 604 | Fire Tiger by Seoulcial Club |  | Fire Tiger by Seoulcial Club |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 603 | Naga Residence |  | Naga Residence |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 602 | 白沙滩 / White Sand Beach |  | 白沙滩 | White Sand Beach | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 601 | Khlong Phlu Waterfall |  | Khlong Phlu Waterfall |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 600 | Kai Bae Beach |  | Kai Bae Beach |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 599 | Kai Bae View Point |  | Kai Bae View Point |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 591 | 邢泰记 / Kope Hya Tai Kee |  | 邢泰记 | Kope Hya Tai Kee | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 590 | 考山路 / Khao San Road |  | 考山路 | Khao San Road | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 589 | Jodd Fairs |  | Jodd Fairs |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 588 | Stanton Hotel |  | Stanton Hotel |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 587 | Tanjung Aru Beach |  | Tanjung Aru Beach |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 586 | 怡丰叻沙 / Yee Fung Laksa |  | 怡丰叻沙 | Yee Fung Laksa | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 585 | Sosodikon Hill |  | Sosodikon Hill |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 583 | Desa Dairy Farm |  | Desa Dairy Farm |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 582 | 神山公园 / Kinabalu Park |  | 神山公园 | Kinabalu Park | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 581 | 89 Station |  | 89 Station |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 579 | Sinalau Bakas |  | Sinalau Bakas |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 576 | 卡帕莱度假村 / Sipadan Kapalai Dive Resort |  | 卡帕莱度假村 | Sipadan Kapalai Dive Resort | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 574 | 海地拍照 |  | 海地拍照 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 570 | 月光广场 |  | 月光广场 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 569 | 龟山公园 |  | 龟山公园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 567 | 独克宗古城 |  | 独克宗古城 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 566 | 香格里拉爱慕唯色客栈 |  | 香格里拉爱慕唯色客栈 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 565 | 普达措国家公园 |  | 普达措国家公园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 563 | 虎跳峡 |  | 虎跳峡 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 561 | 白水台 |  | 白水台 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 559 | 回音壁 |  | 回音壁 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 558 | 香巴拉佛塔 |  | 香巴拉佛塔 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 554 | 半山咖啡 |  | 半山咖啡 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 552 | 先锋书院 |  | 先锋书院 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 551 | 玉津桥 |  | 玉津桥 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 550 | 有风小馆 |  | 有风小馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 548 | 凤阳茶室 |  | 凤阳茶室 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 547 | 凤阳邑 |  | 凤阳邑 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 546 | 卓睿大酒店 |  | 卓睿大酒店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 545 | 大理心悦·雅集海景客栈 |  | 大理心悦·雅集海景客栈 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 544 | 杨丽萍太阳宫 |  | 杨丽萍太阳宫 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 543 | 双廊古镇 |  | 双廊古镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 542 | 大理古城 |  | 大理古城 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 541 | 南诏十二时辰 |  | 南诏十二时辰 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 540 | 大理极浦水景花园别墅别漾店 |  | 大理极浦水景花园别墅别漾店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 539 | 喜洲古镇 |  | 喜洲古镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 538 | 望田咖啡 |  | 望田咖啡 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 537 | 磻溪村S湾 |  | 磻溪村S湾 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 535 | 才村 |  | 才村 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 534 | 龙龛码头 |  | 龙龛码头 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 533 | 霍比特城堡过桥米线 |  | 霍比特城堡过桥米线 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 532 | 丽江古城 |  | 丽江古城 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 531 | 丽江真美狮子观景客栈 |  | 丽江真美狮子观景客栈 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 530 | 太古里民族食府 |  | 太古里民族食府 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 529 | 束河古镇 |  | 束河古镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 528 | 汤佳米云味土鸡米线 |  | 汤佳米云味土鸡米线 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 527 | 柠檬客栈 |  | 柠檬客栈 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 526 | 荒野之国 |  | 荒野之国 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 525 | 听花谷 |  | 听花谷 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 524 | 白沙古镇 |  | 白沙古镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 523 | 玉湖村 |  | 玉湖村 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 522 | 龙女湖 |  | 龙女湖 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 521 | 玉柱擎天 |  | 玉柱擎天 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 516 | 蓝月谷 |  | 蓝月谷 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 515 | 牦牛坪 |  | 牦牛坪 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 514 | 民谣集烧烤酒馆 |  | 民谣集烧烤酒馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 513 | 音乐长廊 |  | 音乐长廊 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 511 | 冰雪大世界 |  | 冰雪大世界 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 510 | 沙滩部落·钻石海 |  | 沙滩部落·钻石海 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 509 | 红专街早市 |  | 红专街早市 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 508 | 圣索菲亚教堂 |  | 圣索菲亚教堂 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 507 | 大模烤吧 |  | 大模烤吧 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 506 | 中央大街 |  | 中央大街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 505 | 防洪纪念塔 |  | 防洪纪念塔 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 504 | 松花江铁路大桥 |  | 松花江铁路大桥 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 503 | 黑皮肘子锅包肉 |  | 黑皮肘子锅包肉 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 502 | 中华巴洛克 |  | 中华巴洛克 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 501 | 汉庭酒店(哈尔滨景阳街中华巴洛克店) |  | 汉庭酒店(哈尔滨景阳街中华巴洛克店) |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 500 | 中国雪乡 |  | 中国雪乡 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 498 | 羊草山 |  | 羊草山 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 497 | 雪谷 |  | 雪谷 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 496 | 雪谷丁子涵时尚家庭旅馆 |  | 雪谷丁子涵时尚家庭旅馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 495 | 云顶集市 |  | 云顶集市 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 494 | 拾乐咖啡 |  | 拾乐咖啡 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 493 | 雪绒花雪乐园 |  | 雪绒花雪乐园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 492 | 西坡雾凇漂流 |  | 西坡雾凇漂流 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 491 | 蓝景聚龙温泉 |  | 蓝景聚龙温泉 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 490 | 长白山北坡景区 |  | 长白山北坡景区 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 489 | 云顶天宫 |  | 云顶天宫 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 488 | 恩都里 |  | 恩都里 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 487 | 山顺炭火烤肉朝鲜家族 |  | 山顺炭火烤肉朝鲜家族 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 486 | 栖溪小院 |  | 栖溪小院 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 484 | 慕田峪长城 |  | 慕田峪长城 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 483 | 中国中央电视台总部大楼 |  | 中国中央电视台总部大楼 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 481 | 烟袋斜街 |  | 烟袋斜街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 480 | 故宫博物院 |  | 故宫博物院 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 479 | 北京环球 |  | 北京环球 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 478 | 前门大街 |  | 前门大街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 477 | 天涯小镇 |  | 天涯小镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 476 | 喜庭海鲜自助餐 |  | 喜庭海鲜自助餐 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 475 | 鹿回头 |  | 鹿回头 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 471 | 槟榔谷 |  | 槟榔谷 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 469 | 三亚大悦城 |  | 三亚大悦城 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 468 | 凯悦嘉轩酒店 |  | 凯悦嘉轩酒店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 466 | 亚龙湾海底世界餐厅 |  | 亚龙湾海底世界餐厅 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 465 | 三角梅科博园 |  | 三角梅科博园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 463 | 海花岛欧堡酒店 |  | 海花岛欧堡酒店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 462 | 莺歌海盐场 |  | 莺歌海盐场 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 461 | 南山文化景区 |  | 南山文化景区 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 460 | 三亚悦信明日大酒店 |  | 三亚悦信明日大酒店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 459 | 豫园商城 |  | 豫园商城 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 458 | 北外滩 |  | 北外滩 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 457 | 白玉兰广场·看得到风景的咖啡馆 |  | 白玉兰广场·看得到风景的咖啡馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 456 | 吴江路步行街 |  | 吴江路步行街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 455 | 星巴克臻选上海烘焙工坊 |  | 星巴克臻选上海烘焙工坊 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 454 | 安福路 |  | 安福路 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 453 | 武康路 |  | 武康路 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 452 | 陆家嘴 |  | 陆家嘴 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 451 | 浦东美术馆 |  | 浦东美术馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 450 | 金陵东路渡口 |  | 金陵东路渡口 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 449 | 上海外滩 |  | 上海外滩 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 448 | 九江路 |  | 九江路 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 447 | 南京路步行街 |  | 南京路步行街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 446 | 上海新天地 |  | 上海新天地 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 445 | 同里古镇 |  | 同里古镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 444 | 珍珠塔景园 |  | 珍珠塔景园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 443 | 退思园 |  | 退思园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 442 | 花筑·同里古镇懿园园林客栈 |  | 花筑·同里古镇懿园园林客栈 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 441 | 平江路 |  | 平江路 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 440 | 拙政园 |  | 拙政园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 439 | 七里山塘 |  | 七里山塘 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 438 | 虎丘 |  | 虎丘 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 437 | 寒山寺 |  | 寒山寺 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 436 | 西园寺 |  | 西园寺 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 435 | 安渡坊摇橹船 |  | 安渡坊摇橹船 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 434 | 早茶客 |  | 早茶客 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 433 | 灵水居 |  | 灵水居 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 432 | 乌镇 |  | 乌镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 431 | 乌镇评书场 |  | 乌镇评书场 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 430 | 喜庆堂 |  | 喜庆堂 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 429 | 钱江新城 城市阳台 |  | 钱江新城 城市阳台 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 427 | 西湖 |  | 西湖 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 426 | 曲院风荷 |  | 曲院风荷 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 425 | 天目里 |  | 天目里 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 424 | 浴鹄湾 |  | 浴鹄湾 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 423 | 花港观鱼 |  | 花港观鱼 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 422 | 太子湾公园 |  | 太子湾公园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 421 | 银泰in77 |  | 银泰in77 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 420 | 满觉陇 |  | 满觉陇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 419 | 祺悦西湖文化酒店 |  | 祺悦西湖文化酒店 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 418 | 士兰道青龙宫 / Cheng Leong Keng |  | 士兰道青龙宫 | Cheng Leong Keng | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 417 | 马接翁武 / Machap Umboo |  | 马接翁武 | Machap Umboo | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 416 | 🧨 马接峇鲁 / Machap Baru |  | 🧨 马接峇鲁 | Machap Baru | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 415 | Loteng Cafe Telok Cempedak |  | Loteng Cafe Telok Cempedak |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 414 | 狮子山 / Bukit Singa |  | 狮子山 | Bukit Singa | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 413 | 和乐足汤 / Warashiyu Footbath |  | 和乐足汤 | Warashiyu Footbath | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 412 | 湯けむり食堂しろがね / Yukemuri Shokudo Shirogane |  | 湯けむり食堂しろがね | Yukemuri Shokudo Shirogane | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 411 | 札幌时计台 / Sapporo Clock Tower |  | 札幌时计台 | Sapporo Clock Tower | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 410 | 薄野 / Susukino |  | 薄野 | Susukino | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 409 | 婆罗洲文化博物馆 / Borneo Cultures Museum |  | 婆罗洲文化博物馆 | Borneo Cultures Museum | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 408 | 101 Premier Foodcourt |  | 101 Premier Foodcourt |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 407 | 马中友谊公园 / Malaysia-China Friendship Park |  | 马中友谊公园 | Malaysia-China Friendship Park | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 406 | 砂拉越文化村 / Sarawak Cultural Village |  | 砂拉越文化村 | Sarawak Cultural Village | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 405 | 古晋河滨公园 / Kuching Waterfront |  | 古晋河滨公园 | Kuching Waterfront | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 404 | Bengoh Dam |  | Bengoh Dam |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 403 | 仙洞 / Fairy Cave |  | 仙洞 | Fairy Cave | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 402 | 二奶巷 / Concubine Lane |  | 二奶巷 | Concubine Lane | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 401 | 怡发咖喱面 / Yee Fatt Curry Mee |  | 怡发咖喱面 | Yee Fatt Curry Mee | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 400 | 德记茶餐室 / Ipoh Tuck Kee Restaurant |  | 德记茶餐室 | Ipoh Tuck Kee Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 399 | M Roof Hotel |  | M Roof Hotel |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 398 | 大乘岩佛寺 / Da Seng Ngan Temple |  | 大乘岩佛寺 | Da Seng Ngan Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 397 | 长江白咖啡 / Kin Loong Valley Chang Jiang White Coffee |  | 长江白咖啡 | Kin Loong Valley Chang Jiang White Coffee | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 396 | 霹雳观音洞 / Perak Guanyin Cave |  | 霹雳观音洞 | Perak Guanyin Cave | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 395 | 灵仙岩 / Ling Sen Tong Temple |  | 灵仙岩 | Ling Sen Tong Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 394 | 南天洞 / Nam Thean Tong Temple |  | 南天洞 | Nam Thean Tong Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 393 | 安记芽菜鸡沙河粉 / Ong Kee Restaurant |  | 安记芽菜鸡沙河粉 | Ong Kee Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 390 | Henn na Hotel Tokyo Nishikasai |  | Henn na Hotel Tokyo Nishikasai |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 389 | 歌舞伎町 / Kabukicho |  | 歌舞伎町 | Kabukicho | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 387 | Flexstay Inn Hakodate Station |  | Flexstay Inn Hakodate Station |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 381 | Hotel Forza Sapporo Station |  | Hotel Forza Sapporo Station |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 380 | Hotel Lavenir Biei |  | Hotel Lavenir Biei |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 379 | 美瑛神社 / Biei Shrine |  | 美瑛神社 | Biei Shrine | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 378 | 狸小路 / Tanukikoji Shopping Street |  | 狸小路 | Tanukikoji Shopping Street | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 377 | 伝説のすた丼屋 札幌駅前店 / Densetsu no Sutadonya Sapporo Ekimae |  | 伝説のすた丼屋 札幌駅前店 | Densetsu no Sutadonya Sapporo Ekimae | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 376 | 白须瀑布 / Shirahige Falls |  | 白须瀑布 | Shirahige Falls | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 375 | 珈琲 森の時計 / Cafe Mori no Tokei |  | 珈琲 森の時計 | Cafe Mori no Tokei | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 374 | 精灵露台 / Ningle Terrace |  | 精灵露台 | Ningle Terrace | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 370 | 藏王树冰 / Zao Tree Ice |  | 藏王树冰 | Zao Tree Ice | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 369 | 藏王温泉街 / Zao Onsen Street |  | 藏王温泉街 | Zao Onsen Street | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 367 | 山中湖平野の浜 / Hirano no Hama |  | 山中湖平野の浜 | Hirano no Hama | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 366 | 忍野八海 / Oshino Hakkai |  | 忍野八海 | Oshino Hakkai | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 365 | 金鸟居 / Kanadorii |  | 金鸟居 | Kanadorii | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 364 | 新仓山浅间公园 / Arakurayama Sengen Park |  | 新仓山浅间公园 | Arakurayama Sengen Park | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 363 | 东京迪士尼海洋 / Tokyo DisneySea |  | 东京迪士尼海洋 | Tokyo DisneySea | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 359 | Shibuya Sky |  | Shibuya Sky |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 358 | 雷一茶 / Kaminari-Issa |  | 雷一茶 | Kaminari-Issa | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 357 | 浅草寺 / Senso-ji Temple |  | 浅草寺 | Senso-ji Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 355 | 登别石水亭 / Noboribetsu Sekisuitei |  | 登别石水亭 | Noboribetsu Sekisuitei | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 354 | 登别地狱谷 / Noboribetsu Jigokudani |  | 登别地狱谷 | Noboribetsu Jigokudani | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 353 | 汤泽神社 / Yuzawa Shrine |  | 汤泽神社 | Yuzawa Shrine | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 352 | 阎魔殿 / Enma-do |  | 阎魔殿 | Enma-do | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 351 | 道产子ぷりん / Dosanko Pudding |  | 道产子ぷりん | Dosanko Pudding | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 350 | 泉源公园 / Sengen Park |  | 泉源公园 | Sengen Park | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 349 | 大汤沼川天然足汤 / Oyunuma River Natural Footbath |  | 大汤沼川天然足汤 | Oyunuma River Natural Footbath | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 347 | 银山温泉街 / Ginzan Onsen Street |  | 银山温泉街 | Ginzan Onsen Street | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 346 | 白银瀑布 / Shirogane Falls |  | 白银瀑布 | Shirogane Falls | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 345 | 泷见馆 / Takimikan |  | 泷见馆 | Takimikan | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 344 | 金森神社 / Kanemori Shrine |  | 金森神社 | Kanemori Shrine | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 343 | 函馆山夜景 / Mount Hakodate Night View |  | 函馆山夜景 | Mount Hakodate Night View | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 342 | 金森红砖仓库 / Kanemori Red Brick Warehouse |  | 金森红砖仓库 | Kanemori Red Brick Warehouse | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 341 | 八幡坂 / Hachiman-zaka Slope |  | 八幡坂 | Hachiman-zaka Slope | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 340 | 幸运小丑汉堡 / Lucky Pierrot |  | 幸运小丑汉堡 | Lucky Pierrot | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 339 | 小樽运河 / Otaru Canal |  | 小樽运河 | Otaru Canal | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 338 | 小樽堺町通商店街 / Otaru Sakaimachi Street |  | 小樽堺町通商店街 | Otaru Sakaimachi Street | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 337 | LeTao小樽洋菓子铺 / LeTAO Pathos |  | LeTao小樽洋菓子铺 | LeTAO Pathos | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 336 | 八音盒博物馆 / Otaru Music Box Museum |  | 八音盒博物馆 | Otaru Music Box Museum | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 335 | 一番拉面 / Ichiban Ramen |  | 一番拉面 | Ichiban Ramen | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 334 | 住吉神社 / Sumiyoshi Shrine |  | 住吉神社 | Sumiyoshi Shrine | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 330 | 佳兆业广场 |  | 佳兆业广场 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 328 | 天环广场 |  | 天环广场 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 327 | 正佳广场 |  | 正佳广场 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 326 | 太古汇 |  | 太古汇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 325 | 海心沙 |  | 海心沙 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 323 | 黄埔古港 |  | 黄埔古港 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 322 | 广州塔 |  | 广州塔 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 320 | 时尚天河 |  | 时尚天河 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 319 | 云台花园 |  | 云台花园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 318 | 沙湾古镇 |  | 沙湾古镇 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 317 | 宝墨园 |  | 宝墨园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 316 | 西坊大院 |  | 西坊大院 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 315 | 上下九步行街 |  | 上下九步行街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 314 | 永庆坊 |  | 永庆坊 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 313 | 广州市文化馆新馆 |  | 广州市文化馆新馆 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 311 | 太古仓码头 |  | 太古仓码头 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 309 | 石室圣心大教堂 |  | 石室圣心大教堂 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 308 | 东山口 |  | 东山口 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 307 | 大佛古寺 |  | 大佛古寺 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 306 | 北京路步行街 |  | 北京路步行街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 305 | 农讲所 |  | 农讲所 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 304 | 流花湖公园 |  | 流花湖公园 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 303 | 西华路美食街 |  | 西华路美食街 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 302 | The Marian Boutique Lodging House |  | The Marian Boutique Lodging House |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 301 | The Culvert |  | The Culvert |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 300 | Meritin Hotel |  | Meritin Hotel |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 299 | 阿爸乐园 / Abba Paradise |  | 阿爸乐园 | Abba Paradise | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 298 | 阿拉丁神灯鸡饭 / Aladdin Chicken Rice |  | 阿拉丁神灯鸡饭 | Aladdin Chicken Rice | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 297 | 黑豆子咖啡 / Black Bean Coffee |  | 黑豆子咖啡 | Black Bean Coffee | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 296 | 泉春茶室 / Choon Hui Cafe |  | 泉春茶室 | Choon Hui Cafe | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 295 | Commons |  | Commons |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 294 | Kantin at The Granary |  | Kantin at The Granary |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 293 | Nam Joo |  | Nam Joo |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 292 | Ceylonese Restaurant |  | Ceylonese Restaurant |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 291 | 明明美食阁 / Ming Ming Food Court |  | 明明美食阁 | Ming Ming Food Court | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 290 | Angkringan Tepi Danau |  | Angkringan Tepi Danau |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 283 | Golden GoKart |  | Golden GoKart |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 281 | Golden View Hotel |  | Golden View Hotel |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 279 | a2 Foodcourt |  | a2 Foodcourt |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 278 | 粉色沙滩酒吧 / BlueFire Beach Club |  | 粉色沙滩酒吧 | BlueFire Beach Club | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 277 | Puncak Beliung |  | Puncak Beliung |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 276 | Jambatan Barelang |  | Jambatan Barelang |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 275 | Kepri Seafood Restaurant |  | Kepri Seafood Restaurant |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 274 | Bukit Tun Razak |  | Bukit Tun Razak |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 273 | 刁曼岛 / Pulau Tioman Kampung Paya |  | 刁曼岛 | Pulau Tioman Kampung Paya | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 272 | Masjid Lapan Kubah |  | Masjid Lapan Kubah |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 271 | Pantai Rhu Sepuluh |  | Pantai Rhu Sepuluh |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 252 | Jeram Mengaji |  | Jeram Mengaji |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 251 | SRZ Ternak (Ladang Tenusu Jeram Mengaji) |  | SRZ Ternak (Ladang Tenusu Jeram Mengaji) |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 250 | Selera Tepi Sungai |  | Selera Tepi Sungai |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 249 | KTMB Guillemard Bridge |  | KTMB Guillemard Bridge |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 247 | 双龙寺 / Wat Phothikyan Phutthaktham |  | 双龙寺 | Wat Phothikyan Phutthaktham | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 246 | Senok Beach |  | Senok Beach |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 245 | Wat Uttamaram |  | Wat Uttamaram |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 244 | 北京清真寺 / Masjid Beijing Rantau Panjang |  | 北京清真寺 | Masjid Beijing Rantau Panjang | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 243 | 龙船寺 / Wat MaiSuwanKiri |  | 龙船寺 | Wat MaiSuwanKiri | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 242 | 立佛寺 / Wat Phikulthong |  | 立佛寺 | Wat Phikulthong | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 241 | 坐佛寺 / Wat Machimmaram |  | 坐佛寺 | Wat Machimmaram | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 240 | 卧佛寺 / Wat Phothivihan |  | 卧佛寺 | Wat Phothivihan | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 237 | 郑和坊 / Dataran Cheng Ho |  | 郑和坊 | Dataran Cheng Ho | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 236 | Pantai Mek Mas |  | Pantai Mek Mas |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 235 | Hattori Coffee |  | Hattori Coffee |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 234 | Renai Hotel Kota Bharu |  | Renai Hotel Kota Bharu |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 233 | Marang Wave Breaker |  | Marang Wave Breaker |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 232 | 棉花岛 / Pulau Kapas |  | 棉花岛 | Pulau Kapas | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 230 | Pantai Jambu Bongkok |  | Pantai Jambu Bongkok |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 228 | Pantai Batu Pelanduk |  | Pantai Batu Pelanduk |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 227 | Pantai Teluk Bidara |  | Pantai Teluk Bidara |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 226 | Terowong Bukit Tebuk |  | Terowong Bukit Tebuk |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 222 | Pantai Kemasik |  | Pantai Kemasik |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 221 | Old Cruise Ship Jetty Kijal |  | Old Cruise Ship Jetty Kijal |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 220 | Pantai Penunjuk Kijal |  | Pantai Penunjuk Kijal |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 219 | Pantai Teluk Kalong |  | Pantai Teluk Kalong |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 218 | Steven's Coffee House |  | Steven's Coffee House |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 217 | Pantai Teluk Mak Nik (Monica Bay) |  | Pantai Teluk Mak Nik (Monica Bay) |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 216 | Riverine Garden Hotel |  | Riverine Garden Hotel |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 215 | Ombok Cherating Surf Cafe |  | Ombok Cherating Surf Cafe |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 196 | 林明博物馆 / Muzium Sungai Lembing |  | 林明博物馆 | Muzium Sungai Lembing | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 168 | 林明彩虹瀑布 / Rainbow Waterfall |  | 林明彩虹瀑布 | Rainbow Waterfall | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 167 | Sunrise Hill |  | Sunrise Hill |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 166 | Pasir Puteri |  | Pasir Puteri |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 165 | Kolong Pahat 3 |  | Kolong Pahat 3 |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 163 | 林明天后宫 / Thean Hou Temple |  | 林明天后宫 | Thean Hou Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 161 | 林明吊桥 / Kolong Pahat Hanging Bridge |  | 林明吊桥 | Kolong Pahat Hanging Bridge | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 160 | 彩虹吊桥 / Kampung Seberang Hanging Bridge (Rainbow Bridge) |  | 彩虹吊桥 | Kampung Seberang Hanging Bridge (Rainbow Bridge) | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 159 | Riverside Palm Inn |  | Riverside Palm Inn |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 158 | 家传食谱林明面 / Jia Chuan Ser Pu |  | 家传食谱林明面 | Jia Chuan Ser Pu | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 157 | Gua Charas |  | Gua Charas |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 151 | 关丹河畔公园 / Esplanade Kuantan |  | 关丹河畔公园 | Esplanade Kuantan | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 150 | Ms Elliot at Hock Bee |  | Ms Elliot at Hock Bee |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 149 | Pantai Pelindung |  | Pantai Pelindung |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 148 | Pantai Teluk Cempedak |  | Pantai Teluk Cempedak |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 146 | Mohd Chan Restaurant |  | Mohd Chan Restaurant |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 145 | Sungai Pandan Waterfall |  | Sungai Pandan Waterfall |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 144 | 联兴海南茶室 / Lian Heng Kopitiam |  | 联兴海南茶室 | Lian Heng Kopitiam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 142 | 关丹艺术街 / Kuantan Art Street |  | 关丹艺术街 | Kuantan Art Street | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 141 | 888 Food Court |  | 888 Food Court |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 140 | Imperium Residence Kuantan |  | Imperium Residence Kuantan |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 139 | 彭亨佛教会 / Pahang Buddhist Association |  | 彭亨佛教会 | Pahang Buddhist Association | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 138 | 天乐茶室 / Tien Lock coffee shop |  | 天乐茶室 | Tien Lock coffee shop | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 137 | Pantai Saujana Biru |  | Pantai Saujana Biru |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 136 | Pantai Lagenda |  | Pantai Lagenda |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 135 | Jambatan Cherok Paloh |  | Jambatan Cherok Paloh |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 134 | Pantai Hiburan |  | Pantai Hiburan |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 133 | 兴楼云冰大桥 / Jambatan Endau-Rompin |  | 兴楼云冰大桥 | Jambatan Endau-Rompin | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 132 | 龙工业城济癫庙 |  | 龙工业城济癫庙 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 131 | 青天宫大伯公 / Cheng Tian Keong |  | 青天宫大伯公 | Cheng Tian Keong | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 130 | 四海龙王大伯公庙 / Si Hai Long Wang Temple |  | 四海龙王大伯公庙 | Si Hai Long Wang Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 129 | 崇龙宫 / Chong Long Gong Temple |  | 崇龙宫 | Chong Long Gong Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 125 | Pantai Minyak Beku |  | Pantai Minyak Beku |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 123 | 壁画街 / Batu Pahat Art Street |  | 壁画街 | Batu Pahat Art Street | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 121 | Fish Soup \| 鱼汤 |  | Fish Soup \| 鱼汤 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 120 | BP Dragon Kopitiam |  | BP Dragon Kopitiam |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 119 | Kafe Kiri Kanan |  | Kafe Kiri Kanan |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 118 | Yeo Yeo 面煎糕 |  | Yeo Yeo 面煎糕 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 117 | 林氏宗祠天后宫 / Batu Pahat Lim Sz Chong Su Temple |  | 林氏宗祠天后宫 | Batu Pahat Lim Sz Chong Su Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 116 | 顺来粿汁 / Kedai Makan Soon Lai |  | 顺来粿汁 | Kedai Makan Soon Lai | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 115 | 峇株吧辖德教会紫英阁 |  | 峇株吧辖德教会紫英阁 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 114 | 建南寺 (太子爷公庙) / Jian Nan Si Temple |  | 建南寺 (太子爷公庙) | Jian Nan Si Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 113 | 澳门茶餐室 / Macau Kopitiam |  | 澳门茶餐室 | Macau Kopitiam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 112 | 汉记面包西果屋 / Han Kee Cake & Café |  | 汉记面包西果屋 | Han Kee Cake & Café | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 111 | 锦鲤 / Fancy Carp |  | 锦鲤 | Fancy Carp | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 109 | 永兴福州饼面厂 / Eng Hin Bakery |  | 永兴福州饼面厂 | Eng Hin Bakery | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 108 | 亚答屋饮食中心 / Atap-OD Food Centre |  | 亚答屋饮食中心 | Atap-OD Food Centre | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 107 | 锦记鱼丸面 / Kim Kee Fish Ball Restaurant |  | 锦记鱼丸面 | Kim Kee Fish Ball Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 106 | 戏院角 / Cinema Corner |  | 戏院角 | Cinema Corner | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 105 | 永平黑龙洞 / Black Dragon Cave Temple |  | 永平黑龙洞 | Black Dragon Cave Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 104 | 永平德教会紫安阁 / Che Ann Khor |  | 永平德教会紫安阁 | Che Ann Khor | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 103 | 永平天保宫 / Tian Pao Kong Chinese Temple |  | 永平天保宫 | Tian Pao Kong Chinese Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 73 | Muo Boutique Hotel |  | Muo Boutique Hotel |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 72 | 全妃亚叁鱼 (Asam Pedas) / Restoran Chun Hui |  | 全妃亚叁鱼 (Asam Pedas) | Restoran Chun Hui | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 71 | 阿梅麻坡乌达 / Otak-Otak Cheng Boi |  | 阿梅麻坡乌达 | Otak-Otak Cheng Boi | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 70 | Kopi 434 |  | Kopi 434 |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 69 | 贪吃街 / Muar Glutton Street |  | 贪吃街 | Muar Glutton Street | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 68 | 华南茶餐室 亚云叻沙 / Kedai Kopi Hua Nam |  | 华南茶餐室 亚云叻沙 | Kedai Kopi Hua Nam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 67 | 世维茶室 / Kedai Kopi See Hoi |  | 世维茶室 | Kedai Kopi See Hoi | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 66 | 麻坡大桥夜景 / Sultan Ismail Bridge |  | 麻坡大桥夜景 | Sultan Ismail Bridge | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 65 | Daily Happy Otak Otak 复古小屋 / Daily Happy Otak Otak (Retro House) |  | Daily Happy Otak Otak 复古小屋 | Daily Happy Otak Otak (Retro House) | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 64 | 巴冬海口渔村 / Parit Jawa Fishing Village |  | 巴冬海口渔村 | Parit Jawa Fishing Village | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 63 | 麻坡南亭寺善才爷公 / Nan Ting Si Temple |  | 麻坡南亭寺善才爷公 | Nan Ting Si Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 62 | 修德善堂 / Xiu De Shan Tang |  | 修德善堂 | Xiu De Shan Tang | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 61 | 麻坡街头艺术 / Muar Street Art |  | 麻坡街头艺术 | Muar Street Art | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 60 | Figgy’s Cafe |  | Figgy’s Cafe |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 58 | 大屋美食阁 / Big House Restaurant |  | 大屋美食阁 | Big House Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 55 | 周新旭猪肠粉 / Chow Sun Yuk Cheong Fun |  | 周新旭猪肠粉 | Chow Sun Yuk Cheong Fun | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 54 | Tumike Hotel Bentong |  | Tumike Hotel Bentong |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 53 | 桃源谷美食 / Restoran Wonderland Valley |  | 桃源谷美食 | Restoran Wonderland Valley | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 52 | 莫大妈豆腐 / Tauhu Auntie Mok |  | 莫大妈豆腐 | Tauhu Auntie Mok | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 51 | Lemang To’ki |  | Lemang To’ki |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 50 | 溏记海南茶室 / Thong Kee Kopitiam |  | 溏记海南茶室 | Thong Kee Kopitiam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 49 | 克切拉禅修林 / Kechara Forest Retreat |  | 克切拉禅修林 | Kechara Forest Retreat | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 48 | Chamang Waterfall |  | Chamang Waterfall |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 47 | Bukit Tinggi法国村 / Colmar Tropicale |  | Bukit Tinggi法国村 | Colmar Tropicale | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 46 | 日本村 / Japanese Village |  | 日本村 | Japanese Village | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 45 | 文冬文化馆 / Bentong Gallery |  | 文冬文化馆 | Bentong Gallery | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 44 | 彭亨文冬旧玻璃口财神庙 |  | 彭亨文冬旧玻璃口财神庙 |  | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 30 | Telok Kerang Beach |  | Telok Kerang Beach |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 29 | Taman Rekreasi Sungai Rambah |  | Taman Rekreasi Sungai Rambah |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 28 | Tambak Pontian |  | Tambak Pontian |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 26 | 古早味亚龙黑面 / Ah Leng Fried Kuey Tiau |  | 古早味亚龙黑面 | Ah Leng Fried Kuey Tiau | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 25 | 新记云吞面 / Kedai Mee Sin Kee |  | 新记云吞面 | Kedai Mee Sin Kee | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 24 | 湧泉香咖啡店 / Jong Suan Hiang Kopitiam |  | 湧泉香咖啡店 | Jong Suan Hiang Kopitiam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 23 | Twins Cafe Kukup |  | Twins Cafe Kukup |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 22 | Kopi Tenggek Tanjung Piai |  | Kopi Tenggek Tanjung Piai |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 21 | 龟咯渔村 / Kukup Fishing Village |  | 龟咯渔村 | Kukup Fishing Village | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 20 | 丹绒比艾国家公园 / Tanjung Piai National Park |  | 丹绒比艾国家公园 | Tanjung Piai National Park | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 19 | Pantai Pasir Lanun |  | Pantai Pasir Lanun |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 17 | Sawah Air Papan |  | Sawah Air Papan |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 16 | Pantai Air Papan |  | Pantai Air Papan |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 15 | Jeti Teluk Buih |  | Jeti Teluk Buih |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 14 | 美國喜愛雞 / Chicken Delight |  | 美國喜愛雞 | Chicken Delight | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 12 | 丰盛港德教会紫林阁 / Che Luan Khor Mersing |  | 丰盛港德教会紫林阁 | Che Luan Khor Mersing | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 11 | 福顺庙 / Hock Soon Temple |  | 福顺庙 | Hock Soon Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 7 | 丰盛港壁画街 / Laman Samudera |  | 丰盛港壁画街 | Laman Samudera | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 6 | 丽丰西菓饮冰室 / Sri Mersing Cafe |  | 丽丰西菓饮冰室 | Sri Mersing Cafe | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| production public API (cdn-cache) / 5 | Pantai Mawar |  | Pantai Mawar |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 808 | Villa Paddy 稻田住宿 / Villa Paddy |  | Villa Paddy |  | B: User-curated original-only name |
| production public API (cdn-cache) / 809 | Airis Sanctuary 度假村 / Airis Sanctuary Resort Langkawi |  | Airis Sanctuary Resort Langkawi |  | B: User-curated original-only name |
| production public API (cdn-cache) / 810 | 兰卡威天空之桥 / Langkawi Sky Bridge |  | 兰卡威天空之桥 | Langkawi Sky Bridge | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 811 | Perdana Quay 灯塔 / Perdana Quay Light House |  | Perdana Quay 灯塔 | Perdana Quay Light House | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 812 | 拉雅山 / Gunung Raya |  | 拉雅山 | Gunung Raya | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 813 | 兰卡威梦幻森林 / Dream Forest Langkawi |  | Dream Forest Langkawi |  | B: User-curated original-only name |
| production public API (cdn-cache) / 814 | 特姆伦瀑布 / Temurun Waterfall |  | 特姆伦瀑布 | Temurun Waterfall | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 815 | 珍南海滩 / Pantai Cenang |  | 珍南海滩 | Pantai Cenang | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 816 | 鲨鱼湾海滩 / Teluk Yu |  | 鲨鱼湾海滩 | Teluk Yu | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 817 | 丹绒鲁海滩 / Tanjung Rhu Beach |  | 丹绒鲁海滩 | Tanjung Rhu Beach | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 818 | 兰卡威海底世界 / Underwater World Langkawi |  | 兰卡威海底世界 | Underwater World Langkawi | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 819 | Bukit Malut 沿海公路 / Jalan Bukit Malut Scenic Drive |  | Bukit Malut 沿海公路 | Jalan Bukit Malut Scenic Drive | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 820 | 老鹰广场 / Dataran Lang |  | 老鹰广场 | Dataran Lang | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 821 | MAHA 观景塔 / MAHA Tower |  | MAHA Tower |  | B: User-curated original-only name |
| production public API (cdn-cache) / 822 | Wat Koh Wanararm 泰佛寺 / Wat Koh Wanararm |  | Wat Koh Wanararm 泰佛寺 | Wat Koh Wanararm | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 823 | Kisap 山洞泰佛寺 / Wat Tham Kisap |  | Kisap 山洞泰佛寺 | Wat Tham Kisap | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 824 | 兰卡威天后宫 / Langkawi Thean Hou Temple |  | 兰卡威天后宫 | Langkawi Thean Hou Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 825 | Gua MAHA & GM Farm Seafood Restaurant |  | Gua MAHA & GM Farm Seafood Restaurant |  | B: User-curated original-only name |
| production public API (cdn-cache) / 826 | FB Cafe 拿坡里披萨 / FB Cafe - Napolitan Pizza |  | FB Cafe - Napolitan Pizza |  | B: User-curated original-only name |
| production public API (cdn-cache) / 827 | Che Ta 鸡饭店 / Che Ta Chicken Rice Store |  | Che Ta Chicken Rice Store |  | B: User-curated original-only name |
| production public API (cdn-cache) / 828 | 串吧日式居酒屋 / Chuan Bar Izakaya - Japanese Fusion |  | Chuan Bar Izakaya - Japanese Fusion |  | B: User-curated original-only name |
| production public API (cdn-cache) / 829 | Golden Bamboo 竹主题咖啡馆 / Golden Bamboo Cafe |  | Golden Bamboo Cafe |  | B: User-curated original-only name |
| production public API (cdn-cache) / 830 | Temonyong 夜市 / Temonyong Night Market |  | Temonyong 夜市 | Temonyong Night Market | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 831 | Tanjung Rhu Mangrove Jetty |  | Tanjung Rhu Mangrove Jetty |  | B: User-curated original-only name |
| production public API (cdn-cache) / 832 | Crab Langkawi Farm and Restaurant |  | Crab Langkawi Farm and Restaurant |  | B: User-curated original-only name |
| production public API (cdn-cache) / 833 | Eagle's Nest SkyWalk |  | Eagle's Nest SkyWalk |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 834 | Langkawi SkyDome |  | Langkawi SkyDome |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 835 | 3D Art in Paradise Langkawi |  | 3D Art in Paradise Langkawi |  | B: Original-only in inspected source; no Chinese name invented |
| production public API (cdn-cache) / 1 | 柔佛 / Johor |  | 柔佛 | Johor | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 2 | 吉隆坡 / Kuala Lumpur |  | 吉隆坡 | Kuala Lumpur | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 3 | 槟城 / Penang |  | 槟城 | Penang | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 8 | 笨珍 / Pontian |  | 笨珍 | Pontian | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 9 | 彭亨 / Pahang |  | 彭亨 | Pahang | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 10 | 文冬 / Bentong |  | 文冬 | Bentong | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 11 | 麻坡 / Muar |  | 麻坡 | Muar | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 14 | 永平 / Yong Peng |  | 永平 | Yong Peng | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 15 | 峇株吧辖 / Batu Pahat |  | 峇株吧辖 | Batu Pahat | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 19 | 关丹 / Kuantan |  | 关丹 | Kuantan | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 23 | 登嘉楼 / Terengganu |  | 登嘉楼 | Terengganu | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 27 | 吉兰丹 / Kelantan |  | 吉兰丹 | Kelantan | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 28 | 哥打巴鲁 / Kota Bharu |  | 哥打巴鲁 | Kota Bharu | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 38 | 巴淡岛 / Batam |  | 巴淡岛 | Batam | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 39 | 砂拉越 / Sarawak |  | 砂拉越 | Sarawak | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 40 | 古晋 / Kuching |  | 古晋 | Kuching | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 42 | 广州 / Guangzhou |  | 广州 | Guangzhou | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 44 | 哈尔滨 / Harbin |  | 哈尔滨 | Harbin | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 45 | 东京 / Tokyo |  | 东京 | Tokyo | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 47 | 北海道 / Hokkaido |  | 北海道 | Hokkaido | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 48 | 小樽 / Otaru |  | 小樽 | Otaru | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 49 | 函馆 / Hakodate |  | 函馆 | Hakodate | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 50 | 登别 / Noboribetsu |  | 登别 | Noboribetsu | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 51 | 山形县 / Yamagata |  | 山形县 | Yamagata | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 55 | 山梨县 / Yamanashi |  | 山梨县 | Yamanashi | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 60 | 丰盛港 / Mersing |  | 丰盛港 | Mersing | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 61 | 怡保 / Ipoh |  | 怡保 | Ipoh | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 62 | 札幌 / Sapporo |  | 札幌 | Sapporo | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 63 | 美瑛 / Biei |  | 美瑛 | Biei | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 64 | 富良野 / Furano |  | 富良野 | Furano | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 65 | 马六甲 / Melaka |  | 马六甲 | Melaka | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 66 | 杭州 / Hangzhou |  | 杭州 | Hangzhou | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 67 | 乌镇 / Wuzhen |  | 乌镇 | Wuzhen | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 68 | 苏州 / Suzhou |  | 苏州 | Suzhou | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 69 | 上海 / Shanghai |  | 上海 | Shanghai | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 70 | 海南 / Hainan |  | 海南 | Hainan | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 71 | 北京 / Beijing |  | 北京 | Beijing | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 72 | 长白山 / Changbai Mountain |  | 长白山 | Changbai Mountain | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 73 | 雪谷 / Xuegu |  | 雪谷 | Xuegu | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 74 | 丽江 / Lijiang |  | 丽江 | Lijiang | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 75 | 大理 / Dali |  | 大理 | Dali | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 76 | 香格里拉 / Shangri-La |  | 香格里拉 | Shangri-La | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 77 | 沙巴 / Sabah |  | 沙巴 | Sabah | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 78 | 亚庇 / Kota Kinabalu |  | 亚庇 | Kota Kinabalu | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 79 | 仙本那 / Semporna |  | 仙本那 | Semporna | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 80 | 昆达山 / Kundasang |  | 昆达山 | Kundasang | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 81 | 泰国 / Thailand |  | 泰国 | Thailand | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 82 | 曼谷 / Bangkok |  | 曼谷 | Bangkok | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 83 | 象岛 / Koh Chang |  | 象岛 | Koh Chang | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 84 | 迪沙鲁 / Desaru |  | 迪沙鲁 | Desaru | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 85 | 林明 / Sungai Lembing |  | 林明 | Sungai Lembing | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 86 | 云顶 / Genting Highlands |  | 云顶 | Genting Highlands | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| production public API (cdn-cache) / 87 | 金马伦 / Cameron Highland |  | 金马伦 | Cameron Highland | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 88 | 宏村 / Hongcun |  | 宏村 | Hongcun | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 89 | 南京 / Nanjing |  | 南京 | Nanjing | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 90 | 刁曼岛 / Pulau Tioman |  | 刁曼岛 | Pulau Tioman | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 91 | 吉打 / Kedah |  | 吉打 | Kedah | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| production public API (cdn-cache) / 92 | 兰卡威 / Langkawi |  | 兰卡威 | Langkawi | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| saved Langkawi proposal (not live) / villa-paddy | Villa Paddy | Villa Paddy 稻田住宿 | Villa Paddy |  | B: User-curated original-only name |
| saved Langkawi proposal (not live) / airis-sanctuary | Airis Sanctuary Resort Langkawi | Airis Sanctuary 度假村 | Airis Sanctuary Resort Langkawi |  | B: User-curated original-only name |
| saved Langkawi proposal (not live) / sky-bridge | Langkawi Sky Bridge | 兰卡威天空之桥 | 兰卡威天空之桥 | Langkawi Sky Bridge | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| saved Langkawi proposal (not live) / perdana-lighthouse | Perdana Quay Light House | Perdana Quay 灯塔 | Perdana Quay 灯塔 | Perdana Quay Light House | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| saved Langkawi proposal (not live) / gunung-raya | Gunung Raya | 拉雅山 | 拉雅山 | Gunung Raya | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| saved Langkawi proposal (not live) / dream-forest | Dream Forest Langkawi | 兰卡威梦幻森林 | Dream Forest Langkawi |  | B: User-curated original-only name |
| saved Langkawi proposal (not live) / temurun | Temurun Waterfall | 特姆伦瀑布 | 特姆伦瀑布 | Temurun Waterfall | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| saved Langkawi proposal (not live) / cenang | Pantai Cenang | 珍南海滩 | 珍南海滩 | Pantai Cenang | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| saved Langkawi proposal (not live) / teluk-yu | Teluk Yu | 鲨鱼湾海滩 | 鲨鱼湾海滩 | Teluk Yu | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| saved Langkawi proposal (not live) / tanjung-rhu | Tanjung Rhu Beach | 丹绒鲁海滩 | 丹绒鲁海滩 | Tanjung Rhu Beach | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| saved Langkawi proposal (not live) / underwater-world | Underwater World Langkawi | 兰卡威海底世界 | 兰卡威海底世界 | Underwater World Langkawi | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| saved Langkawi proposal (not live) / bukit-malut-road | Jalan Bukit Malut Scenic Drive | Bukit Malut 沿海公路 | Bukit Malut 沿海公路 | Jalan Bukit Malut Scenic Drive | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| saved Langkawi proposal (not live) / eagle-square | Dataran Lang | 老鹰广场 | 老鹰广场 | Dataran Lang | A: Natural bilingual pair explicitly covered by the request / saved curated data |
| saved Langkawi proposal (not live) / maha-tower | MAHA Tower | MAHA 观景塔 | MAHA Tower |  | B: User-curated original-only name |
| saved Langkawi proposal (not live) / wat-koh-wanararm | Wat Koh Wanararm | Wat Koh Wanararm 泰佛寺 | Wat Koh Wanararm 泰佛寺 | Wat Koh Wanararm | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| saved Langkawi proposal (not live) / wat-tham-kisap | Wat Tham Kisap | Kisap 山洞泰佛寺 | Kisap 山洞泰佛寺 | Wat Tham Kisap | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| saved Langkawi proposal (not live) / thean-hou | Langkawi Thean Hou Temple | 兰卡威天后宫 | 兰卡威天后宫 | Langkawi Thean Hou Temple | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
| saved Langkawi proposal (not live) / gm-farm | GM Farm Seafood Restaurant | GM Farm 海鲜餐厅 | GM Farm 海鲜餐厅 | GM Farm Seafood Restaurant | C: Business name with Chinese counterpart: review official usage; heuristic flag, not proof of machine translation |
| saved Langkawi proposal (not live) / fb-cafe | FB Cafe - Napolitan Pizza | FB Cafe 拿坡里披萨 | FB Cafe - Napolitan Pizza |  | B: User-curated original-only name |
| saved Langkawi proposal (not live) / che-ta | Che Ta Chicken Rice Store | Che Ta 鸡饭店 | Che Ta Chicken Rice Store |  | B: User-curated original-only name |
| saved Langkawi proposal (not live) / chuan-bar | Chuan Bar Izakaya - Japanese Fusion | 串吧日式居酒屋 | Chuan Bar Izakaya - Japanese Fusion |  | B: User-curated original-only name |
| saved Langkawi proposal (not live) / golden-bamboo | Golden Bamboo Cafe | Golden Bamboo 竹主题咖啡馆 | Golden Bamboo Cafe |  | B: User-curated original-only name |
| saved Langkawi proposal (not live) / temonyong-market | Temonyong Night Market | Temonyong 夜市 | Temonyong 夜市 | Temonyong Night Market | D: Chinese/mixed name or unreviewed bilingual pair: natural/official usage needs manual verification |
