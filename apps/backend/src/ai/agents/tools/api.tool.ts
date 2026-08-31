import { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AgentTool } from '../interfaces/tool.interface';

/** Maximum response body size (characters) to prevent excessively large payloads. */
const MAX_RESPONSE_SIZE = 10_000;

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Built-in agent tool that makes HTTP requests to allowed URLs.
 *
 * Only URLs matching the configurable whitelist are permitted.
 * Uses the built-in `fetch` API.
 */
@Injectable()
export class ApiTool implements AgentTool {
  private readonly logger = new Logger(ApiTool.name);
  private readonly allowedDomains: string[];

  readonly name = 'http_request';

  readonly description =
    'Make an HTTP request to an allowed external API. ' +
    'Only whitelisted domains are permitted. Supports GET, POST, PUT, ' +
    'and PATCH methods.';

  readonly parameters: Record<string, unknown> = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to send the request to',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH'],
        description: 'HTTP method (default: GET)',
      },
      headers: {
        type: 'object',
        description: 'Optional HTTP headers as key-value pairs',
      },
      body: {
        type: 'string',
        description: 'Optional request body (JSON string)',
      },
    },
    required: ['url'],
  };

  constructor(config: ConfigService<EnvConfig>) {
    // Whitelist is a comma-separated list of allowed domains
    const whitelist = config.get<string>('AGENT_API_ALLOWED_DOMAINS') ?? '';
    this.allowedDomains = whitelist
      .split(',')
      .map(d => d.trim().toLowerCase())
      .filter(d => d.length > 0);

    if (this.allowedDomains.length > 0) {
      this.logger.log(`API tool allowed domains: ${this.allowedDomains.join(', ')}`);
    } else {
      this.logger.warn(
        'No allowed domains configured for API tool (AGENT_API_ALLOWED_DOMAINS). ' +
          'All HTTP requests will be rejected.'
      );
    }
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    const url = args['url'];
    if (typeof url !== 'string' || url.trim().length === 0) {
      return 'Error: "url" parameter is required and must be a non-empty string.';
    }

    // ── Domain whitelist check ───────────────────────────────────────────
    const validationError = this.validateUrl(url);
    if (validationError) {
      return validationError;
    }

    const method = typeof args['method'] === 'string' ? args['method'].toUpperCase() : 'GET';

    if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) {
      return `Error: HTTP method "${method}" is not allowed. Use GET, POST, PUT, or PATCH.`;
    }

    // ── Build headers ────────────────────────────────────────────────────
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (typeof args['headers'] === 'object' && args['headers'] !== null) {
      const customHeaders = args['headers'] as Record<string, unknown>;
      for (const [key, value] of Object.entries(customHeaders)) {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      }
    }

    // ── Execute request ──────────────────────────────────────────────────
    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      };

      if (method !== 'GET' && typeof args['body'] === 'string') {
        fetchOptions.body = args['body'];
      }

      this.logger.debug(`HTTP ${method} ${url}`);

      const response = await fetch(url, fetchOptions);
      const responseText = await response.text();

      const truncated = responseText.length > MAX_RESPONSE_SIZE;
      const body = truncated
        ? `${responseText.slice(0, MAX_RESPONSE_SIZE)}\n\n[Response truncated]`
        : responseText;

      const result =
        `HTTP ${String(response.status)} ${response.statusText}\n` +
        `Content-Type: ${response.headers.get('content-type') ?? 'unknown'}\n\n${body}`;

      this.logger.debug(
        `HTTP ${method} ${url} -> ${String(response.status)} (${String(responseText.length)} chars)`
      );

      return result;
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`HTTP request to ${url} failed: ${message}`);
      return `Error making HTTP request: ${message}`;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private validateUrl(rawUrl: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return 'Error: Invalid URL format.';
    }

    // Only allow HTTPS in production-like checks
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return 'Error: Only HTTP and HTTPS protocols are allowed.';
    }

    if (this.allowedDomains.length === 0) {
      return 'Error: No allowed domains configured. HTTP requests are disabled.';
    }

    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = this.allowedDomains.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return (
        `Error: Domain "${hostname}" is not in the allowed list. ` +
        `Allowed: ${this.allowedDomains.join(', ')}`
      );
    }

    return null;
  }
}
