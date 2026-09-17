import type {
  ProductionAgentSessionActor,
  ProductionAgentSessionToolId,
} from "./production-agent-session.types.ts";

export interface ProductionAgentJsonSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, ProductionAgentJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: ProductionAgentJsonSchema;
  minLength?: number;
  minimum?: number;
}

export interface ProductionAgentToolExecutionContext {
  conversationId: string;
  agentTaskId: string;
  agentStepId: string;
  actor: ProductionAgentSessionActor;
  callId: string;
}

export interface ProductionAgentToolResult {
  status: "succeeded" | "waiting_approval";
  output: Record<string, unknown>;
}

export interface ProductionAgentToolDefinition {
  id: ProductionAgentSessionToolId;
  description: string;
  effect: "read" | "write" | "ask" | "commit";
  requiredCapability: string;
  inputSchema: ProductionAgentJsonSchema;
  execute(
    input: Record<string, unknown>,
    context: ProductionAgentToolExecutionContext,
  ): Promise<ProductionAgentToolResult>;
}

export class ProductionAgentToolRegistry {
  private readonly tools = new Map<string, ProductionAgentToolDefinition>();

  register(tool: ProductionAgentToolDefinition) {
    if (!tool.id.trim() || this.tools.has(tool.id)) {
      throw new Error("production_agent_tool_registration_conflict");
    }
    if (tool.id === "canvas.patch") {
      throw new Error("production_agent_canvas_tool_forbidden");
    }
    this.tools.set(tool.id, tool);
    return this;
  }

  get(toolId: string) {
    return this.tools.get(toolId);
  }

  listForModel() {
    return [...this.tools.values()].map((tool) => ({
      id: tool.id,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  validate(toolId: string, input: unknown) {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error("production_agent_tool_not_allowed");
    if (toolId === "canvas.patch" || toolId.startsWith("canvas.")) {
      throw new Error("production_agent_canvas_tool_forbidden");
    }
    const errors: string[] = [];
    validateSchema(tool.inputSchema, input, "$", errors);
    if (errors.length) {
      const error = new Error("production_agent_tool_input_invalid");
      Object.assign(error, { validationErrors: errors.slice(0, 20) });
      throw error;
    }
    return input as Record<string, unknown>;
  }

  async execute(
    toolId: string,
    input: unknown,
    context: ProductionAgentToolExecutionContext,
  ) {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error("production_agent_tool_not_allowed");
    if (toolId === "canvas.patch" || toolId.startsWith("canvas.")) {
      throw new Error("production_agent_canvas_tool_forbidden");
    }
    return tool.execute(this.validate(toolId, input), context);
  }
}

function validateSchema(
  schema: ProductionAgentJsonSchema,
  value: unknown,
  path: string,
  errors: string[],
) {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}:object_required`);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) errors.push(`${path}.${key}:required`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in record) validateSchema(child, record[key], `${path}.${key}`, errors);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}:array_required`);
      return;
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchema(schema.items!, item, `${path}[${index}]`, errors));
    }
    return;
  }
  if (schema.type === "string" && typeof value !== "string") errors.push(`${path}:string_required`);
  if (schema.type === "number" && typeof value !== "number") errors.push(`${path}:number_required`);
  if (schema.type === "integer" && !Number.isInteger(value)) errors.push(`${path}:integer_required`);
  if (schema.type === "boolean" && typeof value !== "boolean") errors.push(`${path}:boolean_required`);
  if (schema.minLength && typeof value === "string" && value.length < schema.minLength) {
    errors.push(`${path}:min_length`);
  }
}
