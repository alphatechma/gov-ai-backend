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
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import {
  CreateDirectConversationDto,
  CreateGroupConversationDto,
} from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../shared/guards/module-access.guard';
import { RequiresModule } from '../../shared/decorators/requires-module.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('users')
  getUsers(@Req() req: any) {
    return this.chatService.getTenantUsers(req.tenantId, req.user.id);
  }

  @Get('conversations')
  getConversations(@Req() req: any) {
    return this.chatService.getConversations(req.tenantId, req.user.id);
  }

  @Get('conversations/:id')
  getConversation(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.getConversation(req.tenantId, id, req.user.id);
  }

  @Post('conversations/direct')
  createDirect(@Req() req: any, @Body() dto: CreateDirectConversationDto) {
    return this.chatService.createDirect(
      req.tenantId,
      req.user.id,
      req.user.name,
      dto,
    );
  }

  @Post('conversations/group')
  createGroup(@Req() req: any, @Body() dto: CreateGroupConversationDto) {
    return this.chatService.createGroup(
      req.tenantId,
      req.user.id,
      req.user.name,
      dto,
    );
  }

  @Patch('conversations/:id')
  updateConversation(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.chatService.updateConversation(
      req.tenantId,
      id,
      req.user.id,
      dto,
    );
  }

  @Delete('conversations/:id')
  deleteConversation(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.deleteConversation(req.tenantId, id, req.user.id);
  }

  @Get('conversations/:id/messages')
  getMessages(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.chatService.getMessages(
      req.tenantId,
      id,
      req.user.id,
      page,
      limit,
    );
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(
      req.tenantId,
      id,
      req.user.id,
      req.user.name,
      dto,
    );
  }

  @Post('conversations/:id/read')
  markAsRead(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.markAsRead(req.tenantId, id, req.user.id);
  }

  @Post('conversations/:id/members/:userId')
  addParticipant(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.chatService.addParticipant(
      req.tenantId,
      id,
      req.user.id,
      userId,
    );
  }

  @Delete('conversations/:id/members/:userId')
  removeParticipant(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.chatService.removeParticipant(
      req.tenantId,
      id,
      req.user.id,
      userId,
    );
  }

  @Post('conversations/:id/mute')
  toggleMute(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.toggleMute(req.tenantId, id, req.user.id);
  }
}
