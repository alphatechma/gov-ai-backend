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
import {
  SendMessageDto,
  BroadcastDto,
  CreateConnectionDto,
  UpdateConnectionDto,
} from './dto/send-message.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  // ── Webhook (no auth — called by Evolution API) ──

  /** New webhook with explicit connectionId. */
  @Post('webhook/:tenantId/:connectionId')
  @HttpCode(HttpStatus.OK)
  handleWebhookScoped(
    @Param('tenantId') tenantId: string,
    @Param('connectionId') connectionId: string,
    @Body() body: any,
  ) {
    this.whatsappService
      .handleWebhook(tenantId, connectionId, body)
      .catch(() => {});
    return { received: true };
  }

  /** Legacy webhook (falls back to default connection for the tenant). */
  @Post('webhook/:tenantId')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Param('tenantId') tenantId: string, @Body() body: any) {
    this.whatsappService.handleWebhook(tenantId, null, body).catch(() => {});
    return { received: true };
  }

  // ── Multi-instance connection endpoints ──

  @Get('connections')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  listConnections(@Req() req: any) {
    return this.whatsappService.listConnections(req.tenantId);
  }

  @Post('connections')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  createConnection(@Req() req: any, @Body() dto: CreateConnectionDto) {
    return this.whatsappService.createConnection(
      req.tenantId,
      req.user.id,
      dto.label,
    );
  }

  @Get('connections/:id')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  getConnectionById(@Req() req: any, @Param('id') id: string) {
    return this.whatsappService.getConnectionById(req.tenantId, id);
  }

  @Post('connections/:id/start')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  startConnectionById(@Req() req: any, @Param('id') id: string) {
    return this.whatsappService.startConnection(
      req.tenantId,
      id,
      req.user.id,
    );
  }

  @Patch('connections/:id')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  updateConnection(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.whatsappService.updateConnection(req.tenantId, id, dto);
  }

  @Post('connections/:id/disconnect')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  disconnectById(@Req() req: any, @Param('id') id: string) {
    return this.whatsappService.disconnectConnection(req.tenantId, id);
  }

  @Delete('connections/:id')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  deleteConnection(@Req() req: any, @Param('id') id: string) {
    return this.whatsappService.deleteConnection(req.tenantId, id);
  }

  // ── Legacy singular endpoints (operate on default connection) ──

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
    return this.whatsappService.legacyStartConnection(
      req.tenantId,
      req.user.id,
    );
  }

  @Delete('connection')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  disconnect(@Req() req: any) {
    return this.whatsappService.legacyDisconnect(req.tenantId);
  }

  // ── Messaging ──

  @Post('send')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  sendMessage(@Req() req: any, @Body() dto: SendMessageDto) {
    return this.whatsappService.sendMessage(
      req.tenantId,
      dto.connectionId,
      dto.phone,
      dto.content,
      dto.quotedId,
    );
  }

  @Post('send-media')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 16 * 1024 * 1024 } }),
  )
  sendMedia(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('connectionId') connectionId: string,
    @Body('phone') phone: string,
    @Body('caption') caption?: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo é obrigatório');
    if (!phone) throw new BadRequestException('Telefone é obrigatório');
    if (!connectionId)
      throw new BadRequestException('connectionId é obrigatório');
    return this.whatsappService.sendMedia(
      req.tenantId,
      connectionId,
      phone,
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
      },
      caption,
    );
  }

  @Post('broadcast')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  broadcast(@Req() req: any, @Body() dto: BroadcastDto) {
    return this.whatsappService.broadcast(
      req.tenantId,
      dto.connectionId,
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
  getAnalytics(
    @Req() req: any,
    @Query('connectionId') connectionId?: string,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.whatsappService.getAnalytics(
      req.tenantId,
      connectionId,
      days ? parseInt(days, 10) : 30,
      startDate,
      endDate,
    );
  }

  @Get('analytics/export')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  async exportAnalytics(
    @Req() req: any,
    @Res() res: Response,
    @Query('connectionId') connectionId?: string,
    @Query('days') days?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const buffer = await this.whatsappService.exportAnalyticsToExcel(
      req.tenantId,
      connectionId,
      days ? parseInt(days, 10) : 30,
      startDate,
      endDate,
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="whatsapp_analytics.xlsx"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  // ── Chat History ──

  @Get('chats')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  getChats(
    @Req() req: any,
    @Query('connectionId') connectionId?: string,
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
      connectionId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      f,
    );
  }

  @Delete('chats/:phone')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  deleteChat(
    @Req() req: any,
    @Param('phone') phone: string,
    @Query('connectionId') connectionId: string,
  ) {
    if (!connectionId)
      throw new BadRequestException('connectionId é obrigatório');
    return this.whatsappService.deleteChat(req.tenantId, connectionId, phone);
  }

  @Patch('chats/:phone/read')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  markChatRead(
    @Req() req: any,
    @Param('phone') phone: string,
    @Query('connectionId') connectionId: string,
  ) {
    if (!connectionId)
      throw new BadRequestException('connectionId é obrigatório');
    return this.whatsappService.markChatRead(
      req.tenantId,
      connectionId,
      phone,
    );
  }

  @Patch('chats/:phone/unread')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  markChatUnread(
    @Req() req: any,
    @Param('phone') phone: string,
    @Query('connectionId') connectionId: string,
  ) {
    if (!connectionId)
      throw new BadRequestException('connectionId é obrigatório');
    return this.whatsappService.markChatUnread(
      req.tenantId,
      connectionId,
      phone,
    );
  }

  @Patch('chats/:phone/reply-later')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  toggleReplyLater(
    @Req() req: any,
    @Param('phone') phone: string,
    @Query('connectionId') connectionId: string,
  ) {
    if (!connectionId)
      throw new BadRequestException('connectionId é obrigatório');
    return this.whatsappService.toggleReplyLater(
      req.tenantId,
      connectionId,
      phone,
    );
  }

  @Get('chats/messages')
  @UseGuards(JwtAuthGuard, ModuleAccessGuard)
  @RequiresModule('whatsapp')
  getChatMessages(
    @Req() req: any,
    @Query('phone') phone: string,
    @Query('connectionId') connectionId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!connectionId)
      throw new BadRequestException('connectionId é obrigatório');
    return this.whatsappService.getChatMessages(
      req.tenantId,
      connectionId,
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
    @Query('connectionId') connectionId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.whatsappService.searchMessages(
      req.tenantId,
      connectionId,
      query,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
