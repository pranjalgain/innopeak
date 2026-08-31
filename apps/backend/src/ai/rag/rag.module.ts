import { Module } from '@nestjs/common';

import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { RagService } from './rag.service';
import { RetrievalService } from './retrieval.service';

import { AiModule } from '../ai.module';

@Module({
  imports: [AiModule],
  providers: [ChunkingService, EmbeddingService, RetrievalService, RagService],
  exports: [RagService, RetrievalService],
})
export class RagModule {}
