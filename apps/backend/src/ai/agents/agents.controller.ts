import { ChatMessage } from '@ai/interfaces/ai-provider.interface';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AgentService } from './agent.service';
import { ChatRequestDto } from './dto/chat.dto';
import { AgentResult } from './interfaces/agent.interface';

@Controller({ path: RouteNames.AI, version: '1' })
@ApiTags('AI')
@ApiBearerAuth()
export class AgentsController {
  constructor(private readonly agentService: AgentService) {}

  // ─── Chat ──────────────────────────────────────────────────────────────────

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a message to the AI agent',
    description:
      'Sends a message and receives a response. If conversationId is provided, ' +
      'the message is appended to an existing conversation. Otherwise, a new ' +
      'conversation is created. The agent may use tools (RAG search, database, etc.) ' +
      'to gather information before responding.',
  })
  async chat(@CurrentUser() user: AuthUser, @Body() dto: ChatRequestDto): Promise<AgentResult> {
    const result = await this.agentService.chat(user.id, dto.conversationId ?? null, dto.message, {
      ...(dto.model !== undefined ? { model: dto.model } : {}),
      ...(dto.systemPrompt !== undefined ? { systemPrompt: dto.systemPrompt } : {}),
      ...(dto.temperature !== undefined ? { temperature: dto.temperature } : {}),
      ...(dto.maxTurns !== undefined ? { maxTurns: dto.maxTurns } : {}),
    });

    return result;
  }

  // ─── Conversations ─────────────────────────────────────────────────────────

  @Get('conversations')
  @ApiOperation({
    summary: 'List user conversations',
    description: "Returns a paginated list of the authenticated user's conversations.",
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async listConversations(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number
  ): Promise<{
    data: Array<{
      id: string;
      title: string | null;
      model: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const result = await this.agentService.listConversations(user.id, page, pageSize);

    return {
      data: result.data.map(conversation => ({
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      })),
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary: 'Get a conversation with messages',
    description: 'Returns a single conversation including all its messages.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Conversation UUID' })
  async getConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() _user: AuthUser
  ): Promise<{
    id: string;
    title: string | null;
    model: string;
    systemPrompt: string | null;
    messages: ChatMessage[];
    createdAt: Date;
  }> {
    const conversation = await this.agentService.getConversation(id);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      id: conversation.conversationId,
      title: conversation.title,
      model: conversation.model,
      systemPrompt: conversation.systemPrompt,
      messages: conversation.messages,
      createdAt: conversation.createdAt,
    };
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a conversation',
    description: 'Permanently deletes a conversation and all its messages.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Conversation UUID' })
  async deleteConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() _user: AuthUser
  ): Promise<void> {
    // Verify the conversation exists before deleting
    const conversation = await this.agentService.getConversation(id);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    await this.agentService.deleteConversation(id);
  }
}
