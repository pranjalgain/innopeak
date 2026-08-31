/**
 * Configuration shape for the AI module.
 * Values are read from environment variables via ConfigService.
 */
export interface AiConfig {
  defaultProvider: 'claude' | 'openai';
  claudeApiKey?: string;
  claudeDefaultModel?: string;
  openaiApiKey?: string;
  openaiDefaultModel?: string;
}
