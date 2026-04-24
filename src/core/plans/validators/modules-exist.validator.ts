import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { In, Repository } from 'typeorm';
import { SystemModule } from '../../modules/system-module.entity';

@ValidatorConstraint({ name: 'ModulesExistByName', async: true })
@Injectable()
export class ModulesExistByNameValidator
  implements ValidatorConstraintInterface
{
  constructor(
    @InjectRepository(SystemModule)
    private readonly systemModulesRepo: Repository<SystemModule>,
  ) {}

  async validate(value: unknown): Promise<boolean> {
    if (!Array.isArray(value) || value.length === 0) return true;
    if (value.some((v) => typeof v !== 'string')) return false;

    const names = value as string[];
    const existing = await this.systemModulesRepo.find({
      where: { name: In(names) },
      select: ['name'],
    });
    const existingNames = new Set(existing.map((m) => m.name));
    return names.every((n) => existingNames.has(n));
  }

  defaultMessage() {
    return 'Um ou mais módulos não existem em system_modules (use o campo name em pt-BR)';
  }
}
