// Uses DATABASE_URL loaded from the project's .env. Default: prepare a reviewable draft.
// --apply publishes the exact reviewed proposed.json, guarded by compare-and-swap.
// --rollback restores this revision only if no subsequent edit has occurred.
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ids = ['bbefb9a0-8bfa-4e3c-a46b-c6639ea3fb80', '26caeb11-2c9f-4a8d-b08d-158cf2084aef', '96bff848-7652-4238-bc65-890b73f510d0'];
const output = resolve('.local/run/lingxi-shot-quality-20260927-v2');
const targets = ['SKILL.md', 'references/shot.md', 'references/分镜.md'];
const marker = '## 分镜源头输出规则（2026-09-27 质量优先版）';
const style = '统一风格在本段 <Asset_Setup> 的「本段风格」中简述一次（含已指定年代、关键材质）；仅当输入明确说明下游会附加同一风格时可省略重复文字，各镜局部差异仍须保留。禁止用内部融合代替实际传递。';
const rules = `${marker}

本节只约束分镜输出，不改变剧本、角色、场景、道具生成流程。分镜阶段以输入已定事实、动作和镜头数值为准；以下保真与技术分段规则优先于后文通用规则（即使标为“强制”）。后文防崩、光影、站位、运镜与继承惯例仅补充未指定项，不得改掉已给光比、合理运动形成的站位变化等源事实；实际要求矛盾时按冲突规则报告，不偷偷取舍。
- 信息完整优先：篇幅由剧情、台词和镜头信息密度决定，不设置与当前模型无关的固定字数目标，不为凑字扩写。只删完全重复的表达、字段装饰和检查报告，不删执行要求，不为变短删镜或额外拆段。
- 若输入明确给出可用正文预算及计量单位，按该预算规划，尽量预留约15%余量，但不能为余量牺牲信息；已给正文预算时不重复扣除开销。只有模型上限而没有系统开销时，不假定全部可用于正文。标题、引用、空格、换行和负面词均计入；字符、字节、token不可混算。实际是否合限仍由系统对最终拼接提示词校验，不以模型自行数数代替。
- 内部先建立必保清单，输出后逐项核对对应位置：人物身份与已定外观；本段涉及的场景、道具名称及形制/材质/数量/持物者；动作主体、对象、方向、速度、力度及因果顺序；完整原台词、说话人、语气音量、音色与发声方式；时码和总时长；空间背景绑定、伤势/湿度/持物状态；已给景别、机位、焦段光圈、运镜、构图、焦点、主光方向等关键数值；统一风格与局部差异；必要负面约束。引用存在或台词字符存在不等于保真。
- 先判断输入模式。输入已是完整分镜时，以原文沿用为默认：在可用预算内保留每镜全部原句、顺序、时码和细节，只补缺失的解析标记；不要为了套用三字段或压字数重写。用户要求去重时，只合并完全相同且作用范围一致的公共项，明确适用人物/镜头；不同背景、构图或限定词不可合并。确实无法无损容纳时保留原稿并单独指出预算冲突，不擅自改镜、删句或改时长。输入为剧本时才规划镜头，可补必要的机位、运镜和光照，但不得新增剧情事件、人物外观或道具事实。未绑定图片的配角、群众仍须保留名称、衣着、携物和群体行为，资产清单仅约束真实素材引用，不能成为出场者白名单。
- 动作、声音和空间限定词不得被其他维度替代：慢推镜不等于人物缓缓合书，低沉音色不等于轻声说话。画面内开口台词保持对应人物口型；跨镜切听众或物件时明确原说话人画外续说，不把有声台词改成内心OS，不在说话人面部镜头上含糊标画外音。背景随人物和有依据的机位变化，不能互换人物绑定背景。
- 身体部位、左右、伤势和物件名称属于事实词，沿用输入原词，不作近义改写，例如“左臂受伤”不能改成“左手受伤”。声音触发反应时，动作字段明确写“听到该声音后再……”；声音字段写明触发声先发生，不靠三个字段的排列暗示先后。
- 每段独立可执行：公共外观、声音、光照、站位、背景和承接状态写在段首一次，适用于本段全部镜头；单镜写动作、台词、调度、变化与例外，必要时简短重申关键锚点。跨段不能只写“同上”。${style}
- 保留【分镜 N】、<Asset_Setup>、【镜头 N】【时间范围】、【负面词约束】及【@名称】格式。画布真实 @{id:label} 引用逐字保留，禁止编造；同一引用不得改绑实体。台词引号内部的【@名称】、【@图N】也是人物指代，必须连同台词原文逐字保留，不能以标记不可朗读为由删除、替换代词或猜测姓名。仅实际随请求提供的参考素材可替代可见的重复外观描述，文字明确指定的关键属性、声音、动作、伤势和持物变化仍须写出。角色、场景、道具名称来自输入，不凭空补服装发型和关键道具属性。
- 十项镜头要素仍作为内部检查维度，不打印十项编号和加号公式。从剧本新规划时，每镜分“画面、动作、声音”三个字段，篇幅按需要分配：画面容纳必要景别机位、焦段光圈、运镜、构图焦点、背景光线；动作独立写主体、对象、速度力度、起止点与持物变化；声音独立写说话人、原台词、音色/音量/发声方式及已有环境音。已有完整分镜沿用原格式，不能为改成三字段丢内容。公共项仍只写段首，不因分字段重复整套设定。七线自检、过程说明、场记备注和重复总结不输出。负面词合并一段，通用、类型及本段特定风险均须有明确表达，不以泛用一句代替具体要求；不能禁止剧情本来要求出现的字幕、文字、角色或声音。
- 保持剧情事件因果顺序。同一事件内部允许机位切换、反应镜、动作覆盖和连续台词跨镜；不能为凑镜数提前或重复执行事件。例如先听到脚步再转头，不能提前转头后又重演。镜头调度不应凭空新增剧情或改变动作结果。
- 仅在新分镜规划阶段、真实可用正文预算或实际时长限制确实不足时，按完整动作/台词边界技术分段；未知硬上限时不按臆造的字数或时长阈值强拆。技术分段保留剧情、全部台词、动作顺序和有效总时长，各段简洁重述必要资产与状态；直接接续未发生的动作和台词，不加1–2秒回放、不复读尾字，不受“第二镜才推进”的惯例限制。只有输入明确要求的叙事回顾或承接镜头才保留其已给时长。
- 输入已有镜头时码时原样保留，不为精简重排、改时长或删镜；新规划的技术分段使用连续的全局时码或可还原的局部时码，不重复占用有效时长。源输入出现总时长与时码不符、对白时长不足等冲突时，不默改事实或伪称已满足，保留要求并单独简短指出冲突，不把诊断文字混入视频提示词正文。
- 未指定模型时以上只是源头去重，不能宣称适配所有模型；已保存分镜不自动改写，不自行调用AI精简或发起图片/视频生成。
`;

function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length - 1, 1, `Expected one anchor: ${from}`);
  return text.replace(from, to);
}
function replaceLine(text, prefix, value) {
  const lines = text.split('\n');
  assert.equal(lines.filter(line => line.startsWith(prefix)).length, 1, `Expected one line: ${prefix}`);
  return lines.map(line => line.startsWith(prefix) ? value : line).join('\n');
}

function patch(source, main) {
  const oldRules = /## 分镜源头精简规则（2026-09-26）\n[\s\S]*?(?=\n(?:\*\*【系统指令】\*\*|#))/g;
  assert.equal([...source.matchAll(oldRules)].length, 1, 'Missing previous revision');
  let text = source.replace(oldRules, rules);
  text = text.replaceAll('输入为剧本时才规划镜头', '输入为剧本或当前工作流允许的叙述体原文时才新规划镜头')
    .replaceAll('从剧本新规划时', '从剧本或当前工作流允许的叙述体原文新规划时')
    .replaceAll('尽量预留约15%余量，但不能为余量牺牲信息', '在必要信息全部保留后可留少量余量，不固定按比例压缩正文')
    .replaceAll('不按臆造的字数或时长阈值强拆。', '不按臆造的字数或时长阈值强拆。新规划有输入指定承接镜头时，该时段只承接状态，新的动作从承接结束后开始。');
  text = text.replaceAll('声音独立写说话人、原台词、音色/音量/发声方式及已有环境音。', '声音独立写说话人、原台词、音色/音量/发声方式及已有环境音；台词只在声音字段出现一次，动作字段不再次抄写同一句台词。')
    .replaceAll('未绑定图片的配角、群众仍须保留', '不得输出【@场景名】、【@道具名】等模板占位引用。未绑定图片的配角、群众用原名称明文保留，仍须保留');
  if (main) {
    text = text.replaceAll('且必须有推拉摇移', '；是否运镜服从叙事与输入，固定长镜同样可用');
    text = text.replaceAll('柔光漫反射，光比2:1，禁止硬光', '沿用输入光质与光比；未指定才按场景选择，例如柔光2:1；不覆盖有意设计的硬光或高反差')
      .replaceAll('分镜阶段优先用用户清单做名称许可池。', '分镜阶段以用户清单绑定真实素材引用；原文中未绑定素材的配角与群众仍按原名称、属性和行为保留。')
      .replaceAll('长镜头隔段去重：上段用过 5–6 秒长镜头，本段禁用。', '长镜头按叙事与表演需要选择，不因上段使用过就改变输入已定镜头；未指定时避免机械重复。')
      .replaceAll('分镜里极端情绪禁止「张嘴尖叫 / 面目狰狞」等毁容词', '分镜里避免非预期五官畸变，但原文明确的张嘴尖叫、愤怒或哭喊动作及声音必须保留，不替换成另一动作');
    text = text.replaceAll('全局视听风格只作内部融合，**禁止写入对外输出**。', style)
      .replaceAll('全局视听风格只作内部融合，**禁止写入节点 prompt**。', style)
      .replaceAll('分镜全局视听风格未指定则内部按「电影级写实」融合，禁止写入对外输出', '分镜风格未指定则「电影级写实」；按段首规则写入 Asset_Setup，一次传递')
      .replaceAll('风格一致性只在内部检查，不输出风格自检文字，不在每镜重复通用风格。', '内部检查风格一致性；实际风格按段首规则传递，不打印检查报告、不在每镜重复。')
      .replaceAll('长场可按预算拆成连续分镜', '长场仅按真实硬限制拆成连续分镜')
      .replaceAll('超出长度预算时按情节点分段', '仅超出已知真实正文预算时按情节点技术分段')
      .replaceAll('超过正文预算时拆成连续分镜节点', '仅超过已知真实正文预算时拆成连续分镜节点')
      .replaceAll('精简后仍超过正文预算', '无损去重后仍超过已知真实正文预算')
      .replaceAll('明显超过 30 秒或无损去重后仍超过已知真实正文预算', '超过已知真实模型时长上限或无损去重后仍超过已知真实正文预算')
      .replaceAll('超 30 秒按情节点切', '30秒只作规划参考；仅超出已知真实模型时长或正文上限才按情节点切')
      .replaceAll('执行场记前情顺接与物理状态嫁接', '继承物理状态；技术分段直接接续，不新增回放或重复台词，叙事已要求的承接镜按输入保留');
    text = text.replaceAll('景别与机位，必要焦段光圈、运镜；【@角色名】按段首设定完成具体动作与表情，说：“原台词”；写明必要构图、焦点、状态变化和局部光线差异。', '画面：必要景别、机位、焦段光圈、运镜、构图、焦点、背景与局部光线。\n动作：【@角色名】完成具体动作，保留动作速度力度、起止点和状态变化。\n声音：【@说话人】沿用段首音色，保留音量/语气/发声方式：“该镜原台词”；保留已给环境音，无台词就不编造。');
  } else {
    text = replaceOnce(text, '## 核心基础约束（最高优先级，禁止大模型篡改）', '## 新规划镜头参考（源事实与用户明确要求优先）\n\n以下防崩、景别、动静交替、长镜去重、光比和语速规则只用于从剧本新规划且输入未指定的部分，不作为改写已有分镜的理由。已有时码、固定长镜、连续静态机位、硬光/光比、情绪动作、站位变化与风格按输入保留；不以通用建议覆盖。示例人物、服装、场景和参数不得复制进无关剧情。');
    text = replaceOnce(text, '{必须写入柔光漫反射，光比2:1，绝对禁止硬光}', '{沿用输入光质与光比；未指定时按场景选择，可参考柔光2:1；明确的硬光或高反差设计照用并保留面部细节}');
    text = replaceLine(text, '2. **防崩避坑红线**', '2. **面部细节保护**：输入未指定打光时优先选择可辨认五官的照明；输入明确硬光、深阴影或高反差时保留设计及数值，只补充防止非预期五官变形的约束。');
    text = replaceLine(text, '3. **正面替换词**', '3. **光影选择**：柔光漫反射、光比2:1或侧逆光是未指定时的可选方案，不能替代输入已有光质、方向、色温与光比。');
    text = replaceLine(text, '**🔧 接口调用建议**：必须让AI强行', '**🔧 光影要求**：沿用输入明确的光质、方向和光比，仅对未指定部分按场景补充合理照明，防止非预期的面部细节丢失。');
    text = text.replaceAll('{脸部或环境的阴影分布，避免死黑深阴影}', '{沿用输入的阴影设计，防止非预期细节丢失，不把有意的深阴影改成柔光}');
    text = replaceLine(text, '2. **打破面瘫正反打的两大武器', '2. **细节与环境镜头**：新规划可在台词停顿、情绪转折时按需要使用细节特写或带人环境镜，不强插、不设置次数配额，不覆盖已定镜头。');
    text = replaceLine(text, '**⚠️【特殊镜头防滥用与跨段去重锁】', '**特殊镜头使用**：同部位特写可服务于连续动作或情绪对照；避免无意义重复，不因跨段重复就替换原文镜头或跳过关键动作。');
    text = replaceLine(text, '⚠️【文戏对峙特权】', '文戏可按表演与对话需要使用连续固定镜头，不限于对峙，不设置两镜配额；避免无叙事作用的停滞。');
    text = replaceLine(text, '4. **Z轴深度构图**', '4. **空间层次**：新规划按场景选用过肩、前后层次或其他构图，不强制所有双人镜头使用OTS；已有构图保持原样。');
    text = replaceLine(text, '4. **30度机位平移法则**', '4. **机位变化**：新规划避免无意跳切，30度变化只作可选参考；已有同轴推镜、固定机位或有意跳切不改动。');
    text = replaceLine(text, '- **空间线**', '- **空间线**：核对站位、背景、视线与位移过程连续，保留输入有依据的位置交换或越轴；不锁死初始左右。');
    text = replaceLine(text, '- **画面线**', '- **画面线**：已有景别、机位、构图与焦点保持原样；新规划采用适合情节的镜头语言，不套景别/30度/OTS配额。');
    text = replaceLine(text, '8. **空间是否跳轴？**', '8. **空间连续性**：原文站位、人物背景和移动过程是否保留？有意越轴照用并保持空间可理解，未给移动依据时不让人物瞬移。');
    text = replaceLine(text, '- **⚠️长镜头复杂度红线**', '- **长镜头信息量**：新规划按动作、表演与空间信息决定时长。固定长镜可承载完整表演、沉默与情绪变化，不能因为达到5秒就强拆或强加运镜；避免没有叙事意义的等待。');
    text = replaceLine(text, '*(⚠️慎用提醒与【跨段去重锁】', '长镜头按叙事需要使用；跨段检查重复信息，不机械禁止连续长镜，也不为满足运镜配额增加剧情。已有镜头按输入保留。');
    text = replaceLine(text, '1. **景别跳跃法则', '1. **景别衔接**：新规划根据情绪与关注点选择景别变化，避免无意跳切。已给机位和景别按输入保留，不强制隔一别切换。');
    text = replaceLine(text, '3. **动静交替公式', '3. **动静节奏**：新规划以叙事与表演需要选择固定或运动镜头，动静交替只作可选方法。连续固定镜头可用于完整表演和对话，不强行插入推拉摇移；已给运镜与衔接方向原样保留。');
    text = replaceLine(text, '2. **轨道二', '2. **轨道二：极端爆发情绪**：保留原文明确的喊叫、哭泣等表演动作及声音强度，同时约束非预期五官畸变。不能用闭嘴、喘息或肢体动作替换原本的张嘴喊叫，不按固定比例削减情绪。');
    text = replaceLine(text, '3. **精准代偿替换法**', '3. **辅助表演**：仅在输入未指定表演动作时，可结合合理的肢体细节表达情绪；不能替换已有动作、改变发声方式或新增会影响因果的事件。');
    text = replaceLine(text, '1. **180度轴线死锁', '1. **轴线连续性**：先建立人物与机位的空间关系，避免无动机跳轴。原文明确的移动、越轴镜头或左右位置变化须保留并交代过程，不能强行锁回初始位置。');
    text = replaceLine(text, '5. **视线与重心锁定**', '5. **视线与重心**：沿用输入既定朝向与视线。未指定时按交互对象安排合理姿态；不能把原文背对、回避目光或低头改成持续对视。');
    text = replaceLine(text, '**物理语速限制与长台词跨镜拆解法则**', '**对白时长核对**：按每镜实际时长、语气和停顿估算可说完程度，普通语速4–5字/秒仅供新规划参考，不设置每镜12字的固定上限。新规划需要跨镜时，将原句分成不重叠的连续片段，明确画内说话或原说话人画外续说。已有时码不足时保留时码和原句，在正文外指出冲突，不缩字、不加速承诺、不偷偷改时长。');
    text = replaceLine(text, '建议每镜 2-3 秒不等', '新规划按动作与完整对白分配镜头时长，2–3秒短镜和更长镜头均可按需要使用，不凑镜数。时间码须首尾相接；已有时码原样保留，不以长镜去重或动静配额为由重排。');
    text = replaceLine(text, '- **光线线**', '- **光线线**：核对输入主光、光质、光比、色温和局部差异均已传递；未指定才采用默认方案，不把所有镜头改成柔光。');
    text = replaceLine(text, '- **运镜线**', '- **运镜线**：已给机位、运镜与方向是否保留？新规划的调度是否服务剧情，是否为套公式强改动作或插入无意义镜头？');
    text = replaceLine(text, '- **表演线**', '- **表演线**：表情、动作强度、发声方式是否忠实原文？肢体补充不能替换原定表演。');
    text = replaceLine(text, '- **台词线**', '- **台词线**：原句、说话人、声音与画内/画外归属是否完整？逐镜台词顺序拼接是否与输入逐字一致且只出现一次？');
    text = replaceLine(text, '2. **运镜节奏与防PPT检查**', '2. **运镜节奏**：已给运镜与固定机位保持原样；新规划避免无意义重复，允许剧情需要的连续固定镜头。');
    text = replaceLine(text, '3. **时间码与长镜头去重**', '3. **时间码与长镜头**：已有时码与总时长是否完整保留？新规划时长是否覆盖动作与对白，技术分段是否直接续接且未重复占用时长？');
    text = replaceLine(text, '6. **台词与物理语速限制**', '6. **对白容量**：按实际镜长、语气与停顿检查对白，不套固定12字上限；源文时长矛盾只另行报告，不静默删改。');
    text = replaceLine(text, '7. **情绪防崩机制**', '7. **情绪与形体**：保留源文情绪强度、面部动作、声音及肢体状态，仅限制非预期畸变，不能用代偿删改剧情表演。');
    text = replaceLine(text, '- **风格自适应微调', '- **风格自适应微调（Fusion）**：融合用户风格与剧本年代、环境，并按段首规则将简短结果写入 Asset_Setup；仅输入明确说明下游附加同一风格时省略重复，不假定所有路径都会补齐。');
    text = replaceLine(text, '- **最高视觉纲领建立', '- **最高视觉纲领建立**：用户指定风格优先；已给年代、关键材质与光照要求归入段首，不打印独立的 `### 🎬 全局视听风格` 长模块。');
    text = replaceLine(text, '- **禁止擅自续写', '- **禁止擅自续写**：只覆盖指定剧情。新规划仅因已知真实模型长度或时长限制不足才技术分段，不按臆造字数阈值拆段，不删动作或台词；既有镜头时码按输入保留。');
    text = replaceOnce(text, '系统会检测你是否处于“继承段落”。如果是，你必须执行：', '继承段落先区分技术分段与叙事承接：技术分段首镜直接接续未完成的动作与台词，无额外回放、尾字重复或新增时长；输入明确要求的叙事承接保留其时长。以下 Shot 1/Shot 2 惯例仅适用于叙事本来要求回顾、且未给具体时长的情形，不用于技术分段：');
    text = replaceLine(text, '- **场记继承铁律', '- **场记继承铁律 (Shot 1)**：技术分段首镜承接状态后立即推进未发生动作，不重演上段末镜。叙事明确要求回顾时才使用回顾镜头：输入已给承接时长则照用，否则可规划1–2秒。未提供上一句台词就不得编造拖尾；输入指定无台词或无声时不得加入台词拖尾。任何声音桥接只能延续尚未说完的部分，不重复已说完的尾字。');
    text = replaceLine(text, '- **顺接起跳', '- **顺接起跳**：技术分段从第一镜推进新内容；有输入明确要求的叙事承接镜时，从该承接结束处推进，不强制套用“第二镜”。');
    text = replaceOnce(text, '【@角色B】: 必要发型/服装/声音音色', '【@角色B】: 必要发型/服装/声音音色\n【@场景名】: 本段所用场景的已知空间特征\n【@道具名】: 本段所用道具的已定形制/材质/数量及持物关系（逐项保留，不编造；不涉及的资产不输出）\n**本段风格**: {用户指定风格、已给年代与关键材质；仅明确由下游附加的同一风格可省略重复；各镜差异另写}');
    text = replaceLine(text, '1. **格式与长度**', '1. **格式与长度**：保留分镜编号、Asset_Setup、时间码和引用；篇幅服从信息完整。仅新规划遇到真实预算不足才按完整动作/台词边界技术分段；已有完整分镜默认原文沿用，不能为了缩短删改必保信息。');
    text = replaceLine(text, '- **风格线**', '- **风格线**：Asset_Setup 中是否实际传递统一风格、年代和关键材质，或输入明确由下游附加同一风格？单镜差异是否保留？不打印自检或独立风格长模块。');
    text = replaceOnce(text, '只补充本镜语气变化', '同时保留本镜已给语气、音量及发声方式');
    text = replaceLine(text, '景别、机位与必要焦段光圈', '画面：必要景别、机位、焦段光圈、运镜、构图、焦点、背景与局部光线。\n动作：【@角色A】的具体动作、作用对象、速度力度、起止点、表情与持物状态。\n声音：【@说话人】沿用段首音色，保留音量/语气和发声方式：“该镜原台词”；保留该镜已有环境音，无台词时明确无台词。');
    text = replaceLine(text, '按本段公共设定，改变景别与运镜', '画面：沿用公共设定，写本镜必要调度、构图、焦点和背景光线差异。\n动作：【@角色B】按剧情先后推进动作或反应，保留速度力度与状态变化，不重复上一镜已完成动作。\n声音：对应原说话人的本镜原台词或未说完的续句，保留音量/语气/发声方式，不重复已说片段；音效按输入先后进入。');
    text = replaceOnce(text, '**👉 【高级视听镜头写法案例参考】', '**跨镜台词不重叠**：将每位说话人的原句按时间只分配一次；若前镜已说完整句，后镜只写听众反应，不再续说其尾句。若需拆句，两镜只写各自不重叠的连续片段，按顺序拼接后必须与原句逐字一致；不能“前镜全句＋后镜后半句”。持物交接同样只发生一次，按原文先腾手/放下原物，再接取新物，不能提前接取后再重复交接。\n\n**👉 【高级视听镜头写法案例参考】');
    text = replaceOnce(text, '【镜头 2】【00:02.5 - 00:04.5】', '【镜头 2】【00:02.5 - 00:05】');
    text = replaceOnce(text, '画外音男主沿用既定音色：“就算逃到天涯海角，我也能把你抓回来。”', '画外音男主沿用既定音色续说：“就算逃到天涯海角，”');
    text = replaceOnce(text, '【镜头 3】【00:04.5 - 00:06】', '【镜头 3】【00:05 - 00:08】');
    text = replaceOnce(text, '倒影瞬间破碎。居中构图', '倒影瞬间破碎；画外音男主保持音色接完原句：“我也能把你抓回来。”居中构图');
    text = replaceLine(text, '中景过肩平拍，50mm', '画面：中景过肩平拍，50mm f/2.8，缓慢推镜；男主左、女主右背对，前景肩部遮挡。背景为红砖墙与昏黄路灯，焦点在男主面部；偏冷柔光，光比2:1，保留面部细节。\n动作：男主黑风衣、湿发贴额，微偏头、瞳孔收缩、咬肌隐现。\n声音：男主以低沉磁性男音冷笑：“你以为你能跑掉？”');
    text = replaceLine(text, '近景稍俯拍，85mm', '画面：近景稍俯拍，85mm f/1.8，固定；背景为水汽巷子，三分构图，焦点在女主睫毛；柔和侧顺光，暗部柔和过渡。\n动作：红裙女主绝望闭眼、胸腔急促起伏、身体剧烈瑟缩。\n声音：画外音男主沿用既定音色续说：“就算逃到天涯海角，”余句于下镜连续说完，不重复。');
    text = replaceLine(text, '俯拍细节特写，100mm', '画面：俯拍细节特写，100mm微距，缓慢上摇，与上一镜静切动衔接；湿滑柏油路水坑，居中构图，焦点跟随皮鞋；霓虹边缘柔和反光、高对比微距光影。\n动作：男主带泥黑皮鞋重踏水坑，倒影瞬间破碎。\n声音：画外音男主保持音色接完原句：“我也能把你抓回来。”');
    text += '\n9. **事实逐项保真**：按段首必保清单核对动作限定词、完整台词与说话人/口型、场景道具属性、空间状态和风格传递，不只检查引用与字数。技术分段是否未新增回放、台词拖尾和有效总时长？\n';
    text += '\n### 输出前最后一道事实核对（内部执行，不打印）\n先从输入提取“主体—动作—限定词—先后条件”和“说话人—原句—音量/音色—发声方式”，再对照逐镜输出逐项反查；只修正本次新规划引入的错误，原完整分镜自身冲突保留并单独报告。\n- 人物缓缓行走要写人物动作“缓缓”，不能只写运镜缓慢；输入轻声说话要保留音量，不能只保留音色。\n- 新规划时把触发声音写在首次反应之前或同镜中先声后动作，不允许先转头再补脚步。\n- 服饰、发型、道具颜色/尺寸等关键属性未提供就省略，不为填满资产模板编造；已给属性必须保留。人物移动后的背景须按起点到终点更新，不能无运动说明又回到原位。\n- 首镜无台词不得塞入未知台词拖尾；将输出台词按顺序拼接，与输入原句逐字比对，不能漏字或多出重复尾句；逐句核对说话人，不能改成内心OS。逐镜核对手中物状态：放下、递出、接取的时点不能提前、重复或跳过。\n- 若源输入已是完整分镜，逐镜反查背景与构图、坐站姿和配角属性；段首若没有等义承接，不能从该镜删除。\n- 风格须在正文段首实际出现，除非输入明确由下游附加同一风格。源总时长/时码或台词时长冲突另行简短标明，不静默改掉后宣称完全保真。\n';
  }
  if (!main) {
    text = replaceLine(text, '- **单镜时长建议与【长镜头特权】**', '- **单镜时长参考**：新规划按动作、对白、表演和空间调度分配时长；2–3秒短镜、5–6秒或更长的长镜均可按需要使用，不能将参考值当作硬上限，既定时间码照用。');
    text = text.replaceAll('... (持续拆解镜头，建议单镜2-3秒，需要丰富调度的长镜头可达5-6秒) ...', '...（按实际动作和对白继续规划镜头，时长服从叙事及已知模型限制，不套固定秒数）...');
    text = text.replaceAll('同时严格执行【标点符号=表演指令】：逗号代表微停顿试探，省略号代表喉咙卡住，问号代表尾音上扬。', '标点只辅助理解句意与停顿，表演服从原文语气和情境；不把逗号一律解释成试探、省略号一律解释成喉咙卡住，也不覆盖已给发声方式。');
    text = replaceLine(text, '**物理状态遗留**:', '**初始场记状态**（逐人填写输入已给事实，适用于本段第一镜）: {姓名：站立/坐下等姿态；具体位置与绑定背景；所持物及已知手别；伤势/湿度。未提供项省略，不默认空手、双手或整洁；物件来源未知就从原文第一次递出/出现开始，不补从怀中/腰间取出。}');
    text = replaceLine(text, '**【空间坐标与专属背景锁】**:', '**【空间坐标与专属背景锁】**: {沿用初始场记状态，写清已给左右位置、站坐姿与背景绑定；人物按剧情移动后同步更新，不能用只有左右坐标的一句代替已知姿态。}');
  }
  text += '\n新规划交付字段补充：段首必须填写“初始场记状态”，逐人保留已给姿态、具体位置/背景、持物和伤势；不是只给出左右坐标。每镜动作按“起态→原文动作与限定词→终态”写成自然短句，例如“人物站在窗边，缓缓合上手中书；书仍在手中”。未指定的衣服、左右手或物件收纳位置不填，不为镜头补设定。已有完整分镜不套此新规划字段，直接沿用原块。\n';
  text += '\n技术分段场记：下一段初始场记状态来自上一段终态，逐项带入人物姿态/位置、物件落点/持有者、伤势和光源，不回到整场初始位置。例：前段人物在左侧放下木箱，后段必须写“木箱已在左侧地面”，不能只写地面；右侧人物向箱子移动，终态及背景同步到左侧，不能仍锁定在右侧背景。只带入已发生事实，不重演动作。仅排版/原稿沿用模式不要新增初始场记表，尤其“门边不走动”不代表站立，也可能坐着；未给姿态不能填默认值。\n';
  text = text.replaceAll('必要发型/服装/声音音色', '输入已给的外观/服装/声音音色（未提供不补）');
  text = text.replaceAll('字幕水印及多余角色', '非剧情要求的字幕、水印及多余角色');
  text += '\n负面词交付规则：通用形体/画质异常和确实不希望出现的结果可列入负面词；剧情动作的正确先后、持物转移等关系写在对应正向动作字段，不转写成“避免A先于B”的负面句，以免否定方向翻转。逐条读作“不要发生该事项”复核，不能禁止输入要求发生的行为。已有原稿负面词原样沿用，矛盾另报。\n';
  text += '\n### 分镜输入分流与交付（分镜阶段先执行本段）\nA. 输入含逐镜正文与明确时间码，且没有明确要求重新设计镜头：直接沿用完整原稿，不进入上面的“新规划”与“三字段”生成流程。原稿在正文预算内时，只补缺失的解析标题和分镜编号，其余逐镜原句、背景、表演、光照参数与配角信息原样传递；“紧凑/优化”不能成为重写画面或添演动作的理由。完全重复的格式标签可以去掉，实质句子不得摘要。标题预估时长也是源事实，不能拿最后时码覆盖。总时长与时码不符、对白在既定镜长说不完时，在所有分镜标题之前用一行“源稿核对：……”分别说明冲突，正文保留原值与原句。这项必要冲突提示不受禁止解释性前言的通用要求限制。\nB. 输入为剧本或当前流程允许的原文，需要新规划：先在内部列“每人初始姿势/左右/背景/持物→只由原文动作导致的状态变化”清单，逐镜核对，最终段首明确已给站姿或坐姿。“站在窗边”不能只剩“在窗边”，“甲扶乙坐下”只能让乙坐下，甲不随之坐下；交接时物件在放下/递出/接住之前仍由原持有人握持。声音触发反应时，此前不能提前转头或看向声源。最后对照输入逐项检查限定词、完整台词只出现一次、动作因果、同框人物姿势及背景是否齐全，再交付三字段格式。\nC. 新规划过肩镜头时，明确谁在前景、谁是被拍主体，不能把同一人物同时写成前景肩膀和正面被拍者；模板人物名、场景名、参数仅供示例，不能用占位引用填充空缺。\n';
  assert.ok(text.includes(marker) && text.includes('同一事件内部允许'));
  assert.ok(!/只在事件之间安排镜头|风格只作内部融合|逐镜 10 字段|Layer [123]|【关键约束 7 线自检】/.test(text));
  return text;
}

function checkChanges(changes) {
  assert.deepEqual(changes.map(row => row.id).sort(), [...ids].sort());
  for (const row of changes) {
    const expectedFiles = row.before.files.map(file => targets.includes(file.name) ? { ...file, content: patch(file.content, file.name === 'SKILL.md') } : file);
    assert.equal(expectedFiles.filter(file => targets.includes(file.name)).length, 3);
    const main = row.before.files.find(file => file.name === 'SKILL.md');
    assert.equal(row.before.introduction.trim(), main.content.trim(), 'Introduction must mirror entry point');
    assert.deepEqual(row.after, { ...row.before, files: expectedFiles, introduction: expectedFiles.find(file => file.name === 'SKILL.md').content.trim() });
    assert.equal(expectedFiles.find(file => file.name === 'references/shot.md').content, expectedFiles.find(file => file.name === 'references/分镜.md').content);
  }
}

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  if (process.env.DATABASE_SCHEMA?.trim()) await db.query("SELECT set_config('search_path', format('%I, pg_catalog', $1::text), false)", [process.env.DATABASE_SCHEMA.trim()]);
  mkdirSync(output, { recursive: true });
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  assert.ok(!(apply && rollback));
  if (apply || rollback) {
    const rollbackFile = existsSync(resolve(output, 'applied.json')) ? 'applied.json' : 'rollback-backup.json';
    const changes = JSON.parse(readFileSync(resolve(output, rollback ? rollbackFile : 'proposed.json'), 'utf8'));
    checkChanges(changes);
    if (apply) {
      assert.ok(!existsSync(resolve(output, 'applied.json')), 'Already applied; preserve revision snapshot');
      const validation = JSON.parse(readFileSync(resolve(output, 'validation.json'), 'utf8'));
      assert.equal(validation.status, 'passed', 'Semantic validation has not passed; leaving published templates unchanged');
      assert.equal(validation.proposalSha256, createHash('sha256').update(JSON.stringify(changes)).digest('hex'), 'Validation is for another draft');
    }
    writeFileSync(resolve(output, 'rollback-backup.json'), JSON.stringify(changes));
    await db.query('BEGIN');
    for (const row of changes) {
      const result = await db.query('UPDATE skills SET detail_json=$2::jsonb,updated_at=now() WHERE id=$1 AND owner_user_id IS NULL AND status=\'published\' AND detail_json=$3::jsonb', [row.id, JSON.stringify(rollback ? row.before : row.after), JSON.stringify(rollback ? row.after : row.before)]);
      assert.equal(result.rowCount, 1, 'Concurrent edit or ownership/status change; aborting all updates');
    }
    await db.query('COMMIT');
    writeFileSync(resolve(output, rollback ? 'rolled-back.json' : 'applied.json'), JSON.stringify(changes));
    console.log(JSON.stringify({ operation: rollback ? 'rollback' : 'apply', workflows: changes.length, changedFiles: changes.length * 3 }));
  } else {
    assert.ok(!existsSync(resolve(output, 'applied.json')), 'Revision already applied; do not overwrite review snapshots');
    const { rows } = await db.query('SELECT id,name,detail_json FROM skills WHERE id=ANY($1::uuid[]) AND owner_user_id IS NULL AND status=\'published\' ORDER BY id', [ids]);
    assert.equal(rows.length, ids.length);
    const changes = rows.map(row => {
      const before = row.detail_json;
      const files = before.files.map(file => targets.includes(file.name) ? { ...file, content: patch(file.content, file.name === 'SKILL.md') } : file);
      return { id: row.id, name: row.name, before, after: { ...before, files, introduction: files.find(file => file.name === 'SKILL.md').content.trim() } };
    });
    checkChanges(changes);
    for (const row of changes) {
      const dir = resolve(output, row.id); mkdirSync(dir, { recursive: true });
      for (const file of row.after.files.filter(file => targets.includes(file.name))) {
        writeFileSync(resolve(dir, file.name.replaceAll('/', '_')), file.content);
        writeFileSync(resolve(dir, file.name.replaceAll('/', '_') + '.before'), row.before.files.find(old => old.name === file.name).content);
      }
    }
    writeFileSync(resolve(output, 'proposed.json'), JSON.stringify(changes));
    console.log(JSON.stringify({ drafted: changes.length, changedFiles: changes.length * 3, otherFieldsUnchanged: true }));
  }
} catch (error) { await db.query('ROLLBACK'); throw error; }
finally { await db.end(); }
