# 上游来源

本模块基于 MIT 开源项目改造为灵曦AI内嵌 3D 导演台：

- 上游仓库：<https://github.com/jiguang132/storyai-3d-director-desk>
- 初始同步提交：`8c8bd36`
- 保留上游 `LICENSE`。

本地改动目标：

1. 只作为灵曦AI生产工作台的 Shadow DOM 模块运行；
2. 不提供独立 HTML、iframe、单独开发服务器或预览服务器；
3. 场景切换、主题和关闭行为由灵曦AI宿主直接传入；
4. 截图结果通过宿主桥接交给灵曦AI处理。
