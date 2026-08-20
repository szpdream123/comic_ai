UPDATE home_recommendation_videos
SET
  cover_url = replace(
    replace(cover_url, '/assets/library/official/scenes/', '/assets/library/official/scenes/home-thumbnails/'),
    '.png',
    '.webp'
  ),
  updated_at = now()
WHERE cover_url IN (
  '/assets/library/official/scenes/scene-3d-neon-street.png',
  '/assets/library/official/scenes/scene-3d-star-cliff.png',
  '/assets/library/official/scenes/scene-2d-lotus.png',
  '/assets/library/official/scenes/scene-3d-airship.png',
  '/assets/library/official/scenes/scene-3d-forest.png',
  '/assets/library/official/scenes/scene-2d-moon-bridge.png',
  '/assets/library/official/scenes/scene-3d-cyber-mall.png',
  '/assets/library/official/scenes/scene-3d-trial-gate.png',
  '/assets/library/official/scenes/scene-2d-sword.png',
  '/assets/library/official/scenes/scene-3d-railway.png',
  '/assets/library/official/scenes/scene-ancient-market.png',
  '/assets/library/official/scenes/scene-2d-starry.png',
  '/assets/library/official/scenes/scene-3d-cloud-office.png',
  '/assets/library/official/scenes/scene-3d-alchemy.png',
  '/assets/library/official/scenes/scene-2d-bamboo.png',
  '/assets/library/official/scenes/scene-3d-studio.png',
  '/assets/library/official/scenes/scene-2d-rooftop.png',
  '/assets/library/official/scenes/scene-3d-cave.png'
);
