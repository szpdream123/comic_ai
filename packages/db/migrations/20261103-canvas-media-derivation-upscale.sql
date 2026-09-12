ALTER TABLE creator_canvas_media_derivations
  DROP CONSTRAINT IF EXISTS creator_canvas_media_derivations_type_check;

ALTER TABLE creator_canvas_media_derivations
  ADD CONSTRAINT creator_canvas_media_derivations_type_check CHECK (
    derivation_type IN ('crop','outpaint','slice','composite','remove_background','upscale','free_view','camera_studio','screenshot')
  );
