import { type Locale, SUPPORTED_LOCALES } from '@common/i18n/locale';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateLocaleDto {
  @ApiProperty({
    example: 'de',
    enum: SUPPORTED_LOCALES,
    description: 'The language the user wants API responses rendered in from now on.',
  })
  @IsIn(SUPPORTED_LOCALES, { message: `locale must be one of: ${SUPPORTED_LOCALES.join(', ')}` })
  locale!: Locale;
}
