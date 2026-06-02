import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

export type TextGatewayChatCompletionRequest = {
  model: string;
  messages: ChatCompletionMessageParam[];
  stream: true;
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
  stream_options?: { include_usage?: boolean };
};

export type TextGatewayChatCompletionChunk = ChatCompletionChunk;

export interface OpenAICompatibleClientConfig {
  baseURL: string;
  apiKey: string;
}

export interface OpenAICompatibleClient {
  chat: {
    completions: {
      create(
        request: TextGatewayChatCompletionRequest,
        options?: { signal?: AbortSignal },
      ): Promise<AsyncIterable<TextGatewayChatCompletionChunk>>;
    };
  };
}

export class OpenAICompatibleTextAdapter {
  constructor(
    private readonly config: {
      clientFactory?: (
        config: OpenAICompatibleClientConfig,
      ) => OpenAICompatibleClient;
    } = {},
  ) {}

  async createChatCompletionStream(input: {
    baseURL: string;
    apiKey: string;
    providerModel: string;
    request: TextGatewayChatCompletionRequest;
    signal?: AbortSignal;
  }): Promise<AsyncIterable<TextGatewayChatCompletionChunk>> {
    const client = this.createClient({
      baseURL: input.baseURL,
      apiKey: input.apiKey,
    });

    return client.chat.completions.create(
      {
        ...input.request,
        model: input.providerModel,
        stream: true,
        stream_options: {
          ...input.request.stream_options,
          include_usage: true,
        },
      },
      { signal: input.signal },
    );
  }

  private createClient(config: OpenAICompatibleClientConfig) {
    if (this.config.clientFactory) {
      return this.config.clientFactory(config);
    }

    return new OpenAI(config) as unknown as OpenAICompatibleClient;
  }
}
