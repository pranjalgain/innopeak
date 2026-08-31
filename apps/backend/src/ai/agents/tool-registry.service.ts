import { ToolDefinition } from '@ai/interfaces/ai-provider.interface';
import { Injectable, Logger } from '@nestjs/common';

import { AgentTool } from './interfaces/tool.interface';

/**
 * Registry for agent tools. Tools are registered at module init time
 * and looked up by name during the agent's tool-calling loop.
 */
@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, AgentTool>();

  /**
   * Register a tool in the registry.
   * Overwrites any existing tool with the same name.
   */
  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
    this.logger.log(`Registered tool: ${tool.name}`);
  }

  /**
   * Look up a tool by name.
   */
  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Return all registered tools.
   */
  getAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Convert all registered tools to ToolDefinition format
   * suitable for passing to AI provider APIs.
   */
  getDefinitions(): ToolDefinition[] {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Find a tool by name and execute it with the provided arguments.
   *
   * @throws Error if the tool is not found.
   * @returns The string result from the tool execution.
   */
  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);

    if (!tool) {
      const available = Array.from(this.tools.keys()).join(', ');
      throw new Error(`Tool "${name}" not found. Available tools: ${available || 'none'}`);
    }

    this.logger.debug(`Executing tool: ${name}`);

    try {
      const result = await tool.execute(args);
      this.logger.debug(`Tool "${name}" completed (${String(result.length)} chars)`);
      return result;
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Tool "${name}" failed: ${message}`);
      throw error;
    }
  }
}
