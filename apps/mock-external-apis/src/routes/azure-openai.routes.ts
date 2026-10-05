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

/** Rough token estimate — good enough for exercising `GenerateReplyResult`'s token fields, not a
 *  real tokenizer. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length * 1.3));
}

/**
 * The multi-snippet branch of the real `buildSystemPrompt` (`apps/backend/src/api/ai/utils/
 * prompt-template.util.ts`) asks for "exactly N distinct reply options" and a JSON-array
 * response — matched here by that exact phrase so this mock can honor the same contract and
 * actually exercise `AiReplyGenerationService`'s `parseMultiSnippetReplies` step locally, rather
 * than only ever returning the single-reply shape it did before escalated multi-snippet
 * generation existed. `null` means the ordinary single-reply instruction was sent instead.
 */
function extractRequestedSnippetCount(systemPrompt: string): number | null {
  const match = /write exactly (\d+) distinct reply options/i.exec(systemPrompt);
  return match?.[1] ? Number(match[1]) : null;
}

export const azureOpenAiRouter = Router();

/**
 * Mirrors Azure OpenAI's (and OpenRouter's — same OpenAI-SDK-compatible shape) chat-completions
 * contract closely enough for `AzureOpenAiProvider` to parse the response unmodified: the path
 * shape (`/deployments/:deployment/chat/completions`), the request body (`messages`), and the
 * response body (`choices[0].message.content`, `choices[0].finish_reason`, `usage.*_tokens`).
 * `:deployment` and any `api-version` query param are accepted but ignored — this mock serves one
 * canned "deployment" regardless of name.
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
