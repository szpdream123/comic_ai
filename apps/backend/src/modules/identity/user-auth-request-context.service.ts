import { AsyncLocalStorage } from "node:async_hooks";

import type { AuthenticatedUserSession } from "./user-auth.service.ts";
import type { UserActorContext } from "./user-actor-context.service.ts";

interface UserAuthRequestState {
  active: boolean;
  requestContext?: object;
  authenticatedByToken: Map<string, AuthenticatedUserSession>;
  actorByScope: Map<string, UserActorContext>;
}

const userAuthRequestStorage = new AsyncLocalStorage<UserAuthRequestState>();

export function runWithUserAuthRequestContext<T>(
  run: () => Promise<T>,
  requestContext?: object,
): Promise<T> {
  const state: UserAuthRequestState = {
    active: true,
    requestContext,
    authenticatedByToken: new Map(),
    actorByScope: new Map(),
  };
  return userAuthRequestStorage.run(state, async () => {
    try {
      return await run();
    } finally {
      state.active = false;
      state.authenticatedByToken.clear();
      state.actorByScope.clear();
    }
  });
}

export function getUserAuthRequestContext(): object | undefined {
  const state = userAuthRequestStorage.getStore();
  return state?.active ? state.requestContext : undefined;
}

export function rememberRequestUserActor(
  sessionToken: string,
  projectId: string | undefined,
  actor: UserActorContext,
): void {
  const state = userAuthRequestStorage.getStore();
  if (state?.active) {
    state.actorByScope.set(actorScopeKey(sessionToken, projectId), actor);
  }
}

export function getRequestUserActor(
  sessionToken: string,
  projectId: string | undefined,
): UserActorContext | undefined {
  const state = userAuthRequestStorage.getStore();
  return state?.active
    ? state.actorByScope.get(actorScopeKey(sessionToken, projectId))
    : undefined;
}

function actorScopeKey(sessionToken: string, projectId: string | undefined): string {
  return `${sessionToken}\u0000${projectId ?? ""}`;
}

export function rememberRequestAuthenticatedUser(
  authenticated: AuthenticatedUserSession,
): void {
  const state = userAuthRequestStorage.getStore();
  if (state?.active) {
    state.authenticatedByToken.set(authenticated.sessionToken, authenticated);
  }
}

export function getRequestAuthenticatedUser(
  sessionToken: string,
  now: Date,
): AuthenticatedUserSession | undefined {
  const state = userAuthRequestStorage.getStore();
  const authenticated = state?.active
    ? state.authenticatedByToken.get(sessionToken)
    : undefined;
  if (
    !authenticated ||
    authenticated.session.status !== "active" ||
    authenticated.session.expiresAt.getTime() <= now.getTime()
  ) {
    return undefined;
  }
  return authenticated;
}
