import { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

/**
 * Both fields optional because the UI's channel toggle and active switch fire independently. A body
 * with neither is rejected in the service: "at least one of two" is a whole-object rule.
 */
export class UpdateNotificationRecipientDto {
  @ApiPropertyOptional({
    example: NotificationChannelPref.EMAIL,
    enum: NotificationChannelPref,
    description:
      'The recipient’s preference — accepted and stored regardless of whether anything dispatches ' +
      'over it yet. No escalation composer exists in this pass (see the notifications module’s ' +
      'own docs), so this is pure configuration for now, not a live setting with an immediate effect.',
  })
  @IsOptional()
  @IsEnum(NotificationChannelPref, {
    message: `channel must be one of: ${Object.values(NotificationChannelPref).join(', ')}`,
  })
  channel?: NotificationChannelPref;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
