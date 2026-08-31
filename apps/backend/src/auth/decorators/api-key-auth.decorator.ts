import type { CustomDecorator } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';

export const API_KEY_AUTH_KEY = 'apiKeyAuth';

/**
 * Marks a route as requiring API key authentication via the X-API-Key header.
 * When applied, the ApiKeyGuard will validate the provided API key
 * against stored keys in the database.
 */
export const ApiKeyAuth = (): CustomDecorator<string> => SetMetadata(API_KEY_AUTH_KEY, true);
