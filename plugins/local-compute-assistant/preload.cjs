const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("localCompute", {
  onProcess(handler) {
    ipcRenderer.on("depth:process", (_event, job) => handler(job));
  },
  complete(result) {
    ipcRenderer.send("depth:complete", result);
  },
  ready() {
    ipcRenderer.send("depth:renderer-ready");
  }
});
