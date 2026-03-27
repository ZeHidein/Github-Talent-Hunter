import type { Tool as AiSdkTool } from 'ai';
import type { ToolModel } from './tool-model.ts';
import { getAgentLogger } from '../types/logger.ts';

export interface IToolRegistry {
  registerTool(tool: ToolModel): void;
  getToolByName(name: string): ToolModel | undefined;
  getAllTools(): ToolModel[];
  getAllAiSdkTools(): Array<AiSdkTool<unknown, unknown>>;
}

export class ToolRegistry implements IToolRegistry {
  private tools: Map<string, ToolModel> = new Map();

  constructor(tools?: ToolModel[]) {
    if (tools) {
      this.registerTools(tools);
    }
  }

  public registerTool(tool: ToolModel): void {
    if (this.tools.has(tool.getName())) {
      getAgentLogger().warn(
        `Tool with name "${tool.getName()}" is already registered. Overwriting.`,
      );
    }
    this.tools.set(tool.getName(), tool);
  }

  public registerTools(tools: ToolModel[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  public getToolByName(name: string): ToolModel | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): ToolModel[] {
    return Array.from(this.tools.values());
  }

  public getAllAiSdkTools(): Array<AiSdkTool<unknown, unknown>> {
    const tools: Array<AiSdkTool<unknown, unknown>> = [];
    for (const toolModel of this.tools.values()) {
      const t = toolModel.getAiSdkTool();
      if (t) {
        tools.push(t);
      }
    }
    return tools;
  }
}
