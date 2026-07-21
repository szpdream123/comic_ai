# Loomic 独立画布 V1

日期：2026-07-20

## 目标

在现有产品中新增一套独立的 Loomic 画布体验，完整保留画布编辑、素材组织、工作流生成和创作外壳能力，同时不修改现有 `production-workbench/canvas`。

## 实现结论

- 画布内核使用 React 19 和 `@excalidraw/excalidraw@0.18.0`，版本与 Loomic 对齐。
- 画布实现位于 `apps/web/new-canvas`，与现有 X6 画布完全隔离。
- 主工作台“画布”菜单下保留“新画布”入口，继续使用 `/new-canvas/` 路由。
- 图片、视频和音频生成节点已接入后台模型目录、参数映射、任务提交、状态轮询、计费结算、产物归档与画布回填。
- 视频合成节点已接入受控 FFmpeg/ffprobe 执行器和鉴权接口，可把已归档且通过类型化边连接的图片/视频按顺序合成为真实 H.264 MP4，产物上传对象存储并回填画布与运行历史。
- 视频模型后台 schema 中的布尔参数已按真实复选框渲染，`generateAudio` 可原样传入供应商参数以生成视频内嵌音轨。
- 画布文档优先保存在按项目/剧集隔离的 IndexedDB 记录中，IndexedDB 不可用时回退到 localStorage；云端画布支持 revision 冲突检测、版本历史与恢复。
- 独立画布项目已接入服务端列表、新建、重命名、切换和删除；业务项目内也支持多张独立画布的新建、切换、新窗口、重命名、复制和删除，离线时仍保留本地草稿能力。

## 访问入口

```text
/new-canvas/
/new-canvas/?projectId=<project-uuid>&episodeId=<episode-uuid>
/new-canvas/?projectId=<project-uuid>&episodeId=<episode-uuid>&canvasId=<canvas-project-uuid>
```

主工作台会附加当前 `projectId` 和 `episodeId`；业务项目画布还使用 `canvasId` 标识具体画布。文档、版本历史、冲突草稿、生命周期草稿、待同步状态和本地对话都按三者隔离。独立模式使用画布项目接口管理服务端画布；项目剧集模式使用业务项目内的画布集合接口。

## 已具备能力

- Excalidraw 自由画布：选择、绘制、文本、图形、连线、缩放和平移。
- Loomic 工具菜单、图层面板、文件面板和底部画布控制栏。
- 图片、视频和本地素材的画布插入、展示与管理。
- 图片、视频、音频生成节点及其提示词、参考图、画幅、质量、时长、分辨率、文本、音色、语速、声调、音量、后台模型和动态参数面板。
- 工作流模板可一次插入完整的规范节点与类型化连线，并作为一个操作整体撤销。
- 项目名称编辑、Logo 菜单、新建/删除项目、撤销/重做和复制对象。
- 创作助手侧栏和本地聊天记录；未确认视觉模型契约前不提供伪多模态附件入口。
- 空画布提示、真实品牌套件面板、保存状态提示和异常兜底。
- 画布内容自动保存、刷新恢复、导出图片和本地项目切换能力。
- 桌面与移动端响应式布局。

## 已完成记录

以下能力已在新画布中完成并通过对应测试，后续改造应优先保持这些行为不回退：

- 画布主壳层已完成，包含工作台导航、项目名、视图切换、聊天侧栏、文件面板、版本历史与品牌入口。
- 工具布局已完成，底部工具栏支持背景色、图层、生成文件、网格吸附、连接线显隐、小地图、自动整理与布局设置；中央“教程”入口按 LibTV 提供使用教程、联系客服、联系销售、关注公众号四项菜单，使用项目现有真实飞书手册，客服/销售仅在公开配置返回真实二维码时启用，暂无真实独立配置的公众号明确禁用。
- 对照 LibTV 的底部主工具条补齐了独立“工作流连线”入口；按钮、`L`/`Ctrl/Cmd+L`、端口点击和端口拖拽共享同一套类型化连接状态，完成、取消、拖空或源节点失效时同步退出，不使用普通 Excalidraw 箭头冒充工作流连接。
- 对照 LibTV 的中央入口补齐了“素材库”“角色库”“历史记录”三个真实按钮，分别直达现有云/复用素材、资源库角色分类和聚合生成历史；中央入口使用同一个 `CanvasFilesPanel` 的大尺寸 dialog 呈现，左侧文件/节点入口继续使用紧凑 panel，避免双实例、重复请求和状态分叉。大层支持关闭按钮、Escape、遮罩关闭和同一入口重复打开，普通左侧入口不会被旧请求重置。
- 中央移动工具已收口为单一入口，二级菜单真实切换 Excalidraw `selection` 的“移动(V)”与 `hand` 的“抓手工具(H)”；原生 `V/H` 快捷键切换后菜单选中态同步回写。网格按钮使用 Excalidraw `gridModeEnabled`，实际参与元素吸附和画布持久化，按钮暴露可逆的 `aria-pressed` 状态，不再仅表述为装饰网格显隐。
- 素材导入已完成，支持菜单选择、按落点拖放图片/视频/音频、粘贴剪贴板图片和云端资源插入，并保留归档失败兜底。批量导入按受支持文件的原始顺序逐项执行并返回一一对应的成功状态；单张图片读取/解析异常会记录 `false`、提示具体文件并继续后续视频或音频，不会让整批中断、结果错位或改写其他成功项的稳定对象元数据。
- 文件与资产面板的本地复用素材、云素材和生成历史产物支持直接拖到画布指定落点；拖拽载荷只保存面板内部 ID，不复制签名 URL，落点按当前缩放和平移换算为场景坐标，原有点击插入和自动定位行为保持不变。云素材和历史产物在异步读取图片或视频前后都会校验当前面板仍打开、画布 API 未更换且 `canvasProjectId` 未切换；关闭资源层或切换画布后才完成的请求不会迟到写入旧场景，本地素材复制也使用同一作用域门禁。
- 节点与连线能力已完成，生成节点、工作流端口、可执行边、节点选择和节点布局规则都已落地。工作流收集器只接受显式 `workflowEdge: true`；新建普通 Excalidraw 箭头会写入 `workflowEdge: false`，不会参与生成计划、依赖指纹或计费。历史无标记但仍满足类型化端口契约的 legacy 箭头只在 hydration 时一次迁移为工作流边，与新边共用同一验证、查找、断开、重连和生成输入来源；改连会升级显式标记并清理旧端点绑定，标记写回不会形成 `onChange` 或保存循环。相同 source/target/port 的重复边在新建时明确拒绝，导入或历史恢复的重复组在断开时一次清理、重连时归一为一条，不增加依赖指纹、生成输入或批量计费节点。持久化、导入或 undo 恢复出的依赖环会在工作流计划和积分提交前以 `canvas_workflow_cycle` 明确阻断并提示断开循环，不再静默丢弃一条边后按错误 DAG 执行。
- 连接线总显隐已改为纯视图投影：不再写箭头 `customData`、版本号、更新时间或撤销栈；自动保存、`Ctrl/Cmd+S`、生成前保存、生命周期暂存、远端同步、版本指纹和页面级快照统一在序列化前反投影真实箭头透明度。全局隐藏期间新增、重连或由图层恢复的连接会继续保持不可见，图层自身的隐藏状态仍独立持久化。
- 工具预设库已完成：中央工具箱和资源库“工具箱”共用 `canvas-tool-preset-catalog` 真实目录、详情/版本缓存与拓扑插入器，内置和用户预设不会再分叉成两套静态卡片。中央工具箱改为独立可扫描面板，提供分类、真实拓扑预览、三列滚动卡片、“使用”动作和拖到画布指定场景坐标；内置 10 个版本化预设，覆盖脚本生图、脚本生视频、图片转视频、双镜头分镜、导演构图、导演双镜头、单/双镜头成片、脚本配音和导演宣传片。用户可把当前选中的规范子图保存为团队共享工具，刷新和跨会话后继续使用，并可创建不可变拓扑版本、选择精确历史版本、更新、重命名、复制和归档删除；主用户与其子用户共享，跨主用户隔离。列表仅返回摘要时按需加载详情并去重并发请求，切换面板或画布后的 stale 响应不会插入场景。每次点击或拖放插入均生成全新节点/边 ID；插入器先在内存 staging API 完整构建和校验拓扑，再以唯一一次 Excalidraw `IMMEDIATELY` 更新提交，真实撤销 action 会整体移除节点和边，失败不会遗留半组节点。服务端使用独立 `creator_tool_presets` / `creator_tool_preset_versions` 契约，递归拒绝媒体 URL、存储对象、任务、运行结果等不可移植运行态数据，创建/复制具备幂等重放，拓扑更新使用 `expectedVersionNumber` 并发版本校验；不复用媒体资产表，也不使用静态卡片冒充功能。
- 图片/视频生成流程已完成，支持按节点执行、工作流队列、暂停/继续/停止排队、按画布持久化待执行顺序、刷新后恢复运行中/暂停/失败队列、任务标识立即持久化、已提交任务无重复提交续跑、正式任务 `result.imageUrl/videoUrl/sourceUrl` 提取、人工审核/结果未知终态处理、任务结果回填、失败状态保留和产物插入。提交与轮询期间会保存 `generationSnapshot`，`taskId` 首次写入时会同批持久化覆盖节点参数、上游文本、稳定素材和类型化连线的 `generationInputSignature`；同会话或刷新续跑发生指纹漂移时均停止轮询、禁止旧输入和旧产物回写，把远端任务线索转存为 `staleGenerationTaskId` 并进入 `inputUpdated`。若任务提交成功但画布 revision 未保存，其他设备会从该节点最新的服务端 run 恢复：只接受与当前节点、上游文本和稳定素材输入严格匹配的最高 `runNo`，活动任务仅 GET 原 `taskId`，成功 run 直接回填服务端 artifact，终态不自动重试且不回扫旧 run；生成产物按稳定对象 ID/URL 去重，不重复插入画布。生成成功但本地插入失败时保留已付费成功状态和结果 URL，可从生成历史重试。
- 生成输入状态与失败恢复已补齐 LibTV 的双动作语义：已完成节点的提示词、参考素材、模型或参数变化会显示“输入已更新”，可选择“更新生成”或仅关闭提示；关闭不会清除待更新标记，下游仍不会误用旧结果。失败节点显示真实错误、可“重新生成”或关闭失败提示，关闭仅持久化提示 dismiss；生成历史中的失败 run 保留为无伪产物的可重试记录，重试前校验原节点仍存在、输入和模型可用及当前积分余额，余额不足时不提交队列。工作流失败弹层提供独立“重试失败节点”，按当前画布元素重建请求并把失败节点排在原 pending 队列前；普通继续仍跳过失败节点，删除、失效或已知余额不足会阻断重试。图片、视频、音频和 standalone 提交会先把 `generationIdempotencyKey` 写入节点并保存，再传给真实请求；超时、`TypeError` 或 `5xx` 保留原键和 `generationReplayPending`，用户重试会恢复同一次请求，不重复计费，明确失败才生成新键。刷新后无 `taskId` 且服务端没有匹配 run 的不确定提交会进入可重试失败态，不永久卡在 `running`；工作流队列执行前重新读取当前元素，已删除或不再可运行的节点会暂停并报错，不使用旧快照继续提交。故事板即使保留旧产物预览，也优先显示当前“等待登录/恢复结果、正在生成、输入已更新、生成失败或已取消”状态，并对更新、失败和取消提供真实恢复动作；“待生成”筛选覆盖这些可恢复节点。真实失败任务 UI 本轮仅由代码/定向测试覆盖，未人为制造供应商自然失败样本。
- 生成前积分预检已接入真实模型目录与账户余额：图片、视频和音频节点按后端同一套 `baseCredits`、分辨率价目、视频时长计费和取整规则显示预计积分，余额确定不足时在共享 `executeCanvasNodeGeneration` 边界统一阻断并提示充值，键盘快捷键、工作流队列、工具面板、故事板和历史重试均不能绕过；已有 `running + taskId` 的恢复任务不会重复阻断。成本或余额无法证明时不猜价，保留后端最终校验。批量工作流会逐节点汇总全部可证明成本并在确认框显示总预计积分与余额，确定不足时不会启动队列；任一节点成本未知时明确显示未知数量并以后端为准。本轮未点击任何生成按钮，未产生付费任务。
- 导演节点已完成画布内真实文本执行：通过 `POST /api/canvas/:canvasProjectId/nodes/:nodeId/run` 校验画布归属、节点身份、输入长度和幂等键，调用现有 `TextModelGateway` 生成结构化导演指令，写入 `creator_canvas_node_runs` 的 `text` run 与 `creator_canvas_node_artifacts` 的 `text` artifact；前端将结果持久化到节点并参与下游提示词，支持同步结果、运行历史轮询、失败重试、网络不确定响应幂等恢复和刷新后自动恢复。导演 run 会保存无 URL 的 `recoveryInput`，恢复时只接受最高成功 run 与当前导演要求、模型、上游文本、稳定素材和端口连线严格匹配的结果；旧 run 缺少可证明快照、媒体缺稳定对象或请求期间输入变化时均不自动回填。导演节点自身已纳入依赖过期传播，导演文本结果、结构化结果或输入更新回退发生变化时，相连的图片、视频和音频下游会进入 `inputUpdated`。导演上下文只传文本、节点 ID、素材名称/类型和稳定对象 ID，不发送 URL、`data:` 或 `blob:`，后端测试使用 stub gateway，未触发真实付费模型。
- 音频生成流程已完成真实闭环并按官方契约纠偏：正式模型为 `cosyvoice-v2`，通过 `aliyun_bailian_audio` 协议调用百炼非流式同步 HTTP `/api/v1/services/audio/tts/SpeechSynthesizer`，请求使用 `model + input{text,voice,format,sample_rate,volume,rate,pitch}`，不再使用无官方依据的异步 task/poll 契约。通用任务、BullMQ submit/finalize、outbox、任务快照与恢复均支持 `audio`，同步响应的 24 小时结果 URL 会立即进入标准归档。独立画布从 `/api/canvas/:canvasProjectId/nodes/:nodeId/run` 执行，并按需创建受控 project/episode；接口只接受真实 `node.type === "audio"` 且 `node.data.mediaKind === "audio"` 的节点，非法请求不会创建隐藏业务记录。
- 音频任务计费与归档已闭合：提交前预留积分，成功消费、明确失败释放；模糊网络提交进入 `result_unknown` 并继续保留预留积分，避免免费重试。成功结果必须归档为带 `storageObjectId` 且 MIME 为 `audio/*` 的标准 audio artifact；产物下载使用 120 秒超时、100 MB 上限、MIME 校验和流式硬上限。供应商不支持取消时明确返回 `provider_cancel_not_supported`，不伪报取消成功。
- 音频节点当前真实透传参数仅包含 `text`、`voice`、`format`、`sampleRate`、`volume`、`rate` 和 `pitch`。`voice` 必填并由官方 V2 的 107 个系统音色驱动，默认 `longxiaochun_v2`；文本上限 20000；格式支持 `mp3/pcm/wav/opus`；采样率默认 22050；音量范围 `0-100`、默认 50；语速和声调范围均为 `0.5-2`、默认 1。控件范围、步长和默认值读取模型 schema，不再硬编码 LibTV 的外观数值。模型目录会实时驱动节点卡片与参数面板状态。前端模型目录和后端执行解析器均按 schema 裁剪参数，百炼 adapter 再以固定白名单构造请求；旧节点或第三方客户端传入的 `pause/interjection/intensity/timbre/effect` 不会进入供应商请求。
- 工作流停止已接入真实任务取消：排队任务可原子取消；运行中的 Seedance 视频只有供应商 `DELETE` 明确成功后，才同步把任务、attempt、provider request 和生成快照标记为 `canceled` 并释放预留积分。供应商不支持取消、取消失败或任务已终态时，不伪报成功，节点保留 `running`、任务 ID 和远端仍可能运行/计费提示，刷新后仍可恢复结果。
- 图层与资产管理已完成，支持搜索、类型筛选、重命名、排序、锁定、显隐、组合/取消组合、可折叠嵌套分组树、组级选择/移动/锁定/显隐/删除、全部折叠/展开、元素/整组拖拽排序、跨组移动、拖入/拖出分组和从画布删除单项素材/节点；分组名称持久化在组成员元数据中，支持双击或按钮重命名，拖入已命名组会继承名称，拖出或取消组合会清理失效名称映射。搜索或类型筛选只裁剪展示树，组级选择、移动、锁定、显隐、删除和拖拽仍按完整嵌套组路径作用于全部成员，不会在刷新后留下未命中的残余成员。拖拽会保留嵌套组并阻止递归分组，删除节点或组时同步清理工作流连线。个人素材库会根据服务端分页元数据加载全部页面，每批最多并发 4 页并按云素材 ID 去重；部分页面失败时保留已加载素材并提示具体失败页数。
- 云资产管理已补齐真实写操作：团队、项目和剧集资产按既有 API 契约支持重命名/删除，个人与官方素材保持只读；团队子账户仅显示后端允许的重命名，不显示明确禁止的删除，管理员 DELETE 仍是显式审计 override；失败时原列表不变并提示，删除云资产不会删除画布中已有引用，不伪造不存在的云文件夹移动能力。图片、视频和音频本地导入在归档、读取、解码和时长探测的异步边界都会复核当前画布 API，画布切换或组件卸载后不再向旧场景写入或弹出旧提示；云资产重命名/删除的成功、失败和收尾同样绑定当前 API、画布、项目、剧集与面板会话 token，迟到响应不会污染新列表、错误或 busy 状态。项目/角色资源归一化会保留顶层、版本或版本元数据中的稳定 `storageObjectId`，插入画布、复制、保存和跨设备 hydration 不再只依赖可能过期的展示 URL。删除项目资产时，当前画布和 revision 历史仍引用的 `storageObjectId` 保持 `available`，只有无任何画布引用的对象才删除；删除剧集文件资源时，纯画布当前文档或历史 revision 引用会删除资产版本记录但保留存储对象。删除项目时排除被删除项目自身的画布引用，再保留其他仍活动画布引用的对象并解除项目归属，源项目独占且无其他引用的对象才会清理。
- 资产页已补齐真实创建与批量管理闭环：支持一次选择多张图片、视频和音频，复用现有画布导入与对象归档链逐项上传，单项失败不会中断其余文件，完成后重新加载个人素材库；批量模式支持对当前筛选结果全选、按原顺序插入，并以一次 `IMMEDIATELY` 场景事务把本地复用资产的 `canvasFolder` 分类写入画布文档，刷新后继续保留。云资产没有统一可写分类接口，因此仍保持来源库分类并明确提示，不伪造不存在的服务端云文件夹能力。
- 云资产插入与下载已统一使用稳定对象内容路由：存在 `storageObjectId` 时始终生成编码后的同源 `/api/storage/objects/:id/content`，不会优先使用过期签名 URL；下载按钮按真实可解析内容 URL 显示，JPEG/WebP/GIF/AVIF/SVG、MP4/WebM/MOV、MP3/WAV/M4A/AAC/FLAC/OGG/Opus 会保留或补齐正确扩展名。视频和音频只有图片缩略图、没有原文件或稳定对象时不会把缩略图误作媒体插入或下载。
- 个人素材库的服务端汇总和分页列表已纳入 `audio/*`，支持 `media=audio` 筛选并返回兼容新增的 `audioCount/audioBytes`；音频条目序列化为 `mediaKind: audio`，归档后的上传音频和生成音频可在其他设备重新读取并插入画布。个人汇总与列表只返回 `storage_objects.status = available`，`pending_upload/failed/delete_failed` 不会被统计或插入；管理员资源审计接口的异常状态可见性保持不变。
- 导演 Agent 资产集合已完成真实持久化：新增 `creator_agent_assets` 表和正式迁移，按当前主用户聚合，主账户与其子账户共享同一集合并记录创建成员，其他主用户不可读取或修改；鉴权 API 支持列表、新建、编辑和软删除，名称唯一、字段长度和 UUID 均有服务端校验。文件面板新增 Agent 视图，可搜索、创建、编辑、删除并把资产插入为真实可执行导演节点；删除集合资产不会删除画布中已经插入的节点配置。
- 品牌套件已按 Loomic 多套件契约完成真实闭环：新增主用户归属的 `creator_brand_kits`、类型化 `creator_brand_kit_assets`（`color/font/logo/image`）和项目 `brand_kit_id`，主账户与子账户共享、跨主用户隔离；支持列表、详情、新建、编辑、默认套件、复制、删除、资产 CRUD 和项目选择，项目查看/编辑能力分别保护读取与绑定。Logo、图片和可选字体文件按主账号对象作用域上传，不绑定某个来源项目，只保存经过归属、available 状态、MIME 与扩展名校验的 `storageObjectId`；因此同一主账号的其他项目和子账户能继续签名读取。读取时生成短期签名 URL，不把签名 URL 写入数据库；存储修复任务会把品牌封面和品牌资产引用计入保留集合，不会在绑定 15 分钟后把仍在使用的文件误判为悬空对象。
- 品牌套件已进入真实画布和生成链路：品牌面板可管理颜色、字体、Logo、参考图片和指南，把 Logo/图片插入画布，把主色与支持的字体映射应用到新建或选中元素，并把 background 角色颜色应用为画布背景；项目当前品牌套件的主上传字体使用 Excalidraw 保留的 custom font slot 和浏览器标准 `FontFace` 真实渲染到新建或选中画布文字，运行时优先从稳定对象鉴权内容路由加载，不依赖短期签名 URL，刷新和其他已登录设备可重新注册。项目选中的品牌指南会去重追加到图片、视频和导演请求，且只发送资产 ID/类型/名称/角色等白名单元数据，不发送签名 URL。音频节点明确不注入品牌文本，避免 TTS 念出颜色和 Logo 名称。
- 失败素材恢复已完成，图片、视频或音频缺少源文件、归档失败或需要重新选择文件时，可校验同媒体类型后原位重新上传并更新稳定 URL，不创建重复节点。
- 上传归档保留与旧节点恢复已闭合：存储修复任务对已完成超过 15 分钟的上传对象执行悬空清理，但 `project_upload_records` 中状态为 `uploaded`、有完成时间且无错误的正式上传记录，以及画布 revision 中仍引用对应 `uploadSessionId` 的媒体，都会作为保留根，不会被误删；`delete_failed` 等删除失败记录进入可再次修复的持久状态，活动画布引用始终优先保留。原生图片后台归档在上传完成、回写场景前会重新校验画布作用域、当前 `fileId` 二进制 `dataURL` 和 live 节点仍处于本地待归档状态；期间删除节点、重绑源文件或切换画布会把迟到结果标记为 stale，不复活节点、不覆盖新 `storageObjectId`、不向其他画布写入或安排跨画布重试。旧画布加载时会按归档媒体元素的 `uploadSessionId` 去重预检（图片、视频、上传音频；默认并发 4，最多 8），仅把上传会话 `failed/expired` 或存储对象 `deleted/failed` 的确定终态标记为 `cloudArchiveStatus: failed`、`archiveRetryState: needs-file`、`requiresSourceFile: true`；鉴权、网络和其他暂态请求失败不会改变本地节点。标记会通过正常立即保存路径持久化，文件面板显示“重新选择源文件”，用户可在原节点上按媒体类型重绑并继续使用。
- 聚合生成历史已完成，支持全部生成节点或单节点查看、图片/视频/音频分类计数、时间升降序、批量插入、历史结果回填画布和按所属节点设置当前结果；音频历史切换当前结果会同步更新画布音频节点的结果 URL、MIME、稳定对象 ID 和运行归属，不再只更新服务端选择状态。
- 生成媒体稳定来源已完成，图片/视频产物记录 `storageUrl`、来源和归档状态；上传视频/音频按纯输出素材节点连接，不再错误接收生成输入。
- 已归档图片复用链已修复：个人/项目素材、生成历史和当前结果会保留后端 `storageObjectId`，再次插入画布时继续写入图片元素。连接视频合成节点后会被识别为已归档输入，不再要求用户重复上传或错误禁用合成。
- 跨设备媒体 hydration 与生成入队已闭合：画布元素、图片文件、视频/音频媒体和生成结果以稳定 `storageObjectId` 为主键，过期签名 URL 会在初次读取、跨标签远端 revision 采纳、云端冲突版本接受和历史版本恢复时统一改写为鉴权的同源内容路由（`/api/storage/objects/:storageObjectId/content`）；历史版本恢复后保存的最新正文也使用 hydration 后的稳定路由，不要求再刷新一次。未登录、跨用户或非 `available` 对象不会泄露内容。生成提交前后端按当前用户和对象归属重新签发短期供应商 URL，同时保留对象 ID；幂等指纹基于未签名的稳定输入，不因签名 URL 轮换产生重复付费任务。
- 缩放导航已完成，底栏按 LibTV 收口为单一百分比入口；菜单内提供可编辑缩放值、`Ctrl/Cmd +`、`Ctrl/Cmd -`、`Ctrl/Cmd 0` 和 50/100/800% 预设。小地图默认关闭，开启后支持点击/拖动导航；缩放前后的视口中心场景点保持不漂移。缩放按键不再依赖 Excalidraw 的隐式默认监听，而是与底栏共用 10%–800% 边界和中心锚定换算；小地图在一次拖动手势中冻结按下时的场景映射，视口自身移动不会导致落点坐标连续漂移。
- 快捷键定义已收口为单一模块，面板与真实监听共用同一契约：`Ctrl/Cmd+G`、`Ctrl/Cmd+Alt/Option+G`、`Ctrl/Cmd+Shift+G`、`Ctrl/Cmd+D`、`Ctrl/Cmd+L`、`Ctrl/Cmd+Enter`、`Ctrl/Cmd +`、`Ctrl/Cmd -`、`Ctrl/Cmd+0`、`Tab` 与 `Alt/Option+Shift+F`。不再保留会抢占直线、编辑或原生画布行为的裸 `G/L/D/Enter/0/N`；面板补齐缩放手势、`V/H`、节点复制和节点创建副本提示，并按 LibTV 的创作、缩放、移动画布、其他四栏布局展示，移动端回退为单栏。`Tab` 与底部“添加节点”按钮复用同一菜单 toggle，菜单已打开时可关闭，不再被持续锁开；输入/文本编辑目标和故事板视图不会响应隐藏工作流的添加节点快捷键。菜单动作仍统一按当前画布缩放和平移计算空画布中心，已有节点时放到最右节点旁，不区分鼠标或快捷键入口。
- 工作流切换到故事板时会卸载节点参数编辑器、添加菜单、移动菜单、工具箱、快捷键面板、绘图菜单、端口层、图层、小地图和底栏，复位工作流连接模式及活动绘图/移动工具，并禁用除保存外的工作流专属快捷键；切回工作流不会恢复切换前的浮层或连接/绘图状态。故事板不会接管全局图片粘贴或文件拖放，输入框、文本域、选择框、`contenteditable` 和 `role=textbox` 也不会把媒体输入重定向到隐藏工作流；切换故事板会清除拖放激活态且不渲染导入遮罩。故事板卸载这些浮层不影响页面级 `Ctrl/Cmd+S`、`pagehide`、`visibilitychange` 和组件 `unmount` 的 flush，待保存正文、标题和生命周期草稿仍会进入同一串行保存链。画布选中态仍通过纯视图 `captureUpdate: "NONE"` 清空，不删除节点、不制造撤销记录或额外 revision。
- 修饰键拖动复制已区分 LibTV 的两套内部语义：`Alt/Option+拖动` 只复制节点/分组子节点，不复制边；`Ctrl/Cmd+Alt/Option+拖动` 在单节点时复制全部上游边到新副本，在多选时只复制选区内部边，不复制下游或跨选区边。受控路径恢复原节点 ID、位置和原连接，新副本 ID 随拖动落点移动；锁定节点、未达 4px 阈值和取消拖动不会产生副本，修复投影使用同一 Excalidraw 历史事务。
- 保存与恢复主链路已完成，支持本地/云端保存、保存请求串行化、离线待同步和联网自动重试、页面级 `Ctrl/Cmd+S` 立即保存正文与待同步标题、生命周期恢复、较新关闭草稿保护、冲突处理、最新云端版本接受、冲突草稿历史、版本恢复立即持久化和刷新后恢复。接受云端冲突版本改为“先投影成功、再清冲突并提交本地基线”，投影失败时仍保留本地草稿、待处理冲突和非 saved 状态；版本恢复改为先保存当前快照、应用目标、再提交目标，应用或提交失败会回滚画布与保存基线。版本历史面板按 25 条分页并通过 `beforeRevision` 游标继续加载，服务端列表保持单页最多 100 条并返回 `hasMore/nextCursor`，第一页才合并本地冲突快照且追加页去重排序。离线编辑刷新后仍保留待同步标记，重新联网时若云端 revision 已变化，不会用旧云版本静默覆盖本地草稿，而是进入明确冲突选择。页面可见、在线且本地无脏数据、保存或重试任务时，每 5 秒通过鉴权的 current-head 接口读取真实最新 `serverRevision + document`，不再依赖稀疏版本历史。采纳远端元素、文件、背景、网格和主题时保留本地视口与选区，并以短事务保护和内容指纹抑制中间事件与 echo-save。远端采纳的 revision 二次校验、状态变更和本地缓存写入与本地保存共用同一 `saveChain`；若前置的历史恢复或导航预保存已产生 revision 冲突，排队中的远端采纳会返回失败且不投影、不覆盖本地冲突草稿。
- 初始保存态与冲突恢复已修正：页面先保持 loading，待本地/云端初始化及同步标记读取完成后再挂载可交互画布；初始化失败显示 error，不把尚未判定的状态误报为“已保存”。恢复的 `cloudPending` 草稿进入 local，并在编辑器 hydration 后重新进入串行保存队列和联网重试，不要求用户再编辑一次才续传；恢复的待处理 revision 冲突进入 conflict，标题待同步也会合并进 local/error/conflict；明确接受云端或覆盖后才回到 saved。
- 保存调度已增加完整可持久化内容去重：保存状态变化或 Excalidraw 对相同场景重复触发 `onChange` 时不会重复排队，也不会取消首次真实保存。独立 Chromium 中新增文本和删除文本两次真实编辑只产生两次 `PUT`，4.5 秒后保持“已保存”，未再出现保存循环。
- 离线同步标记已增加可验证的已同步内容指纹：正常云保存保留 `cloudPending=false + contentFingerprint` 基线；若 pending 标记写入失败而正文已经落地，重载会发现指纹不一致并进入冲突而不是静默覆盖；首次没有本地正文时仍直接采用云端，正常 clean 本地缓存更新时不会被误判为冲突。
- 画布已补最小真实在线通知闭环：`GET /api/canvas/:canvasProjectId/live` 使用现有登录 Cookie 和画布查看权限建立长连接 SSE，连接/断开产生真实 presence 快照；成功提交新 revision 后服务端立即向同一画布频道广播 revision，前端仅在本地无脏数据、无保存/重试任务时复用既有 `checkForRemoteUpdate/adoptRemoteUpdate` 安全采纳，5 秒 revision 检查继续作为断线兜底。该频道当前是单服务进程内广播，不显示在线成员或远端光标，也不宣称 CRDT 合并或完整多人实时协作。
- 独立画布项目标题已纳入可靠保存：标题 PATCH 使用串行队列和 `expectedTitle` compare-and-swap，陈旧标题返回 `409 canvas_project_title_conflict + details.currentTitle`；冲突后冻结排队写并提供“使用云端标题/保留本地并覆盖”两条显式路径，失败继续保留按画布隔离的待同步草稿和重试入口。切换项目或离开画布前会等待标题同步，不再静默吞掉失败并显示虚假的“已保存”。
- 画布菜单已接入真实 PNG 导出：过滤已删除元素，调用 Excalidraw `exportToBlob`，创建临时下载链接并在成功或失败路径回收 object URL；空画布和浏览器不支持时明确提示，不伪报下载成功。
- 登录过期恢复链路已完成：新任务提交前遇到 `401/unauthenticated` 会打开现有共用登录框并保持节点可重试；已提交的付费任务在轮询时登录过期会保留 `running`、任务 ID 和待恢复标记，密码登录成功刷新后只轮询原任务，不会重复提交。已确认取消的节点不会恢复轮询，取消失败而脱离本地轮询的远端任务会在刷新后继续恢复。
- 生成任务、历史与当前结果一致性已完成：用户取消会记录为 `canceled` 运行并同步画布节点，不创建伪产物；项目素材的取消、失败、人工审核或结果未知重试在没有新产物时，不会覆盖之前已成功的当前预览和生成结果。
- 图片和视频生成入口已补服务端规范节点类型校验：图片任务只接受持久文档中的 `type === image`，视频任务只接受 `type === video`；非法节点在创建隐藏项目/剧集、节点运行、生成任务或计费记录前返回明确 `400`，避免错误节点触发付费任务。
- 视频合成主链路已完成：合成节点只收集通过类型化工作流边连接的图片/视频节点，运行前要求每个输入已有 `storageObjectId` 且画布云保存成功；后端重新校验画布归属、source/target 端口、edge kind、目标端口 accepts、媒体类型、对象归属和项目归属，不接受客户端 URL 或服务器路径。媒体执行器支持图片/视频混排、逐片段时长、缩放留边、帧率统一、短视频末帧补齐、顺序拼接、H.264、`yuv420p`、`faststart`、`ftyp + ffprobe` 双重校验、路径白名单与 realpath 防逃逸、数量/总时长/尺寸限制、512 MB 单文件和 1 GB 聚合下载限制、60 秒下载超时、输入输出大小限制、临时目录清理和目标不可覆盖。
- 视频合成可靠性已完成：接口使用持久化幂等记录，同一请求键不重复执行或上传，处理中返回 `202`，同键不同请求返回 `409`，明确失败会持久化失败终态并可重放而不会卡在 `processing`；画布在运行前持久化 `running + compositionRequestId`，网络丢响应、超时、`5xx` 和 `idempotency_processing` 保留原键，刷新后可“恢复合成结果”；明确 `4xx/422` 才清活动键并允许新请求，成功后记录 `lastCompositionRequestId`，用户主动重跑才生成新键。成功产物挂载、运行完成和幂等成功在同一数据库事务收口；收口失败会删除刚上传的云对象并把存储记录标为已删除。产物写入 `creator_canvas_node_runs`、`creator_canvas_node_artifacts`，节点可预览并插入可复用的已归档视频元素。
- 业务项目内多画布已完成真实前后端数据闭环：每张画布拥有独立 `creator_canvas_projects` 聚合根、document、revision、nodes、edges、run 和 artifact；旧项目画布接口稳定指向最早活跃画布。后端接口支持列表、新建、具体画布读取/保存、重命名、复制和软删除，所有操作使用 `projectId + canvasProjectId` 双重归属校验；任务结果回写优先使用显式 `canvasProjectId`，避免写入同一业务项目的其他画布。复制只复制持久文档、节点、边和稳定素材引用，不复制任务、运行、供应商请求或计费状态；最后一张画布禁止删除并返回 `409 last_project_canvas_delete_forbidden`。前端顶栏画布切换器以 URL `canvasId` 选定具体画布，文档、历史、聊天、冲突、生命周期和待同步本地键均按画布隔离；切换、新建、复制和新窗口前会等待当前画布云保存，冲突、离线待同步或保存失败时阻止导航。
- 节点运行历史的并发编号分配已修复：相同节点的不同幂等请求并发创建时，以唯一索引仲裁并重新读取 `MAX(run_no) + 1`，冲突后有界重试；相同幂等键仍只复用同一运行，不同幂等键会稳定得到不同 `runNo`，避免导演、图片、视频、音频或合成任务因运行编号竞争丢失。
- 正式迁移 `20260720-correct-cosyvoice-v2-contract.sql`、`20260720-enable-project-multi-canvases.sql`、`20260720-create-creator-agent-assets.sql` 与 `20260720-create-creator-brand-kits.sql` 已精确应用到 `.env` 的正式 `DATABASE_URL` 并写入迁移账本。新增迁移执行时整体 runner 先因既有 baseline checksum 漂移停止，随后仅对对应新迁移进行事务化应用和登记，没有修改历史 checksum 或重放 baseline；正式库已确认 Agent 表、品牌套件/资产表、项目品牌列存在且各自账本记录为 1。当前 active 音频模型为 `cosyvoice-v2`、`sync`、`aliyun_bailian_audio`，`poll_queue_name` 为 `NULL`，结果进入 finalize 归档队列。业务项目画布唯一索引已替换为稳定排序普通索引。

## 已验证

- npm run build:new-canvas
- `$files = Get-ChildItem apps/web/tests -Filter 'new-canvas*.spec.mjs' | Sort-Object FullName | ForEach-Object { $_.FullName }; node scripts/run-tests.mjs $files`
- node scripts/run-tests.mjs apps/backend/src/modules/project/tests/director-canvas-node-run.service.spec.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.director-node.spec.ts apps/backend/src/modules/project/tests/creator-canvas-record.service.spec.ts
- node scripts/run-tests.mjs apps/backend/src/modules/project/tests/agent-asset.service.spec.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.agent-assets.spec.ts apps/web/tests/new-canvas-files.spec.mjs scripts/migrate-user-scope.test.mjs
- node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/phone-auth-dev-server.media-library.spec.ts apps/web/tests/new-canvas-files.spec.mjs apps/web/tests/new-canvas-ports.spec.mjs
- node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/phone-auth-dev-server.canvas-live.spec.ts -- --test-name-pattern "latest current canvas head"
- node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/phone-auth-dev-server.canvas-node-type-validation.spec.ts apps/web/tests/new-canvas-layers.spec.mjs apps/web/tests/new-canvas-file-persistence.spec.mjs
- node scripts/run-tests.mjs apps/backend/src/modules/project/tests/brand-kit.service.spec.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.brand-kits.spec.ts apps/web/tests/new-canvas-brand-kit.spec.mjs
- node scripts/run-tests.mjs apps/backend/src/modules/project/tests/brand-kit-storage-retention.spec.ts
- node scripts/run-tests.mjs apps/backend/src/modules/new-canvas/tests/new-canvas-assistant.service.spec.ts
- node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts -- --test-name-pattern "protects the new canvas assistant route"
- node scripts/run-tests.mjs apps/web/tests/new-canvas-upload-recovery.spec.mjs（3/3）
- node scripts/run-tests.mjs apps/web/tests/new-canvas-file-persistence.spec.mjs（13/13）
- node scripts/run-tests.mjs apps/web/tests/new-canvas-generation.spec.mjs apps/web/tests/new-canvas-cloud-persistence.spec.mjs apps/web/tests/new-canvas-project-name-sync.spec.mjs apps/web/tests/new-canvas-file-persistence.spec.mjs apps/web/tests/new-canvas-files.spec.mjs（147/147）
- node scripts/run-tests.mjs apps/web/tests/creator-api.spec.ts（56/56）
- apps/backend/src/modules/project/tests/creator-application.service.spec.ts 项目资产/项目删除画布引用保留回归（12/12）
- apps/backend/src/entrypoints/tests/phone-auth-dev-server.storage-upload.spec.ts 剧集文件删除与画布引用保留回归（8/8）
- apps/backend/src/modules/storage/tests/upload-session.service.spec.ts 存储修复与持久保留根回归（9/9）
- apps/backend/src/entrypoints/tests/phone-auth-dev-server.upload-content.spec.ts 鉴权内容路由与生成入队重签回归（2/2）

-上述测试已通过；2026-07-21 当前统一完整 `new-canvas*.spec.mjs` 为 380/380 全量通过；`creator-api.spec.ts` 为 57/57。导演服务测试为 4/4，显式读取 `.env` 正式 `DATABASE_URL`，导演 HTTP 契约测试为 1/1，均使用 stub gateway 且未触发真实模型。工具预设后端服务测试为 3/3、密码登录 HTTP 测试为 1/1，覆盖主/子共享、跨主隔离、创建/复制幂等、纯元数据更新不增版本、拓扑 CAS 并发冲突、嵌套运行态字段拒绝和归档可见性。`npm run build:new-canvas` 通过，`git diff --check` 通过。`20260721-create-creator-tool-presets.sql` 已通过只读取 `.env DATABASE_URL` 的 one-shot 脚本按 `pending -> applied -> already-applied` 应用，账本 checksum 与最终 SQL 一致，两表、三索引及全部约束完整。连接线纯视图投影覆盖保存反投影、图层组合和新增连接；拖动复制覆盖无边、单节点上游边、多选内部边、原 ID/位置、锁定和阈值；帮助菜单覆盖顺序、真实来源与统一关闭行为；版本分页、标题 CAS、上传终态恢复与源文件重绑已纳入回归。后端 `creator-canvas-record.service` 为 11/11，HTTP 标题 CAS 与独立版本分页为 2/2，项目绑定版本可见性为 1/1；本轮项目资产/项目删除、剧集文件删除、存储修复、剧集 CRUD、鉴权对象内容与生成入队重签分别为 12/12、8/8、9/9、1/1、2/2，均读取 `.env` 正式 `DATABASE_URL`。标题 CAS SQL 已以 `$6::text` 消除 PostgreSQL `42P08`。构建仍会报告既有 `project-detail.js` 重复对象键警告，本轮未修改该无关文件。

本轮图层完整成员与项目资源稳定引用的定向合并回归为 51/51；导航为 18/18、云保存为 40/40、生成为 69/69、文件与资产为 45/45、工具预设为 15/15、工作流队列最终为 18/18、类型化端口为 10/10、工作流边为 10/10、故事板为 9/9、媒体输入隔离为 5/5。最终统一全量数字以 380/380 为准。

自定义字体运行时补强后，品牌套件专项为 6/6，当前并行工作树 `new-canvas*.spec.mjs` 为 341/341，墙钟约 3.62 秒；覆盖稳定对象路由、custom slot 注册、清理和异步切换防旧请求回写，`npm run build:new-canvas` 与定向 `git diff --check` 通过。

批量素材部分失败语义补强后，文件与资产专项为 37/37，当前并行工作树 `new-canvas*.spec.mjs` 为 345/345，墙钟约 3.68 秒；生产构建与定向 `git diff --check` 继续通过。

图片异步归档 stale 回写防护补强后，文件持久化专项为 15/15，当前并行工作树 `new-canvas*.spec.mjs` 为 346/346，墙钟约 3.65 秒；生产构建与定向 `git diff --check` 继续通过。

云素材/生成历史异步插入作用域门禁补强后，文件与资产专项为 38/38；`npm run build:new-canvas` 通过，仅保留既有 `project-detail.js` 重复对象键警告。云素材和生成历史的异步读取会在资源层仍打开、画布 API 与 `canvasProjectId` 未更换时才允许写入，原生图片后台归档也会在回写前确认当前画布、文件二进制和本地待归档节点仍有效；关闭资源层、切换画布或删除/重绑节点后，迟到结果会被丢弃且不跨作用域重试。当前并行工作树统一 `new-canvas*.spec.mjs` 为 352/352 全量通过。

工作流/故事板视图隔离补强后，故事板与主画布定向回归为 30/30，当前并行工作树 `new-canvas*.spec.mjs` 为 346/346，墙钟约 3.79 秒；`npm run build:new-canvas` 与 `git diff --check` 通过，构建仅保留既有 `project-detail.js` 重复对象键警告。

视频合成 HTTP 端到端测试覆盖密码登录、创建画布、保存节点和边、下载已归档图片、生成真实 MP4、ffprobe 确认 H.264、上传、运行历史、同键成功重放不重复上传、同键请求冲突、跨用户素材拒绝、终态失败重放、数据库 finalization 故障注入和云对象清理。本轮首次复跑时正式 `.env` 的 PostgreSQL `DATABASE_URL` 在创建数据库阶段短暂出现 `Connection terminated unexpectedly`，没有切换到 `TEST_DATABASE_URL` 或备用数据库；连接恢复后按最终代码重新运行并通过 1 项。

云持久化专项 39 项、文件与资产专项 35 项、生成专项 53 项、文件持久化专项 13 项、标题同步专项 7 项和工作流恢复专项 12 项均通过。登录成功固定刷新页面，恢复键集合会随组件重建；持久化的 `running + taskId` 节点只轮询原任务。若节点本地缺少 taskId，则只查询其最高服务端 run 并严格核对输入，不调用新任务提交接口，也不回退旧 run。画布记录后端数据库测试包含取消历史、零伪产物、节点取消状态和并发运行编号断言。

独立 Chromium 已同时打开 LibTV 与本地新画布，完成节点菜单、工作流模板、工具布局、图层/资产侧栏、画布导航和快捷键面板对比。浏览器中已验证模板菜单的四种真实拓扑、资产面板搜索/类型/文件夹控制、聚合生成历史的全部节点、媒体分类、时间排序与批量入口；图层实际拖拽改变 z-order 后自动保存，刷新仍保持新顺序，验证结束后已恢复审计画布原顺序。留档截图：

最新构建已在独立 Chromium 中验证视频合成节点菜单、输入端口、分辨率、帧率、图片默认时长和逐片段时长控件。未归档输入会明确禁用合成；从云素材或生成历史再次插入的已归档图片现在保留 `storageObjectId` 并可直接参与合成。当前开发栈监听 `http://127.0.0.1:4310`；`/api/auth/session`、画布、revision、项目多画布和 generation config 接口均使用正式数据库。generation config 已迁移为 `cosyvoice-v2`、必填官方音色、20000 文本上限及动态 schema 参数。音频节点卡片和参数面板保持可执行，但为避免费用未提交真实付费音频任务。

业务项目多画布已完成独立 Chromium 实机联调：缺少 `canvasId` 时会自动选择并回写默认画布；新建、保存、重命名和复制分别得到成功的 `POST 201`、`PUT 200`、`PATCH 200` 和复制 `POST 201`。临时 B 画布写入文本节点后，副本可加载同一节点；切回默认 A 画布时节点为空，刷新后仍为空，确认文档与本地状态按具体画布隔离。联调结束后临时副本和 B 画布均已 `DELETE 200`，页面恢复原默认画布、选择器仅剩原画布、状态为“已保存”，控制台无错误。

2026-07-21 本轮继续复用独立 headed 测试浏览器并直接保持用户已登录的指定 LibTV 画布；`browse status` 为 `healthy / headed`、PID `10692`，标签页标题和 URL 与目标项目一致。登录态 DOM snapshot 已确认中央“添加节点、移动、工具箱、素材库、角色库、历史记录、快捷键、教程”，左下“整理画布、小地图、连线可见、网格吸附、缩放”，以及左侧“画布/资产/资产管理”均为真实可交互元素。另一个 CDP `9225` 独立 Chrome 也保留同一 LibTV 登录态和本地新画布标签页。

本轮对“输入已更新”双动作、失败提示关闭/重试和历史失败 run 重试完成了代码与定向测试验证；headed 浏览器按单项超过 3 分钟即标记该轮测试完成并继续下一项的规则执行，但现有数据中没有供应商自然失败任务，因此不把真实失败任务 UI 记为 headed 实机通过。为避免产生费用，本轮未点击生成或历史失败重试，没有触发任何真实付费生成。

本轮同时核对历史删除对象 `453767ce-2653-469f-857b-b9d8c85826f6` 与上传会话 `834b6adf-78dd-48d7-aef8-a1ad73e8113b`：正式云库的 canvas document/revision 没有保存该 `uploadSessionId`，但 headed 浏览器的本地画布仍保留旧节点。加载时状态预检确认 `failed/deleted`，节点被标记为 `needs-file`，文件面板实际出现“重新选择源文件”。使用原 PNG 原位重绑后，新会话 `23fc08df-4845-4847-8580-1eac927b0769` 当时曾在刷新后返回 `200 / 261918B`；末轮审计发现该对象随后又被旧 `delete_failed` repair 重试路径删除，当前已是 `failed/deleted`，不能再把早先截图作为当前可用证据。最终修复会在 repair 重试前重新检查 durable roots 与活动画布当前/历史引用，防止未来复发，但不会伪造恢复已经删除的对象字节；确定终态预检、标记、立即保存和原位重绑由 3/3 专项及 316/316 全量套件覆盖。

登录态实机进一步确认：LibTV 素材库打开全屏个人资产管理，角色库提供角色预设和“应用至画布”，历史记录提供图片/视频/音频分类、独立缩放、时间排序和批量操作；小地图和连线显隐可逆，移动入口提供“移动(V)/抓手工具(H)”。网格吸附、缩放菜单和自动布局在当前图上的内部状态证据有限，按三次观测上限标记本轮审计完成但不据此宣称完全一致；所有可逆开关与自动布局审计均已恢复原状态，未修改 LibTV 项目内容。

2026-07-21 已登录只读审计进一步确认 LibTV 工具箱：实际为视口居中的无蒙层 `480×460` 浮层，与底部工具栏间距约 8px；“我的工具箱”有 25 张三列可滚动 workflow 卡片，卡片约 `138×175`、可拖拽，悬停显示“使用”。列表协议为 `POST /api/canvas/workflow/list`，详情为 `GET /api/canvas/workflow/detail?workflowUuid=...`，拖拽 MIME 为 `application/x-liblibtv-canvas-workflow`；插入时会重生成全部 node/edge ID，并重写 parent/child/params 中的节点引用。另有 5 张“周星驰经典名场面”专用效果模板，它们依赖 LibTV 私有 `star-video2` 节点，不是普通 workflow，本项目尚无真实供应商执行能力，因此不以同名静态模板伪装支持。新画布最终实测工具箱为 `480×460`、间距 `7.97px`、三列独立滚动，预设卡约 `141×173`，支持分类状态保持、点击使用、拖放插入和用户/团队自定义工具。headed 浏览器在 `4312` 正式后端实际完成选中子图保存、`POST 201`、刷新持久化、点击插入、不同 `data-node-id`、创建 `v2`、选择历史 `v1` 后重命名仍保留 `v1`、复制和删除；测试数据与插入节点随后全部清理，刷新后画布恢复为空，控制台无错误，未触发生成。

2026-07-21 最终 split build 已在同一 headed 浏览器的 `4312` 标签刷新：资产页可见“上传素材”“批量操作”、类型与来源筛选及真实个人素材列表；上传和批量按钮的作用域、部分失败、顺序、分类事务与稳定下载路由由 `45/45` 专项覆盖。本轮没有实际上传用户文件或下载云资产，也没有触发付费生成；临时本地标签验证后关闭，独立浏览器恢复指定 LibTV 为唯一前台标签。

中央资源层也已在独立 headed 浏览器验证：素材库以 `1120×760` dialog 居中覆盖 `1707×876` 视口，遮罩完整覆盖，`aria-modal=true`，Escape 可关闭；角色库和历史记录复用同一实例并由独立 requestId 切换目标视图，左侧紧凑文件/节点入口保留。

2026-07-21 快捷键、导航与保存再次在同一独立 headed 浏览器对照已登录 LibTV：LibTV DOM 明确显示成组/合并/解组/连线/复制/生成/适合屏幕均使用主修饰键，缩放菜单为百分比输入、放大/缩小/适合屏幕和 50/100/800%。本地刷新后“添加节点”显示 `Tab`、小地图默认关闭、缩放菜单命令与预设完整；快捷键面板四栏包含 `V/H` 和手势提示。在创作助手输入框聚焦时发送 `Ctrl+S` 后页面未出现浏览器保存对话框，应用仍保持画布页并执行保存请求。最终构建在真实 Excalidraw 画布获得焦点后发送 `Ctrl+=`，底栏从 100% 变为 110%；随后 `Ctrl+-` 恢复 100%，控制台无错误。页面外壳或输入框持有焦点时不劫持缩放按键，该焦点边界与文本编辑保护一致。

2026-07-21 LibTV 拖动复制完成真实可撤销审计：`Option+拖动` 复制已有上游连接的“高清”节点后仍为 8 条边，`Cmd+Option+拖动` 后新增一条上游到副本的边并变为 9 条；两次均 `Cmd+Z` 恢复 13 节点/8 边。bundle 同时确认单节点以 `copyUpstreamEdges`、多选以 `copyInternalEdges` 读取主修饰键。本地受控复制的策略、ID/位置、双向绑定、锁定和阈值已由定向与全量测试覆盖；使用 CDP 发送本地指针时连普通无修饰拖动也未命中节点，因此该次 CDP 尝试按 3 分钟规则记为测试不成立，不作为本地实机通过证据。

2026-07-21 本地 headed 页面已验证中央“教程”按钮和四项菜单真实渲染：使用教程可用，客服/销售按公开配置状态启用，缺少独立真实配置的公众号禁用；页面控制台无新增错误。另在 `4312` 正式后端创建临时画布并用两个 headed 页面验证保存通知：页面 A 插入脚本生图后保存为 `serverRevision=2`，页面 B 自动出现同一两节点和一条类型化边；隐藏连接线并等待保存窗口后，服务端仍为 revision 2、edge 仍为 1、持久箭头 opacity 仍为 100，确认纯视图显隐不会制造 revision 或污染文档。随后恢复显隐并以 `DELETE 200` 删除临时画布；该验证证明同浏览器多页面通知和 revision 计数，不替代两台物理设备的生产验证。

2026-07-21 最终构建继续在同一独立 headed Chromium 的 `4312` 页面验证：底部“添加节点”打开后按 `Tab` 可关闭，再次打开并插入图片生成节点不会触发生成；从该选中节点直接切换到故事板时，工作流节点参数浮层会关闭，故事板卡片不再被遮挡，DOM 中也不再保留“提示词/模型/生成图片”编辑控件。验证后返回工作流，使用画布全选删除、`Ctrl+S` 和刷新确认临时节点均已清理，控制台无错误。留档 `artifacts/new-canvas-storyboard-selection-clear-2026-07-21.png`；该截图只证明非付费故事板切换与浮层清理，不作为真实失败供应商任务证据。

2026-07-21 本轮收尾再次在独立 headed Chromium 的 `4312` 构建中验证故事板真实 DOM 隔离：`main.lm-canvas-shell` 的 `data-view-mode` 为 `storyboard`，故事板区域存在；工作流工具栏、添加节点、连接端口、图层、小地图、底栏以及节点/素材编辑浮层计数全部为 0。验证未触发生成，临时本地标签已关闭；浏览器最终为 `healthy / headed`，仅保留并选中用户已登录的目标 LibTV 画布标签。

2026-07-21 本轮在同一独立 headed Chromium 的 `4312` 最新构建中向故事板发送可取消的合成 drag、drop 与图片 paste 事件，三者均未被画布 `preventDefault` 接管；`data-drop-active` 为 `false`、导入遮罩计数为 0，清空后的网络记录中没有本地上传请求。验证后关闭临时标签、收起 LibTV 对照侧栏并恢复目标 LibTV 画布为唯一前台标签；浏览器状态继续为 `healthy / headed`。该验证不触发生成，也不替代真实付费任务或两台设备生产验证。

本轮再次直接使用 `.env` 启动完整开发栈时，Redis `REDIS_URL` 出现 `ENETUNREACH`、PostgreSQL `DATABASE_URL` 出现 `Connection terminated unexpectedly`，并伴随既有 `ERR_HTTP_HEADERS_SENT` 日志；未切换 `TEST_DATABASE_URL` 或备用端点，完整开发栈已停止。因此新增代码有构建、单元/HTTP 测试和 LibTV 登录态只读证据，但没有把本轮本地静态页面 `200` 误记为后端功能运行成功。

LibTV 音频节点也已完成登录态只读审计：文本上限为 50000，包含模型、音色、停顿、语气词、语速 `0.5-2`、声调 `-12-12`、音量 `0.01-10`、音高/强度/音色调节，以及无、空旷回音、礼堂广播、电话失真、电音等音效，并具有输入/输出端口。LibTV 视频合成节点在无连接时显示“空空如也，请连接视频节点后操作”，具有左右连接端口；本轮未修改 LibTV 项目内容。

- `artifacts/libtv-live-2026-07-20.png`
- `artifacts/new-canvas-live-2026-07-20.png`
- `artifacts/libtv-shortcuts-2026-07-20.png`
- `artifacts/new-canvas-shortcuts-2026-07-20-v2.png`
- `artifacts/new-canvas-workflow-toolbox-2026-07-20.png`
- `artifacts/libtv-final-reference-2026-07-20.png`
- `artifacts/new-canvas-assets-final-2026-07-20.png`
- `artifacts/libtv-audio-composition-audit-2026-07-20.png`
- `artifacts/libtv-canvas-baseline.png`
- `artifacts/libtv-add-node-menu.png`
- `artifacts/libtv-cdp-central-assets-2026-07-20.png`
- `artifacts/libtv-cdp-central-character-library-2026-07-20.png`
- `artifacts/libtv-cdp-central-history-clean-2026-07-20.png`
- `artifacts/libtv-cdp-toolbox-clean-2026-07-20.png`
- `artifacts/libtv-toolbox-panel-readonly-2026-07-21.png`
- `artifacts/new-canvas-toolbox-parity-final-2026-07-21.png`
- `artifacts/new-canvas-assets-dialog-final-2026-07-21.png`
- `artifacts/new-canvas-shortcuts-navigation-save-final-2026-07-21.png`
- `artifacts/libtv-drag-duplicate-audit.png`
- `artifacts/new-canvas-help-menu-drag-connection-2026-07-21.png`
- `artifacts/qa-core-image-cost-preflight-2026-07-21.png`
- `artifacts/qa-core-expired-upload-recovery-2026-07-21.png`
- `artifacts/qa-core-rebound-upload-reload-2026-07-21.png`
- `artifacts/libtv-cdp-minimap-toggle-2026-07-20.png`
- `artifacts/libtv-cdp-auto-layout-applied-2026-07-20.png`
- `artifacts/libtv-cdp-auto-layout-undone-2026-07-20.png`
- `artifacts/new-canvas-video-composition-unarchived-2026-07-20.png`
- `artifacts/new-canvas-multicanvas-cosyvoice-v2-2026-07-20.png`
- `artifacts/libtv-toolbox-overview-2026-07-21.png`
- `artifacts/libtv-toolbox-template-help-2026-07-21.png`
- `artifacts/libtv-toolbox-zhouxingchi-2026-07-21.png`
- `artifacts/new-canvas-tool-presets-4312-open.png`
- `artifacts/new-canvas-user-tool-preset-insert-4312.png`
- `artifacts/new-canvas-user-tool-preset-final-4312.png`
- `artifacts/new-canvas-storyboard-selection-clear-2026-07-21.png`

`artifacts/new-canvas-audio-ready-2026-07-20.png` 生成于本轮 CosyVoice V2 最终契约确认前，不再作为当前音频节点契约的有效验证证据。`artifacts/qa-core-rebound-upload-reload-2026-07-21.png` 仅记录重绑对象被旧 repair 路径再次删除前的历史瞬时成功，不作为当前对象可用证据。多画布联调截图记录的是临时画布清理后的默认画布和已保存状态；同一 Chromium 会话中另行核对了 `CosyVoice V2`、`longxiaochun_v2`、20000 文本上限及官方参数范围。未点击生成，未产生付费请求。

## 尚未闭合的能力

- LibTV “周星驰经典名场面”的 5 个专用效果模板依赖其私有 `star-video2` 节点和供应商执行协议；本项目当前只完成通用规范 workflow 与用户/团队自定义工具预设，不提供同名专用效果。只有在模型目录、输入输出、计费、任务恢复和产物归档均取得真实可验证契约后，才能把这些模板列为已支持。
- LibTV 音频节点中的停顿、语气词、强度、音色调节和音效尚未找到 CosyVoice V2 HTTP Provider 可安全确认的正式字段，因此当前 UI 不展示、请求不透传，也不以静态选项冒充真实能力。LibTV 显示 50000 字及声调 `-12-12`、音量 `0.01-10`，百炼官方 V2 则限制 20000 字、声调 `0.5-2`、音量 `0-100`；本项目以真实供应商契约为准，保留这项可见差异。最小真实替代是继续使用纯文本标点、分句和换行表达停顿，并在 provider 正式发布对应结构化字段前保持这些控件明确阻断；不能把文本预处理包装成与 LibTV 同名的可精确调节能力。
- 通用 Agent 工具绑定和跨节点独立产物集合仍未完成。当前已完成的是可复用的导演 Agent 配置集合及其可执行导演节点，尚没有任意 Agent 类型、工具权限绑定、Agent 自有媒体集合或跨项目 Agent 运行空间，因此不把导演 Agent 资产扩展解释为完整通用 Agent 平台。
- 创作助手真正多模态仍未完成：运行时文本模型目录目前只有 `deepseek-chat` 与 `qwen-plus`，现有 OpenAI-compatible 文本网关没有经过验证的视觉模型或 multimodal adapter，且网关会持久化上游 request body。前端不提供图片附件入口，只发送选中元素的标题、文本和提示词；后端对任何非空 `attachments` 在调用模型前返回 `400 new_canvas_assistant_vision_unsupported`，图片节点也只作为文字摘要处理，不发送图片内容、素材 URL、`data:`、`blob:` 或 `storageObjectId`。存储层已有对象归属校验与短期签名 URL，但在视觉模型、MIME/大小限制和签名 URL 脱敏审计补齐前，不将其误接为“图片理解”能力。
- 自定义字体运行时已完成当前品牌套件主字体的画布内真实加载：`.ttf/.otf/.woff/.woff2` 通过 10 MB 正式上传策略归档并绑定稳定对象，画布从鉴权内容路由注册字体，应用后的文字保存 custom slot 与品牌字体资产 ID/名称，刷新和跨设备可按项目品牌套件重新加载。当前 Excalidraw 公共生产入口不提供多自定义字体注册表或导出字体嵌入 API，因此同一画布同时保留多套上传字体、切换品牌后保持旧字体独立渲染、PNG/SVG 导出嵌入和字体许可证校验仍未完成；不把当前单一活动主字体能力扩大解释为任意多字体完整所见即所得。
- 完整 Loomic 多人实时协作仍未完成。当前仅有已鉴权、按画布隔离的单服务进程 SSE presence 与 revision 通知；没有 Redis pub/sub 跨实例广播、WebSocket 双向光标/选区协议、CRDT/OT 合并、成员颜色和远端操作数据契约，因此不显示在线成员或远端选区，也不把 revision 通知/轮询误称为完整实时协作。
- 仍需补真实付费模型任务、跨刷新任务恢复、稳定 `storageObjectId` 素材跨设备和 revision 并发的生产端到端验证；当前稳定对象 hydration、鉴权读取与生成入队重签已有代码和 HTTP/模块测试，但尚未在两台真实设备完成生产对象全链路联调。真实供应商自然失败任务的提示、关闭和历史重试也尚无 headed 样本；当前音频闭环已由专项、HTTP 和登录态 Chromium 的非付费路径覆盖，但未实际发起付费音频生成。
- 视频合成使用随包 FFmpeg/ffprobe 二进制，其中 FFmpeg 为 GPLv3 且启用 libx264；正式分发前必须完成 GPLv3 源码提供、许可证通知、构建对应性等合规评审，不能只按普通 npm 依赖发布。

## 代码边界

- `apps/web/new-canvas/index.html`：独立页面入口。
- `apps/web/new-canvas/src/main.jsx`：React 页面装配、本地持久化和宿主操作。
- `apps/web/new-canvas/src/loomic-core`：Excalidraw 编辑器、工具栏、图层、底栏、媒体节点、工作流执行和生成状态管理。
- `apps/web/new-canvas/src/loomic-shell`：菜单、文件面板、项目名、空状态和创作助手侧栏。
- `apps/web/new-canvas/src/app.css`：宿主布局和响应式样式。
- `apps/web/tests/new-canvas*.spec.mjs`：入口、生成、连线、素材、图层、导航、云保存、版本历史与恢复回归测试。

## 构建与验证

```text
npm run build:new-canvas
node --test apps/web/tests/new-canvas*.spec.mjs
git diff --check
npm run dev:background:status
```

构建产物为 `apps/web/new-canvas/app.js`，页面由现有 Web 服务通过 `/new-canvas/` 提供。

## 下一阶段

优先补充真实付费音频任务与跨刷新恢复、真实供应商失败任务的 headed 交互验证、业务项目多画布跨设备切换、稳定对象素材跨设备和 revision 并发的生产端到端验证；待供应商正式契约确认后，再实现 LibTV 的停顿、语气词、强度、音色调节、音效参数和 `star-video2` 类专用视频效果。多人实时协作、多自定义字体并存与导出嵌入、通用 Agent 工具绑定和 Agent 自有产物集合保持独立阶段。视频合成随包 FFmpeg/libx264 的 GPLv3 发布合规必须在正式分发前完成。
