import { Module } from '@nestjs/common';
import { OtelModule } from '@otel/otel.module';

import { TracingController } from './tracing.controller';

@Module({
  imports: [OtelModule],
  controllers: [TracingController],
  providers: [],
})
export class TracingModule {}
