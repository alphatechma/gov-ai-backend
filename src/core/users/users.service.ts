import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async findAll(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    return this.usersRepo.find({
      where,
      relations: ['tenant'],
      order: { createdAt: 'DESC' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        cpf: true,
        avatarUrl: true,
        active: true,
        tenantId: true,
        lastLoginAt: true,
        createdAt: true,
        allowedModules: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where: any = { id };
    if (tenantId) where.tenantId = tenantId;

    const user = await this.usersRepo.findOne({
      where,
      relations: ['tenant'],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        cpf: true,
        avatarUrl: true,
        active: true,
        tenantId: true,
        lastLoginAt: true,
        createdAt: true,
        allowedModules: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email já cadastrado');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepo.create({
      ...dto,
      password: hashedPassword,
    });

    const saved = await this.usersRepo.save(user);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateUserDto, tenantId?: string) {
    const where: any = { id };
    if (tenantId) where.tenantId = tenantId;

    const user = await this.usersRepo.findOne({ where });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (dto.email && dto.email !== user.email) {
      const existing = await this.usersRepo.findOne({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException('Email já cadastrado');
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    Object.assign(user, dto);
    await this.usersRepo.save(user);
    return this.findOne(id);
  }

  async remove(id: string, tenantId?: string) {
    const where: any = { id };
    if (tenantId) where.tenantId = tenantId;

    const user = await this.usersRepo.findOne({ where });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.usersRepo.remove(user);
  }
}
