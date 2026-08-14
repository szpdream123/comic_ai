# 灵曦AI 3D 导演台

本目录只提供灵曦AI内嵌的 3D 导演台模块，不再提供独立网页、iframe 入口或单独预览服务。

导演台由 `apps/web/src/features/production-workbench/index.js` 在用户进入灵曦AI“导演台”页面时动态加载，并通过 `mountDirectorDesk` 挂载到 Shadow DOM。导演台清单与场景数据均通过认证后端接口按当前主用户持久化。

## 开发命令

运行测试：

```powershell
npm --prefix apps/web/src/features/director-desk test
```

生成灵曦AI加载的模块：

```powershell
npm --prefix apps/web/src/features/director-desk run build
```

构建产物写入 `apps/web/director-desk/`。该目录只应包含 JavaScript 模块、模型和其他运行时资源，不包含独立 `index.html`。

## 集成方式

唯一受支持的入口是：

```js
const { mountDirectorDesk, unmountDirectorDesk } = await import("/director-desk/director-desk.js");

mountDirectorDesk(container, {
  instanceId: "optional-director-desk-id",
  theme: "dark",
  onClose: () => {},
});
```

具体约束见 [INTEGRATION.md](INTEGRATION.md)。上游许可证保留在 [LICENSE](LICENSE)。
