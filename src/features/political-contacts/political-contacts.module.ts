import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PoliticalContactsService } from './political-contacts.service';
import { PoliticalContactsController } from './political-contacts.controller';
import { PoliticalContact } from './political-contact.entity';
import { TenantModule } from '../../core/modules/tenant-module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PoliticalContact, TenantModule])],
  controllers: [PoliticalContactsController],
  providers: [PoliticalContactsService],
  exports: [PoliticalContactsService],
})
export class PoliticalContactsModule {}
