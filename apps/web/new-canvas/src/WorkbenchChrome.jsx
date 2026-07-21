import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  renderGlobalStatusbar,
  renderWorkbenchRail,
} from "../../src/features/production-workbench/project-detail.js";
import { creatorApi } from "../../src/shared/creator-api.js";
import { openSharedLoginModal } from "./shared-login.js";

const NAV_PATHS = {
  home: "/",
  tools: "/canvas",
  director: "/#director",
  script: "/script",
  project: "/projects",
  library: "/assets",
  team: "/team",
};

const WORKBENCH_THEME_STORAGE_KEY = "comic-ai:production-workbench-theme";
const WORKBENCH_THEME_IDS = new Set(["starlit", "aurora", "corona", "turquoise", "daylight"]);
const WorkbenchThemeContext = createContext({
  selectedThemeId: "starlit",
  setSelectedThemeId: () => undefined,
});

function normalizeWorkbenchTheme(themeId) {
  return WORKBENCH_THEME_IDS.has(themeId) ? themeId : "starlit";
}

function readWorkbenchThemePreference() {
  try {
    return normalizeWorkbenchTheme(window.localStorage.getItem(WORKBENCH_THEME_STORAGE_KEY));
  } catch {
    return "starlit";
  }
}

function persistWorkbenchThemePreference(themeId) {
  try {
    window.localStorage.setItem(WORKBENCH_THEME_STORAGE_KEY, themeId);
  } catch {
    // Theme persistence is cosmetic; keep the in-memory selection when storage is blocked.
  }
}

export function useWorkbenchTheme() {
  return useContext(WorkbenchThemeContext).selectedThemeId;
}

export function WorkbenchThemeProvider({ children }) {
  const [selectedThemeId, setSelectedThemeId] = useState(readWorkbenchThemePreference);

  useEffect(() => {
    document.body.dataset.workbenchTheme = selectedThemeId;
    persistWorkbenchThemePreference(selectedThemeId);
  }, [selectedThemeId]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === WORKBENCH_THEME_STORAGE_KEY) {
        setSelectedThemeId(normalizeWorkbenchTheme(event.newValue));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo(() => ({ selectedThemeId, setSelectedThemeId }), [selectedThemeId]);
  return <WorkbenchThemeContext.Provider value={value}>{children}</WorkbenchThemeContext.Provider>;
}

export function WorkbenchChrome({ children, view = "detail", embedded: embeddedOverride }) {
  const embedded = embeddedOverride ?? (new URLSearchParams(window.location.search).get("embedded") === "1" || window.parent !== window);
  const [session, setSession] = useState({ authenticated: false });
  const { selectedThemeId, setSelectedThemeId } = useContext(WorkbenchThemeContext);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
    if (embedded) return undefined;
    let active = true;
    creatorApi.getSession({ fresh: true }).then((nextSession) => {
      if (active && nextSession) setSession(nextSession);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [embedded]);

  const statusbar = useMemo(() => renderGlobalStatusbar(session, {
    creditBalance: session?.user?.creditBalance ?? session?.creditBalance ?? 0,
    selectedThemeId,
    themeMenuOpen,
  }), [session, selectedThemeId, themeMenuOpen]);
  const rail = useMemo(() => renderWorkbenchRail("new-canvas", session, {
    newCanvasLabel: view === "list" ? "新画布" : "画布编辑",
  }), [session, view]);

  if (embedded) {
    return <section className="lm-embedded-canvas">{children}</section>;
  }

  const handleChromeClick = (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "toggle-workbench-theme-menu") {
      setThemeMenuOpen((open) => !open);
      return;
    }
    if (action === "select-workbench-theme") {
      setSelectedThemeId(normalizeWorkbenchTheme(target.dataset.themeId));
      setThemeMenuOpen(false);
      return;
    }
    if (action === "set-nav-tab") {
      const path = NAV_PATHS[target.dataset.tab] || "/";
      window.location.href = path;
      return;
    }
    if (action === "logout" && !session?.user?.id && !session?.user?.phone) {
      void openSharedLoginModal();
    }
  };

  return (
    <section className="production-workbench lm-workbench-shell" onClick={handleChromeClick}>
      <div className="lm-shared-rail" dangerouslySetInnerHTML={{ __html: rail }} />
      <section className={`workbench-main tools-mode tools-canvas-${view === "list" ? "list" : "detail"}-mode lm-workbench-main`}>
        <div className="lm-shared-statusbar" dangerouslySetInnerHTML={{ __html: statusbar }} />
        {children}
      </section>
    </section>
  );
}
