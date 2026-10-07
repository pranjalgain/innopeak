import { Router } from 'express';

import { composeMockReply } from '../utils/compose-mock-reply';
import { extractReviewContext } from '../utils/extract-review-context';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionsRequestBody {
  messages?: ChatMessage[];
}

/** Rough estimate, not a real tokenizer. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length * 1.3));
}

/**
 * Matches the real `buildSystemPrompt` multi-snippet instruction ("exactly N distinct reply
 * options", JSON-array response) so the mock exercises `parseMultiSnippetReplies`. `null` means the
 * single-reply instruction was sent.
 */
function extractRequestedSnippetCount(systemPrompt: string): number | null {
  const match = /write exactly (\d+) distinct reply options/i.exec(systemPrompt);
  return match?.[1] ? Number(match[1]) : null;
}

export const azureOpenAiRouter = Router();

/**
 * Mirrors the OpenAI-compatible chat-completions contract closely enough for `AzureOpenAiProvider`
 * to parse it unmodified. `:deployment` and `api-version` are accepted but ignored.
 */
azureOpenAiRouter.post(
  '/deployments/:deployment/chat/completions',
  (req: { body: ChatCompletionsRequestBody }, res) => {
    const systemMessage = req.body.messages?.find(message => message.role === 'system');
    const userMessage = req.body.messages?.find(message => message.role === 'user');
    const context = extractReviewContext(userMessage?.content ?? '');

    const snippetCount = extractRequestedSnippetCount(systemMessage?.content ?? '');
    const content =
      snippetCount !== null && snippetCount > 1
        ? JSON.stringify(
            Array.from({ length: snippetCount }, (_, index) => composeMockReply(context, index))
          )
        : composeMockReply(context);

    res.json({
      choices: [
        {
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: estimateTokens(userMessage?.content ?? ''),
        completion_tokens: estimateTokens(content),
      },
    });
  }
);
