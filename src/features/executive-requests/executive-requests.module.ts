import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutiveRequestsService } from './executive-requests.service';
import { ExecutiveRequestsController } from './executive-requests.controller';
import { ExecutiveRequest } from './executive-request.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExecutiveRequest, TenantModule])],
  controllers: [ExecutiveRequestsController],
  providers: [ExecutiveRequestsService],
  exports: [ExecutiveRequestsService],
})
export class ExecutiveRequestsModule {}
