import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiService } from './ai.service';
import { ClaudeAiProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  imports: [ConfigModule],
  providers: [ClaudeAiProvider, OpenAiProvider, AiService],
  exports: [AiService, ClaudeAiProvider, OpenAiProvider],
})
export class AiModule {}
