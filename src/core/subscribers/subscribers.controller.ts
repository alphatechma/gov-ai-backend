import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { ListSubscribersDto } from './dto/list-subscribers.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../shared/enums';

@Controller('subscribers')
export class SubscribersController {
  constructor(private subscribersService: SubscribersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async findMine(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId?: string | null,
  ) {
    const sub = await this.subscribersService.findActiveForContext(
      userId,
      tenantId,
    );
    if (!sub) return { hasSubscription: false };
    return {
      hasSubscription: true,
      id: sub.id,
      active: sub.active,
      startDate: sub.startDate,
      endDate: sub.endDate,
      trialEndsAt: sub.trialEndsAt,
      plan: {
        id: sub.plan.id,
        name: sub.plan.name,
        billingCycle: sub.plan.billingCycle,
        price: sub.plan.price,
      },
    };
  }

  @Post('me/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  cancelMine(
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId?: string | null,
  ) {
    return this.subscribersService.cancelByContext(userId, tenantId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Query() query: ListSubscribersDto) {
    return this.subscribersService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscribersService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateSubscriberDto) {
    return this.subscribersService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriberDto,
  ) {
    return this.subscribersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscribersService.remove(id);
  }
}
