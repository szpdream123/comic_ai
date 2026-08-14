# Lingxi AI Director Desk Integration

The director desk is only supported as an embedded Lingxi AI module. The production
build is emitted to `apps/web/director-desk/` and loaded when the user opens the director route.
There is no standalone HTML page, iframe entry, dev server, or preview server.

```js
const { mountDirectorDesk, unmountDirectorDesk } = await import("/director-desk/director-desk.js");

mountDirectorDesk(container, {
  instanceId: "optional-local-scene-scope",
  theme: "dark",
  onClose: () => {},
});

unmountDirectorDesk(container);
```

The mount API renders directly into a Shadow DOM root. It does not use an iframe, and its
React, Three.js, styles, local scene state, and event handlers remain isolated from the host page.

Build after changing the director desk source:

```powershell
npm --prefix apps/web/src/features/director-desk run build
```
