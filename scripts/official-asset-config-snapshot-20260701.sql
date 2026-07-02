-- Official asset admin configuration snapshot.
-- Exported from the project .env DATABASE_URL on 2026-07-01.
-- Contains admin-managed official asset images, detail image groups, prompt/copy fields, and status.
-- Apply manually to a target database when the admin-managed official asset catalog must be restored or promoted.
BEGIN;

-- character / 2D漫-东方修仙 / 宗门师姐
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001506', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-东方修仙', '宗门师姐', '全身角色立绘，一位清冷优雅的中国古风女剑修，年轻女性角色，东方玄幻仙侠风，气质高贵神秘，黑色长发半束高髻，长发自然垂落，头戴银色发冠与紫色流苏发饰，面容精致清秀，眼神冷静淡然，神情沉稳克制，身材纤细修长，身穿深紫色内袍与浅紫色层叠仙侠长裙，外搭半透明淡紫色披帛和宽大长袖外衫，衣摆垂坠飘逸，裙身带银白色刺绣纹样、花纹暗纹和边饰，腰间佩戴黑银色腰封、银色花形扣饰、玉石吊坠、链条和紫色流苏，右手握着一柄古风长剑剑鞘，长剑斜垂在身侧，左手持青绿色小法器或玉佩，脚穿深紫色绣花长靴，正面站姿，姿态端庄从容，居中构图，完整身体，纯白背景，无场景背景，高质量仙侠游戏角色设定，东方玄幻女性剑修角色设计，日系二次元古风立绘风，轻小说插画风，紫色系清冷配色，纱质布料轻薄通透，服装层次丰富，银饰和玉石配饰质感精致，刺绣细节清晰，柔和明亮光照，清晰锐利，仙气飘逸，高级感，竖版构图，画面比例 3:4，适合游戏或漫画女剑修角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001506'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001506'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '32a84dce-5a61-43d5-8d56-cc132577c0e7', '51000000-0000-4000-8000-000000001506', latest.version_number + 1, 'official/characters/2d-xianxia-senior.png', '/assets/library/official/characters/2d-xianxia-senior.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"宗门师姐","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-xianxia-senior-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-xianxia-senior-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-xianxia-senior-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-东方修仙 / 灵兽少年
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001505', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-东方修仙', '灵兽少年', '全身角色立绘，一位阳光俊朗的兽耳仙侠少年，年轻男性角色，东方玄幻狐族或狼族少年形象，气质活泼温和，黑色短发微乱蓬松，头顶一对白色内耳的兽耳，耳侧带青绿色羽饰或金属发饰，面容清秀可爱，眼神明亮，露出开朗微笑，身材修长少年感，身穿白色与青绿色层叠仙侠长袍，内搭深色交领衣衫和黑色长裤，外袍宽大飘逸，肩部有白色毛绒披肩装饰，衣袖和衣摆带青绿色云纹刺绣，腰间佩戴黑金色腰封、青绿色宝石扣饰、金属挂件和长流苏，身侧有青绿色飘带与小 tassel 配饰，脚穿白黑青配色长靴，右手自然握拳，左手轻扶腰间，正面略带侧身站姿，姿态轻松自信，居中构图，完整身体，纯白背景，无场景背景，高质量东方玄幻游戏角色设定，兽耳少年角色设计，日系二次元古风立绘风，轻小说插画风，白青黑配色，服装层次丰富，毛绒材质蓬松，布料和刺绣细节清晰，金属与宝石配饰质感精致，柔和明亮光照，清晰锐利，清爽可爱，仙气灵动，高级感，竖版构图，画面比例 3:4，适合游戏或漫画兽耳仙侠角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001505'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001505'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '637c460b-98e2-4970-86cb-97185c940231', '51000000-0000-4000-8000-000000001505', latest.version_number + 1, 'official/characters/2d-xianxia-beast.png', '/assets/library/official/characters/2d-xianxia-beast.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"灵兽少年","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-xianxia-beast-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-xianxia-beast-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-xianxia-beast-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-东方修仙 / 白衣仙子
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001502', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-东方修仙', '白衣仙子', '全身角色立绘，一位清冷温婉的中国古风仙侠少女，年轻女性角色，东方玄幻仙子形象，气质纯净高雅，黑色长发半束高髻，长发自然披散并随风飘动，头戴银白色华丽发冠与精致发饰，额间有淡蓝色花钿，面容柔美清秀，眼神温柔宁静，神情淡雅含蓄，身材纤细修长，身穿白色与淡蓝色层叠仙裙，交领白色内袍，外搭半透明轻纱披帛和宽大飘逸长袖，衣摆层层垂落，裙身带银白色暗纹刺绣、云纹和花纹装饰，腰间佩戴浅蓝色束带、银色花形腰饰、垂挂流苏和精致配饰，脚穿白色绣鞋，双手自然微微展开，正面站姿，姿态轻盈优雅，居中构图，完整身体，纯白背景，无场景背景，高质量仙侠游戏角色设定，东方玄幻女性角色设计，日系二次元古风立绘风，轻小说插画风，白蓝清冷配色，纱质布料轻薄通透，服装层次丰富，银饰细节精致，柔和明亮光照，清晰锐利，仙气飘逸，唯美高级感，竖版构图，画面比例 3:4，适合游戏或漫画仙侠仙子角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001502'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001502'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '222ba446-30a2-40e6-85ab-cb255d8b704f', '51000000-0000-4000-8000-000000001502', latest.version_number + 1, 'official/characters/2d-xianxia-fairy.png', '/assets/library/official/characters/2d-xianxia-fairy.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"白衣仙子","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-xianxia-fairy-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-xianxia-fairy-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-xianxia-fairy-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-东方修仙 / 符箓师
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001504', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-东方修仙', '符箓师', '全身角色立绘，一位俊美神秘的中国古风符咒术士，年轻男性角色，东方玄幻仙侠风，玄门法师或阴阳师形象，黑色长发半束高髻，长发随风飘散，头戴黑金色高冠与金色发饰，面容清冷俊秀，眉眼狭长沉稳，神情从容淡漠，气质高贵神秘，身穿白色内袍与黑金色层叠法袍，外搭浅金色半透明披帛和宽大长袖外衫，衣袍带精致金色云纹刺绣、符文纹样和黑色描边，腰间佩戴华丽黑金腰封、青绿色宝石扣饰、金属链条、玉石吊坠和长流苏，身侧挂有圆形法器或灵器配件，手持黄色符咒纸牌，周围漂浮多张写有神秘符文的金色符纸，脚穿黑金纹样长靴，正面站姿，姿态端庄从容，居中构图，完整身体，纯白背景，无场景背景，高质量仙侠游戏角色设定，东方玄幻法师角色设计，半写实二次元立绘风，黑白金配色，服装层次华丽，符咒与法器细节丰富，金属和玉石配饰质感清晰，纱质布料轻盈飘逸，柔和棚拍光，清晰锐利，神秘高贵，高级感，竖版构图，画面比例 3:4，适合游戏或漫画古风符咒术士角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001504'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001504'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'b4895eef-7fba-4839-8192-efde8014377a', '51000000-0000-4000-8000-000000001504', latest.version_number + 1, 'official/characters/2d-xianxia-talisman.png', '/assets/library/official/characters/2d-xianxia-talisman.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"符箓师","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-xianxia-talisman-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-xianxia-talisman-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-xianxia-talisman-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-东方修仙 / 青衣剑客
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001501', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-东方修仙', '青衣剑客', '全身角色立绘，一位俊逸潇洒的中国古风仙侠剑客，年轻男性角色，东方玄幻正派修仙者形象，黑色长发半束高髻，长发随风飘散，头戴青玉发冠，面容俊美温和，眉眼清朗，神情淡然自信，气质儒雅洒脱，身穿白色内袍与深青绿色层叠长袍，外搭半透明青绿色披帛和飘逸纱质外衫，衣袖宽大，衣摆修长，衣袍边缘带精致金色刺绣纹样和云纹装饰，腰间佩戴黑金色腰封、青玉扣饰、玉石串珠和垂挂流苏，右手自然握着一柄古风长剑剑鞘，剑鞘斜垂在身侧，脚穿黑色高筒长靴，身侧飘散多条青绿色半透明长带，正面站姿，姿态挺拔从容，居中构图，完整身体，纯白背景，无场景背景，高质量仙侠游戏角色设定，东方玄幻角色设计，半写实 3D 立绘风，青绿白配色，服装层次丰富，纱质布料轻薄飘逸，金色刺绣细节精致，玉石和金属配饰质感清晰，柔和棚拍光，清晰锐利，仙气飘逸，高级感，竖版构图，画面比例 3:4，适合游戏或漫画仙侠角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001501'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001501'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'eae39b5c-5aef-49c6-8d5c-507cbfc7e032', '51000000-0000-4000-8000-000000001501', latest.version_number + 1, 'official/characters/2d-xianxia-green.png', '/assets/library/official/characters/2d-xianxia-green.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"青衣剑客","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-xianxia-green-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-xianxia-green-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-xianxia-green-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-东方修仙 / 黑衣魔修
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001503', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-东方修仙', '黑衣魔修', '全身角色立绘，一位俊美阴冷的中国古风魔尊，年轻男性角色，东方玄幻暗黑仙侠风，黑色长发半束高髻，长发凌乱飘散，头戴黑红色尖锐魔冠，面容苍白俊美，眉眼狭长锐利，神情冷漠危险，气质邪魅压迫，身穿黑色层叠长袍与暗红色内衬，外搭华丽黑色披风，肩部有尖锐铠甲状护肩和羽刃般装饰，衣袍带暗红纹路、黑色刺绣和破碎火焰纹样，腰间佩戴复杂黑银金属腰封、红色宝石扣饰、垂挂链条和长红色流苏，袖口有黑色护腕与金属装饰，脚穿黑色长靴，身侧飘散大量黑红色长带与半透明披帛，双手自然下垂，正面站姿，姿态高傲威严，居中构图，完整身体，纯白背景，无场景背景，高质量仙侠游戏角色设定，东方玄幻反派角色设计，暗黑华丽风格，半写实 3D 立绘风，服装层次复杂，金属配饰精致，布料和披风纹理细腻，红黑配色强烈，柔和棚拍光，清晰锐利，邪气强大，高级感，竖版构图，画面比例 3:4，适合游戏或漫画反派角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001503'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001503'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '8ca927fd-fbf7-4e2f-8f08-4e4bd8ee9261', '51000000-0000-4000-8000-000000001503', latest.version_number + 1, 'official/characters/2d-xianxia-dark.png', '/assets/library/official/characters/2d-xianxia-dark.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"黑衣魔修","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-xianxia-dark-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-xianxia-dark-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-xianxia-dark-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-现代都市 / 偶像练习生
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001403', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-现代都市', '偶像练习生', '全身角色立绘，一位活泼可爱的日系少女偶像，年轻女性角色，青春元气偶像形象，棕色长发自然披散，发尾微卷，额前齐刘海，头戴粉色格纹大蝴蝶结发饰，侧边有小星星发夹，圆润大眼睛，笑容灿烂，表情开朗甜美，身材纤细修长，身穿白色与粉色搭配的偶像舞台服，上身为短款白色衬衫露腰设计，粉色荷叶边短袖，胸前有粉色蝴蝶结和金色小装饰，搭配白色百褶短裙，裙摆带粉色格纹边和多层荷叶边，腰间有金色链条装饰与粉色蝴蝶结飘带，手腕佩戴粉白色花边手环，下身穿白色长筒袜，袜口带粉色条纹，脚穿粉白色高帮运动鞋，右手轻握在胸前，左手自然张开，单腿微微弯曲，姿势俏皮可爱，正面站姿，居中构图，完整身体，纯白背景，无场景背景，日系二次元动漫风，偶像角色设定，轻小说插画风，干净线稿，柔和上色，粉白甜美配色，服装褶皱自然，蝴蝶结和荷叶边细节丰富，画面清爽明亮，高质量角色概念设计，清晰锐利，青春可爱，竖版构图，画面比例 3:4，适合游戏或漫画偶像角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001403'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001403'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '42e65617-0084-4908-8f60-fb5004ee844d', '51000000-0000-4000-8000-000000001403', latest.version_number + 1, 'official/characters/2d-city-idol.png', '/assets/library/official/characters/2d-city-idol.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"偶像练习生","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-city-idol-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-city-idol-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-city-idol-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-现代都市 / 元气少女
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001401', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-现代都市', '元气少女', '全身角色立绘，一位活泼开朗的日系青春少女，年轻女性角色，元气校园休闲风，棕色长发扎成高马尾，发尾蓬松卷翘，额前碎刘海，头戴橙色发圈，侧边有黄色星星发夹，圆润大眼睛，笑容灿烂，张嘴开心表情，气质阳光可爱，身材纤细修长，身穿宽松黄色短袖 T 恤，胸前有彩色爱心图案印花，下身穿蓝色高腰牛仔短裤，裤脚有白色蕾丝边和磨边细节，肩背粉色双肩包，包上挂着白色小兔子挂件，手腕佩戴彩色手链，白色中筒袜带黄色条纹，脚穿黄白橙配色厚底运动鞋，右手举起比耶手势，左手叉腰，单腿自然受力，站姿俏皮自信，正面略带侧身角度，居中构图，完整身体，纯白背景，无场景背景，日系二次元动漫风，青春校园角色设定，轻小说插画风，干净线稿，明亮柔和上色，色彩活泼清新，服装褶皱自然，背包与鞋子细节丰富，画面清爽明亮，高质量角色概念设计，清晰锐利，元气可爱，竖版构图，画面比例 3:4，适合游戏或漫画现代校园角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001401'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001401'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '3bed21ed-e310-49fe-8607-57a6508d2884', '51000000-0000-4000-8000-000000001401', latest.version_number + 1, 'official/characters/2d-city-girl.png', '/assets/library/official/characters/2d-city-girl.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"元气少女","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-city-girl-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-city-girl-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-city-girl-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-现代都市 / 冷面学长
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001402', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-现代都市', '冷面学长', '全身角色立绘，一位清冷沉稳的现代校园男高中生，少年男性角色，日系二次元动漫风，黑色微卷短发略显凌乱，蓝灰色眼睛，面容清秀，神情安静略带疏离感，身材修长，身穿深 navy 蓝色学院制服西装外套，外套胸前带校徽徽章，白色衬衫，灰色 V 领针织背心，蓝金条纹领带，下身穿深灰色格纹西裤，脚穿黑色皮鞋，单肩背着黑色书包，一只手插在裤袋里，另一只手自然下垂，正面站姿，居中构图，完整身体，纯白背景，无场景背景，现代校园角色设定，青春校园题材，日系轻小说角色插画风，干净线稿，柔和上色，服装褶皱自然，格纹裤细节清晰，人物比例修长，画面清爽，高质量角色概念设计，清晰锐利，竖版构图，画面比例 3:4，适合游戏或漫画角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001402'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001402'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '79ccf181-c964-45fb-8ed1-6efd6a8a765b', '51000000-0000-4000-8000-000000001402', latest.version_number + 1, 'official/characters/2d-city-senior.png', '/assets/library/official/characters/2d-city-senior.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"冷面学长","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-city-senior-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-city-senior-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-city-senior-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-现代都市 / 机车少年
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001405', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-现代都市', '机车少年', '全身角色立绘，一位酷帅叛逆的现代机车少年，年轻男性角色，街头赛车手或摩托骑士形象，气质冷峻自信，黑色短发凌乱蓬松，面容清秀英气，眉眼锐利，神情沉稳略带不羁感，身材修长挺拔，身穿黑色皮质机车夹克，夹克带红白色拼接条纹和拉链装饰，内搭白色圆领 T 恤，下身穿黑色工装长裤，腰间有黑色皮带、金属链条和侧边挂带，双手佩戴黑色半指骑行手套，脚穿黑色厚底机车靴，靴面带红白装饰和金属扣件，左手抱着黑红白配色全盔摩托头盔，右手自然下垂，正面站姿，姿态放松帅气，居中构图，完整身体，纯白背景，无场景背景，现代都市机车角色设定，街头潮流人物形象设计，日系二次元动漫风，轻小说插画风，干净线稿，精致上色，黑红白强对比配色，皮革反光质感清晰，工装裤褶皱自然，头盔和机车靴细节丰富，柔和棚拍光，清晰锐利，酷感十足，高级感，竖版构图，画面比例 3:4，适合游戏或漫画现代机车少年角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001405'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001405'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '3040496d-0e8f-4f20-8334-3a7b6857c53e', '51000000-0000-4000-8000-000000001405', latest.version_number + 1, 'official/characters/2d-city-rider.png', '/assets/library/official/characters/2d-city-rider.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"机车少年","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-city-rider-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-city-rider-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-city-rider-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-现代都市 / 漫画编辑
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001404', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-现代都市', '漫画编辑', '全身角色立绘，一位温柔文艺的现代漫画创作者，年轻女性角色，日系生活休闲风，棕色长发盘成松散丸子头，额前有自然碎发，佩戴圆框眼镜，面容清秀可爱，眼神柔和，带腼腆微笑，气质安静亲和，身材纤细自然，身穿白色圆领 T 恤，外搭米 beige 色宽松针织开衫，下身穿橄榄绿色高腰宽松直筒长裤，裤脚卷边，脚穿米白色帆布鞋，怀里抱着漫画原稿本或分镜稿，肩背米白色帆布托特包，包上印有漫画格图案，包内装着画笔、马克笔、笔记本和画材，双臂交叠抱着画稿，正面站姿，姿态放松自然，居中构图，完整身体，纯白背景，无场景背景，现代日常角色设定，漫画创作者人物形象设计，日系二次元动漫风，轻小说插画风，干净线稿，柔和上色，米色与橄榄绿清新配色，服装褶皱自然，画稿和画材细节丰富，画面清爽温暖，清晰锐利，文艺可爱，高级感，竖版构图，画面比例 3:4，适合游戏或漫画现代日常角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001404'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001404'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'aeee1866-e856-4ea2-80e9-04f497e45413', '51000000-0000-4000-8000-000000001404', latest.version_number + 1, 'official/characters/2d-city-editor.png', '/assets/library/official/characters/2d-city-editor.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"漫画编辑","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-city-editor-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-city-editor-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-city-editor-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 2D漫-现代都市 / 白领姐姐
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001406', 'official', NULL, NULL, NULL, 'character', 'character', '2D漫-现代都市', '白领姐姐', '全身角色立绘，一位温柔干练的现代都市职场女性，年轻女性角色，商务通勤形象，气质优雅自信，深棕色长发自然披肩，发丝柔顺微卷，面容精致甜美，眼神柔和，带淡淡微笑，身材高挑纤细，身穿米白色修身西装外套，内搭黑色 V 领上衣，下身穿黑色高腰修身西装长裤，脚穿黑色尖头高跟鞋，肩背黑色小号单肩包，包身带金色扣饰，右手插在裤袋里，左手轻扶包带，正面站姿，单腿微微倾斜，姿态自然优雅，居中构图，完整身体，纯白背景，无场景背景，现代都市职场角色设定，商务女性人物形象设计，日系二次元动漫风，轻小说插画风，干净线稿，柔和上色，黑白简约配色，服装褶皱自然，西装剪裁利落，皮包和高跟鞋细节清晰，画面清爽干净，清晰锐利，专业亲和，高级感，竖版构图，画面比例 3:4，适合游戏或漫画现代职场角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001406'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001406'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'd688bf8e-d47f-4cb2-8c28-ce985212f5ef', '51000000-0000-4000-8000-000000001406', latest.version_number + 1, 'official/characters/2d-city-office.png', '/assets/library/official/characters/2d-city-office.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"白领姐姐","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/2d-city-office-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/2d-city-office-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/2d-city-office-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-东方修仙 / 丹师
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001305', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-东方修仙', '丹师', '全身角色立绘，一位俊美年轻的中国古风炼药师，仙侠武侠风，男性角色，黑色长发半束，头戴小型金色发冠，神情清冷沉稳，身穿米白色和浅金色层叠汉服长袍，白色内衬，宽袖，衣摆和披帛带有精致金色刺绣，棕色皮革腰带和斜挎带，皮质护腕，棕色短靴，腰间挂满药瓶、皮袋、卷轴和小配件，手持装有绿色药液的透明玻璃瓶，正面站姿，居中构图，纯白背景，无场景背景，高质量幻想游戏角色设定，半写实 3D 插画风，东方玄幻角色设计，精致服装细节，细腻布料纹理，复杂配饰，柔和棚拍光，清晰锐利，高级感，完整身体，角色概念设计，比例 3:4，竖版构图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001305'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001305'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '3a2dc86c-f64e-4f35-8000-b69f3e077f9d', '51000000-0000-4000-8000-000000001305', latest.version_number + 1, 'officialAssets/20260629/6504beaa-8d77-4498-a4b7-20b1517833ba-.png', 'https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260629/6504beaa-8d77-4498-a4b7-20b1517833ba-.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"丹师","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"detail-1782735700088":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260629/7db17398-6f26-4395-b111-3591b3e80afd-1.png"},"detailViewItems":[{"key":"detail-1782735700088","label":"方位图","imageUrl":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260629/7db17398-6f26-4395-b111-3591b3e80afd-1.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260629/7db17398-6f26-4395-b111-3591b3e80afd-1.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-东方修仙 / 仙尊
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001302', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-东方修仙', '仙尊', '全身角色立绘，一位威严俊朗的中国古风白发仙尊，男性角色，仙侠玄幻风，宗门掌门气质，高阶修仙者形象，银白色长发披肩，头戴高挑银色仙冠，面容成熟清冷，眉眼沉稳，留有细长白色胡须，神态庄重淡然，身穿层叠银白色汉服仙袍，宽大长袖，白色内衬，银灰色披帛与外袍自然垂落，衣料轻薄飘逸，衣摆带有精致暗纹刺绣和银色花纹，肩部有华丽立体装饰，腰间银色腰带，悬挂青绿色玉佩和长流苏，整体配色为白色、银色、浅灰色，高洁圣洁，仙气飘渺，正面站姿，双手自然下垂，居中构图，完整身体，纯白背景，无场景背景，高质量幻想游戏角色设定，东方玄幻角色设计，半写实 3D 插画风，精致服装细节，细腻布料纹理，复杂配饰，柔和棚拍光，清晰锐利，高级感，竖版构图，画面比例 3:4，角色概念设计，适合游戏立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001302'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001302'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'f0bbd4ec-382d-47be-8fd6-07382ee7a631', '51000000-0000-4000-8000-000000001302', latest.version_number + 1, 'official/characters/3d-xianxia-master.png', '/assets/library/official/characters/3d-xianxia-master.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"仙尊","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"detail-1782735734737":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260629/4dccf573-5bb3-427b-a04d-ba73e87275fc-2.png"},"detailViewItems":[{"key":"detail-1782735734737","label":"方位图","imageUrl":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260629/4dccf573-5bb3-427b-a04d-ba73e87275fc-2.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260629/4dccf573-5bb3-427b-a04d-ba73e87275fc-2.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-东方修仙 / 剑修
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001301', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-东方修仙', '剑修', '全身角色立绘，一位俊美冷峻的中国古风仙侠剑客，年轻男性角色，东方玄幻武侠风，黑色长发半束高马尾，头戴青玉银色发冠，部分长发自然垂落，面容清秀英气，眉眼锐利，神情沉稳淡漠，身穿白色内袍与浅青色层叠仙侠长袍，外搭半透明青绿色披帛与飘逸外衫，衣摆带精致银白色刺绣纹样，袖口和肩部有细腻花纹装饰，腰间佩戴黑银色金属腰封和华丽扣饰，悬挂青绿色玉佩、流苏和小配件，脚穿黑色高筒皮靴，右手持一柄细长古风长剑，剑身修长锋利，剑柄带银色雕花装饰，长剑自然斜向下垂，正面站姿，身体挺拔，居中构图，完整身体，纯白背景，无场景背景，高质量仙侠游戏角色设定，东方玄幻角色设计，半写实 3D 立绘风，精致服装细节，轻薄纱质布料，金属与玉石配饰质感清晰，柔和棚拍光，清晰锐利，仙气飘逸，高级感，竖版构图，画面比例 3:4，适合游戏角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001301'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001301'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '0639ae8e-0be1-424d-8b0e-e943b8dbfe6f', '51000000-0000-4000-8000-000000001301', latest.version_number + 1, 'official/characters/3d-xianxia-swordsman.png', '/assets/library/official/characters/3d-xianxia-swordsman.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"剑修","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-xianxia-swordsman-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-xianxia-swordsman-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-xianxia-swordsman-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-东方修仙 / 宗门长老
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001306', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-东方修仙', '宗门长老', '全身角色立绘，一位威严清冷的中国古风白发仙尊，老年男性角色，东方玄幻宗门长老或仙门掌门形象，气质庄重高洁，银白色长发半束高髻，长发披肩垂落，头戴银蓝色发冠与玉石发饰，面容苍老端正，眉眼深邃威严，留有长白眉和浓密白色长须，神情严肃沉稳，身材挺拔修长，身穿白色内袍与银灰蓝色层叠仙袍，外搭半透明蓝灰色披帛和宽大长袖外衫，肩部有银色金属护肩与精致镂空装饰，衣袍带银色暗纹刺绣、云纹和流线花纹，腰间佩戴银蓝色腰封、金属扣饰、青蓝色玉佩吊坠、长流苏和小配件，脚穿银灰色古风布靴，双手自然下垂，正面站姿，姿态端正威严，居中构图，完整身体，纯白背景，无场景背景，高质量仙侠游戏角色设定，东方玄幻长老角色设计，半写实 3D 立绘风，白银蓝灰清冷配色，服装层次丰富，纱质布料轻薄飘逸，金属与玉石配饰质感清晰，刺绣细节精致，柔和棚拍光，清晰锐利，仙气飘逸，庄严高贵，高级感，竖版构图，画面比例 3:4，适合游戏或漫画仙侠长老角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001306'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001306'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '97d1e0d5-b969-4815-8d76-9ba7ace9e502', '51000000-0000-4000-8000-000000001306', latest.version_number + 1, 'official/characters/3d-xianxia-elder.png', '/assets/library/official/characters/3d-xianxia-elder.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"宗门长老","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-xianxia-elder-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-xianxia-elder-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-xianxia-elder-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-东方修仙 / 灵狐少女
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001304', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-东方修仙', '灵狐少女', '全身角色立绘，一位柔美神秘的白狐妖仙少女，年轻女性角色，东方玄幻狐族仙子形象，气质清冷温婉，银白色长发披散至腰间，头顶一对白色狐耳，身后有蓬松白色狐尾，额间有精致花钿，面容精致柔美，眼神清澈淡然，神情安静高贵，身材纤细修长，身穿白色与浅粉色层叠仙裙，露肩束腰设计，外搭半透明轻纱长袖和飘逸披帛，肩部有白色毛绒狐裘装饰，裙身带金色刺绣、花纹暗纹和细腻珠链装饰，腰间佩戴粉色束带、宝石腰饰、青绿色玉佩吊坠和长流苏，脚穿白色绣花短靴，双手自然微微展开，正面站姿，姿态轻盈优雅，居中构图，完整身体，纯白背景，无场景背景，高质量东方玄幻游戏角色设定，狐妖仙子角色设计，半写实 3D 立绘风，白粉柔和配色，纱质布料轻薄通透，毛绒与玉石配饰质感清晰，服装层次华丽，柔和棚拍光，清晰锐利，仙气飘逸，唯美高级感，竖版构图，画面比例 3:4，适合游戏或漫画狐族仙子角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001304'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001304'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '4f4ac89b-72c0-4cb4-89d8-96f167d596be', '51000000-0000-4000-8000-000000001304', latest.version_number + 1, 'official/characters/3d-xianxia-fox.png', '/assets/library/official/characters/3d-xianxia-fox.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"灵狐少女","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-xianxia-fox-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-xianxia-fox-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-xianxia-fox-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-东方修仙 / 魔尊
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001303', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-东方修仙', '魔尊', '全身角色立绘，一位俊美冷酷的中国古风魔尊，年轻男性角色，东方玄幻反派风，黑色长发半束高髻，长发凌乱飘散，头戴黑红色尖锐魔冠，冠饰镶嵌红色宝石，面容苍白俊美，眉眼狭长锐利，神情冷漠威严，气质危险强势，身穿黑色层叠长袍与暗红色内衬，外搭厚重黑色披风，肩部有尖锐铠甲护肩和复杂金属装饰，衣袍带暗红描边、黑色暗纹刺绣和火焰裂纹图案，腰间佩戴多层黑红腰带、金属扣饰、链条、红色长流苏和玉石吊坠，双臂有黑色护腕与金属甲片，脚穿黑色战靴，身侧飘散大量黑红色长带与半透明披帛，双手握拳自然下垂，正面站姿，姿态挺拔压迫感强，居中构图，完整身体，纯白背景，无场景背景，高质量仙侠游戏角色设定，东方玄幻暗黑角色设计，半写实 3D 立绘风，黑红配色，服装层次复杂，金属配饰精致，布料纹理细腻，披风飘逸，柔和棚拍光，清晰锐利，邪魅霸气，高级感，竖版构图，画面比例 3:4，适合游戏或漫画反派角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001303'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001303'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'ef5066f2-60f0-4f4c-86c0-024ff6e5db48', '51000000-0000-4000-8000-000000001303', latest.version_number + 1, 'official/characters/3d-xianxia-demon.png', '/assets/library/official/characters/3d-xianxia-demon.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"魔尊","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-xianxia-demon-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-xianxia-demon-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-xianxia-demon-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-现代都市 / 助理
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001204', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-现代都市', '助理', '全身角色立绘，一位年轻温柔的现代职场女性，都市白领秘书或行政助理形象，女性角色，气质亲和专业，深棕黑色长发低盘发，额前有自然碎发，面容清秀甜美，五官精致，眼神柔和，微笑表情，身材修长匀称，身穿白色修身衬衫，袖口自然挽起，搭配黑色高腰包臀铅笔裙，脚穿黑色高跟鞋，双手抱着一台灰色平板电脑或文件夹，站姿端正优雅，正面站立，居中构图，完整身体，纯白背景，无场景背景，现代商务角色设定，职场人物形象设计，半写实 3D 插画风，轻度卡通写实质感，柔和棚拍光，皮肤细腻自然，服装褶皱真实，黑白职业装对比清晰，干净简洁，高质量角色概念设计，清晰锐利，亲切专业，高级感，竖版构图，画面比例 3:4，适合游戏或漫画现代职场角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001204'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001204'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'a28e9a7f-1831-466b-8b28-022c4b9c684c', '51000000-0000-4000-8000-000000001204', latest.version_number + 1, 'official/characters/3d-assistant.png', '/assets/library/official/characters/3d-assistant.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"助理","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-assistant-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-assistant-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-assistant-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-现代都市 / 富家千金
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001205', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-现代都市', '富家千金', '全身角色立绘，一位优雅精致的现代富家千金，年轻女性角色，豪门名媛形象，气质高贵甜美，棕色长卷发侧分披肩，发丝柔顺蓬松，面容精致漂亮，眼神温柔自信，带淡淡微笑，妆容干净高级，身材高挑纤细，身穿米白色无袖小香风连衣裙，V 领设计，收腰短裙剪裁，腰间有同色腰带和金色方扣，裙身带细腻粗花呢纹理、金色纽扣、口袋装饰和毛边细节，佩戴金色耳环、项链、手镯和腕表，右手提着米白色菱格纹链条小方包，包身带金色锁扣，脚穿米白色细带高跟凉鞋，双腿自然交错，正面略带行走姿态，姿势优雅从容，居中构图，完整身体，纯白背景，无场景背景，现代都市豪门角色设定，富家千金人物形象设计，半写实 3D 立绘风，轻度高端时尚摄影质感，米白金配色，服装', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001205'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001205'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'e33b630f-cff7-41c5-8a11-e42f037afb1d', '51000000-0000-4000-8000-000000001205', latest.version_number + 1, 'official/characters/3d-heiress.png', '/assets/library/official/characters/3d-heiress.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"富家千金","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-heiress-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-heiress-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-heiress-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-现代都市 / 律师
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001206', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-现代都市', '律师', '全身角色立绘，一位年轻斯文的现代商务精英男性，都市职场经理或金融顾问形象，男性角色，气质温和专业，黑色短发侧分向后梳理，发型蓬松利落，佩戴黑框眼镜，面容俊朗干净，眼神沉稳亲和，带淡淡微笑，身材高挑修长，身穿深 navy 蓝色修身西装外套，白色衬衫，深灰蓝色领带，胸前白色口袋巾，下身穿同色西装长裤，脚穿黑色亮面皮鞋，左手抱着棕色皮质文件夹或公文包，右手插在裤袋里，正面站姿，姿态挺拔自然，居中构图，完整身体，纯白背景，无场景背景，现代都市商务角色设定，职场精英人物形象设计，半写实 3D 立绘风，轻度商业摄影质感，西装剪裁利落，布料纹理细腻，眼镜和皮革文件夹质感清晰，皮鞋反光自然，柔和棚拍光，真实人体比例，清晰锐利，干净专业，斯文可靠，高级感，竖版构图，画面比例 3:4，适合游戏或漫画现代商务角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001206'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001206'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '35f90589-8d99-40fb-8c33-194958ef301b', '51000000-0000-4000-8000-000000001206', latest.version_number + 1, 'official/characters/3d-lawyer.png', '/assets/library/official/characters/3d-lawyer.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"律师","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-lawyer-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-lawyer-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-lawyer-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-现代都市 / 都市女主
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001202', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-现代都市', '都市女主', '全身角色立绘，一位温柔清新的现代都市年轻女性，日常休闲穿搭形象，女性角色，气质甜美自然，棕色长卷发侧分披肩，发丝柔顺蓬松，面容精致可爱，眼神柔和，带淡淡微笑，身材高挑纤细，身穿米白色宽松衬衫，袖口自然挽起，下身穿浅蓝色高腰直筒牛仔裤，裤型修身利落，脚穿白色休闲运动鞋，肩背棕色皮质单肩包，左手插在牛仔裤口袋里，右手自然下垂，双腿自然交错，正面略带行走姿态，姿势轻松优雅，居中构图，完整身体，纯白背景，无场景背景，现代都市日常角色设定，清新休闲人物形象设计，半写实 3D 立绘风，轻度卡通写实质感，柔和棚拍光，皮肤细腻自然，衬衫布料柔软，牛仔布纹理清晰，皮包材质细节真实，色彩干净明亮，清晰锐利，亲和甜美，高级感，竖版构图，画面比例 3:4，适合游戏或漫画现代日常角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001202'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001202'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'd226d0d7-f322-4176-8805-88bc95b6538d', '51000000-0000-4000-8000-000000001202', latest.version_number + 1, 'official/characters/3d-city-heroine.png', '/assets/library/official/characters/3d-city-heroine.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"都市女主","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-city-heroine-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-city-heroine-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-city-heroine-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-现代都市 / 都市男主
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001201', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-现代都市', '都市男主', '全身角色立绘，一位年轻帅气的现代都市休闲男生，男性角色，清爽潮流穿搭形象，黑色微卷短发自然蓬松，发型精致随性，面容俊朗干净，眉眼温和自信，神情平静略带微笑，身材高挑修长，身穿黑色飞行员夹克外套，内搭白色圆领 T 恤，下身穿黑色修身休闲长裤，脚穿黑白配色低帮帆布鞋，左手佩戴黑色腕表，双手插在裤袋里，正面站姿，姿态自然放松，居中构图，完整身体，纯白背景，无场景背景，现代都市角色设定，青春休闲人物形象设计，半写实 3D 立绘风，轻度商业摄影质感，黑白简约配色，夹克布料纹理细腻，服装褶皱自然，鞋带和腕表细节清晰，柔和棚拍光，真实人体比例，清晰锐利，干净帅气，高级感，竖版构图，画面比例 3:4，适合游戏或漫画现代日常角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001201'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001201'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'f2b9bbdd-5651-42a7-8eb6-28dfa0c64564', '51000000-0000-4000-8000-000000001201', latest.version_number + 1, 'official/characters/3d-city-hero.png', '/assets/library/official/characters/3d-city-hero.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"都市男主","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-city-hero-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-city-hero-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-city-hero-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 3D漫-现代都市 / 霸总
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001203', 'official', NULL, NULL, NULL, 'character', 'character', '3D漫-现代都市', '霸总', '全身角色立绘，一位年轻英俊的现代商务精英男性，都市职场总裁或高级经理形象，男性角色，气质沉稳自信，黑色短发向后梳理，发型精致利落，面容俊朗清冷，眉眼锐利，神情从容严肃，身材高挑修长，身穿黑色修身西装外套，白色衬衫，黑色领带，胸前白色口袋巾，领带夹细节，下身穿黑色西装长裤，脚穿黑色亮面皮鞋，左手抱着棕色皮质文件夹或公文包，右手插在裤袋里，正面站姿，姿态挺拔优雅，居中构图，完整身体，纯白背景，无场景背景，现代都市商务角色设定，高级职场人物形象设计，半写实 3D 立绘风，轻度商业摄影质感，西装剪裁利落，布料纹理细腻，皮革文件夹质感清晰，皮鞋反光自然，柔和棚拍光，真实人体比例，清晰锐利，干净专业，高级感，竖版构图，画面比例 3:4，适合游戏或漫画现代商务角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001203'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001203'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '8e15dc02-0ec9-4e12-8614-6cd9e902f343', '51000000-0000-4000-8000-000000001203', latest.version_number + 1, 'official/characters/3d-ceo.png', '/assets/library/official/characters/3d-ceo.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"霸总","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/3d-ceo-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/3d-ceo-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/3d-ceo-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-东方古代 / 侠客
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001107', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-东方古代', '侠客', '全身角色立绘，一位年轻冷峻的中国古风黑衣剑客，男性角色，武侠江湖风，侠客护卫气质，黑色长发半束高髻，部分长发自然垂落，面容英气沉稳，眉眼锐利，神情严肃克制，身穿深黑色与暗灰色层叠汉服武袍，交领内衬带少量暗红色衣领，宽袖上衣，长款下摆，衣料带有低调暗纹和磨砂质感，腰间多层棕色皮革腰带与垂挂束带，双臂佩戴棕色皮革护腕，脚穿深色长靴，腰侧斜挎一柄古风长剑，剑鞘为黑棕色，剑柄带金属装饰，双手自然握拳下垂，正面站姿，居中构图，完整身体，纯黑背景或透明背景，无场景背景，高质量武侠游戏角色设定，东方古风角色设计，半写实 3D 写实立绘风，服装层次清晰，皮革与布料纹理细腻，武器细节精致，柔和棚拍光，清晰锐利，沉稳冷酷，高级感，竖版构图，画面比例 2:3，适合游戏角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001107'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001107'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '771de0c5-b813-4b8d-8855-b0401c8452aa', '51000000-0000-4000-8000-000000001107', latest.version_number + 1, 'official/characters/wanderer.png', '/assets/library/official/characters/wanderer.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"侠客","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"detail-1782792572814":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260630/4197a4c6-ce58-4c86-ad0c-198b1ac697cd-wanderer-sheet.png"},"detailViewItems":[{"key":"detail-1782792572814","label":"方位图","imageUrl":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260630/4197a4c6-ce58-4c86-ad0c-198b1ac697cd-wanderer-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/officialAssets/20260630/4197a4c6-ce58-4c86-ad0c-198b1ac697cd-wanderer-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-东方古代 / 和尚
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001105', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-东方古代', '和尚', '全身角色立绘，一位沉静庄重的中国佛门僧人，中年男性角色，寺庙和尚或高僧形象，气质平和稳重，剃光头，面容端正朴素，眉眼平静，神情淡然克制，身材匀称挺拔，身穿明黄色僧袍，宽大长袖，内层交领袈裟自然垂落，肩披橙褐色袈裟披帛，衣料厚实柔软，布料褶皱自然，下摆层叠垂至脚踝，脚穿棕色布鞋，双手持佛珠念珠和经书袋或布袋，念珠自然垂挂在身前，正面站姿，姿态端正安定，居中构图，完整身体，纯黑背景或透明背景，无场景背景，中国佛教寺庙角色设定，传统僧侣人物形象设计，写实 3D 立绘风，轻度影视服装摄影质感，黄色与橙褐色主色调，僧袍布料纹理清晰，佛珠材质细节明确，柔和棚拍光，真实人体比例，清晰锐利，宁静庄严，朴素高级感，竖版构图，画面比例 3:4，适合游戏或漫画僧人角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001105'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001105'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '2400a079-705b-43d0-89a4-70a681f0a3fa', '51000000-0000-4000-8000-000000001105', latest.version_number + 1, 'official/characters/monk.png', '/assets/library/official/characters/monk.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"和尚","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/monk-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/monk-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/monk-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-东方古代 / 太监
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001103', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-东方古代', '太监', '全身角色立绘，一位年轻端正的中国古代文官或监察官，男性角色，朝廷官员形象，气质沉稳内敛，面容清秀端正，眉眼平静坚定，神情严肃克制，身材修长挺拔，头戴黑色古代官帽，官帽两侧有横向展翅帽翅，帽前有圆形金色纹章，身穿黑色宽袖官袍，内露白色领口，胸前有方形金色补子图案，补子上带飞禽纹样和暗金刺绣，下身为黑色长袍垂至脚踝，腰间佩戴黑色腰带，腰带有多枚圆形金属扣饰和中央青灰色玉石腰牌，侧边垂挂灰色长流苏，双手交叠藏于袖前，正面站姿，姿态端正肃穆，居中构图，完整身体，纯黑背景或透明背景，无场景背景，中国古代朝堂角色设定，古代文官人物形象设计，写实 3D 立绘风，轻度影视服装摄影质感，黑金配色沉稳庄重，官服布料带暗纹光泽，补子刺绣细节清晰，腰带金属与玉石质感明确，柔和棚拍光，真实人体比例，清晰锐利，庄严克制，高级感，竖版构图，画面比例 2:3，适合游戏或漫画古代官员角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001103'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001103'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6a71830f-d66c-448e-8416-77ea9f039ea4', '51000000-0000-4000-8000-000000001103', latest.version_number + 1, 'official/characters/eunuch.png', '/assets/library/official/characters/eunuch.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"太监","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/eunuch-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/eunuch-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/eunuch-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-东方古代 / 宫女
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001106', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-东方古代', '宫女', '全身角色立绘，一位清秀端庄的中国古代宫女，年轻女性角色，宫廷侍女形象，气质温婉恭顺，黑色长发中分盘成双侧圆髻，发髻点缀白色花朵发饰，佩戴细长珍珠耳坠，面容清秀柔和，眼神平静，神情端正克制，身材匀称修长，身穿浅蓝色宫女服，上衣为立领对襟长袖短袄，衣襟有盘扣细节，袖口带淡金色花枝刺绣，下身为同色系高腰长裙，裙摆宽大垂坠，带细腻花枝刺绣和浅色花纹，脚穿浅蓝色绣鞋，双手交叠置于身前，正面站姿，姿态端庄规矩，居中构图，完整身体，纯白背景，无场景背景，中国古代宫廷角色设定，宫女侍女形象设计，写实 3D 立绘风，轻度影视服装摄影质感，浅蓝淡雅配色，布料柔软细腻，裙摆褶皱自然，刺绣纹样清晰，发饰与耳坠质感精致，柔和棚拍光，真实人体比例，清晰锐利，温婉素雅，干净高级感，竖版构图，画面比例 3:4，适合游戏或漫画古代宫女角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001106'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001106'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '5beb5cf4-0f5c-49b6-8326-86ccf01252b1', '51000000-0000-4000-8000-000000001106', latest.version_number + 1, 'official/characters/maid.png', '/assets/library/official/characters/maid.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"宫女","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/maid-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/maid-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/maid-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-东方古代 / 宰相
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001104', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-东方古代', '宰相', '全身角色立绘，一位威严端正的中国古代文官，中年男性角色，朝廷大臣或宰相形象，气质沉稳严肃，黑色短须和下巴胡，面容成熟端正，眉眼坚定，神情庄重克制，头戴黑色古代官帽，官帽两侧有横向展翅帽翅，帽前带金色纹章，身穿深红色宽袖官袍，内搭黑金色朝服，衣襟和袖口带精致金色织锦边饰，胸前有方形金色补子图案，下摆有大面积金色山海纹、云纹和宫廷纹样刺绣，腰间束带，双手持白色笏板置于身前，正面站姿，姿态端正肃穆，居中构图，完整身体，纯黑背景或透明背景，无场景背景，中国古代朝堂角色设定，历史文官人物形象设计，写实 3D 立绘风，轻度影视服装摄影质感，深红黑金配色，官服布料厚重，刺绣纹样细节丰富，笏板质感清晰，柔和棚拍光，真实人体比例，清晰锐利，庄严稳重，高级感，竖版构图，画面比例 3:4，适合游戏或漫画古代文官角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001104'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001104'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '99679aeb-6722-49dc-89ba-461a416b2829', '51000000-0000-4000-8000-000000001104', latest.version_number + 1, 'official/characters/chancellor.png', '/assets/library/official/characters/chancellor.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"宰相","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/chancellor-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/chancellor-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/chancellor-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-东方古代 / 将军
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001108', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-东方古代', '将军', '全身角色立绘，一位威严厚重的中国古代武将，中年男性角色，古代将军或禁军统领形象，气质沉稳勇猛，黑色短发与浓密胡须，面容成熟硬朗，眉眼坚定威严，神情严肃克制，身材魁梧结实，头戴黑金色金属战盔，盔顶有红色缨饰，身穿黑金色重型将军铠甲，肩部有虎头或兽首金属护肩，胸甲带金色龙纹、兽纹和浮雕装饰，腰间佩戴宽大黑金腰带与狮兽头金属扣饰，下身为层叠札甲战裙和黑色战裤，双臂佩戴金属护腕，腿部有黑金护胫，脚穿厚重黑色战靴，身后披着黑色长披风，双手握拳自然下垂，正面站姿，姿态稳重有压迫感，居中构图，完整身体，纯黑背景或透明背景，无场景背景，中国古代战争角色设定，历史武将人物形象设计，写实 3D 立绘风，轻度影视服装摄影质感，黑金配色厚重华丽，金属铠甲质感清晰，纹样雕刻细节丰富，披风布料垂坠自然，柔和棚拍光，真实人体比例，清晰锐利，威武霸气，高级感，竖版构图，画面比例 3:4，适合游戏或漫画古代武将角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001108'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001108'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'a13c6859-922c-48e5-85fc-76794819cd63', '51000000-0000-4000-8000-000000001108', latest.version_number + 1, 'official/characters/general.png', '/assets/library/official/characters/general.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"将军","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/general-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/general-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/general-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-东方古代 / 皇后
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001101', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-东方古代', '皇后', '全身角色立绘，一位端庄威严的中国古代皇后，年轻女性角色，宫廷凤后形象，气质高贵沉稳，黑色长发盘成精致高髻，头戴华丽金色凤冠，凤冠带精细镂空纹样和垂珠流苏，面容秀丽端正，眉眼清冷平静，神情庄重克制，身材修长端庄，身穿黑金色华丽凤袍，内层为金色与红色交领宫装，外袍宽大厚重，肩部有立体宽肩结构，衣袍满绣金色凤凰纹、龙凤纹、祥云纹和宫廷花纹，衣襟与袖口带红金织锦边饰，腰间佩戴红金色宽腰封和圆形金属扣饰，双手交叠置于身前，正面站姿，姿态端正尊贵，居中构图，完整身体，纯黑背景或透明背景，无场景背景，中国古代宫廷角色设定，历史皇后人物形象设计，写实 3D 立绘风，轻度影视服装摄影质感，黑金红配色，丝绸缎面光泽明显，凤袍刺绣细节丰富，金属凤冠质感清晰，柔和棚拍光，真实人体比例，清晰锐利，尊贵华丽，高级感，竖版构图，画面比例 3:4，适合游戏或漫画古代皇后角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001101'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001101'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6911dbd2-79d4-4875-8d79-48d2e3d842af', '51000000-0000-4000-8000-000000001101', latest.version_number + 1, 'official/characters/empress.png', '/assets/library/official/characters/empress.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"皇后","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/empress-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/empress-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/empress-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-东方古代 / 皇帝
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000001102', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-东方古代', '皇帝', '全身角色立绘，一位威严沉稳的中国古代皇帝，中年男性角色，帝王形象，气质庄重肃穆，黑色短发束起，面容成熟端正，眉眼威严，留有短胡须和下巴胡，神情冷静克制，身材挺拔厚重，头戴华丽金色帝王冕冠，冠饰带红色宝石与两侧垂珠流苏，身穿明黄色龙袍，宽大长袖，外袍层叠厚重，胸前有精致金龙刺绣图案，衣摆带山海纹、云纹和多色祥瑞纹样，袖口与衣襟边缘有深蓝金色织锦花纹装饰，腰间佩戴黑金色宽腰带和圆形金属扣饰，脚穿金黑色朝靴，双手自然下垂，正面站姿，姿态端正威严，居中构图，完整身体，纯黑背景或透明背景，无场景背景，中国古代宫廷角色设定，历史帝王人物形象设计，写实 3D 立绘风，轻度影视服装摄影质感，明黄金色主色调，丝绸缎面光泽明显，龙袍刺绣细节丰富，金属冠饰质感清晰，柔和棚拍光，真实人体比例，清晰锐利，尊贵庄严，高级感，竖版构图，画面比例 2:3，适合游戏或漫画古代皇帝角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001102'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000001102'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '54edb849-48a5-45bb-84a0-a3a9dd406353', '51000000-0000-4000-8000-000000001102', latest.version_number + 1, 'official/characters/emperor.png', '/assets/library/official/characters/emperor.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"皇帝","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/emperor-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/emperor-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/emperor-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-现代都市 / 保姆
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000101', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-现代都市', '保姆', '全身角色立绘，一位亲切温和的保姆阿姨，现代生活职业形象，女性角色，气质朴素可靠，黑色短发自然盘起，面容和善，眼神温柔，带淡淡微笑，身材普通自然，身穿米白色长袖立领衬衫，外搭浅灰绿色围裙，围裙带肩带、前置口袋和侧边系带蝴蝶结，下身穿深棕色直筒长裤，脚穿黑色平底工作鞋，双手自然下垂，正面站姿，姿态端正放松，居中构图，完整身体，纯白背景，无场景背景，现代生活角色设定，日常职业人物形象设计，写实 3D 立绘风，轻度商业摄影质感，布料纹理自然，围裙褶皱清晰，色彩柔和干净，柔和棚拍光，真实人体比例，清晰锐利，亲和朴实，干净整洁，高质量角色概念设计，竖版构图，画面比例 2:3，适合游戏或漫画现代生活角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000101'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000101'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6ad225ff-f552-49d7-8369-01665e0b4456', '51000000-0000-4000-8000-000000000101', latest.version_number + 1, 'official/characters/nanny.png', '/assets/library/official/characters/nanny.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"保姆","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/nanny-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/nanny-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/nanny-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-现代都市 / 保镖
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000107', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-现代都市', '保镖', '全身角色立绘，一位成熟冷静的现代职业保镖，中年男性角色，商务安保形象，黑色短发梳理整齐，面容硬朗沉稳，眉眼坚定，神情严肃克制，身材挺拔结实，身穿黑色修身西装外套，白色衬衫，黑色领带，黑色西装长裤，脚穿黑色亮面皮鞋，耳朵佩戴黑色隐形耳麦和透明通讯线，双手自然下垂，正面站姿，姿态笔直稳重，居中构图，完整身体，纯白背景，无场景背景，现代都市角色设定，保镖角色设计，写实 3D 立绘风，轻度商业摄影质感，西装剪裁利落，布料纹理细腻，皮鞋反光清晰，柔和棚拍光，真实人体比例，清晰锐利，冷静专业，安全感，高级感，竖版构图，画面比例 2:3，适合游戏或漫画现代职业角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000107'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000107'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6107617f-26e6-4760-8728-fb7e87a1189c', '51000000-0000-4000-8000-000000000107', latest.version_number + 1, 'official/characters/security-guard.png', '/assets/library/official/characters/security-guard.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"保镖","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/security-guard-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/security-guard-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/security-guard-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-现代都市 / 医生
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000102', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-现代都市', '医生', '全身角色立绘，一位沉稳专业的现代医生，中年男性角色，医院主任医师或医学专家形象，气质可靠亲和，黑色短发侧分梳理整齐，面容成熟端正，眉眼平和坚定，神情冷静温和，身材挺拔匀称，身穿白色医生大褂，内搭浅蓝色衬衫和深 navy 蓝色领带，大褂胸前有口袋和青绿色标识条，下方两侧有大口袋与青绿色边饰，下身穿黑色西装长裤，脚穿黑色亮面皮鞋，双手自然下垂，正面站姿，姿态端正正式，居中构图，完整身体，纯白背景，无场景背景，现代医疗职业角色设定，医生人物形象设计，写实 3D 立绘风，轻度商业证件照质感，白蓝黑简洁配色，医生大褂布料干净平整，衬衫领带细节清晰，皮鞋反光自然，柔和棚拍光，真实人体比例，清晰锐利，专业稳重，可信赖，高级感，竖版构图，画面比例 2:3，适合游戏或漫画现代医生角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000102'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000102'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '0692a03c-ae0d-4ccc-81c1-5f74bed99d57', '51000000-0000-4000-8000-000000000102', latest.version_number + 1, 'official/characters/doctor.png', '/assets/library/official/characters/doctor.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"医生","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/doctor-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/doctor-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/doctor-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-现代都市 / 厨师
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000103', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-现代都市', '厨师', '全身角色立绘，一位沉稳专业的现代厨师，中年男性角色，酒店主厨或餐厅厨师形象，气质干净可靠，黑色短发被白色高筒厨师帽遮住，面容端正成熟，眉眼平和，神情冷静亲切，身材匀称挺拔，身穿白色双排扣厨师服，立领设计，胸前有口袋，袖口整洁，腰间系白色围裙，下身穿黑色厨师长裤，脚穿黑色防滑工作鞋，双手自然下垂，正面站姿，姿态端正正式，居中构图，完整身体，纯白背景，无场景背景，现代餐饮职业角色设定，厨师人物形象设计，写实 3D 立绘风，轻度商业摄影质感，白黑简洁配色，厨师服布料干净平整，纽扣和围裙细节清晰，鞋面质感自然，柔和棚拍光，真实人体比例，清晰锐利，专业整洁，稳重可信，高级感，竖版构图，画面比例 2:3，适合游戏或漫画现代厨师角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000103'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000103'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'e4266676-ee5d-4a5b-8c05-c260de4d3353', '51000000-0000-4000-8000-000000000103', latest.version_number + 1, 'official/characters/chef.png', '/assets/library/official/characters/chef.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"厨师","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/chef-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/chef-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/chef-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-现代都市 / 司机
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000105', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-现代都市', '司机', '全身角色立绘，一位沉稳可靠的现代私人司机，中年男性角色，豪宅司机或商务专车司机形象，气质专业克制，黑色短发侧分向后梳理，发型整洁利落，面容成熟端正，眉眼平和坚定，神情冷静稳重，身材挺拔匀称，身穿黑色修身西装外套，白色衬衫，黑色领带，胸前白色口袋巾，下身穿黑色西装长裤，脚穿黑色亮面皮鞋，双手自然下垂，正面站姿，姿态笔直正式，居中构图，完整身体，纯白背景，无场景背景，现代都市职业角色设定，商务司机人物形象设计，写实 3D 立绘风，轻度商业证件照质感，黑白配色干净正式，西装剪裁利落，布料纹理细腻，皮鞋反光清晰，柔和棚拍光，真实人体比例，清晰锐利，专业可靠，稳重安全感，高级感，竖版构图，画面比例 2:3，适合游戏或漫画现代司机角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000105'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000105'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '91940541-b4f3-4d89-8750-d91b127a7c28', '51000000-0000-4000-8000-000000000105', latest.version_number + 1, 'official/characters/driver.png', '/assets/library/official/characters/driver.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"司机","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/driver-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/driver-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/driver-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-现代都市 / 管家
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000108', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-现代都市', '管家', '全身角色立绘，一位沉稳专业的现代高级管家，中老年男性角色，豪宅管家或私人管家形象，气质严谨可靠，黑灰色短发向后梳理，发型整洁利落，面容成熟端正，眉眼平和坚定，神情严肃克制，身材挺拔匀称，身穿黑色正式燕尾服或管家礼服外套，内搭白色礼服衬衫，佩戴黑色领结，胸前有白色口袋巾，下身穿黑色西装长裤，双手佩戴白色礼仪手套，脚穿黑色亮面皮鞋，双手自然下垂，正面站姿，姿态笔直庄重，居中构图，完整身体，纯白背景，无场景背景，现代管家角色设定，高级服务人员形象设计，写实 3D 立绘风，轻度商业摄影质感，礼服剪裁利落，黑白配色干净正式，布料纹理细腻，手套和皮鞋质感清晰，柔和棚拍光，真实人体比例，清晰锐利，端庄专业，稳重可信，高级感，竖版构图，画面比例 2:3，适合游戏或漫画现代管家角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000108'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000108'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'e02e4011-6e36-4c15-8b5f-2a57f516900f', '51000000-0000-4000-8000-000000000108', latest.version_number + 1, 'official/characters/butler.png', '/assets/library/official/characters/butler.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"管家","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/butler-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/butler-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/butler-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-现代都市 / 老师
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000104', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-现代都市', '老师', '全身角色立绘，一位温和端庄的现代职场中年女性，老师形象，女性角色，气质亲切稳重，深棕黑色中长发侧分披肩，发尾微微内扣，发型自然整洁，面容柔和自然，眼神平和，带淡淡微笑，身材普通匀称，身穿米白色圆领衬衫，外搭深 navy 蓝色针织开衫，开衫带一排纽扣，下身穿深 navy 蓝色高腰宽松长裙或阔腿裙裤，长度到脚踝，脚穿黑色平底皮鞋，双手自然下垂，正面站姿，姿态端正放松，居中构图，完整身体，纯白背景，无场景背景，现代职场日常角色设定，办公室人物形象设计，写实 3D 立绘风，轻度商业证件照质感，针织开衫布料纹理自然，衬衫褶皱柔和，长裙垂坠感清晰，柔和棚拍光，真实人体比例，清晰锐利，干净专业，亲和可靠，高级感，竖版构图，画面比例 2:3，适合游戏或漫画现代职场角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000104'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000104'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '972abfa4-ca75-476c-8916-a58dc5ce22ba', '51000000-0000-4000-8000-000000000104', latest.version_number + 1, 'official/characters/teacher.png', '/assets/library/official/characters/teacher.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"老师","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/teacher-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/teacher-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/teacher-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- character / 国内仿真人-现代都市 / 记者
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000106', 'official', NULL, NULL, NULL, 'character', 'character', '国内仿真人-现代都市', '记者', '全身角色立绘，一位成熟干练的现代职场女性，记者人物形象，女性角色，气质专业稳重，黑色短发齐肩内扣，发型整洁利落，面容端庄自然，眼神平和坚定，神情自信克制，身材匀称端正，身穿深灰黑色职业西装外套，内搭白色衬衫，下身穿同色西装长裤，佩戴黑色挂绳证件牌，脚穿黑色低跟皮鞋，双手自然下垂，正面站姿，姿态笔直正式，居中构图，完整身体，纯白背景，无场景背景，现代商务职业角色设定，企业办公人物形象设计，写实 3D 立绘风，轻度商业证件照质感，西装剪裁利落，布料纹理自然，服装褶皱真实，柔和棚拍光，真实人体比例，清晰锐利，干净专业，稳重可靠，高级感，竖版构图，画面比例 2:3，适合游戏或漫画现代职场角色立绘', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000106'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000106'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '21a63190-8713-49a6-80d7-9578a826e067', '51000000-0000-4000-8000-000000000106', latest.version_number + 1, 'official/characters/reporter.png', '/assets/library/official/characters/reporter.png', 'image/png', 720, 960, '{"source":"official_seed_imagegen","display":{"title":"记者","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"turnaround":"/assets/library/official/characters/detail/reporter-sheet.png"},"detailViewItems":[{"key":"turnaround","label":"方位图","imageUrl":"/assets/library/official/characters/detail/reporter-sheet.png","isDefault":true,"sortOrder":10,"thumbnailUrl":"/assets/library/official/characters/detail/reporter-sheet.png"}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-东方修仙 / 灵兽蛋
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003307', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-东方修仙', '灵兽蛋', '一枚东方幻想星空灵蛋道具，蛋形透明蓝绿色水晶外壳，内部呈现深蓝星空、星光、微型宇宙与发光云雾，外表覆盖浅青色云纹浮雕和金色描边，底部为华丽金属底座，带卷云纹、宝石镶嵌和四足支架，整体气质神圣、梦幻、珍贵、孕育灵兽或神器核心感，白色纯背景，单个道具正面展示，高清游戏道具设定图，东方幻想宝物概念设计，水晶、星空、金属、宝石材质精致，画面比例4:5，适合作为灵兽蛋、星辰宝珠、神器核心、游戏稀有道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003307'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003307'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '02037447-2d81-4c11-82de-487b323eacd5', '51000000-0000-4000-8000-000000003307', latest.version_number + 1, 'official/props/prop-2d-xianxia-egg.png', '/assets/library/official/props/prop-2d-xianxia-egg.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"灵兽蛋","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-xianxia-egg.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-xianxia-egg.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-东方修仙 / 灵剑
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003302', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-东方修仙', '灵剑', '一把东方幻想冰属性长剑道具，透明冰蓝色剑刃，剑身带有锐利晶体质感和蓝色能量光纹，银色金属护手呈尖锐兽角与羽翼造型，镶嵌蓝色宝石，黑蓝色缠绕剑柄，柄首有蓝色晶石与浅蓝流苏挂坠，整体气质冷冽、锋利、神秘、冰系法器感，白色纯背景，单个武器倾斜竖向展示，高清游戏武器设定图，东方幻想装备概念设计，水晶、金属、宝石、流苏材质清晰，画面比例4:5，适合作为冰剑、仙侠武器、角色佩剑、游戏装备图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003302'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003302'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'b3f0e301-ea0d-4f74-8fda-5bd914a18f53', '51000000-0000-4000-8000-000000003302', latest.version_number + 1, 'official/props/prop-2d-xianxia-sword.png', '/assets/library/official/props/prop-2d-xianxia-sword.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"灵剑","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-xianxia-sword.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-xianxia-sword.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-东方修仙 / 玉笛
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003305', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-东方修仙', '玉笛', '一支东方古风玉笛道具，浅绿色半透明玉石笛身，表面带有细腻浮雕花纹和玉石天然纹理，笛孔整齐排列，两端包裹金色镂空云纹金属护套，顶部挂有金色链条、圆形玉佩、青绿色玉珠和长流苏，整体气质清雅、贵气、仙侠乐器感，白色纯背景，单个道具倾斜竖向展示，高清游戏道具设定图，东方幻想乐器概念设计，玉石、金属、珠串、流苏材质清晰，柔和棚拍光，画面比例4:5，适合作为玉笛、仙门乐器、角色随身法器、游戏道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003305'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003305'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '1e555ad5-ee9f-4ff7-8d75-d0cd2713853c', '51000000-0000-4000-8000-000000003305', latest.version_number + 1, 'official/props/prop-2d-xianxia-flute.png', '/assets/library/official/props/prop-2d-xianxia-flute.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"玉笛","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-xianxia-flute.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-xianxia-flute.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-东方修仙 / 符箓
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003301', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-东方修仙', '符箓', '一张东方玄幻符箓道具，金黄色长条符纸微微弯曲，纸面带有细腻暗纹和边角装饰，中间绘制棕红色复杂符文、咒印线条和圆形符号，整体像驱邪镇妖或法术封印符，气质神秘、古老、法器感强，白色纯背景，单个道具竖向居中展示，高清游戏道具设定图，东方幻想符纸概念设计，纸张纹理、墨迹和轻微阴影清晰，画面比例4:5，适合作为符咒、封印符、仙侠法术道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003301'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003301'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'd87b1b07-9e2b-4a85-8b61-561ad1fec18d', '51000000-0000-4000-8000-000000003301', latest.version_number + 1, 'official/props/prop-2d-xianxia-talisman.png', '/assets/library/official/props/prop-2d-xianxia-talisman.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"符箓","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-xianxia-talisman.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-xianxia-talisman.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-东方修仙 / 纸伞
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003304', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-东方修仙', '纸伞', '一把东方古风油纸伞道具，浅米色伞面搭配青绿色半透明边缘，伞面绘有淡金色云纹和水墨卷云装饰，细密竹制伞骨呈放射状展开，木质伞柄修长，柄端有金色雕花配件、玉珠挂饰和浅青色流苏，整体气质雅致、清新、古典、仙侠感，白色纯背景，单个道具倾斜展示，高清游戏道具设定图，东方古风器物概念设计，纸伞、竹骨、木柄、玉珠和流苏材质细腻，画面比例4:5，适合作为古风纸伞、角色随身道具、场景装饰图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003304'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003304'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '63bf41f1-7bec-4198-89f5-a087443e544b', '51000000-0000-4000-8000-000000003304', latest.version_number + 1, 'official/props/prop-2d-xianxia-umbrella.png', '/assets/library/official/props/prop-2d-xianxia-umbrella.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"纸伞","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-xianxia-umbrella.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-xianxia-umbrella.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-东方修仙 / 药瓶
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003303', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-东方修仙', '药瓶', '一瓶东方仙侠风格的灵药药剂瓶道具，圆形透明玻璃瓶身，内部盛放青绿色发光液体，瓶口为深青色瓶颈，顶部有花瓣形水晶瓶塞，金色藤蔓状金属包边缠绕瓶身与瓶颈，侧面垂挂金色链条、蓝绿色宝石圆环和浅蓝流苏，整体气质清透、珍贵、治愈、灵力药剂感，白色纯背景，单个道具正面展示，高清游戏道具设定图，东方幻想药瓶概念设计，玻璃、液体、金属、宝石材质清晰，画面比例4:5，适合作为回血药剂、灵泉瓶、仙侠道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003303'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003303'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '02833de5-e61c-46ff-8534-673383dadb7f', '51000000-0000-4000-8000-000000003303', latest.version_number + 1, 'official/props/prop-2d-xianxia-medicine.png', '/assets/library/official/props/prop-2d-xianxia-medicine.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"药瓶","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-xianxia-medicine.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-xianxia-medicine.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-东方修仙 / 莲花灯
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003306', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-东方修仙', '莲花灯', '一盏东方仙侠风格的莲花吊灯道具，粉白色半透明莲花花瓣层层展开，内部散发温暖柔和金光，顶部由金属链条和古铜色吊架悬挂，底部装饰珠串、粉色宝石、玉珠和长流苏，整体造型轻盈、华美、柔和、宫廷仙气感，白色纯背景，单个道具居中悬挂展示，高清游戏道具设定图，东方幻想灯具概念设计，花瓣透光、金属、宝石、流苏材质细节清晰，画面比例4:5，适合作为宫灯、法器灯盏、场景装饰道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003306'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003306'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'd870c39f-2d58-4b9e-8ce6-bade299f4a19', '51000000-0000-4000-8000-000000003306', latest.version_number + 1, 'official/props/prop-2d-xianxia-lantern.png', '/assets/library/official/props/prop-2d-xianxia-lantern.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"莲花灯","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-xianxia-lantern.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-xianxia-lantern.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-东方修仙 / 阵法卷轴
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003308', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-东方修仙', '阵法卷轴', '一卷东方仙侠风格的法术卷轴道具，浅冰蓝色半透明卷面，卷轴上下为圆柱形金属轴，银金色边框和精致云纹雕花装饰，卷面中央绘制发光蓝白色圆形法阵、符文刻印和星盘纹路，两端垂挂蓝色珠链与流苏，整体气质神秘、清冷、法器感强，白色纯背景，单个道具立体展示，高清游戏道具设定图，东方幻想魔法卷轴概念设计，材质细腻，发光效果柔和，画面比例4:5，适合作为法术卷轴、阵法秘籍、游戏装备图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003308'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003308'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'aafcf916-cd14-4926-8c09-add906f96a74', '51000000-0000-4000-8000-000000003308', latest.version_number + 1, 'official/props/prop-2d-xianxia-scroll.png', '/assets/library/official/props/prop-2d-xianxia-scroll.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"阵法卷轴","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-xianxia-scroll.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-xianxia-scroll.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-现代都市 / 书包
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003201', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-现代都市', '书包', '单个学生双肩包道具，深蓝色主包体，米白色前袋和侧边拼接，棕色皮革提手、拉链头与底部包边，正面多层口袋设计，肩带厚实，带小徽章标签和菱形皮革装饰，白色纯背景，居中展示，高清日常校园道具设定图，干净二次元半写实产品渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003201'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003201'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '4088c1da-6dac-49b5-8cbc-ccd7124877a4', '51000000-0000-4000-8000-000000003201', latest.version_number + 1, 'official/props/prop-2d-modern-backpack.png', '/assets/library/official/props/prop-2d-modern-backpack.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"书包","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-modern-backpack.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-modern-backpack.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-现代都市 / 便利贴
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003208', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-现代都市', '便利贴', '一叠彩色便利贴道具，黄色、粉色、蓝色、绿色便签纸层叠摆放，顶部黄色便签纸微微卷起一角，纸张边缘厚实整齐，柔和高光与轻微投影，白色纯背景，居中展示，高清日常办公道具设定图，干净半写实产品渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003208'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003208'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '8dd1fdf1-93b9-4e7d-8401-577a56dbf718', '51000000-0000-4000-8000-000000003208', latest.version_number + 1, 'official/props/prop-2d-modern-sticky-note.png', '/assets/library/official/props/prop-2d-modern-sticky-note.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"便利贴","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-modern-sticky-note.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-modern-sticky-note.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-现代都市 / 地铁卡
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003205', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-现代都市', '地铁卡', '单张蓝色交通卡道具，圆角矩形卡片，蓝白渐变设计，表面印有地铁列车、公交车、城市天际线与弧形轨道图案，薄片塑料材质，轻微反光，白色纯背景，居中展示，高清日常道具设定图，干净产品渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003205'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003205'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '888bc6a7-3c9c-47dd-8068-64e6303d43e8', '51000000-0000-4000-8000-000000003205', latest.version_number + 1, 'official/props/prop-2d-modern-subway-card.png', '/assets/library/official/props/prop-2d-modern-subway-card.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"地铁卡","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-modern-subway-card.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-modern-subway-card.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-现代都市 / 奶茶
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003204', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-现代都市', '奶茶', '单杯珍珠奶茶道具，透明塑料杯，奶茶色饮品与冰块，底部大量黑糖珍珠，透明封口盖，粗吸管插入杯中，外层牛皮纸杯套，水珠细节，白色纯背景，居中展示，高清食物道具设定图，半写实清新插画风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003204'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003204'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '4845501b-ddf1-435a-81b5-ec713df65929', '51000000-0000-4000-8000-000000003204', latest.version_number + 1, 'official/props/prop-2d-modern-milk-tea.png', '/assets/library/official/props/prop-2d-modern-milk-tea.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"奶茶","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-modern-milk-tea.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-modern-milk-tea.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-现代都市 / 拍立得
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003206', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-现代都市', '拍立得', '单个粉色拍立得相机道具，圆角方形机身，粉色与奶白色半透明塑料外壳，大圆形镜头，左侧闪光灯和取景窗，顶部出片口，侧边挂着粉色编织手绳，整体可爱清新，白色纯背景，居中展示，高清产品道具设定图，二次元半写实风格，柔和高光，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003206'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003206'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'cad836a7-de27-43bf-8e7f-847a2b08ef0f', '51000000-0000-4000-8000-000000003206', latest.version_number + 1, 'official/props/prop-2d-modern-polaroid.png', '/assets/library/official/props/prop-2d-modern-polaroid.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"拍立得","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-modern-polaroid.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-modern-polaroid.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-现代都市 / 漫画书
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003203', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-现代都市', '漫画书', '一本现代日系漫画书道具，厚本单行本立体展示，封面绘有青春动漫角色，前景是黑发少年，后景是粉发少女，封面包含漫画分镜、蓝色背景和动感构图，书脊有装饰文字与图案，整体气质青春、热血、二次元收藏品感，白色纯背景，单本道具三分之四视角展示，高清游戏道具设定图，现代动漫周边概念设计，纸张、封面印刷、书脊厚度材质清晰，画面比例4:5，适合作为漫画书、收藏品、校园生活道具、游戏物品图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003203'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003203'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '48f83596-8532-4083-8f27-c227aa165d1d', '51000000-0000-4000-8000-000000003203', latest.version_number + 1, 'official/props/prop-2d-modern-comic.png', '/assets/library/official/props/prop-2d-modern-comic.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"漫画书","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-modern-comic.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-modern-comic.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-现代都市 / 社团徽章
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003207', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-现代都市', '社团徽章', '一枚学院或军团徽章道具，深蓝色盾牌底板，金色金属外框，中央是金色五角星、白金色羽翼、金色月桂枝和皇冠图案，下方有蓝色飘带装饰，整体造型立体厚重，带有荣耀、等级、组织身份象征感，白色纯背景，单个道具正面居中展示，高清游戏徽章设定图，半写实3D图标风格，金属、珐琅、浮雕材质清晰，画面比例4:5，适合作为学院徽章、军团标志、成就勋章、身份道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003207'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003207'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'ca1b1b46-2919-4a48-812c-3b292a082edc', '51000000-0000-4000-8000-000000003207', latest.version_number + 1, 'official/props/prop-2d-modern-club-badge.png', '/assets/library/official/props/prop-2d-modern-club-badge.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"社团徽章","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-modern-club-badge.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-modern-club-badge.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 2D漫-现代都市 / 耳机
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003202', 'official', NULL, NULL, NULL, 'prop', 'prop', '2D漫-现代都市', '耳机', '一副现代无线蓝牙耳机道具，浅紫白色高光塑料充电盒打开状态，盒内放置一对入耳式耳机，耳机柄带金色金属描边和蓝色指示灯，旁边配有同色系USB-C充电线，整体造型圆润精致、轻奢、数码产品感，白色纯背景，单个道具三分之四视角展示，高清产品渲染风格，半写实插画质感，塑料、金属、硅胶和数据线材质清晰，柔和棚拍光，画面比例4:5，适合作为现代数码耳机、生活道具、游戏物品图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003202'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003202'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'ef9b4cc1-7092-4196-807e-30e9ea839137', '51000000-0000-4000-8000-000000003202', latest.version_number + 1, 'official/props/prop-2d-modern-earphone.png', '/assets/library/official/props/prop-2d-modern-earphone.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"耳机","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-2d-modern-earphone.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-2d-modern-earphone.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-东方修仙 / 丹炉
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003103', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-东方修仙', '丹炉', '单个仙侠风青铜法器鼎道具，古代祭祀礼器造型，做旧青铜材质，圆形对称鼎身结构，精细云纹与回纹雕刻装饰，表面有细腻金属氧化与磨损质感，双侧对称弯曲提耳，三足兽首底座支撑，兽面雕刻威严精致，器身镶嵌多颗发光青绿色玉石宝珠，散发柔和灵光，顶部莲花宝珠形盖钮装饰，神秘东方仙侠法宝风格，单个道具居中展示，白色纯背景，柔和投影，高清道具设定图，半写实3D产品渲染风格，精致细节，PBR材质，电影级光照，UE/Octane渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003103'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003103'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6da4f847-e0c7-4369-895b-6db22a397b44', '51000000-0000-4000-8000-000000003103', latest.version_number + 1, 'official/props/prop-3d-xianxia-cauldron.png', '/assets/library/official/props/prop-3d-xianxia-cauldron.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"丹炉","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-xianxia-cauldron.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-xianxia-cauldron.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-东方修仙 / 乾坤袋
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003106', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-东方修仙', '乾坤袋', '单个古风锦囊钱袋道具，深蓝色皮革布料材质，圆鼓鼓束口袋造型，袋口褶皱自然，金色描边与云纹刺绣，正面大面积金色祥云海浪纹章，棕金色编织束绳缠绕收口，吊坠带青绿色玉珠和深蓝流苏，白色纯背景，居中展示，高清古风道具设定图，精致二次元半写实产品渲染风格，柔和阴影，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003106'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003106'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '34967981-9a99-46bf-8074-31f1f7094f6a', '51000000-0000-4000-8000-000000003106', latest.version_number + 1, 'official/props/prop-3d-xianxia-bag.png', '/assets/library/official/props/prop-3d-xianxia-bag.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"乾坤袋","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-xianxia-bag.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-xianxia-bag.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-东方修仙 / 仙草匣
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003108', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-东方修仙', '仙草匣', '单个古风宝箱道具，深棕色木质箱体打开状态，四角带复古铜质雕花包角与锁扣，箱内生长一朵蓝色发光莲花，花瓣晶莹半透明，周围有点点蓝色灵光，底部铺有苔藓和绿叶，正面悬挂青绿色玉石吊坠与流苏，白色纯背景，居中展示，高清古风奇幻游戏道具设定图，精致半写实渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003108'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003108'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'c1bbe360-5a6e-4fa1-8eff-03baa30ba391', '51000000-0000-4000-8000-000000003108', latest.version_number + 1, 'official/props/prop-3d-xianxia-herb-box.png', '/assets/library/official/props/prop-3d-xianxia-herb-box.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"仙草匣","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-xianxia-herb-box.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-xianxia-herb-box.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-东方修仙 / 法阵罗盘
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003105', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-东方修仙', '法阵罗盘', '一个东方幻想星盘罗盘道具，圆形金色金属盘面，内部多层同心圆刻度、星象符号、云纹雕刻和复杂指针结构，中心镶嵌发光蓝绿色宝石，四周分布多个发光节点与叶形玉石装饰，边框为华丽浮雕金属纹样，整体气质神秘、精密、占星、法阵仪器感，白色纯背景，单个道具正面居中展示，高清游戏道具设定图，东方幻想星盘法器概念设计，金属、玉石、宝石、发光符文材质清晰，画面比例4:5，适合作为星盘、罗盘、占卜仪、阵法核心、游戏法器图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003105'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003105'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '7b3d05a1-5234-40ef-84d0-b933a462cd07', '51000000-0000-4000-8000-000000003105', latest.version_number + 1, 'official/props/prop-3d-xianxia-compass.png', '/assets/library/official/props/prop-3d-xianxia-compass.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"法阵罗盘","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-xianxia-compass.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-xianxia-compass.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-东方修仙 / 灵兽铃
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003107', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-东方修仙', '灵兽铃', '一只东方古风铜铃法器道具，古铜色钟形铃身，表面雕刻云纹、回纹和青绿色玉石镶嵌装饰，顶部有威严瑞兽或狮首造型与圆环吊扣，侧边悬挂玉珠与圆形玉佩，底部垂下蓝灰色长流苏和金属铃芯，整体气质厚重、神秘、镇邪、宗门法器感，白色纯背景，单个道具倾斜展示，高清游戏道具设定图，东方幻想铃铛法器概念设计，古铜、玉石、绳结、流苏材质细腻，画面比例4:5，适合作为镇魂铃、法器挂饰、仙侠道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003107'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003107'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'e79237d4-d790-4a9c-8262-150f20e1bd7a', '51000000-0000-4000-8000-000000003107', latest.version_number + 1, 'official/props/prop-3d-xianxia-bell.png', '/assets/library/official/props/prop-3d-xianxia-bell.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"灵兽铃","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-xianxia-bell.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-xianxia-bell.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-东方修仙 / 灵石
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003102', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-东方修仙', '灵石', '一簇东方仙侠风格的蓝绿色灵晶矿石道具，中央高耸透明水晶柱，周围生长多根大小不一的晶体，晶体内部有星点微光和蓝绿色能量辉光，底部环绕金色云纹金属底座与圆形宝石装饰，整体气质纯净、神秘、灵力充沛、珍贵矿物感，白色纯背景，单个道具正面展示，高清游戏道具设定图，东方幻想水晶资源概念设计，水晶、金属、宝石材质通透细腻，发光效果柔和，画面比例4:5，适合作为灵晶、能量矿石、仙侠材料、游戏资源图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003102'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003102'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'b349272e-7a9f-4626-814f-3f530abb492f', '51000000-0000-4000-8000-000000003102', latest.version_number + 1, 'official/props/prop-3d-xianxia-spirit-stone.png', '/assets/library/official/props/prop-3d-xianxia-spirit-stone.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"灵石","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-xianxia-spirit-stone.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-xianxia-spirit-stone.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-东方修仙 / 玉简
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003104', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-东方修仙', '玉简', '一枚东方古风玉佩道具，长方形浅绿色玉石吊牌，圆角造型，玉面半透明并带天然纹理，正面浮雕竹子、竹叶和云纹边饰，顶部穿孔系有深绿色编绳，侧边垂挂玉珠串、中国结和绿色长流苏，整体气质清雅、文人、古典、珍贵饰物感，白色纯背景，单个道具倾斜竖向展示，高清游戏道具设定图，东方古风玉器概念设计，玉石、绳结、珠串和流苏材质细腻，画面比例4:5，适合作为玉佩、书签、信物、古风饰品道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003104'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003104'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '0663d8e4-973a-45a9-802c-65bba6f9b686', '51000000-0000-4000-8000-000000003104', latest.version_number + 1, 'official/props/prop-3d-xianxia-jade-slip.png', '/assets/library/official/props/prop-3d-xianxia-jade-slip.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"玉简","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-xianxia-jade-slip.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-xianxia-jade-slip.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-东方修仙 / 飞剑
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003101', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-东方修仙', '飞剑', '一把东方仙侠风格的冰蓝长剑道具，透明水晶质感剑刃，剑身带有浅蓝色灵力纹路和金色细线装饰，华丽金属护手呈对称云纹与尖角造型，镶嵌多颗蓝色宝石，深蓝色缠绕剑柄，柄首有圆形蓝宝石与浅蓝流苏挂坠，整体气质清冷、精致、神圣、仙门法器感，白色纯背景，单个道具居中展示，轻微倾斜构图，高清游戏道具设定图，东方幻想武器概念设计，细节丰富，金属、水晶、宝石材质清晰，柔和棚拍光，画面比例4:5，适合作为仙侠武器、角色佩剑、游戏装备图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003101'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003101'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '8afd7914-3f6c-4971-8d22-09f92f4287fe', '51000000-0000-4000-8000-000000003101', latest.version_number + 1, 'official/props/prop-3d-xianxia-flying-sword.png', '/assets/library/official/props/prop-3d-xianxia-flying-sword.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"飞剑","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-xianxia-flying-sword.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-xianxia-flying-sword.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-现代都市 / 全息终端
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003001', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-现代都市', '全息终端', '单个未来科技全息显示器道具，银灰色金属底座，蓝色发光灯带，底座上方悬浮半透明蓝色全息屏幕，屏幕为圆角矩形，显示雷达扫描界面、圆形目标定位图、数据面板和科幻UI符号，整体散发淡蓝色能量光晕，白色纯背景，居中展示，高清科幻道具设定图，干净二次元半写实产品渲染风格，柔和阴影，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003001'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003001'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'f0e61972-406d-43a0-89cf-1040a5a132cc', '51000000-0000-4000-8000-000000003001', latest.version_number + 1, 'official/props/prop-3d-modern-holo.png', '/assets/library/official/props/prop-3d-modern-holo.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"全息终端","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-modern-holo.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-modern-holo.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-现代都市 / 悬浮滑板
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003005', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-现代都市', '悬浮滑板', '单个未来悬浮滑板道具，银白色流线型双轮平衡车结构，黑色防滑脚踏板，车轮带蓝紫色发光环，机身带紫色与蓝色LED灯带，科技感强，金属与橡胶材质清晰，白色纯背景，居中展示，高清科幻载具道具设定图，产品级渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003005'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003005'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '85632491-9b6e-418f-80f4-2c8798f24fce', '51000000-0000-4000-8000-000000003005', latest.version_number + 1, 'official/props/prop-3d-modern-hoverboard.png', '/assets/library/official/props/prop-3d-modern-hoverboard.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"悬浮滑板","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-modern-hoverboard.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-modern-hoverboard.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-现代都市 / 数据芯片
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003003', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-现代都市', '数据芯片', '单个未来能量芯片道具，方形厚重机械模块，黑色与银色金属装甲外壳，中央嵌入蓝色发光核心，四角螺栓结构，边缘排列金色电路触点和蓝色灯条，精密电子元件质感，白色纯背景，居中展示，高清科幻游戏道具设定图，产品级3D渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003003'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003003'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '8cfdcd69-a073-4e04-8afb-b08242594477', '51000000-0000-4000-8000-000000003003', latest.version_number + 1, 'official/props/prop-3d-modern-chip.png', '/assets/library/official/props/prop-3d-modern-chip.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"数据芯片","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-modern-chip.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-modern-chip.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-现代都市 / 智能手环
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003002', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-现代都市', '智能手环', '单个未来智能健康手环道具，黑色运动腕带，弧面高亮屏幕，屏幕显示蓝色爱心图标与心电波形，机身带银色金属边框和蓝色发光灯带，侧面有科技按键与传感器细节，白色纯背景，居中展示，高清科技产品道具设定图，半写实游戏图标风格，精致干净，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003002'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003002'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '2351c20f-07d7-4dc7-8279-e1728265c0a7', '51000000-0000-4000-8000-000000003002', latest.version_number + 1, 'official/props/prop-3d-modern-band.png', '/assets/library/official/props/prop-3d-modern-band.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"智能手环","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-modern-band.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-modern-band.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-现代都市 / 机械钥匙
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003006', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-现代都市', '机械钥匙', '单个未来科技钥匙道具，银灰色机械金属外壳，圆形钥匙头内嵌橙色发光能量核心，分段式装甲结构，细长钥匙柄带橙色能量灯槽，顶部带金属挂环，造型硬朗精密，白色纯背景，居中展示，高清科幻道具设定图，产品级渲染质感，金属反光清晰，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003006'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003006'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'bbfa094f-58e8-40d9-855f-b8102d5c9fb3', '51000000-0000-4000-8000-000000003006', latest.version_number + 1, 'official/props/prop-3d-modern-mech-key.png', '/assets/library/official/props/prop-3d-modern-mech-key.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"机械钥匙","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-modern-mech-key.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-modern-mech-key.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-现代都市 / 电子耳麦
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003004', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-现代都市', '电子耳麦', '一副未来电竞耳机道具，黑银色机械结构头戴式耳机，厚实黑色耳罩和可调节头梁，耳罩外侧有六边形装甲面板与蓝色发光灯带，局部带紫色和橙色小灯点缀，前方伸出麦克风杆，麦克风端部发出蓝光，整体造型科技、酷炫、游戏装备感，白色纯背景，单个道具三分之四视角展示，高清游戏道具设定图，未来科技产品概念设计，金属、塑料、皮革、发光LED材质清晰，画面比例4:5，适合作为电竞耳机、通讯装备、科幻道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003004'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003004'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '27f0ffda-7354-4cf0-8fed-024624d6421a', '51000000-0000-4000-8000-000000003004', latest.version_number + 1, 'official/props/prop-3d-modern-headset.png', '/assets/library/official/props/prop-3d-modern-headset.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"电子耳麦","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-modern-headset.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-modern-headset.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-现代都市 / 能量饮料
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003007', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-现代都市', '能量饮料', '一个未来科幻风格的蓝色能量电池道具，透明圆柱形容器内部充满发光蓝色能量液体和气泡，中央有醒目的白蓝色闪电符号，顶部和底部为银黑色金属机械结构，带有蓝色发光指示灯、环形接口和模块化装甲边框，整体气质科技、能源、便携补给感，白色纯背景，单个道具正面居中展示，高清游戏道具设定图，未来科技能量核心概念设计，玻璃、液体、金属、LED发光材质清晰，画面比例4:5，适合作为能量电池、科幻补给品、游戏物品图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003007'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003007'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6abab563-3bb2-419d-8584-ddca7c8788fa', '51000000-0000-4000-8000-000000003007', latest.version_number + 1, 'official/props/prop-3d-modern-energy.png', '/assets/library/official/props/prop-3d-modern-energy.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"能量饮料","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-modern-energy.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-modern-energy.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 3D漫-现代都市 / 追踪器
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000003008', 'official', NULL, NULL, NULL, 'prop', 'prop', '3D漫-现代都市', '追踪器', '一个未来科幻风格的圆环悬浮装置道具，白色与黑色分段外壳组成开口环形结构，中央悬浮圆形能量核心，核心散发蓝色发光圆环，外壳带有橙色小型指示灯、机械接口、模块化装甲片和精密缝隙，整体气质科技、轻量、智能设备感，白色纯背景，单个道具三分之四视角展示，高清游戏道具设定图，未来科技装备概念设计，金属、塑料、发光能量材质清晰，画面比例4:5，适合作为科幻随身装置、能量控制器、游戏道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003008'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000003008'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'a5d94213-8ea1-440d-8741-3135e6f66876', '51000000-0000-4000-8000-000000003008', latest.version_number + 1, 'official/props/prop-3d-modern-tracker.png', '/assets/library/official/props/prop-3d-modern-tracker.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"追踪器","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-3d-modern-tracker.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-3d-modern-tracker.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-东方古代 / 令牌
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000903', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-东方古代', '令牌', '深褐色古风令牌道具，竖向长条牌形，顶部圆弧花瓣轮廓，表面精细浮雕雕刻，树木枝叶纹、山石纹、古典纹样装饰，木纹清晰，做旧包浆质感，边缘深色磨损，右侧穿孔系棕色编织挂绳，搭配暗红色圆珠与长款深棕流苏，单个道具居中展示，白色纯背景，柔和投影，高清道具设定图，古风奇幻道具，二次元半写实产品渲染风格，精致细节，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000903'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000903'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '3efa4e67-3df1-45b3-8e28-e3a96884f868', '51000000-0000-4000-8000-000000000903', latest.version_number + 1, 'official/props/prop-ancient-token.png', '/assets/library/official/props/prop-ancient-token.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"令牌","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-ancient-token.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-ancient-token.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-东方古代 / 刀剑
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000901', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-东方古代', '刀剑', '一组三件古风刀剑道具，两把出鞘长刀与一只黑色刀鞘并排展示，银色弯刃，黑色缠绳刀柄，金色雕花护手与端头，刀鞘带金色纹饰和挂件，武侠兵器风格，白色纯背景，居中展示，高清古风游戏武器设定图，半写实精致渲染，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000901'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000901'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '0360b5bc-d237-455f-8d3a-350deff76077', '51000000-0000-4000-8000-000000000901', latest.version_number + 1, 'official/props/prop-ancient-sword.png', '/assets/library/official/props/prop-ancient-sword.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"刀剑","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-ancient-sword.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-ancient-sword.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-东方古代 / 印玺
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000908', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-东方古代', '印玺', '单个玉石印章道具，方形青灰玉石印台，上方雕刻瑞兽狮子印钮，玉质温润半透明，边缘有天然纹理，侧边悬挂金棕色长流苏，古典收藏品风格，白色纯背景，居中展示，高清古风道具设定图，写实材质渲染，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000908'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000908'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '4b2cdda0-cb0e-42a6-83e2-fd1b14f2adb1', '51000000-0000-4000-8000-000000000908', latest.version_number + 1, 'official/props/prop-ancient-seal.png', '/assets/library/official/props/prop-ancient-seal.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"印玺","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-ancient-seal.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-ancient-seal.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-东方古代 / 圣旨
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000904', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-东方古代', '圣旨', '单个古风卷轴道具，金黄色卷轴收拢状态，圆柱卷轴杆，表面绘有龙纹、山水与云纹装饰，棕色绳结捆绑，悬挂棕色流苏，金属端头雕花，白色纯背景，居中展示，高清古风游戏道具设定图，精致半写实风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000904'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000904'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'ceb0691e-458e-436a-8923-8af4b85a0eeb', '51000000-0000-4000-8000-000000000904', latest.version_number + 1, 'official/props/prop-ancient-edict.png', '/assets/library/official/props/prop-ancient-edict.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"圣旨","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-ancient-edict.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-ancient-edict.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-东方古代 / 毒药
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000906', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-东方古代', '毒药', '单个复古炼金药剂瓶道具，透明旧玻璃瓶身，圆球瓶塞，瓶内装有深紫色神秘液体，玻璃表面带细微污渍、气泡和岁月痕迹，瓶颈缠绕粗麻绳，悬挂铜色中国结吊坠与小流苏，轻微反光，底部柔和投影，白色纯背景，居中展示，高清游戏道具设定图，写实与二次元结合的精致道具概念设计，材质细节清晰，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000906'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000906'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '45259f95-24b0-40b3-83f2-40697b031342', '51000000-0000-4000-8000-000000000906', latest.version_number + 1, 'official/props/prop-ancient-poison.png', '/assets/library/official/props/prop-ancient-poison.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"毒药","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-ancient-poison.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-ancient-poison.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-东方古代 / 玉佩
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000907', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-东方古代', '玉佩', '一枚东方古风圆形玉佩挂饰道具，浅白绿色圆形玉璧，中间有圆孔，正面雕刻繁复瑞兽与云纹浮雕，顶部系黑色编绳、白玉珠和金色小珠，底部垂挂黑色珠串与长流苏，整体气质古雅、神秘、护身符、贵族信物感，白色纯背景，单个道具正面居中展示，高清游戏道具设定图，东方古风玉器概念设计，玉石、编绳、珠串、流苏材质细腻，画面比例4:5，适合作为玉佩、护符、身份信物、古风饰品图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000907'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000907'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6e015740-f63f-4380-83c6-f27f7e5b39f4', '51000000-0000-4000-8000-000000000907', latest.version_number + 1, 'official/props/prop-ancient-jade.png', '/assets/library/official/props/prop-ancient-jade.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"玉佩","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-ancient-jade.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-ancient-jade.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-东方古代 / 秘密信息
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000905', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-东方古代', '秘密信息', '一封复古羊皮信封道具，竖向长方形牛皮纸信封，纸面泛黄、有旧纸纹理、污渍和折痕，信封用麻绳横向缠绕固定，中央盖有棕红色火漆封印，火漆上有花纹徽记，整体气质神秘、古旧、机密信件感，白色纯背景，单个道具正面居中展示，高清游戏道具设定图，复古信件概念设计，羊皮纸、麻绳、火漆材质清晰，柔和阴影，画面比例4:5，适合作为密信、任务道具、剧情物品图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000905'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000905'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '7ac5c6ed-7fab-41da-868e-ac902f9e7035', '51000000-0000-4000-8000-000000000905', latest.version_number + 1, 'official/props/prop-ancient-secret-letter.png', '/assets/library/official/props/prop-ancient-secret-letter.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"秘密信息","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-ancient-secret-letter.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-ancient-secret-letter.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-东方古代 / 酒壶
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000902', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-东方古代', '酒壶', '一只古典东方风格的华丽茶壶或酒壶道具，圆润白瓷壶身，表面绘制青绿色山水云纹与金色描边，壶嘴修长优雅，壶盖和壶口为古铜金属材质，带有浮雕花纹、回纹边饰和复古包边，弯曲手柄造型精致，整体气质古雅、贵气、宫廷器物感，白色纯背景，单个道具正面居中展示，高清游戏道具设定图，东方古风器物概念设计，陶瓷、金属、釉面材质清晰，画面比例4:5，适合作为古代茶具、宫廷酒壶、道具图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000902'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000902'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'e7b1ade7-651b-43d1-82ac-9525aabbf048', '51000000-0000-4000-8000-000000000902', latest.version_number + 1, 'official/props/prop-ancient-wine.png', '/assets/library/official/props/prop-ancient-wine.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"酒壶","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-ancient-wine.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-ancient-wine.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-现代都市 / 公文包
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000303', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-现代都市', '公文包', '单个复古商务公文包道具，深棕色皮革材质，矩形硬挺包身，翻盖式结构，圆弧提手，正面金属锁扣，边缘缝线清晰，侧面带金属挂环，皮革压纹与细微磨损质感，低调稳重的商务风格，单个道具居中展示，白色纯背景，柔和投影，高清道具设定图，半写实产品渲染风格，精致细节，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000303'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000303'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'df5526b3-351e-47dd-8483-e2796062fd27', '51000000-0000-4000-8000-000000000303', latest.version_number + 1, 'official/props/prop-modern-briefcase.png', '/assets/library/official/props/prop-modern-briefcase.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"公文包","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-modern-briefcase.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-modern-briefcase.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-现代都市 / 医疗箱
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000305', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-现代都市', '医疗箱', '单个白色急救箱道具，圆角硬壳箱体，顶部提手，正面红色十字标志，黑色侧边铰链与卡扣，小型底脚，干净医疗用品风格，白色纯背景，居中展示，高清道具设定图，写实产品渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000305'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000305'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6f1b0562-5c9d-461c-89d5-f62912d9efbb', '51000000-0000-4000-8000-000000000305', latest.version_number + 1, 'official/props/prop-modern-medkit.png', '/assets/library/official/props/prop-modern-medkit.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"医疗箱","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-modern-medkit.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-modern-medkit.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-现代都市 / 工作证
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000301', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-现代都市', '工作证', '单个工作证挂绳道具，深蓝色织物挂带，银色金属夹扣，透明证件卡套，顶部蓝色横条，卡片中央有灰色头像占位图标，简洁办公用品风格，白色纯背景，居中展示，高清道具设定图，干净产品渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000301'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000301'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '1a28d2ca-6cb6-424d-8480-96c3aa6efa58', '51000000-0000-4000-8000-000000000301', latest.version_number + 1, 'official/props/prop-modern-badge.png', '/assets/library/official/props/prop-modern-badge.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"工作证","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-modern-badge.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-modern-badge.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-现代都市 / 录音笔
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000304', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-现代都市', '录音笔', '单个黑色录音笔道具，长条圆角机身，小型灰色显示屏，正面圆形方向控制键与红色录音按钮，下方密集扬声器孔，侧边功能按键，黑色磨砂塑料材质，白色纯背景，居中展示，高清数码产品道具设定图，写实产品渲染风格，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000304'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000304'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'd13d2830-c84e-459d-8107-9cce92cdfd16', '51000000-0000-4000-8000-000000000304', latest.version_number + 1, 'official/props/prop-modern-recorder.png', '/assets/library/official/props/prop-modern-recorder.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"录音笔","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-modern-recorder.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-modern-recorder.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-现代都市 / 手机
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000302', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-现代都市', '手机', '单个现代智能手机道具，竖直轻微侧角展示，黑色全面屏，顶部胶囊形摄像头开孔，屏幕显示深灰色极简波纹壁纸，银色金属边框，机身纤薄，白色纯背景，居中展示，高清数码产品道具设定图，写实产品渲染风格，干净高级，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000302'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000302'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6532454c-9280-4984-8281-1e836d266680', '51000000-0000-4000-8000-000000000302', latest.version_number + 1, 'official/props/prop-modern-phone.png', '/assets/library/official/props/prop-modern-phone.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"手机","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-modern-phone.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-modern-phone.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-现代都市 / 文件袋
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000308', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-现代都市', '文件袋', '单个黑色文件袋道具，方形硬质手提文件包，黑色磨砂皮革纹理，翻盖结构，正面双圆扣绕线封口，顶部小提手，简洁商务风格，边缘厚实，白色纯背景，居中展示，高清道具设定图，写实产品渲染质感，柔和阴影，画面比例4:5', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000308'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000308'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '0fe615c1-795e-4efb-80ca-83a43737ebe3', '51000000-0000-4000-8000-000000000308', latest.version_number + 1, 'official/props/prop-modern-document-bag.png', '/assets/library/official/props/prop-modern-document-bag.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"文件袋","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-modern-document-bag.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-modern-document-bag.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-现代都市 / 相机
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000307', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-现代都市', '相机', '一台黑色专业微单相机道具，机身为黑色磨砂金属与皮革纹理材质，正面安装大口径变焦镜头，镜头玻璃有真实反光和多层镀膜，顶部有取景器热靴、多个旋钮、快门和按键，机身侧面有金属挂环，整体造型专业、现代、摄影器材感，白色纯背景，单个道具三分之四视角展示，高清写实产品渲染风格，镜头、金属、橡胶、皮革材质细节清晰，柔和棚拍光，画面比例4:5，适合作为相机、摄影道具、现代生活物品图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000307'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000307'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '050867c1-70fe-4809-8575-ea3ff7ac6d4c', '51000000-0000-4000-8000-000000000307', latest.version_number + 1, 'official/props/prop-modern-camera.png', '/assets/library/official/props/prop-modern-camera.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"相机","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-modern-camera.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-modern-camera.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- prop / 国内仿真人-现代都市 / 车钥匙
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000306', 'official', NULL, NULL, NULL, 'prop', 'prop', '国内仿真人-现代都市', '车钥匙', '一个现代汽车车钥匙，黑色磨砂塑料主体，银色金属边框包裹侧面，正面有三个橡胶按键，分别带锁车、解锁、后备箱图标，顶部有圆形按键与小指示灯，底部有金属钥匙扣孔，造型简洁实用、现代工业产品感，白色纯背景，单个道具正面居中展示，高清产品渲染风格，写实3D道具设定图，塑料、橡胶、镀铬金属材质清晰，柔和阴影，画面比例4:5，适合作为现代车钥匙、生活道具、游戏物品图标', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000306'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000306'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'c28c36c1-7128-4f1f-8c85-be5cfd52b6e1', '51000000-0000-4000-8000-000000000306', latest.version_number + 1, 'official/props/prop-modern-car-key.png', '/assets/library/official/props/prop-modern-car-key.png', 'image/png', 960, 720, '{"source":"official_seed_imagegen","display":{"title":"车钥匙","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/props/prop-modern-car-key.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/props/prop-modern-car-key.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-东方修仙 / 仙门书阁
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000808', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-东方修仙', '仙门书阁', '宏伟古典的中式藏书阁内景，两层木结构书楼，高耸书架堆满古籍、卷轴和文房器物，中央有书案、卷轴、毛笔、香炉和摆件，两侧楼梯与回廊连接二层，蓝金长幡和宫灯垂挂，右侧格栅窗透入金色阳光，形成体积光和尘埃光束，氛围庄严、博学、古代书院感，东方幻想写实场景概念图，横版广角构图，画面比例16:9，适合作为藏书阁、书院大殿、仙门典籍库背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000808'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000808'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '3285709e-4a52-457c-8de9-a9e2983c21e1', '51000000-0000-4000-8000-000000000808', latest.version_number + 1, 'official/scenes/scene-2d-sect-library.png', '/assets/library/official/scenes/scene-2d-sect-library.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"仙门书阁","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-sect-library.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-sect-library.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-东方修仙 / 剑阵山门
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000802', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-东方修仙', '剑阵山门', '宏大的东方仙侠云海圣地场景，云雾之上矗立巨型蓝金牌坊与通天石阶，四周漂浮仙山、悬空平台、亭台楼阁和高耸剑形法器，蓝色灵光从法阵与剑阵中升起，长幡随风垂落，白色云海环绕群峰，天空晴朗明亮，氛围神圣、壮观、宗门禁地感，电影级东方幻想游戏场景概念图，横版超广角构图，画面比例16:9，适合作为仙侠宗门入口、天界广场、游戏主场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000802'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000802'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'e4a38720-20c9-4fa0-880a-53b6a52821b7', '51000000-0000-4000-8000-000000000802', latest.version_number + 1, 'official/scenes/scene-2d-sword.png', '/assets/library/official/scenes/scene-2d-sword.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"剑阵山门","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-sword.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-sword.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-东方修仙 / 山谷药庐
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000805', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-东方修仙', '山谷药庐', '清新自然的东方山谷草药铺场景，山林溪谷中坐落一间古朴木质茅草屋，屋檐长满青苔与藤蔓，屋内摆满药罐、草药瓶、木架和生活器具，屋外有石板小径、木桌、陶罐、石臼、竹篮、晾晒架和成束悬挂的草药花束，周围生长大量野花、药草、藤蔓和绿色植被，右侧溪流穿过画面并形成小瀑布，远处有木桥、亭子、雾气、奇峰山崖和多道瀑布，阳光穿过树叶洒在草地与水面上，氛围宁静、治愈、仙侠山居、隐世药庐感，广角横版构图，空间层次丰富，电影级东方幻想场景概念图，写实动漫融合风格，高精度数字绘画，植物、木材、石头和流水细节丰富，色彩清透明亮，画面比例16:9，适合作为山谷药铺、隐士居所、草药采集点、古风游戏场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000805'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000805'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'ee3ee228-fb29-474f-894d-4be2abf6e19e', '51000000-0000-4000-8000-000000000805', latest.version_number + 1, 'official/scenes/scene-2d-herb-hut.png', '/assets/library/official/scenes/scene-2d-herb-hut.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"山谷药庐","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-herb-hut.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-herb-hut.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-东方修仙 / 星河崖畔
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000804', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-东方修仙', '星河崖畔', '壮阔梦幻的东方仙侠星空观景台场景，悬崖之巅建有巨大的圆形石质法阵平台，平台中央是发光的蓝色星辰祭坛，地面刻满环形星象纹路和古老符文，周围分布古风石灯笼、旗幡、牌坊、松树和栏杆，悬崖边有细小瀑布流入云海，远处是无边云海、奇峰山峦、漂浮仙山与隐约亭台，天空为深蓝夜色，璀璨银河横跨整片天空，繁星密布，明月悬挂右侧，偶有流星划过，整体氛围宁静、神圣、浪漫、星辰修炼感，超广角横版构图，开阔远景与强空间纵深，电影级东方幻想场景概念图，高精度数字绘画，写实3D渲染风格，蓝色月光、星辉和灯笼暖光交织，云海与石材反射细腻，画面比例16:9，适合作为仙侠观星台、星辰祭坛、宗门禁地、游戏场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000804'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000804'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'f462dae6-92f5-49f3-8246-1d5bfa73c682', '51000000-0000-4000-8000-000000000804', latest.version_number + 1, 'official/scenes/scene-2d-starry.png', '/assets/library/official/scenes/scene-2d-starry.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"星河崖畔","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-starry.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-starry.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-东方修仙 / 月下古桥
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000807', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-东方修仙', '月下古桥', '梦幻唯美的东方古风夜景园林场景，满月高悬在深蓝星空中，月光洒落在山水庭院与湖面上，中央是一座拱形石桥跨过宁静湖水，桥身与灯笼倒映在水面形成完美圆形倒影，右侧有精致中式楼阁与回廊，窗内透出温暖灯光，四周垂柳环绕，柳枝从画面上方自然垂下，湖面漂浮荷叶与莲花，岸边布置石灯笼、假山、花草和庭院小径，远处是云雾缭绕的奇峰山脉、亭台楼阁与点点灯火，整体氛围浪漫、安静、仙侠、诗意、夜游园林感，广角横版构图，强纵深与对称倒影，电影级东方幻想场景概念图，高精度数字绘画，写实动漫融合风格，蓝色月光与暖色灯火对比鲜明，水面反射细腻，细节丰富，画面比例16:9，适合作为古风园林夜景、仙侠湖畔、浪漫剧情场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000807'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000807'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'be935b7a-624d-4d34-824d-23473ec62c1c', '51000000-0000-4000-8000-000000000807', latest.version_number + 1, 'official/scenes/scene-2d-moon-bridge.png', '/assets/library/official/scenes/scene-2d-moon-bridge.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"月下古桥","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-moon-bridge.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-moon-bridge.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-东方修仙 / 灵兽庭院
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000806', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-东方修仙', '灵兽庭院', '明亮宏大的东方仙侠门派庭院场景，古风木质建筑与灰瓦飞檐环绕广场，中央远处是一座高台亭阁，亭中悬立发光的蓝色圆形法阵与龙纹符文，左右悬挂蓝金色长幡、铃铛、吊灯和装饰流苏，前景有圆形灵池与雕刻阵盘，池水清澈并泛着蓝色灵光，庭院地面铺设精致石砖和金色纹路，周围布置石灯笼、木栏杆、符文石碑、灵力宝箱、花草植被与巨大古树，远景是云雾缭绕的奇峰山脉和古塔建筑，整体氛围神圣、清新、仙气、门派修行感，白天自然阳光，树影斑驳，空气通透，广角横版构图，强纵深透视，电影级东方幻想游戏场景概念图，写实3D渲染风格，高精度数字绘画，建筑雕刻和魔法符文细节丰富，画面比例16:9，适合作为仙侠宗门广场、修炼庭院、门派据点、游戏场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000806'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000806'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '1de2d8da-58b4-4e71-850b-0cf57dca7c84', '51000000-0000-4000-8000-000000000806', latest.version_number + 1, 'official/scenes/scene-2d-spirit-yard.png', '/assets/library/official/scenes/scene-2d-spirit-yard.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"灵兽庭院","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-spirit-yard.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-spirit-yard.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-东方修仙 / 竹林秘境
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000803', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-东方修仙', '竹林秘境', '幽静的东方竹林秘境场景，密集高耸的青绿色竹林环绕画面，中央是一条长满青苔的古老石板小径和石阶，通向远处的中式牌坊与小亭，左右分布古风石灯笼，灯笼散发温暖微光，右侧有清澈溪流与小瀑布，湿润岩石、苔藓、蕨类和低矮灌木细节丰富，竹叶间洒下斑驳阳光，清晨薄雾、体积光、空气透视，氛围安静、神秘、清新、禅意，构图为低机位广角透视，石径形成纵深引导线，电影级东方幻想场景概念图，高精度数字绘画，写实游戏场景渲染，细节精致，光影层次丰富，横版宽幅画面，画面比例16:9，适合作为古风仙侠竹林入口、秘境山道、游戏场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000803'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000803'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '7530ec70-83a8-4f49-8db9-8ad5e2b25d4b', '51000000-0000-4000-8000-000000000803', latest.version_number + 1, 'official/scenes/scene-2d-bamboo.png', '/assets/library/official/scenes/scene-2d-bamboo.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"竹林秘境","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-bamboo.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-bamboo.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-东方修仙 / 莲池仙境
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000801', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-东方修仙', '莲池仙境', '一处唯美东方古风园林湖景场景，仙侠山水庭院，清晨或晴朗白天的柔和自然光，前景大片荷塘铺满绿色荷叶和粉白色荷花，水面清澈平静并倒映天空、石桥和亭台，中央是一座古典拱形石桥横跨湖面，桥身带石雕栏杆和青苔藤蔓，右侧有飞檐翘角的中式亭阁与石栏庭台，左侧有小亭、樱花树和垂柳，粉色花瓣随风飘落，远处是云雾缭绕的奇峰山峦、瀑布、松树和层层亭台楼阁，天空湛蓝，白云蓬松，空气清透带淡淡雾气，整体氛围宁静、清新、浪漫、仙气飘逸，高质量东方玄幻游戏场景概念图，中国古典园林背景设计，电影级写实 3D 渲染风，超高细节，水面、石材、木质亭阁、荷叶、花瓣、山峰和云雾材质清晰，柔和阳光，体积光，真实反射，广角镜头，中心纵深构图，横版宽幅画面，画面比例 16:9，适合游戏场景背景或仙侠园林概念图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000801'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000801'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '90becc0d-235e-4a77-8fb3-8eaa5a9c0df3', '51000000-0000-4000-8000-000000000801', latest.version_number + 1, 'official/scenes/scene-2d-lotus.png', '/assets/library/official/scenes/scene-2d-lotus.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"莲池仙境","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-lotus.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-lotus.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-现代都市 / 便利店
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000707', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-现代都市', '便利店', '夜晚街角便利店外景，玻璃门店面透出明亮暖光，店内货架、冷柜、收银机和自助设备清晰可见，门口有垃圾桶、自动售货机、盆栽和街灯，地面雨后湿润反射灯光，周围是安静住宅街与树木阴影，氛围温暖、孤独、都市夜晚日常感，现代日系动漫场景风格，横版广角构图，画面比例16:9，适合作为便利店夜景、都市街角、日常剧情背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000707'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000707'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '78db0184-7f08-409f-890c-9496bbb6c212', '51000000-0000-4000-8000-000000000707', latest.version_number + 1, 'official/scenes/scene-2d-store.png', '/assets/library/official/scenes/scene-2d-store.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"便利店","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-store.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-store.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-现代都市 / 地铁站
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000705', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-现代都市', '地铁站', '现代地铁站台室内场景，银蓝色地铁列车停靠在左侧，玻璃屏蔽门整齐排列，站台地面为高反射灰色石材，黄色盲道与候车标识清晰，中央有楼梯和扶梯通往上层，顶部线性灯光明亮，柱体、导视牌、座椅和线路图细节完整，写实动漫融合风格，横版广角构图，画面比例16:9，适合作为地铁站、通勤场景、现代城市交通背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000705'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000705'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'f71bf9b1-0b2d-4823-8c84-fe5899bd8b12', '51000000-0000-4000-8000-000000000705', latest.version_number + 1, 'official/scenes/scene-2d-subway.png', '/assets/library/official/scenes/scene-2d-subway.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"地铁站","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-subway.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-subway.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-现代都市 / 城市天桥
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000708', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-现代都市', '城市天桥', '黄昏都市高架步道场景，宽阔人行天桥沿城市道路弯曲延伸，两侧高楼林立，玻璃幕墙反射橙紫色夕阳，路灯逐渐亮起，下方车流穿行，天空布满晚霞云彩，地面有雨后反光效果，氛围浪漫、都市、青春、通勤感，现代日系动漫场景风格，广角横版构图，画面比例16:9，适合作为城市黄昏、天桥道路、都市剧情背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000708'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000708'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '68d81087-b93c-489f-8b3f-62ac202f440e', '51000000-0000-4000-8000-000000000708', latest.version_number + 1, 'official/scenes/scene-2d-city-bridge.png', '/assets/library/official/scenes/scene-2d-city-bridge.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"城市天桥","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-city-bridge.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-city-bridge.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-现代都市 / 天台夜景
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000704', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-现代都市', '天台夜景', '夜晚城市天台场景，空旷屋顶平台铺满雨后湿润地砖，左侧有设备间、水箱、管道和亮着灯的门窗，四周金属护栏与防护网包围，远处城市高楼灯火闪烁，深蓝星空与紫色晚霞交织，地面积水反射夜景灯光，现代日系动漫场景风格，横版广角构图，画面比例16:9，适合作为都市天台、夜景告白、青春剧情背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000704'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000704'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'c5108c8b-1dba-4d37-8fe1-f30f047532be', '51000000-0000-4000-8000-000000000704', latest.version_number + 1, 'official/scenes/scene-2d-rooftop.png', '/assets/library/official/scenes/scene-2d-rooftop.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"天台夜景","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-rooftop.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-rooftop.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-现代都市 / 校园操场
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000706', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-现代都市', '校园操场', '明亮清新的校园操场场景，现代学校教学楼围绕运动场，中央是大片绿色人工草坪足球场，白色球门立在前景右侧，周围环绕红色塑胶跑道和清晰的白色跑道线，远处还有小球门、看台雨棚、校园绿化带和整齐树木，教学楼为红砖与白色现代建筑组合，玻璃窗反射阳光，天空湛蓝开阔，巨大白色积云层次丰富，夏日正午阳光充足，树影洒在跑道上，氛围青春、干净、安静、校园日常感，超广角横版构图，空间开阔，现代日系动漫场景风格，高精度数字绘画，色彩明亮通透，光影清晰，画面比例16:9，适合作为校园操场、青春校园剧情、运动会、足球场背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000706'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000706'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'dcf9a696-35ff-47a5-8ab2-7ff5fa1dd71a', '51000000-0000-4000-8000-000000000706', latest.version_number + 1, 'official/scenes/scene-2d-campus-playground.png', '/assets/library/official/scenes/scene-2d-campus-playground.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"校园操场","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-campus-playground.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-campus-playground.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-现代都市 / 漫画公寓
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000701', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-现代都市', '漫画公寓', '温馨明亮的现代城市公寓客厅场景，宽敞整洁的日式现代家居空间，浅色布艺长沙发、木质茶几、电视柜、餐桌、书架、壁挂收纳柜和开放式置物架布置自然，室内摆放大量绿植、盆栽、书籍、文件夹、相框和生活小物，右侧是电视与音响设备，中央落地窗通向阳台，阳台上有盆栽和休闲椅，窗外可见晴朗蓝天、白云和城市高楼景观，午后阳光从落地窗洒入室内，在木地板和沙发上形成温暖光斑与长阴影，氛围舒适、治愈、生活化、安静，广角横版构图，室内空间纵深清晰，现代写实动漫场景风格，高精度数字绘画，细节丰富，光影柔和真实，画面比例16:9，适合作为都市生活客厅、公寓室内、日常剧情场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000701'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000701'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '3e9a4e63-351d-4909-86fd-e9c1fa394adb', '51000000-0000-4000-8000-000000000701', latest.version_number + 1, 'official/scenes/scene-2d-apartment.png', '/assets/library/official/scenes/scene-2d-apartment.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"漫画公寓","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-apartment.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-apartment.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-现代都市 / 街角咖啡店
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000702', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-现代都市', '街角咖啡店', '一间温馨清新的街角咖啡馆外景，现代欧式城市街区场景，阳光明媚的上午或午后，转角建筑一层是黑色木质框架咖啡店，米白色遮阳棚覆盖店面，大面积玻璃窗透出室内暖光、吧台、吊灯、木质桌椅和咖啡器具，店门为复古木门，门口摆放大量绿植盆栽、花盆、藤蔓和粉色花朵，窗外有两张藤编椅和小圆桌，楼上阳台布满植物和花草，左侧街道延伸到远处，路边有大树、路灯、人行道、斑马线和安静的居民楼，树叶投下斑驳光影，整体氛围悠闲、治愈、文艺、安静舒适，高质量日系动画背景美术，现代城市咖啡馆场景设计，清新生活感插画风，细节丰富，柔和自然光，温暖色调，真实透视，街角构图，广角镜头，画面干净明亮，横版宽幅画面，画面比例 16:9，适合游戏场景背景或日常漫画背景', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000702'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000702'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'a4c1ecb3-33a5-4f9c-8329-e35f4fd33353', '51000000-0000-4000-8000-000000000702', latest.version_number + 1, 'official/scenes/scene-2d-cafe.png', '/assets/library/official/scenes/scene-2d-cafe.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"街角咖啡店","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-cafe.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-cafe.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 2D漫-现代都市 / 黄昏教室
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000703', 'official', NULL, NULL, NULL, 'scene', 'scene', '2D漫-现代都市', '黄昏教室', '一间空无一人的现代高中教室室内场景，日系校园风，黄昏放学后的安静氛围，左侧一整排大窗户透入橙金色夕阳，窗外可见城市高楼、树影和晚霞云层，教室内摆放整齐的木质课桌椅，桌面被夕阳照亮并产生温暖反光，前方有大黑板、讲台、粉笔槽和黑板擦，墙上挂着时钟、公告板、文件栏、音响和空调设备，角落有书架、储物柜、盆栽和窗帘，天花板有日光灯管、管线和吊架，地面为光滑瓷砖并映出窗框光影，夕阳穿过窗户在黑板、讲台、地板和课桌上投下长条阴影，整体光影温暖柔和，画面宁静怀旧，带有青春校园回忆感，高质量动画背景美术，日系二次元场景插画风，电影级构图，细节丰富，干净线稿，精致上色，体积光，真实透视，广角镜头，室内纵深感强，横版宽幅画面，画面比例 16:9，适合游戏场景背景或校园漫画背景', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000703'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000703'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '7ca51ab8-eedc-47f9-8c69-4917994e8935', '51000000-0000-4000-8000-000000000703', latest.version_number + 1, 'official/scenes/scene-2d-classroom.png', '/assets/library/official/scenes/scene-2d-classroom.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"黄昏教室","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-2d-classroom.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-2d-classroom.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-东方修仙 / 丹房
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000607', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-东方修仙', '丹房', '一间宏大复杂的东方玄幻炼丹房室内场景，古风仙侠炼药工坊，深色木质梁柱与雕花隔断构成圆形空间，中央摆放巨大青铜炼丹炉，炉身带精致金色纹样和兽首装饰，底部燃着橙色炉火，周围环形石台与符文地砖层层展开，左右两侧布满木质药柜、抽屉、书架和陈列架，摆放大量瓷瓶、玻璃药瓶、药罐、香炉、卷轴、草药盆栽和炼金器具，右侧有大型金属炼炉与管道装置，玻璃容器中发出蓝色灵光，天花悬挂古风宫灯、铜链、吊瓶和法器，墙面挂有青蓝色符纹幡旗，空间深处开阔窗外可见云雾山峰、松树与远处仙山楼阁，室内暖色火光与冷蓝灵光交织，空气中有淡淡烟雾和尘埃光束，氛围神秘古老、精密华丽、仙气与炼金科技感结合，超高细节幻想场景设计，东方玄幻游戏场景概念图，电影级写实 3D 渲染风，复杂道具陈设，金属、木材、玻璃、石材质感清晰，体积光，景深，广角镜头，中心对称构图，横版宽幅画面，画面比例 16:9，适合游戏场景原画或仙侠炼丹房背景', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000607'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000607'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '81909d1c-eaba-4326-8638-2b162c57c4cc', '51000000-0000-4000-8000-000000000607', latest.version_number + 1, 'official/scenes/scene-3d-alchemy.png', '/assets/library/official/scenes/scene-3d-alchemy.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"丹房","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-alchemy.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-alchemy.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-东方修仙 / 云海仙台
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000601', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-东方修仙', '云海仙台', '神圣唯美的东方仙界云台场景，云海之上有圆形白玉祭坛平台，地面雕刻精致环形法阵和青金纹路，周围有栏杆、仙鹤雕塑、琉璃灯柱、亭台、拱门和发光传送法阵，远处漂浮仙山、宫殿、桥梁、瀑布和云雾，晨曦阳光穿透云层洒在玉石地面上，整体氛围纯净、梦幻、庄严、天界圣地感，电影级东方幻想场景概念图，横版超广角构图，画面比例16:9，适合作为仙界广场、天宫入口、传送台、游戏场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000601'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000601'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'a70f7453-42b9-4432-8337-c1d75df8a0b7', '51000000-0000-4000-8000-000000000601', latest.version_number + 1, 'official/scenes/scene-3d-cloud.png', '/assets/library/official/scenes/scene-3d-cloud.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"云海仙台","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-cloud.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-cloud.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-东方修仙 / 仙舟甲板
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000606', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-东方修仙', '仙舟甲板', '东方幻想飞空船甲板场景，巨大的木质甲板悬浮在云海之上，船体结合古风飞檐楼阁、金属机械结构、蓝色灵能核心、巨大风帆和翼状装置，甲板上有栏杆、灯笼、旗帜、法阵纹样和铜质机械装饰，远处漂浮仙山、云海和其他飞空船，阳光明亮，氛围冒险、壮阔、蒸汽仙侠感，电影级游戏场景概念图，横版广角构图，画面比例16:9，适合作为飞空船、云海航行、仙侠交通工具背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000606'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000606'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '8459e05e-6fd1-4585-8e62-6294d275621f', '51000000-0000-4000-8000-000000000606', latest.version_number + 1, 'official/scenes/xianzhou-deck.png', '/assets/library/official/scenes/xianzhou-deck.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"仙舟甲板","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/xianzhou-deck.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/xianzhou-deck.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-东方修仙 / 宗门大殿
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000603', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-东方修仙', '宗门大殿', '宏伟壮丽的东方仙侠宗门大殿场景，白玉石材与蓝金纹饰构成恢弘宫殿建筑群，中央主殿高耸庄严，层叠飞檐、琉璃蓝瓦、雕花立柱、金色法纹和巨型门扉细节精致，宽阔石阶从前景一路通向大殿入口，地面铺设白色石砖与蓝金符文阵纹，左右矗立高大旗幡、法器立柱、石灯笼和守护栏杆，两侧有亭台回廊、松树、岩石、水池与小瀑布，远处环绕高耸仙山、云雾、悬崖楼阁和晴朗蓝天白云，整体氛围神圣、明亮、庄严、仙气、宗门圣地感，超广角横版构图，中轴对称透视，电影级东方幻想游戏场景概念图，高精度数字绘画，写实3D渲染风格，白玉、金属、蓝色琉璃和水面材质真实细腻，光影通透，画面比例16:9，适合作为仙侠宗门大殿、修仙门派主场景、神圣宫殿、游戏场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000603'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000603'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '37c3a6d2-2bbb-47dc-8c2f-2757a4bf7973', '51000000-0000-4000-8000-000000000603', latest.version_number + 1, 'official/scenes/scene-3d-sect.png', '/assets/library/official/scenes/scene-3d-sect.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"宗门大殿","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-sect.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-sect.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-东方修仙 / 星河悬崖
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000608', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-东方修仙', '星河悬崖', '壮丽的东方仙侠星空祭坛场景，悬崖之巅建有巨大的圆形石质观星台，地面刻满复杂星象法阵和环形符文纹路，中央有发光水晶祭坛，四周矗立多根高耸石柱与蓝紫色旗幡，柱顶镶嵌发光晶石，边缘分布古风石灯笼和栏杆，远处是云海之上的群山、悬崖、仙山楼阁与亭台，天空为深蓝夜色，巨大银河横贯天幕，星座连线、流星光柱、繁星与明月共同照亮场景，氛围神秘、宏大、神圣、星辰修炼感，广角横版构图，俯视透视与强空间纵深，电影级东方幻想游戏场景概念图，高精度数字绘画，写实3D渲染风格，蓝紫冷光、月光与云海反射层次丰富，细节精致，画面比例16:9，适合作为仙侠观星台、星辰祭坛、宗门禁地、游戏场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000608'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000608'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6fa75fb1-46e0-4ad9-89cf-d8838483bca8', '51000000-0000-4000-8000-000000000608', latest.version_number + 1, 'official/scenes/scene-3d-star-cliff.png', '/assets/library/official/scenes/scene-3d-star-cliff.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"星河悬崖","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-star-cliff.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-star-cliff.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-东方修仙 / 灵石洞府
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000602', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-东方修仙', '灵石洞府', '宏大的地下水晶洞窟秘境场景，巨大岩洞空间中布满钟乳石、岩壁裂隙和天然石桥，清澈蓝绿色地下湖环绕中央圆形石台，石台中央生长巨大的发光蓝色水晶簇，周围散布大量透明晶体矿石，远处有古风遗迹大门、石阶、亭台楼阁和悬空岩台，水面倒映水晶蓝光与暖色石灯笼，洞顶裂口洒下神圣光束，空气中有薄雾、尘埃和魔法微光，氛围神秘、壮观、仙侠、远古遗迹探索感，广角横版构图，中央对称透视，电影级东方幻想游戏场景概念图，写实3D渲染风格，高精度数字绘画，水面反射真实，岩石与晶体材质细节丰富，蓝色冷光与暖色灯光对比强烈，画面比例16:9，适合作为地下秘境、水晶洞穴副本、仙侠遗迹场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000602'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000602'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '01e65cb4-44d3-41fb-89d3-ee13ddf9b266', '51000000-0000-4000-8000-000000000602', latest.version_number + 1, 'official/scenes/scene-3d-cave.png', '/assets/library/official/scenes/scene-3d-cave.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"灵石洞府","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-cave.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-cave.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-东方修仙 / 秘境森林
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000604', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-东方修仙', '秘境森林', '神秘的东方幻想森林秘境场景，巨大古树与盘绕树根形成天然拱顶，茂密深绿色植被覆盖整个画面，中央是一条潮湿的古老石板小径和石阶，通向森林深处的古风亭台遗迹，远处有高处石塔与小瀑布，溪流穿过岩石与苔藓，左右点缀古风石灯笼、发光蓝色水晶、幽蓝荧光花草与漂浮微光，环境充满潮湿雾气、清晨阳光穿透树冠形成体积光，氛围神秘、静谧、仙侠、遗迹探索感，广角横版构图，强纵深透视，电影级东方奇幻场景概念图，高精度数字绘画，写实游戏场景渲染，细节丰富，光影层次强，画面比例16:9，适合作为仙侠秘境森林、古代遗迹入口、游戏场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000604'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000604'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '81cb0879-ffcd-4124-8689-edfe7148cbb2', '51000000-0000-4000-8000-000000000604', latest.version_number + 1, 'official/scenes/scene-3d-forest.png', '/assets/library/official/scenes/scene-3d-forest.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"秘境森林","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-forest.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-forest.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-东方修仙 / 试炼山门
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000605', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-东方修仙', '试炼山门', '一座宏伟壮丽的东方玄幻仙门入口场景，云海之上的仙侠宗门山门，前景是巨大的圆形石质祭坛平台，地面刻有复杂阵法纹路和几何符文，平台两侧立有青蓝色旗幡、金属栏杆、灵石灯柱和发光法器，中间一条长长的悬空石阶向远处延伸，通往高耸华丽的仙门牌楼，牌楼采用古风飞檐屋顶、金色雕花、青铜立柱和蓝色宝石灵核装饰，中央悬浮或镶嵌一枚发光的圆形法阵核心，散发蓝白色灵光，远处云雾缭绕中漂浮着多座小型仙台和灯塔，四周环绕奇峰峭壁、松树、云海和远山楼阁，天空云层厚重，夕阳金光从云缝洒下，形成神圣耀眼的逆光和体积光，整体氛围庄严、神秘、宏大、仙气磅礴，高质量东方玄幻游戏场景概念图，仙侠宗门入口设计，电影级写实 3D 渲染风，超高细节，石材、青铜、金属、宝石、旗帜布料和云雾材质清晰，金色阳光与蓝色灵光对比，广角镜头，中心对称构图，强纵深透视，史诗感场景，横版宽幅画面，画面比例 16:9，适合游戏场景背景或仙侠世界观概念图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000605'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000605'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'df5fc91d-2819-411e-8efa-cc51b2a9fb6f', '51000000-0000-4000-8000-000000000605', latest.version_number + 1, 'official/scenes/scene-3d-trial-gate.png', '/assets/library/official/scenes/scene-3d-trial-gate.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"试炼山门","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-trial-gate.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-trial-gate.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-现代都市 / 云端办公室
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000506', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-现代都市', '云端办公室', '未来高空云端办公室场景，白色科技感开放办公区悬浮在云海之上，大面积落地玻璃、透明连廊、玻璃会议舱和悬浮办公舱构成空间，蓝色LED灯带沿天花与平台边缘延伸，室内有办公桌、人体工学椅、绿植、休息区和会议桌，窗外是云层、蓝天和超高未来塔楼，氛围明亮、轻盈、先进、科幻商务感，写实3D未来建筑渲染风格，横版广角构图，画面比例16:9，适合作为未来公司总部、云端办公室、科幻商务背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000506'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000506'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '03eaedbc-5e23-4479-8f4f-f2af65012afc', '51000000-0000-4000-8000-000000000506', latest.version_number + 1, 'official/scenes/scene-3d-cloud-office.png', '/assets/library/official/scenes/scene-3d-cloud-office.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"云端办公室","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-cloud-office.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-cloud-office.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-现代都市 / 学院广场
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000504', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-现代都市', '学院广场', '未来感现代学院广场/科技园场景，玻璃幕墙办公楼与白色流线型建筑环绕，建筑外立面带有蓝色科技灯带和发光装饰，中央远处有大型金属圆环雕塑与阶梯广场，前景是宽阔整洁的石材步道、水景倒影、低矮花坛、绿植景观、树木和现代长椅，地面局部带有蓝色导光线和暖色灯带，远处可见连廊、山景和现代高楼，晴朗白天，蓝天白云，阳光明亮通透，整体氛围干净、先进、开放、科技园区感，广角横版构图，中央道路形成纵深引导线，写实3D建筑可视化风格，高精度数字绘画，玻璃、金属、石材、水面和植物材质真实细腻，画面比例16:9，适合作为未来科技园区、现代企业总部、研发中心、商业办公广场背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000504'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000504'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '90a72d51-b4b7-4b78-8d32-847e8bf3773c', '51000000-0000-4000-8000-000000000504', latest.version_number + 1, 'official/scenes/scene-3d-campus.png', '/assets/library/official/scenes/scene-3d-campus.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"学院广场","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-campus.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-campus.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-现代都市 / 智能车库
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000505', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-现代都市', '智能车库', '未来科技感地下智能车库场景，宽敞高端的现代车库空间，右侧排列多组机械升降车位与金属停车平台，停放黑色、白色、灰色豪华轿车，墙面和立柱带有蓝色LED灯带与机械结构装饰，地面为高反射灰色环氧地坪，清晰白色车道线与蓝色导向灯嵌入地面，左侧有透明玻璃电梯井、现代楼梯、绿植和休息区入口，顶部为黑色格栅吊顶、线性灯带和几何发光灯具，整体氛围干净、精密、豪华、科幻、智能停车系统感，广角横版构图，空间纵深明显，电影级写实3D渲染风格，高精度建筑可视化，金属、玻璃、车漆和地面反射材质真实细腻，冷蓝科技光与柔和白光对比，画面比例16:9，适合作为未来车库、豪宅地下停车场、智能机械停车库、科幻都市场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000505'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000505'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'f79cb37a-1c2f-433a-8e45-35b3ca5d00d5', '51000000-0000-4000-8000-000000000505', latest.version_number + 1, 'official/scenes/scene-3d-smart-garage.png', '/assets/library/official/scenes/scene-3d-smart-garage.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"智能车库","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-smart-garage.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-smart-garage.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-现代都市 / 未来公寓
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000501', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-现代都市', '未来公寓', '未来科技感豪华城市公寓客厅场景，宽敞开放式高层住宅室内，落地窗外是傍晚蓝紫色城市天际线和霓虹高楼夜景，室内有米白色L形沙发、低矮智能茶几、现代休闲椅、圆形餐桌、开放式厨房吧台和左侧卧室区域，墙面与玻璃上显示蓝色全息智能家居界面与数据面板，天花板嵌入线性灯带和科技感中央灯具，家具带有柔和橙色氛围灯，地面为高反射石材，映出城市灯光与室内暖光，点缀绿植、摆件、书籍和智能设备，整体氛围高级、安静、赛博豪宅、未来生活感，广角横版构图，室内空间纵深清晰，电影级写实3D渲染风格，高精度数字场景概念图，蓝紫夜景冷光与室内暖色灯光对比强烈，材质精致真实，画面比例16:9，适合作为未来都市豪宅、智能公寓、科幻生活场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000501'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000501'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'e43a6aaf-77de-4e3a-8901-b798865dc5c3', '51000000-0000-4000-8000-000000000501', latest.version_number + 1, 'official/scenes/scene-3d-future-apartment.png', '/assets/library/official/scenes/scene-3d-future-apartment.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"未来公寓","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-future-apartment.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-future-apartment.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-现代都市 / 直播间
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000503', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-现代都市', '直播间', '现代高端电视直播演播室场景，中央是弧形主播台和黑色主播椅，背后是一整面超宽曲面LED大屏，显示蓝绿色抽象科技图形，前景有专业广播级摄像机、滑轨轨道、三脚架和摄像机推车，左右布置柔光箱、聚光灯、吊装灯架和顶部演播室灯光设备，右侧有导播控制台、多屏监看器、调音台与编辑工作站，墙面为深色吸音板和几何发光装饰，局部点缀绿植与休息椅，整体氛围专业、科技、沉稳、商业级制作现场，广角横版构图，电影级室内灯光，蓝色冷光与暖色轮廓灯交织，写实3D渲染风格，高精度数字场景概念图，细节丰富，金属与磨砂材质清晰，画面比例16:9，适合作为新闻直播间、访谈节目演播室、短视频录制棚、虚拟主播场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000503'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000503'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'e4df4c89-aa05-4a1b-85bd-1b8ad3f1f382', '51000000-0000-4000-8000-000000000503', latest.version_number + 1, 'official/scenes/scene-3d-studio.png', '/assets/library/official/scenes/scene-3d-studio.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"直播间","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-studio.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-studio.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-现代都市 / 赛博商场
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000507', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-现代都市', '赛博商场', '一座未来感大型购物中心中庭室内场景，科幻商业综合体设计，多层开放式商场空间，中央有交错延伸的自动扶梯和玻璃观光电梯，楼层连廊层层环绕，顶部是巨大的几何玻璃天幕与金属结构穹顶，整体建筑采用银色金属、透明玻璃和抛光石材材质，栏杆与天花边缘布满蓝色霓虹灯带，空间中悬挂紫蓝色全息广告屏和竖向数字屏，店铺橱窗明亮通透，两侧可见高端商店、展示柜、餐饮区和休闲座椅，中央下沉式休息区摆放环形沙发、绿植花坛和发光屏幕，地面为高反射大理石瓷砖，倒映蓝紫霓虹和橱窗灯光，整体氛围明亮奢华、未来科技感强、商业繁华、干净高级，高质量科幻城市场景概念图，未来购物中心室内设计，电影级写实 3D 渲染风，超高细节，玻璃、金属、石材、灯带和全息屏材质清晰，蓝紫霓虹与暖色店铺灯光对比，真实反射，广角镜头，高视角俯瞰透视，中心对称构图，强纵深感，横版宽幅画面，画面比例 16:9，适合游戏场景背景或未来商场概念图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000507'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000507'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '93bf1a68-21fb-4d41-8b01-488313aa32d6', '51000000-0000-4000-8000-000000000507', latest.version_number + 1, 'official/scenes/scene-3d-cyber-mall.png', '/assets/library/official/scenes/scene-3d-cyber-mall.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"赛博商场","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-cyber-mall.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-cyber-mall.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-现代都市 / 霓虹街区
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000502', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-现代都市', '霓虹街区', '一条未来都市商业街夜景场景，赛博朋克风格城市街区，雨后湿润的步行街道延伸到远处，高楼大厦夹在道路两侧，建筑立面布满霓虹灯牌、蓝色和粉紫色发光广告屏、透明橱窗、科技感线条灯带和巨型数字标识，远处有高耸的圆柱形摩天楼和密集城市灯光，街道地面为深色石材或金属地砖，雨水形成镜面反射，倒映出粉色、紫色、蓝色、橙色霓虹光，路边有树木、绿植花箱、玻璃商铺、咖啡厅室内暖光、智能路灯、电子导视牌和短柱护栏，夜空深蓝，空气中带轻微雾气和潮湿氛围，整体画面冷暖对比强烈，繁华但空旷安静，未来科技感与都市生活感结合，高质量科幻城市场景概念图，电影级写实 3D 渲染风，超高细节，玻璃、金属、湿地面、霓虹灯材质清晰，广角镜头，低机位街道透视，中心纵深构图，清晰锐利，色彩鲜艳，高级感，横版宽幅画面，画面比例 16:9，适合游戏场景背景或赛博朋克都市概念图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000502'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000502'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'd4bfa020-d5d1-449a-8a70-84c750a3c9fe', '51000000-0000-4000-8000-000000000502', latest.version_number + 1, 'official/scenes/scene-3d-neon-street.png', '/assets/library/official/scenes/scene-3d-neon-street.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"霓虹街区","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-neon-street.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-neon-street.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 3D漫-现代都市 / 高铁站
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000508', 'official', NULL, NULL, NULL, 'scene', 'scene', '3D漫-现代都市', '高铁站', '一座未来感现代高铁站台室内场景，科幻交通枢纽设计，宽阔明亮的高速铁路车站，右侧停靠一列白色流线型高速列车，车头圆润光滑，车窗深黑反光，车身带蓝色灯带和科技线条，站台地面为高反射灰白色石材瓷砖，前方有黄色盲道与轨道边缘，左侧有白色候车长椅、玻璃栏杆、绿植花箱和透明电梯井，顶部是巨大弧形玻璃穹顶，金属梁架纵横交错，蓝天白云透过天窗洒入室内，空间内有银色金属立柱、弧形结构、蓝色霓虹灯带、悬挂式电子信息屏和现代照明灯条，整体环境干净通透、科技感强、秩序感强，阳光在地面形成清晰反射和光影，超高细节未来城市交通场景，现代科幻建筑概念设计，电影级写实 3D 渲染风，玻璃、金属、抛光地面和列车漆面材质清晰，广角镜头，低机位透视，强纵深构图，明亮自然光，清晰锐利，高级感，横版宽幅画面，画面比例 16:9，适合游戏场景背景或未来高铁站概念图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000508'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000508'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '6e74a211-3f04-4e4e-85a5-d8eb00c85390', '51000000-0000-4000-8000-000000000508', latest.version_number + 1, 'official/scenes/scene-3d-railway.png', '/assets/library/official/scenes/scene-3d-railway.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"高铁站","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-3d-railway.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-3d-railway.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-东方古代 / 军营
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000408', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-东方古代', '军营', '古代军事训练营寨场景，木质营房、瞭望塔、围栏和营帐围绕土质操练场，场地中摆放兵器架、长矛、盾牌、战鼓、火盆、旗帜和训练器械，远处是山林背景与夕阳暖光，整体氛围粗粝、肃杀、古代军营、武侠训练场感，写实电影场景风格，横版广角构图，画面比例16:9，适合作为古代兵营、练武场、战争剧情背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000408'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000408'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '317481f3-5a6e-49ed-8675-af4d8a56966e', '51000000-0000-4000-8000-000000000408', latest.version_number + 1, 'official/scenes/scene-ancient-barracks.png', '/assets/library/official/scenes/scene-ancient-barracks.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"军营","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-ancient-barracks.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-ancient-barracks.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-东方古代 / 客栈
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000405', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-东方古代', '客栈', '古代中式客栈酒楼内景场景，宽敞两层木结构大厅，深色旧木梁柱、二楼回廊、木质栏杆和楼梯构成空间，左侧是酒柜与柜台，摆放陶坛、酒壶、碗碟和杂物，中央与四周分布多张方形木桌、长凳和矮凳，桌上有筷筒、茶壶、酒壶、蜡烛和餐具，地面为磨损青石板，墙面有木格窗、门帘、竹帘、匾额和装饰器物，暖黄色纸灯笼从梁柱和回廊垂下，远处门窗透入微弱自然光，整体氛围温暖、古朴、烟火气、武侠客栈感，广角横版构图，室内空间纵深明显，电影级古风场景概念图，写实3D渲染风格，高精度数字绘画，木材、石板、陶器和灯笼材质真实细腻，暖色灯光层次丰富，画面比例16:9，适合作为古代客栈、酒楼大厅、江湖酒馆、武侠剧情场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000405'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000405'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'bd53522b-23f6-4c1e-888d-0d448a4737d3', '51000000-0000-4000-8000-000000000405', latest.version_number + 1, 'official/scenes/scene-ancient-inn.png', '/assets/library/official/scenes/scene-ancient-inn.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"客栈","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-ancient-inn.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-ancient-inn.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-东方古代 / 市集
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000403', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-东方古代', '市集', '古代中式市井商业街场景，宽阔青石板街道向远处城楼和拱形城门延伸，两侧排列木质古建筑店铺、茶棚、摊位和货架，灰瓦飞檐、木格窗、旧木梁柱与布棚遮阳篷细节丰富，街边悬挂大量纸灯笼、幌子和布帘，摊位上摆放竹篮、陶罐、蔬菜、药材、干货、木桶和生活杂物，整体有古代集市、商铺街巷、繁华但暂时无人的市集氛围，白天自然阳光照射，蓝天白云，建筑阴影落在石板路上，广角横版构图，中央道路形成强烈纵深透视，电影级古风场景概念图，写实3D渲染风格，高精度数字绘画，木材、石板、布料和竹编材质真实细腻，画面比例16:9，适合作为古代街市、武侠城镇、商贸集市、游戏城市场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000403'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000403'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '521aebcc-f15e-4ece-8ba6-fc1185499c39', '51000000-0000-4000-8000-000000000403', latest.version_number + 1, 'official/scenes/scene-ancient-market.png', '/assets/library/official/scenes/scene-ancient-market.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"市集","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-ancient-market.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-ancient-market.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-东方古代 / 御书房
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000404', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-东方古代', '御书房', '古典厚重的中式书房内景场景，深色木质梁柱与雕花隔扇构成空间，中央摆放大型黑檀木书案和太师椅，书案上有展开的书卷、毛笔笔筒、砚台、镇纸、香炉和古籍，左侧整面书架堆满线装书、卷轴、木盒、瓷瓶与文房器物，后方悬挂山水屏风画和书法挂轴，右侧为大面积中式格栅窗，窗外可见古建筑屋顶与庭院，厚重绣花帷幔垂落两侧，室内点亮暖色宫灯和烛火，前景有铜香炉与茶器虚化，整体氛围沉稳、儒雅、权贵、古代文人书斋感，广角横版构图，室内纵深与层次丰富，电影级古风场景概念图，写实3D渲染风格，高精度数字绘画，木雕、金色纹饰、织物和铜器材质细腻，暖色灯光与窗外冷色自然光对比，画面比例16:9，适合作为古代书房、王府书斋、谋略议事房、古风剧情背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000404'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000404'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '0f1f264b-c35c-483e-873f-b4f8b783f958', '51000000-0000-4000-8000-000000000404', latest.version_number + 1, 'official/scenes/scene-ancient-study.png', '/assets/library/official/scenes/scene-ancient-study.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"御书房","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-ancient-study.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-ancient-study.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-东方古代 / 御花园
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000407', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-东方古代', '御花园', '典雅宁静的中式古典园林场景，白墙黛瓦、飞檐亭台、雕花木质凉亭与传统院落建筑错落分布，右侧是一座精致六角亭，亭内有木桌椅和悬挂宫灯，前景为石板小径、石栏杆、盆景、假山石与修剪松树，左侧是荷花池塘，大片荷叶与粉色莲花漂浮水面，池边点缀石灯笼、太湖石和水生植物，远处有圆形月洞门、回廊、庭院墙与古建筑屋顶，树木繁茂、柳枝垂落，阳光穿过枝叶形成斑驳树影，氛围清幽、雅致、古典、江南园林感，广角横版构图，空间层次丰富，写实建筑景观摄影风格，高精度数字绘画，材质真实细腻，自然光影柔和，画面比例16:9，适合作为中式园林、古代庭院、江南宅院、古风剧情场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000407'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000407'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '81b55f49-86e9-41f2-8ece-783a05ea7db6', '51000000-0000-4000-8000-000000000407', latest.version_number + 1, 'official/scenes/scene-ancient-garden.png', '/assets/library/official/scenes/scene-ancient-garden.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"御花园","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-ancient-garden.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-ancient-garden.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-东方古代 / 牢房
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000401', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-东方古代', '牢房', '阴暗压抑的古代地牢走廊场景，粗糙石墙与破旧木梁结构，左右两侧是厚重木栅栏牢房和木门，牢房内有稻草床铺、铁链、木桶和简陋刑具，地面为不规则旧石板，潮湿磨损、裂缝明显，墙上排列燃烧的火把，橙黄色火光照亮局部空间，远处走廊逐渐隐入黑暗并有铁窗透入微弱冷光，环境充满烟雾、尘埃和潮湿空气感，氛围沉重、危险、神秘、古代刑狱感，低机位广角横版构图，强纵深透视，电影级古风地牢场景概念图，写实3D渲染风格，高精度数字绘画，材质粗粝真实，明暗对比强烈，画面比例16:9，适合作为古代牢狱、武侠审讯室、游戏地牢关卡背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000401'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000401'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '2c604274-f104-407c-88e4-9d49dec952b3', '51000000-0000-4000-8000-000000000401', latest.version_number + 1, 'official/scenes/scene-ancient-prison.png', '/assets/library/official/scenes/scene-ancient-prison.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"牢房","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-ancient-prison.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-ancient-prison.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-东方古代 / 王府
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000402', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-东方古代', '王府', '庄严古朴的中式古代宫殿庭院场景，传统木质殿宇围合布局，中央主殿位于石阶之上，灰瓦飞檐、红色立柱、雕花斗拱、木格门窗和金色纹饰细节丰富，两侧回廊对称延伸，悬挂古风宫灯与流苏装饰，庭院地面为大块青石砖铺设，中央有精美石雕纹样，左右摆放石灯笼、盆景、绿植、假山和修剪整齐的庭院植物，整体氛围安静、威严、古典、雅致，清晨或傍晚柔和自然光从侧面照入，形成温暖阴影和空气透视，广角横版构图，中轴对称透视，电影级中式古建筑场景概念图，写实3D渲染风格，高精度数字绘画，材质细腻，光影真实，画面比例16:9，适合作为古代王府庭院、宫廷场景、武侠仙侠建筑背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000402'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000402'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  'cf518a0c-86d3-47e0-824d-fa7ac4cfcb0c', '51000000-0000-4000-8000-000000000402', latest.version_number + 1, 'official/scenes/scene-ancient-mansion.png', '/assets/library/official/scenes/scene-ancient-mansion.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"王府","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-ancient-mansion.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-ancient-mansion.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-东方古代 / 酒楼
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000406', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-东方古代', '酒楼', '一间中国古代酒楼客栈室内大厅场景，古风武侠酒馆氛围，深色木质梁柱与二层回廊构成复杂空间，墙面和栏杆带精细雕花格栅，中央摆放多张圆形木桌和方凳，桌上有酒壶、酒杯、茶具、小菜、筷子和烛灯，左侧有木楼梯、酒坛架、陶瓷酒坛和储物柜，右侧有木质柜台、花瓶、盆栽、红色酒坛和装饰摆件，远处有帘幕分隔的内厅和更多桌椅，天花与回廊悬挂大量暖黄色宫灯、纸灯笼和吊灯，灯光映照出木材纹理和石板地面反光，整体色调为深棕、黑木、暖橙金色，空间充满古代市井生活感和江湖气息，氛围温暖神秘、安静厚重、年代感强，高质量古风游戏场景概念图，东方武侠室内场景设计，电影级写实 3D 渲染风，超高细节，木材、石板、陶瓷、布帘、灯笼材质清晰，暖色体积光，真实透视，广角镜头，强纵深构图，横版宽幅画面，画面比例 16:9，适合游戏场景背景或古代酒楼客栈背景', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000406'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000406'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '9b9312b9-d9fb-416c-8a60-873ce208c3b1', '51000000-0000-4000-8000-000000000406', latest.version_number + 1, 'official/scenes/scene-ancient-restaurant.png', '/assets/library/official/scenes/scene-ancient-restaurant.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"酒楼","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-ancient-restaurant.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-ancient-restaurant.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-现代都市 / 会所
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000207', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-现代都市', '会所', '奢华复古私人酒廊室内会所场景，深色木墙、暖色壁灯、皮质沙发、扶手椅、大理石茶几和高级吧台组成空间，后方酒柜陈列大量洋酒与玻璃杯，吧椅、餐桌、台灯、绿植和装饰画点缀其中，整体氛围沉稳、昂贵、私密、上流社交感，电影级写实3D室内渲染风格，横版广角构图，画面比例16:9，适合作为私人会所、豪华酒吧、商务谈判背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000207'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000207'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '21448c33-ff02-4786-8cb0-fac09f36a600', '51000000-0000-4000-8000-000000000207', latest.version_number + 1, 'official/scenes/scene-club.png', '/assets/library/official/scenes/scene-club.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"会所","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-club.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-club.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-现代都市 / 别墅
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000202', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-现代都市', '别墅', '现代豪华独栋别墅夜景外观，二层大宅采用浅色石材、黑色金属线条、大面积落地玻璃和悬挑阳台设计，室内暖光从窗户透出，前院有水景、石板步道、修剪绿植、景观树和地灯，蓝调傍晚天空与暖色建筑灯光形成对比，氛围高级、安静、富人住宅感，写实建筑可视化风格，横版广角构图，画面比例16:9，适合作为豪宅外景、现代别墅、富人区场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000202'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000202'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '957ab99a-fc0c-47d8-8c85-8fffa0f099d1', '51000000-0000-4000-8000-000000000202', latest.version_number + 1, 'official/scenes/scene-villa.png', '/assets/library/official/scenes/scene-villa.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"别墅","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-villa.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-villa.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-现代都市 / 办公室
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000205', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-现代都市', '办公室', '高端商务总裁办公室场景，深色木质办公桌、真皮办公椅、访客椅、会议桌、黑色皮沙发和茶几布置在宽敞空间内，左侧整面书柜带暖色灯带，落地窗外是城市高楼天际线，室内有绿植、艺术画、文件夹和办公设备，氛围沉稳、权威、商务精英感，写实3D室内渲染风格，横版广角构图，画面比例16:9，适合作为总裁办公室、董事会议室、商务剧情背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000205'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000205'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '1f18c308-39ee-4a06-8eec-135ebd488c8f', '51000000-0000-4000-8000-000000000205', latest.version_number + 1, 'official/scenes/scene-office.png', '/assets/library/official/scenes/scene-office.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"办公室","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-office.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-office.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-现代都市 / 医院
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000204', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-现代都市', '医院', '干净明亮的现代医院护士站与走廊场景，左侧为弧形接待台、电脑、打印机、医疗用品柜和洗手区，右侧长走廊延伸至远处，两侧有病房门、玻璃隔断、候诊沙发、扶手和绿植，整体以白色与浅木色为主，灯光柔和均匀，空间整洁专业，写实建筑室内渲染风格，横版广角构图，画面比例16:9，适合作为医院走廊、护士站、医疗剧情背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000204'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000204'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '98867f7f-3aab-4ad9-83ec-6aa943271482', '51000000-0000-4000-8000-000000000204', latest.version_number + 1, 'official/scenes/scene-hospital.png', '/assets/library/official/scenes/scene-hospital.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"医院","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-hospital.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-hospital.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-现代都市 / 小巷
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000203', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-现代都市', '小巷', '安静高级的现代城市商业步行巷场景，两侧是欧式现代公寓楼与精品店铺，灰色石材外墙、黑色金属阳台、玻璃橱窗和深色遮阳棚细节清晰，街边布置露天咖啡座、圆桌、休闲椅、壁灯和室内暖光橱窗，巷道两侧摆满大型盆栽、绿植、藤蔓和灌木，植物从阳台和墙面自然垂落，地面为整齐灰色石板路，远处可见高楼与树荫，午后阳光从巷口斜射进来，在石板路上形成长阴影和斑驳光斑，整体氛围安静、精致、生活化、都市慢节奏，广角横版构图，中央街道形成强纵深透视，写实城市街景摄影风格，高精度数字绘画，建筑石材、玻璃、植物和金属材质真实细腻，光影自然柔和，画面比例16:9，适合作为现代都市街巷、精品商业街、咖啡馆外景、日常剧情场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000203'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000203'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '86421b97-a8fa-463e-87a6-165157b29f19', '51000000-0000-4000-8000-000000000203', latest.version_number + 1, 'official/scenes/scene-alley.png', '/assets/library/official/scenes/scene-alley.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"小巷","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-alley.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-alley.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-现代都市 / 机场
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000208', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-现代都市', '机场', '明亮宽敞的现代机场候机大厅场景，大面积弧形玻璃幕墙贯穿右侧，窗外可见停机坪、登机廊桥和多架客机，室内有成排棕色皮质候机座椅、信息显示屏、指示牌、玻璃护栏和登机口区域，左侧布置大型绿植与室内树木，顶部为流线型木纹吊顶和现代白色支撑柱，地面是高反射灰色 polished 石材地板，映出窗光与座椅倒影，整体空间干净、通透、秩序感强，白天自然阳光充足，蓝天光透过玻璃洒入大厅，氛围安静、现代、商务、国际机场感，超广角横版构图，强空间纵深，写实建筑可视化风格，电影级室内摄影光影，高精度3D渲染，材质真实细腻，画面比例16:9，适合作为机场候机厅、现代交通枢纽、商务出行场景背景图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000208'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000208'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '85de6d19-0387-4134-8aaa-3aa7fca4f676', '51000000-0000-4000-8000-000000000208', latest.version_number + 1, 'official/scenes/scene-airport.png', '/assets/library/official/scenes/scene-airport.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"机场","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-airport.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-airport.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-现代都市 / 车库
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000201', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-现代都市', '车库', '一座高端现代私宅地下车库室内场景，豪宅车库与展示空间设计，宽阔空旷的地下停车区域，地面为深灰色抛光混凝土或环氧地坪，带清晰反射和停车位白色线条，天花为工业风裸露管线与黑色金属梁架，嵌入长条线性灯带形成强烈透视引导，黑色大理石立柱带白色纹理和竖向发光线条，左侧有开放式酒柜、陈列柜、隐藏灯带和楼梯入口，远处墙面展示多排摩托头盔和储物柜，右侧墙面悬挂自行车、滑板、工具和运动装备，墙边有车轮挡块和停车辅助设施，整体空间干净整洁、奢华低调、科技感强，暖色灯光与深色材质形成高级对比，现代豪宅生活方式场景，高质量室内空间概念图，电影级写实 3D 渲染风，超高细节，混凝土地面、黑色大理石、金属管线、玻璃、木饰面和皮革陈列材质清晰，真实反射，广角镜头，低机位透视，强纵深构图，横版宽幅画面，画面比例 16:9，适合游戏场景背景或现代豪宅地下车库概念图', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000201'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000201'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '022b672c-5b7b-459d-8de9-98329f794ed4', '51000000-0000-4000-8000-000000000201', latest.version_number + 1, 'official/scenes/scene-garage.png', '/assets/library/official/scenes/scene-garage.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"车库","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-garage.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-garage.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

-- scene / 国内仿真人-现代都市 / 酒店
INSERT INTO library_assets (
  id, scope, organization_id, workspace_id, created_by_user_id, asset_type, category, folder, name, description, tags_json, status, requires_pro_entitlement, created_at, updated_at
) VALUES (
  '51000000-0000-4000-8000-000000000206', 'official', NULL, NULL, NULL, 'scene', 'scene', '国内仿真人-现代都市', '酒店', '一座奢华现代五星级酒店大堂室内场景，高端商务酒店或豪宅会所空间，宽敞挑高大厅，中央悬挂巨大的多层水晶吊灯，暖金色灯光洒满空间，地面为高反射深灰大理石拼花地板，清晰倒映吊灯和墙面光影，左侧是黑色大理石前台接待区，配有台灯和金属线条装饰，墙面有大型山水纹理装饰画与金属格栅，中央尽头摆放圆形花台和大型插花，背景为对称的大理石墙面与电梯厅入口，右侧是舒适休息区，摆放米色沙发、扶手椅、茶几、地毯、落地灯、绿植和装饰架，大面积玻璃窗与金属框架提升空间通透感，整体采用米金、深灰、黑金配色，氛围优雅安静、奢华高级、干净明亮，高质量室内空间概念图，现代新中式豪华酒店大堂设计，电影级写实 3D 渲染风，超高细节，水晶、金属、大理石、玻璃、布艺和木质材质清晰，暖色柔和灯光，真实反射，广角镜头，中心对称构图，强纵深感，横版宽幅画面，画面比例 16:9，适合游戏场景背景或现代酒店大堂', '[]'::jsonb, 'active', FALSE, '2026-06-13T14:46:09.295Z', NOW()
)
ON CONFLICT (id) DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  category = EXCLUDED.category,
  folder = EXCLUDED.folder,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  tags_json = EXCLUDED.tags_json,
  status = EXCLUDED.status,
  requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
  updated_at = EXCLUDED.updated_at;
WITH latest AS (
  SELECT COALESCE(MAX(version_number), 0) AS version_number
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000206'
), current_snapshot AS (
  SELECT 1
  FROM library_asset_versions
  WHERE library_asset_id = '51000000-0000-4000-8000-000000000206'
    AND metadata_json->>'officialConfigSnapshot' = 'official-asset-config-snapshot-20260701'
  LIMIT 1
)
INSERT INTO library_asset_versions (
  id, library_asset_id, version_number, storage_object_key, preview_url, mime_type, width, height, metadata_json, created_at
)
SELECT
  '8f5701e4-2042-472d-8fa7-10228f38c805', '51000000-0000-4000-8000-000000000206', latest.version_number + 1, 'official/scenes/scene-hotel.png', '/assets/library/official/scenes/scene-hotel.png', 'image/png', 1280, 720, '{"source":"official_seed_imagegen","display":{"title":"酒店","kicker":"灵曦剧场公共资产","metaRows":[],"description":""},"managedBy":"admin","sortOrder":100,"detailViews":{"main":"/assets/library/official/scenes/scene-hotel.png"},"detailViewItems":[{"key":"main","label":"主图","imageUrl":"/assets/library/official/scenes/scene-hotel.png","isDefault":true,"sortOrder":10,"thumbnailUrl":null}],"officialConfigSnapshot":"official-asset-config-snapshot-20260701"}'::jsonb, NOW()
FROM latest
WHERE NOT EXISTS (SELECT 1 FROM current_snapshot)
ON CONFLICT (id) DO UPDATE SET
  storage_object_key = EXCLUDED.storage_object_key,
  preview_url = EXCLUDED.preview_url,
  mime_type = EXCLUDED.mime_type,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  metadata_json = EXCLUDED.metadata_json;

COMMIT;
