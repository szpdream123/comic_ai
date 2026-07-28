import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import { createProjectCommand } from "../../../../../packages/contracts/api/project.commands.ts";

import {
  createProjectDraft,
  CreateProjectValidationError,
  type ProjectStore,
} from "./project.service.ts";
import {
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";

export interface ActorContext {
  actorId: string;
  userId: string;
  capabilities: string[];
}

export interface CreateProjectAuditEvent {
  actorId: string;
  userId: string;
  targetId: string;
  eventType: string;
  occurredAt: Date;
}

export interface CreateProjectCommandRequest {
  auth: { sessionToken: string };
  body: {
    name: string;
    scriptInput: string;
    aspectRatio: string;
    resolution: string;
    projectType: string;
  };
  idempotencyKey: string;
  now: Date;
}

export interface CreateProjectCommandResponse {
  status: number;
  body:
    | {
        project: {
          id: string;
          phase: string;
          name: string;
          projectType: string;
        };
        script: {
          id: string;
          status: string;
        };
      }
    | {
        error: string;
        fieldErrors?: Record<string, string>;
      };
}

export function createProjectCommandHandler(deps: {
  store: ProjectStore;
  resolveActorContext: (input: {
    sessionToken: string;
    capability: string;
  }) => Promise<ActorContext>;
  appendAuditEvent: (event: CreateProjectAuditEvent) => Promise<void>;
}) {
  return async function handleCreateProject(
    request: CreateProjectCommandRequest,
  ): Promise<CreateProjectCommandResponse> {
    const actor = await deps.resolveActorContext({
      sessionToken: request.auth.sessionToken,
      capability: capabilities.projectCreate,
    });

    if (!actor.capabilities.includes(capabilities.projectCreate)) {
      return {
        status: 403,
        body: { error: "forbidden" },
      };
    }

    try {
      const created = await createProjectDraft(deps.store, {
        userId: actor.userId,
        createdByUserId: actor.userId,
        name: request.body.name,
        scriptInput: request.body.scriptInput,
        aspectRatio: request.body.aspectRatio,
        resolution: request.body.resolution,
        projectType: request.body.projectType,
        idempotencyKey: request.idempotencyKey,
      });

      if (created.idempotencyResult === "created") {
        await deps.appendAuditEvent({
          actorId: actor.userId,
          userId: actor.userId,
          targetId: created.project.id,
          eventType: createProjectCommand.auditEvent,
          occurredAt: request.now,
        });
      }

      return {
        status: 200,
        body: {
          project: {
            id: created.project.id,
            phase: created.project.phase,
            name: created.project.name,
            projectType: created.project.projectType,
          },
          script: {
            id: created.script.id,
            status: created.script.status,
          },
        },
      };
    } catch (error) {
      if (error instanceof CreateProjectValidationError) {
        return {
          status: 400,
          body: {
            error: "invalid_project_input",
            fieldErrors: error.fieldErrors,
          },
        };
      }

      if (error instanceof IdempotencyConflictError) {
        return {
          status: 409,
          body: { error: error.code },
        };
      }

      if (error instanceof IdempotencyProcessingError) {
        return {
          status: 202,
          body: { error: error.code },
        };
      }

      throw error;
    }
  };
}
