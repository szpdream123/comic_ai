import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { normalizeCanvasCreditBalance } from "./canvas-generation-credits.js";

const CanvasGenerationConfigContext = createContext({
  api: null,
  config: null,
  status: "idle",
  error: "",
  creditBalance: null,
  creditStatus: "idle",
  creditError: "",
  reload: () => undefined,
});

export function CanvasGenerationConfigProvider({ api, children }) {
  const [state, setState] = useState({ config: null, status: "loading", error: "" });
  const [creditState, setCreditState] = useState({ creditBalance: null, creditStatus: "loading", creditError: "" });
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, status: "loading", error: "" }));
    const request = api?.listGlobalGenerationConfig?.();
    Promise.resolve(request)
      .then((config) => {
        if (active) setState({ config: config ?? null, status: "ready", error: "" });
      })
      .catch(() => {
        if (active) setState({ config: null, status: "error", error: "模型配置加载失败" });
      });
    return () => { active = false; };
  }, [api, reloadKey]);

  useEffect(() => {
    let active = true;
    if (typeof api?.getCreditBalance !== "function") {
      setCreditState({ creditBalance: null, creditStatus: "idle", creditError: "" });
      return () => { active = false; };
    }
    setCreditState({ creditBalance: null, creditStatus: "loading", creditError: "" });
    Promise.resolve()
      .then(() => api.getCreditBalance())
      .then((payload) => {
        if (!active) return;
        const creditBalance = normalizeCanvasCreditBalance(payload);
        if (creditBalance === null) throw new Error("credit_balance_unavailable");
        setCreditState({ creditBalance, creditStatus: "ready", creditError: "" });
      })
      .catch(() => {
        if (active) setCreditState({ creditBalance: null, creditStatus: "error", creditError: "积分余额加载失败" });
      });
    return () => { active = false; };
  }, [api, reloadKey]);

  const value = useMemo(() => ({ ...state, ...creditState, api, reload }), [api, creditState, reload, state]);
  return <CanvasGenerationConfigContext.Provider value={value}>{children}</CanvasGenerationConfigContext.Provider>;
}

export function useCanvasGenerationConfig() {
  return useContext(CanvasGenerationConfigContext);
}
