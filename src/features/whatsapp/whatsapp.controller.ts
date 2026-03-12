import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';
import { WhatsappService } from './whatsapp.service';
import { SendMessageDto, BroadcastDto } from './dto/send-message.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  // ── Webhook (no auth — called by Evolution API) ──

  @Post('webhook/:tenantId')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Param('tenantId') tenantId: string, @Body() body: any) {
    // Fire-and-forget: don't block the Evolution API response
    this.whatsappService.handleWebhook(tenantId, body).catch(() => {});
    return { received: true };
  }

  // ── Protected endpoints ──

  @Get('connection')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  getConnection(@Req() req: any) {
    return this.whatsappService.getConnection(req.tenantId);
  }

  @Post('connection/start')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  startConnection(@Req() req: any) {
    return this.whatsappService.startConnection(req.tenantId, req.user.id);
  }

  @Delete('connection')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  disconnect(@Req() req: any) {
    return this.whatsappService.disconnectConnection(req.tenantId);
  }

  // ── Messaging ──

  @Post('send')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  sendMessage(@Req() req: any, @Body() dto: SendMessageDto) {
    return this.whatsappService.sendMessage(req.tenantId, dto.phone, dto.content, dto.quotedId);
  }

  @Post('broadcast')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  broadcast(@Req() req: any, @Body() dto: BroadcastDto) {
    return this.whatsappService.broadcast(req.tenantId, dto.phones, dto.content);
  }

  // ── Chat History ──

  @Get('chats')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  getChats(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.whatsappService.getChats(
      req.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 30,
    );
  }

  @Get('chats/messages')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  getChatMessages(
    @Req() req: any,
    @Query('phone') phone: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.whatsappService.getChatMessages(
      req.tenantId,
      phone,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('chats/search')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  searchMessages(
    @Req() req: any,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.whatsappService.searchMessages(
      req.tenantId,
      query,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
