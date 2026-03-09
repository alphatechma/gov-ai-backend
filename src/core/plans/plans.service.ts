import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private plansRepo: Repository<Plan>,
  ) {}

  findAll() {
    return this.plansRepo.find({ order: { price: 'ASC' } });
  }

  async findOne(id: string) {
    const plan = await this.plansRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plano não encontrado');
    return plan;
  }

  create(dto: CreatePlanDto) {
    const plan = this.plansRepo.create(dto);
    return this.plansRepo.save(plan);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.findOne(id);
    Object.assign(plan, dto);
    return this.plansRepo.save(plan);
  }

  async remove(id: string) {
    const plan = await this.findOne(id);
    return this.plansRepo.remove(plan);
  }
}
