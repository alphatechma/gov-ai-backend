import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broadcast } from './entities/broadcast.entity';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { UpdateBroadcastDto } from './dto/update-broadcast.dto';

@Injectable()
export class BroadcastsService {
  constructor(
    @InjectRepository(Broadcast)
    private repo: Repository<Broadcast>,
  ) {}

  findAll(tenantId: string): Promise<Broadcast[]> {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Broadcast> {
    const broadcast = await this.repo.findOne({ where: { id, tenantId } });
    if (!broadcast) throw new NotFoundException('Campanha não encontrada');
    return broadcast;
  }

  create(tenantId: string, dto: CreateBroadcastDto): Promise<Broadcast> {
    const broadcast = this.repo.create({ ...dto, tenantId });
    return this.repo.save(broadcast);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateBroadcastDto,
  ): Promise<Broadcast> {
    const broadcast = await this.findOne(tenantId, id);
    Object.assign(broadcast, dto);
    return this.repo.save(broadcast);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const broadcast = await this.findOne(tenantId, id);
    await this.repo.remove(broadcast);
  }
}
