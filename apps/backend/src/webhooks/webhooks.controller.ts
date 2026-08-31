import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhookDeliveryResponseDto, WebhookResponseDto } from './dto/webhook-response.dto';
import { WebhooksService } from './webhooks.service';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';

@Controller({ path: RouteNames.WEBHOOKS, version: '1' })
@ApiTags('Webhooks')
@ApiBearerAuth()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new webhook subscription' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWebhookDto
  ): Promise<WebhookResponseDto> {
    const webhook = await this.webhooksService.create(user.id, dto);
    return WebhookResponseDto.fromRecord(webhook);
  }

  @Get()
  @ApiOperation({ summary: 'List all webhooks for the current user' })
  async findAll(@CurrentUser() user: AuthUser): Promise<{ data: WebhookResponseDto[] }> {
    const webhooks = await this.webhooksService.findAllByUser(user.id);
    return {
      data: webhooks.map(w => WebhookResponseDto.fromRecord(w)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get webhook details by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook UUID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser
  ): Promise<WebhookResponseDto> {
    const webhook = await this.webhooksService.findOne(id, user.id);
    return WebhookResponseDto.fromRecord(webhook);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateWebhookDto
  ): Promise<WebhookResponseDto> {
    const webhook = await this.webhooksService.update(id, user.id, dto);
    return WebhookResponseDto.fromRecord(webhook);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook UUID' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser
  ): Promise<void> {
    await this.webhooksService.remove(id, user.id);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'List delivery attempts for a webhook' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async getDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number
  ): Promise<{
    data: WebhookDeliveryResponseDto[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const result = await this.webhooksService.getDeliveries(id, user.id, page, pageSize);

    return {
      data: result.data.map(d => WebhookDeliveryResponseDto.fromRecord(d)),
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test event to verify the webhook endpoint' })
  @ApiParam({ name: 'id', type: String, description: 'Webhook UUID' })
  async sendTestEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser
  ): Promise<{ message: string; delivery: WebhookDeliveryResponseDto }> {
    const delivery = await this.webhooksService.sendTestEvent(id, user.id);
    return {
      message: 'Test webhook delivery queued',
      delivery: WebhookDeliveryResponseDto.fromRecord(delivery),
    };
  }
}
