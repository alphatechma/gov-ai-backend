import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CeapExpense } from './ceap-expense.entity';
import { TenantAwareService } from '../../shared/base/tenant-aware.service';
import {
  TransactionType,
  TransactionStatus,
} from '../../shared/enums/features';

@Injectable()
export class CeapService extends TenantAwareService<CeapExpense> {
  constructor(@InjectRepository(CeapExpense) repo: Repository<CeapExpense>) {
    super(repo);
  }

  async getTotalsByCategory(tenantId: string) {
    return this.repository
      .createQueryBuilder('ceap')
      .select('ceap.category', 'category')
      .addSelect('ceap.type', 'type')
      .addSelect('SUM(ceap.value)', 'total')
      .where('ceap.tenantId = :tenantId', { tenantId })
      .groupBy('ceap.category')
      .addGroupBy('ceap.type')
      .getRawMany();
  }

  async getSummary(tenantId: string) {
    const rows = await this.repository
      .createQueryBuilder('ceap')
      .select('ceap.type', 'type')
      .addSelect('ceap.status', 'status')
      .addSelect('SUM(ceap.value)', 'total')
      .addSelect('COUNT(*)::int', 'count')
      .where('ceap.tenantId = :tenantId', { tenantId })
      .groupBy('ceap.type')
      .addGroupBy('ceap.status')
      .getRawMany();

    let totalReceitas = 0;
    let totalDespesas = 0;
    let pendentes = 0;

    for (const row of rows) {
      const val = Number(row.total);
      if (row.type === TransactionType.RECEITA) totalReceitas += val;
      else totalDespesas += val;
      if (row.status === TransactionStatus.PENDENTE)
        pendentes += Number(row.count);
    }

    return {
      totalReceitas,
      totalDespesas,
      saldo: totalReceitas - totalDespesas,
      pendentes,
    };
  }

  async getMonthlyChart(tenantId: string) {
    const rows = await this.repository
      .createQueryBuilder('ceap')
      .select("TO_CHAR(ceap.date, 'YYYY-MM')", 'month')
      .addSelect('ceap.type', 'type')
      .addSelect('SUM(ceap.value)', 'total')
      .where('ceap.tenantId = :tenantId', { tenantId })
      .groupBy("TO_CHAR(ceap.date, 'YYYY-MM')")
      .addGroupBy('ceap.type')
      .orderBy("TO_CHAR(ceap.date, 'YYYY-MM')", 'ASC')
      .getRawMany();

    const months: Record<
      string,
      { month: string; receitas: number; despesas: number }
    > = {};
    for (const row of rows) {
      if (!months[row.month]) {
        months[row.month] = { month: row.month, receitas: 0, despesas: 0 };
      }
      if (row.type === TransactionType.RECEITA) {
        months[row.month].receitas = Number(row.total);
      } else {
        months[row.month].despesas = Number(row.total);
      }
    }

    return Object.values(months);
  }
}
