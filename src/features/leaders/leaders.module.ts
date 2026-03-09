import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadersService } from './leaders.service';
import { LeadersController } from './leaders.controller';
import { Leader } from './leader.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Leader, TenantModule])],
  controllers: [LeadersController],
  providers: [LeadersService],
  exports: [LeadersService],
})
export class LeadersModule {}
