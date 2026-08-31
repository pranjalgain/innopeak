import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { MediaResponseDto } from './dto/media-response.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import { FileUploadInterceptor } from './interceptors/file-upload.interceptor';
import { MediaService } from './media.service';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';

@Controller({ path: RouteNames.MEDIA, version: '1' })
@ApiTags('Media')
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @UseInterceptors(FileUploadInterceptor)
  @ApiOperation({ summary: 'Upload a media file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'The file to upload' },
        metadata: { type: 'object', description: 'Optional JSON metadata', nullable: true },
      },
      required: ['file'],
    },
  })
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto
  ): Promise<MediaResponseDto> {
    const mediaFile = await this.mediaService.upload(user.id, file, dto.metadata);

    return MediaResponseDto.fromMediaFile(mediaFile);
  }

  @Get()
  @ApiOperation({ summary: 'List current user media files with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number
  ): Promise<{
    data: MediaResponseDto[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const result = await this.mediaService.getByUserId(user.id, page, pageSize);

    return {
      data: result.data.map(item => MediaResponseDto.fromMediaFile(item)),
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a media file by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Media UUID' })
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<MediaResponseDto> {
    const mediaFile = await this.mediaService.getById(id);
    return MediaResponseDto.fromMediaFile(mediaFile);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a media file (ownership verified)' })
  @ApiParam({ name: 'id', type: String, description: 'Media UUID' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<{ message: string }> {
    await this.mediaService.delete(id, user.id);
    return { message: 'Media deleted successfully' };
  }

  @Get(':id/signed-url')
  @ApiOperation({ summary: 'Get a presigned URL for a media file (ownership verified)' })
  @ApiParam({ name: 'id', type: String, description: 'Media UUID' })
  async getSignedUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<{ signedUrl: string }> {
    const signedUrl = await this.mediaService.getSignedUrl(id, user.id);
    return { signedUrl };
  }
}
