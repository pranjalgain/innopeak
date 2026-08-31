import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({
    description: 'Notification title',
    example: 'New message received',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(500, { message: 'Title must not exceed 500 characters' })
  title!: string;

  @ApiProperty({
    description: 'Notification body text',
    example: 'You have a new message from John.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Body is required' })
  body!: string;

  @ApiProperty({
    description: 'Notification type for categorization',
    example: 'message',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'Type is required' })
  @MaxLength(50, { message: 'Type must not exceed 50 characters' })
  type!: string;

  @ApiProperty({
    description: 'Delivery channel for the notification',
    enum: ['push', 'email', 'sms', 'in-app'],
    example: 'push',
  })
  @IsString()
  @IsNotEmpty({ message: 'Channel is required' })
  @IsIn(['push', 'email', 'sms', 'in-app'], {
    message: 'Channel must be one of: push, email, sms, in-app',
  })
  channel!: 'email' | 'in-app' | 'push' | 'sms';

  @ApiPropertyOptional({
    description: 'Additional data payload for the notification',
    example: { orderId: '12345', deepLink: '/orders/12345' },
  })
  @IsOptional()
  @IsObject({ message: 'Data must be a valid JSON object' })
  data?: Record<string, unknown>;
}

export class RegisterDeviceFidDto {
  @ApiProperty({
    description: 'Firebase Installation ID (FID) for the device',
    example: 'fid-abc123...',
  })
  @IsString()
  @IsNotEmpty({ message: 'FID is required' })
  fid!: string;

  @ApiProperty({
    description: 'Device platform',
    enum: ['ios', 'android', 'web'],
    example: 'ios',
  })
  @IsString()
  @IsNotEmpty({ message: 'Platform is required' })
  @IsIn(['ios', 'android', 'web'], {
    message: 'Platform must be one of: ios, android, web',
  })
  platform!: 'android' | 'ios' | 'web';
}
