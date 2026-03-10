import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';
import { WhatsappService } from './whatsapp.service';
import { SendMessageDto, BroadcastDto } from './dto/send-message.dto';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  // ── Connection ──

  @Get('connection')
  getConnection(@Req() req: any) {
    return this.whatsappService.getConnection(req.tenantId);
  }

  @Post('connection/start')
  startConnection(@Req() req: any) {
    return this.whatsappService.startConnection(req.tenantId, req.user.id);
  }

  @Delete('connection')
  disconnect(@Req() req: any) {
    return this.whatsappService.disconnectConnection(req.tenantId);
  }

  // ── Messaging ──

  @Post('send')
  sendMessage(@Req() req: any, @Body() dto: SendMessageDto) {
    return this.whatsappService.sendMessage(req.tenantId, dto.phone, dto.content, dto.quotedId);
  }

  @Post('broadcast')
  broadcast(@Req() req: any, @Body() dto: BroadcastDto) {
    return this.whatsappService.broadcast(req.tenantId, dto.phones, dto.content);
  }

  // ── Chat History ──

  @Get('chats')
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

  // DEBUG: remove after testing
  @Get('debug/messages')
  async debugMessages(@Req() req: any) {
    return this.whatsappService.debugMessages(req.tenantId);
  }

  @Get('chats/search')
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
