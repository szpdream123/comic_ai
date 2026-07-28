import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { ZipArchive, type Archiver } from "archiver";

export interface JianyingDraftClip {
  storyboardId: string;
  title: string;
  fileName: string;
  durationUs: number;
  width: number;
  height: number;
}

export interface JianyingDraftPackageClip extends JianyingDraftClip {
  sourceFilePath: string;
}

export interface StoryboardVideoPackageClip {
  fileName: string;
  sourceFilePath: string;
}

type IdFactory = () => string;

export function buildJianyingDraftContent(input: {
  draftName: string;
  width: number;
  height: number;
  fps?: number;
  clips: JianyingDraftClip[];
  idFactory?: IdFactory;
}) {
  if (!input.clips.length) {
    throw new Error("jianying_draft_requires_clips");
  }
  const idFactory = input.idFactory ?? randomUUID;
  const draftId = idFactory();
  const trackId = idFactory();
  let timelineStartUs = 0;
  const videos: Record<string, unknown>[] = [];
  const speeds: Record<string, unknown>[] = [];
  const segments: Record<string, unknown>[] = [];

  for (const clip of input.clips) {
    assertValidClip(clip);
    const materialId = idFactory();
    const speedId = idFactory();
    const segmentId = idFactory();
    const assetPath = `assets/video/${clip.fileName}`;
    videos.push({
      audio_fade: null,
      category_id: "",
      category_name: "local",
      check_flag: 63487,
      crop: {
        upper_left_x: 0,
        upper_left_y: 0,
        upper_right_x: 1,
        upper_right_y: 0,
        lower_left_x: 0,
        lower_left_y: 1,
        lower_right_x: 1,
        lower_right_y: 1,
      },
      crop_ratio: "free",
      crop_scale: 1,
      duration: clip.durationUs,
      height: clip.height,
      id: materialId,
      local_material_id: "",
      material_id: materialId,
      material_name: clip.fileName,
      media_path: "",
      path: assetPath,
      type: "video",
      width: clip.width,
    });
    speeds.push({
      curve_speed: null,
      id: speedId,
      mode: 0,
      speed: 1,
      type: "speed",
    });
    segments.push({
      enable_adjust: true,
      enable_color_correct_adjust: false,
      enable_color_curves: true,
      enable_color_match_adjust: false,
      enable_color_wheels: true,
      enable_lut: true,
      enable_smart_color_adjust: false,
      last_nonzero_volume: 1,
      reverse: false,
      track_attribute: 0,
      track_render_index: 0,
      visible: true,
      id: segmentId,
      material_id: materialId,
      target_timerange: {
        start: timelineStartUs,
        duration: clip.durationUs,
      },
      source_timerange: {
        start: 0,
        duration: clip.durationUs,
      },
      common_keyframes: [],
      keyframe_refs: [],
      speed: 1,
      volume: 1,
      extra_material_refs: [speedId],
      is_tone_modify: false,
      clip: {
        alpha: 1,
        flip: { horizontal: false, vertical: false },
        rotation: 0,
        scale: { x: 1, y: 1 },
        transform: { x: 0, y: 0 },
      },
      uniform_scale: { on: true, value: 1 },
      hdr_settings: { intensity: 1, mode: 1, nits: 1000 },
      render_index: 0,
    });
    timelineStartUs += clip.durationUs;
  }

  return {
    canvas_config: {
      height: input.height,
      ratio: "original",
      width: input.width,
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: "",
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      multi_language_current: "none",
      multi_language_list: [],
      multi_language_main: "none",
      multi_language_mode: "none",
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: "",
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    duration: timelineStartUs,
    extra_info: null,
    fps: input.fps ?? 30,
    free_render_index_mode_on: false,
    group_container: null,
    id: draftId,
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [],
      audios: [],
      effects: [],
      filters: [],
      handwrites: [],
      stickers: [],
      texts: [],
      videos: [],
    },
    last_modified_platform: jianyingPlatform(),
    materials: emptyMaterialCollections({ videos, speeds }),
    mutable_config: null,
    name: input.draftName,
    new_version: "110.0.0",
    platform: jianyingPlatform(),
    relationships: [],
    render_index_track_mode_on: false,
    retouch_cover: null,
    source: "default",
    static_cover_image_path: "",
    time_marks: null,
    tracks: [
      {
        attribute: 0,
        flag: 0,
        id: trackId,
        is_default_name: true,
        name: "video",
        segments,
        type: "video",
      },
    ],
    update_time: 0,
    version: 360000,
  };
}

export async function writeJianyingDraftPackage(input: {
  archivePath: string;
  draftName: string;
  width: number;
  height: number;
  fps?: number;
  clips: JianyingDraftPackageClip[];
  idFactory?: IdFactory;
}) {
  const folderName = sanitizeJianyingDraftFolderName(input.draftName);
  const draft = buildJianyingDraftContent(input);
  const meta = buildJianyingDraftMetaInfo({
    draftId: draft.id,
    draftName: input.draftName,
    durationUs: draft.duration,
  });
  await mkdir(dirname(input.archivePath), { recursive: true });
  await writeArchive(input.archivePath, (archive) => {
    archive.append(JSON.stringify(draft, null, 2), {
      name: `${folderName}/draft_content.json`,
    });
    archive.append(JSON.stringify(meta, null, 2), {
      name: `${folderName}/draft_meta_info.json`,
    });
    for (const clip of input.clips) {
      archive.file(clip.sourceFilePath, {
        name: `${folderName}/assets/video/${clip.fileName}`,
      });
    }
  });
  const archiveStats = await stat(input.archivePath);
  return {
    folderName,
    clipCount: input.clips.length,
    durationUs: draft.duration,
    sizeBytes: archiveStats.size,
  };
}

export async function writeStoryboardVideoPackage(input: {
  archivePath: string;
  folderName: string;
  clips: StoryboardVideoPackageClip[];
}) {
  if (!input.clips.length) {
    throw new Error("storyboard_video_package_requires_clips");
  }
  const folderName = sanitizePortableFileName(input.folderName, "MP4");
  await mkdir(dirname(input.archivePath), { recursive: true });
  await writeArchive(input.archivePath, (archive) => {
    for (const clip of input.clips) {
      if (!clip.fileName || /[\\/]/.test(clip.fileName)) {
        throw new Error("storyboard_video_package_file_name_invalid");
      }
      archive.file(clip.sourceFilePath, {
        name: `${folderName}/${clip.fileName}`,
      });
    }
  });
  const archiveStats = await stat(input.archivePath);
  return {
    folderName,
    clipCount: input.clips.length,
    sizeBytes: archiveStats.size,
  };
}

export function sanitizePortableFileName(value: string, fallback = "file") {
  const sanitized = String(value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 120);
  return sanitized || fallback;
}

function buildJianyingDraftMetaInfo(input: {
  draftId: string;
  draftName: string;
  durationUs: number;
}) {
  return {
    cloud_package_completed_time: "",
    draft_cloud_capcut_purchase_info: "",
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: "",
    draft_cloud_template_id: "",
    draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "",
    draft_cover: "",
    draft_deeplink_url: "",
    draft_enterprise_info: {
      draft_enterprise_extra: "",
      draft_enterprise_id: "",
      draft_enterprise_name: "",
      enterprise_material: [],
    },
    draft_fold_path: "",
    draft_id: input.draftId,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_from_deeplink: "false",
    draft_is_invisible: false,
    draft_materials: [0, 1, 2, 3, 6, 7, 8].map((type) => ({ type, value: [] })),
    draft_materials_copied_info: [],
    draft_name: input.draftName,
    draft_new_version: "110.0.0",
    draft_removable_storage_device: "",
    draft_root_path: "",
    draft_segment_extra_info: [],
    draft_type: "",
    tm_draft_cloud_completed: "",
    tm_draft_cloud_modified: 0,
    tm_draft_removed: 0,
    tm_duration: input.durationUs,
  };
}

function emptyMaterialCollections(input: {
  videos: Record<string, unknown>[];
  speeds: Record<string, unknown>[];
}) {
  return {
    ai_translates: [],
    audio_balances: [],
    audio_effects: [],
    audio_fades: [],
    audio_track_indexes: [],
    audios: [],
    beats: [],
    canvases: [],
    chromas: [],
    color_curves: [],
    digital_humans: [],
    drafts: [],
    effects: [],
    flowers: [],
    green_screens: [],
    handwrites: [],
    hsl: [],
    images: [],
    log_color_wheels: [],
    loudnesses: [],
    manual_deformations: [],
    masks: [],
    material_animations: [],
    material_colors: [],
    multi_language_refs: [],
    place_holders: [],
    placeholders: [],
    plugin_effects: [],
    primary_color_wheels: [],
    realtime_denoises: [],
    shapes: [],
    smart_crops: [],
    smart_relights: [],
    sound_channel_mappings: [],
    speeds: input.speeds,
    stickers: [],
    tail_leaders: [],
    text_templates: [],
    texts: [],
    time_marks: [],
    transitions: [],
    video_effects: [],
    video_trackings: [],
    videos: input.videos,
    vocal_beautifys: [],
    vocal_separations: [],
  };
}

function jianyingPlatform() {
  return {
    app_id: 3704,
    app_source: "lv",
    app_version: "5.9.0",
    os: "windows",
  };
}

function assertValidClip(clip: JianyingDraftClip) {
  if (!clip.fileName || /[\\/]/.test(clip.fileName)) {
    throw new Error("jianying_clip_file_name_invalid");
  }
  if (!Number.isFinite(clip.durationUs) || clip.durationUs <= 0) {
    throw new Error("jianying_clip_duration_invalid");
  }
  if (!Number.isFinite(clip.width) || clip.width <= 0 || !Number.isFinite(clip.height) || clip.height <= 0) {
    throw new Error("jianying_clip_dimensions_invalid");
  }
}

function sanitizeJianyingDraftFolderName(value: string) {
  return sanitizePortableFileName(value, "Jianying Draft").slice(0, 80);
}

async function writeArchive(
  archivePath: string,
  populate: (archive: Archiver) => void,
) {
  const output = createWriteStream(archivePath);
  const archive = new ZipArchive({ store: true });
  const completed = new Promise<void>((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
    archive.once("error", reject);
  });
  archive.pipe(output);
  populate(archive);
  await archive.finalize();
  await completed;
}
