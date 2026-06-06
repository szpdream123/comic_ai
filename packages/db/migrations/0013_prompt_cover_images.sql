ALTER TABLE storyboard_prompt_packages
  ADD COLUMN IF NOT EXISTS cover_image_url text NULL;

ALTER TABLE image_prompt_styles
  ADD COLUMN IF NOT EXISTS cover_image_url text NULL;
