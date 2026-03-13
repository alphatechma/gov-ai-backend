import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PoliticalContactsService } from './political-contacts.service';
import { CreatePoliticalContactDto } from './dto/create-political-contact.dto';
import { UpdatePoliticalContactDto } from './dto/update-political-contact.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('political-contacts')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('political-contacts')
export class PoliticalContactsController {
  constructor(private service: PoliticalContactsService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.service.findAll(req.tenantId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(req.tenantId, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreatePoliticalContactDto) {
    return this.service.create(req.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePoliticalContactDto,
  ) {
    return this.service.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(req.tenantId, id);
  }
}
