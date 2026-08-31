/**
 * Interface that all agent tools must implement.
 *
 * Tools are registered in the ToolRegistryService and invoked
 * by the agent orchestrator when the AI model issues tool calls.
 */
export interface AgentTool {
  /** Unique tool name (must match the name sent to the AI provider). */
  readonly name: string;

  /** Human-readable description for the AI model. */
  readonly description: string;

  /** JSON Schema describing the tool's input parameters. */
  readonly parameters: Record<string, unknown>;

  /**
   * Execute the tool with the given arguments.
   *
   * @param args - Parsed arguments from the AI model's tool call.
   * @returns A string result that will be sent back to the model as a tool response.
   */
  execute: (args: Record<string, unknown>) => Promise<string>;
}
