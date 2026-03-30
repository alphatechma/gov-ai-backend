import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
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
    return this.whatsappService.sendMessage(
      req.tenantId,
      dto.phone,
      dto.content,
      dto.quotedId,
    );
  }

  @Post('send-media')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }))
  sendMedia(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('phone') phone: string,
    @Body('caption') caption?: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo é obrigatório');
    if (!phone) throw new BadRequestException('Telefone é obrigatório');
    return this.whatsappService.sendMedia(
      req.tenantId,
      phone,
      { buffer: file.buffer, mimetype: file.mimetype, originalname: file.originalname },
      caption,
    );
  }

  @Post('broadcast')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  broadcast(@Req() req: any, @Body() dto: BroadcastDto) {
    return this.whatsappService.broadcast(
      req.tenantId,
      dto.phones,
      dto.content,
    );
  }

  // ── Media Proxy ──

  @Get('media/:messageId')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  async getMedia(
    @Req() req: any,
    @Param('messageId') messageId: string,
    @Res() res: Response,
  ) {
    const result = await this.whatsappService.getMediaForMessage(
      req.tenantId,
      messageId,
    );
    if (!result) throw new NotFoundException('Mídia não encontrada');

    const buffer = Buffer.from(result.base64, 'base64');
    res.set({
      'Content-Type': result.mimetype,
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(buffer);
  }

  // ── Analytics ──

  @Get('analytics')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  getAnalytics(@Req() req: any, @Query('days') days?: string) {
    return this.whatsappService.getAnalytics(
      req.tenantId,
      days ? parseInt(days, 10) : 30,
    );
  }

  // ── Chat History ──

  @Get('chats')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  getChats(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ) {
    const validFilters = ['all', 'unread', 'reply-later'] as const;
    const f = validFilters.includes(filter as any)
      ? (filter as (typeof validFilters)[number])
      : 'all';
    return this.whatsappService.getChats(
      req.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      f,
    );
  }

  @Delete('chats/:phone')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  deleteChat(@Req() req: any, @Param('phone') phone: string) {
    return this.whatsappService.deleteChat(req.tenantId, phone);
  }

  @Patch('chats/:phone/read')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  markChatRead(@Req() req: any, @Param('phone') phone: string) {
    return this.whatsappService.markChatRead(req.tenantId, phone);
  }

  @Patch('chats/:phone/unread')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  markChatUnread(@Req() req: any, @Param('phone') phone: string) {
    return this.whatsappService.markChatUnread(req.tenantId, phone);
  }

  @Patch('chats/:phone/reply-later')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  toggleReplyLater(@Req() req: any, @Param('phone') phone: string) {
    return this.whatsappService.toggleReplyLater(req.tenantId, phone);
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
