import { Langfuse, type LangfuseGenerationClient } from 'langfuse'; // or "langfuse-node"
import type { CreateLangfuseGenerationBody } from 'langfuse-core';

type LangfuseServiceParams = {
  apiKey: string;
  appName: string;
  baseUrl: string;
};

export default class LangfuseService {
  private client: Langfuse;
  private appName: string;

  constructor(params: LangfuseServiceParams) {
    this.appName = params.appName;
    this.client = new Langfuse({
      publicKey: '{agentplace-platform}',
      secretKey: '{agentplace-platform}',
      baseUrl: params.baseUrl,
      additionalHeaders: {
        'x-access-key': params.apiKey,
      },
    });
  }

  getClient(): Langfuse {
    return this.client;
  }

  trace(options) {
    return this.client.trace({
      ...options,
      name: this.appName,
    });
  }

  span(options) {
    return this.client.span(options);
  }

  generation(options: CreateLangfuseGenerationBody): LangfuseGenerationClient {
    return this.client.generation(options);
  }

  async flush() {
    return this.client.flushAsync();
  }
}
