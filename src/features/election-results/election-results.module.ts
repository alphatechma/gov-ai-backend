import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElectionResultsController } from './election-results.controller';
import { ElectionProxyService } from './election-proxy.service';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TenantModule])],
  controllers: [ElectionResultsController],
  providers: [ElectionProxyService],
  exports: [ElectionProxyService],
})
export class ElectionResultsModule {}
