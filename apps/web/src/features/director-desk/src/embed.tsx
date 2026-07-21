import React from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import directorDeskStyles from "./styles/index.css?inline";
import objectMotionTransportStyles from "./editor/motion/objectMotionTransport.css?inline";
import { applyDirectorDeskTheme, setDirectorDeskThemeRoot } from "./editor/theme/themeRoot";
import {
  clearDirectorDeskNotificationHandler,
  setDirectorDeskNotificationHandler,
  type DirectorDeskNotificationTone,
} from "./editor/io/hostNotification";
import {
  clearDirectorDeskPanoramaUploadHandler,
  setDirectorDeskPanoramaUploadHandler,
  type DirectorDeskPanoramaUploadResult,
} from "./editor/io/hostUpload";

export interface MountDirectorDeskOptions {
  instanceId?: string;
  onClose?: () => void;
  onRequireLogin?: () => void | Promise<void>;
  onAuthorizeCreate?: (options?: { interactive?: boolean }) => boolean | Promise<boolean>;
  onNotify?: (message: string, tone: DirectorDeskNotificationTone) => void;
  onUploadPanorama?: (file: File) => Promise<DirectorDeskPanoramaUploadResult>;
  initialScreen?: "home" | "editor";
  theme?: "dark" | "light";
  authenticated?: boolean;
  canManageDesks?: boolean;
}

interface MountedDirectorDesk {
  reactRoot: Root;
  shadowRoot: ShadowRoot;
}

const mountedDirectorDesks = new WeakMap<HTMLElement, MountedDirectorDesk>();

function scopeDirectorDeskStyles(css: string) {
  return css
    .replace(/:root\[data-theme="dark"\]/g, ':host([data-theme="dark"])')
    .replace(/:root\.dark/g, ":host(.dark)")
    .replace(/:root\s*\{/g, ":host {")
    .replace(/html,\s*\nbody,\s*\n#root/g, ":host,\n.director-desk-root")
    .replace(/^body\s*\{/gm, ".director-desk-root {");
}

export function mountDirectorDesk(container: HTMLElement, options: MountDirectorDeskOptions = {}) {
  unmountDirectorDesk(container);

  const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: "open" });
  shadowRoot.replaceChildren();

  const style = document.createElement("style");
  style.textContent = `${scopeDirectorDeskStyles(directorDeskStyles)}
${objectMotionTransportStyles}

:host { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.director-desk-root { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.app-shell { min-height: 0; }
`;

  const mountNode = document.createElement("div");
  mountNode.className = "director-desk-root";
  shadowRoot.append(style, mountNode);

  setDirectorDeskThemeRoot(container);
  setDirectorDeskNotificationHandler(options.onNotify);
  setDirectorDeskPanoramaUploadHandler(options.onUploadPanorama);
  applyDirectorDeskTheme(options.theme ?? "dark");

  const reactRoot = createRoot(mountNode);
  mountedDirectorDesks.set(container, { reactRoot, shadowRoot });
  reactRoot.render(
    <React.StrictMode>
      <App
        initialInstanceId={options.instanceId}
        onClose={options.onClose}
        onRequireLogin={options.onRequireLogin}
        onAuthorizeCreate={options.onAuthorizeCreate}
        initialScreen={options.initialScreen}
        theme={options.theme ?? "dark"}
        authenticated={options.authenticated ?? true}
        canManageDesks={options.canManageDesks ?? true}
      />
    </React.StrictMode>
  );

  return () => unmountDirectorDesk(container);
}

export function unmountDirectorDesk(container: HTMLElement) {
  const mounted = mountedDirectorDesks.get(container);
  if (!mounted) return;

  mounted.reactRoot.unmount();
  mounted.shadowRoot.replaceChildren();
  mountedDirectorDesks.delete(container);
  clearDirectorDeskNotificationHandler();
  clearDirectorDeskPanoramaUploadHandler();
  setDirectorDeskThemeRoot(null);
}
