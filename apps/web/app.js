import { creatorApi, resolveApiUrl } from "./src/shared/creator-api.js";
import { initProductionWorkbench } from "./src/features/production-workbench/index.js?script-library-refresh=1";

const root = document.querySelector("#creator-app");
const loginUrl =
  window.location.protocol === "file:"
    ? resolveApiUrl("/login.html")
    : new URL("/login.html", window.location.origin).toString();
const LOCAL_STORAGE_PREFIXES = ["comic-ai-project-library", "comic-ai:production-workbench:"];

if (!root) {
  throw new Error("creator_app_mount_missing");
}

async function bootstrap() {
  try {
    console.log("[creator-app] bootstrap:start");
    const session = await creatorApi.getSession();
    console.log("[creator-app] bootstrap:session", {
      userId: session?.user?.id ?? null,
      phone: session?.user?.phone ?? null,
    });
    await initProductionWorkbench({
      root,
      session,
      api: creatorApi,
      onLogout: async () => {
        await creatorApi.logout();
        clearCreatorBrowserStorage();
        window.location.replace(loginUrl);
      },
    });
    console.log("[creator-app] bootstrap:ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[creator-app] bootstrap:error", error);
    if (message === "unauthenticated") {
      clearCreatorBrowserStorage();
      window.location.href = loginUrl;
      return;
    }
    await initProductionWorkbench({
      root,
      session: {
        authenticated: false,
        user: {
          id: "",
          phone: "",
        },
        bootstrapError: message,
      },
      api: createRecoverableApi(creatorApi, message),
      onLogout: async () => {
        await creatorApi.logout().catch(() => undefined);
        clearCreatorBrowserStorage();
        window.location.replace(loginUrl);
      },
    });
  }
}

function createRecoverableApi(api, bootstrapError) {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "getSession") {
        return async () => ({
          authenticated: false,
          user: { id: "", phone: "" },
          bootstrapError,
        });
      }
      return value;
    },
  });
}

function clearCreatorBrowserStorage() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be blocked in private or file-based browser contexts.
  }

  try {
    sessionStorage.clear();
  } catch {
    // Keep navigation working even when browser storage is unavailable.
  }
}

bootstrap();
