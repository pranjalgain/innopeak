import { AiModule } from '@ai/ai.module';
import { RagModule } from '@ai/rag/rag.module';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgentService } from './agent.service';
import { AgentsController } from './agents.controller';
import { ConversationMemoryService } from './conversation-memory.service';
import { ToolRegistryService } from './tool-registry.service';
import { ApiTool } from './tools/api.tool';
import { DatabaseTool } from './tools/database.tool';
import { SearchTool } from './tools/search.tool';

@Module({
  imports: [ConfigModule, AiModule, RagModule],
  controllers: [AgentsController],
  providers: [
    ConversationMemoryService,
    ToolRegistryService,
    AgentService,
    SearchTool,
    DatabaseTool,
    ApiTool,
  ],
  exports: [AgentService],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly searchTool: SearchTool,
    private readonly databaseTool: DatabaseTool,
    private readonly apiTool: ApiTool
  ) {}

  onModuleInit(): void {
    // Register all built-in tools in the registry
    this.toolRegistry.register(this.searchTool);
    this.toolRegistry.register(this.databaseTool);
    this.toolRegistry.register(this.apiTool);
  }
}
