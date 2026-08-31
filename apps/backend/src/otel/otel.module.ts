import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OtelService } from './otel.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [OtelService],
  exports: [OtelService],
})
export class OtelModule {}
