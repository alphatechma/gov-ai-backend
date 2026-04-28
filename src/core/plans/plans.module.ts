import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { Plan } from './plan.entity';
import { SystemModule } from '../modules/system-module.entity';
import { ModulesExistByNameValidator } from './validators/modules-exist.validator';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, SystemModule]), AuthModule],
  controllers: [PlansController],
  providers: [PlansService, ModulesExistByNameValidator],
  exports: [PlansService],
})
export class PlansModule {}
