import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VotersService } from './voters.service';
import { VotersController } from './voters.controller';
import { Voter } from './voter.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';
import { GeocodingService } from '../../shared/services/geocoding.service';

@Module({
  imports: [TypeOrmModule.forFeature([Voter, TenantModule])],
  controllers: [VotersController],
  providers: [VotersService, GeocodingService],
  exports: [VotersService],
})
export class VotersModule {}
