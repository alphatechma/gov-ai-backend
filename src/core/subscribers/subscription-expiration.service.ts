import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Subscriber } from './subscriber.entity';

@Injectable()
export class SubscriptionExpirationService {
  private readonly logger = new Logger(SubscriptionExpirationService.name);

  constructor(
    @InjectRepository(Subscriber)
    private subscribersRepo: Repository<Subscriber>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async deactivateExpired(): Promise<void> {
    const now = new Date();
    const expired = await this.subscribersRepo.find({
      where: { active: true, endDate: LessThan(now) },
    });

    if (!expired.length) return;

    for (const sub of expired) {
      sub.active = false;
      await this.subscribersRepo.save(sub);

      this.logger.warn(
        `Assinatura expirada: subscriber=${sub.id} user=${sub.userId ?? '<none>'} endDate=${sub.endDate?.toISOString() ?? '<null>'}`,
      );
    }

    this.logger.log(
      `Desativados ${expired.length} assinante(s) por expiração`,
    );
  }
}
