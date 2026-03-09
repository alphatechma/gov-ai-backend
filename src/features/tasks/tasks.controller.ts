import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('tasks')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('tasks')
export class TasksController {
  constructor(private service: TasksService) {}

  @Get()
  findAll(@Req() req: any) { return this.service.findAll(req.tenantId); }

  @Get(':id')
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(req.tenantId, id); }

  @Post()
  create(@Req() req: any, @Body() dto: CreateTaskDto) { return this.service.create(req.tenantId, dto); }

  @Patch('reorder')
  reorder(@Req() req: any, @Body() items: { id: string; column: string; position: number }[]) {
    return this.service.reorder(req.tenantId, items);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) { return this.service.update(req.tenantId, id, dto); }

  @Delete(':id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(req.tenantId, id); }
}
