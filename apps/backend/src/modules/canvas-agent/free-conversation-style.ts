import type { SqlDatabase } from "../shared/db/sql.ts";

export const VISUAL_STYLES = [
  { id: "realistic", label: "真人写实", pattern: /真人写实|真人实拍|写实风格|写实画风|photorealistic|live[- ]action/gi, instruction: "真实演员与实景摄影，自然皮肤纹理、真实人体比例、自然光影和摄影镜头质感；不要动漫、卡通或插画渲染。" },
  { id: "anime", label: "日系动漫", pattern: /日系动漫|动漫风格|动漫画风|二次元|anime/gi, instruction: "二维动画角色与手绘线条，赛璐璐色彩和动画光影，保持角色设计统一。" },
  { id: "3d", label: "3D动画", pattern: /3d动画|3d卡通|三维动画/gi, instruction: "三维动画造型、立体材质和动画灯光，保持角色与场景渲染风格统一。" },
  { id: "watercolor", label: "水彩插画", pattern: /水彩插画|水彩风格|水彩画风/gi, instruction: "水彩纸质感、透明水色晕染与手绘笔触，柔和层次，保持插画质感。" },
  { id: "ink", label: "国风水墨", pattern: /国风水墨|水墨风格|水墨画风/gi, instruction: "中国水墨笔触、墨色浓淡、宣纸肌理与留白，保持水墨画面语言。" },
  { id: "pixel", label: "像素艺术", pattern: /像素艺术|像素风格|像素画风|像素风/gi, instruction: "清晰像素网格、有限调色板与像素角色造型，保持像素尺寸和画面语言统一。" },
];
type Style = typeof VISUAL_STYLES[number];
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function inferVisualStyle(text: string): Style | undefined {
  const header = /【画面风格：([^】]+)】/.exec(text);
  if (header) return VISUAL_STYLES.find(style => style.label === header[1]) ?? inferVisualStyle(header[1]) ?? { id: header[1], label: header[1], pattern: /$^/gi, instruction: "" };
  let found: { style: Style; index: number } | undefined;
  for (const style of VISUAL_STYLES) for (const match of text.matchAll(style.pattern)) {
    if (/(?:不|不要|避免|禁止|并非|不是)[^，。；;\n]*$/.test(text.slice(0, match.index).split(/而是|改成|改为|换成/).at(-1)!)) continue;
    if (!found || match.index! > found.index) found = { style, index: match.index! };
  }
  return found?.style;
}

export function resolveVisualStyles(messages: unknown) {
  const styles = { image: VISUAL_STYLES[1], video: VISUAL_STYLES[1] };
  for (const raw of Array.isArray(messages) ? messages : []) {
    const message = record(raw);
    if (message.role !== "user") continue;
    const text = String(record(message.content).text ?? "");
    const projectStyle = /^(?:\/[\w-]+\s+)?创作风格：([^\n。]+)。\r?\n风格描述：("[^\n]+")/m.exec(text);
    let body = text;
    if (projectStyle) {
      try {
        const instruction: unknown = JSON.parse(projectStyle[2]);
        if (typeof instruction === "string" && instruction.trim()) {
          const known = inferVisualStyle(projectStyle[1]);
          styles.image = styles.video = { id: known?.id ?? projectStyle[1], label: projectStyle[1], pattern: /$^/gi, instruction };
          body = text.replace(projectStyle[0], "");
        }
      } catch { /* Malformed style details still pass through normal user-text parsing. */ }
    }
    for (const clause of body.split(/[。；;\n]/)) {
      if (clause.startsWith("风格描述：")) continue;
      if (/[吗么?？]|是不是|是否/.test(clause) && !/请(?:帮我)?(?:生成|制作|改|用|画)|帮我(?:生成|制作|改|画)|改成|改为|采用|使用|创作风格[：:]/.test(clause)) continue;
      const style = inferVisualStyle(clause);
      if (!style) continue;
      const imageOnly = /图片|生图/.test(clause) && !/视频/.test(clause);
      const videoOnly = /视频/.test(clause) && !/图片|生图/.test(clause);
      if (!videoOnly) styles.image = style;
      if (!imageOnly) styles.video = style;
    }
  }
  return styles;
}

export function bindVisualStyle<T extends Record<string, unknown>>(input: T, styles: ReturnType<typeof resolveVisualStyles>): T {
  if (input.kind !== "image" && input.kind !== "video") return input;
  const request = record(input.request);
  const field = ["prompt", "text", "motionPrompt"].find(key => request[key] != null);
  if (!field || typeof request[field] !== "string" || !String(request[field]).trim()) return input;
  const style = styles[input.kind];
  return { ...input, request: { ...request, [field]: `【画面风格：${style.label}】\n${style.instruction}\n本次画风优先于旧设定；以下内容如含其他画风，仅保留人物、场景与动作要求。\n\n${request[field]}` } };
}

export async function conflictingReferenceStyles(db: SqlDatabase, conversationId: string, fileGrantIds: string[], style: Style) {
  if (!fileGrantIds.length) return [];
  const result = await db.query<{ id: string; prompt: string }>(`
    SELECT g.id, COALESCE(step.input_json->'request'->>'prompt',step.input_json->'request'->>'text',step.input_json->'request'->>'motionPrompt') AS prompt
    FROM canvas_agent_file_grants g
    JOIN ai_generation_task_snapshots snapshot ON snapshot.target_id=g.conversation_id
      AND snapshot.canvas_project_id=g.canvas_id AND snapshot.user_id=g.owner_user_id
      AND snapshot.target_type='canvas_agent_conversation' AND snapshot.status='succeeded'
      AND snapshot.result_assets_json @> jsonb_build_array(jsonb_build_object('storageObjectId',g.storage_object_id::text))
    JOIN canvas_agent_steps step ON step.generation_task_id=snapshot.task_id
    WHERE g.conversation_id=$1 AND (g.id::text=ANY($2::text[]) OR g.storage_object_id::text=ANY($2::text[])) AND g.status='active'`, [conversationId, fileGrantIds]);
  return result.rows.filter(row => {
    const source = inferVisualStyle(String(row.prompt ?? ""));
    return source && source.id !== style.id;
  });
}
