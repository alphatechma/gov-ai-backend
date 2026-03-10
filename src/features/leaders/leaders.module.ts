import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadersService } from './leaders.service';
import { LeadersController } from './leaders.controller';
import { Leader } from './leader.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';
import { UsersModule } from '../../core/users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Leader, TenantModule]), UsersModule],
  controllers: [LeadersController],
  providers: [LeadersService],
  exports: [LeadersService],
})
export class LeadersModule {}
