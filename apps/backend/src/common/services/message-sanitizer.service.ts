import { Injectable } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

@Injectable()
export class MessageSanitizer {
  sanitizeMessage(message: string): string {
    if (!message) return '';

    // Remove HTML tags (XSS prevention)
    const sanitized = sanitizeHtml(message, {
      allowedTags: [],
      allowedAttributes: {},
    });

    return sanitized;
  }
}
