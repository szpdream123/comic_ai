# 新画布章节浏览无法退出

- 症状：剧本创作工作台点「章节浏览」后，整页变成居中章节列表，没有弹层框、关闭按钮和遮罩，无法退出。
- 根因：章节浏览通过 ModalOverlay portal 到 `document.body`。组件用了 `h-[min(80vh,720px)]`、`w-[min(960px,calc(100vw-32px))]` 和章节网格任意类，但当前加载的 `runtime-DvQFP_BS.css` 没有这些 utility。弹层被章节列表撑满视口，标题栏和关闭按钮被裁出屏幕，遮罩也被盖住。
- 修复：在 `runtime-brand-overrides.css` 给 `[aria-label="章节浏览"]` 补上宽高、overflow 和网格约束，并 bump CSS cache。
- 验证：`chapter browse stays a bounded closable dialog` 通过。
- 状态：DONE
