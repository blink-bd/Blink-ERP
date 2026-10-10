import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface AuditEntry {
  tenantId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  severity?: 'info' | 'warning' | 'critical';
}

/** يستخرج بيانات الفاعل (المستخدم/المفتاح + IP + المتصفح) من الطلب. */
export function actorFromRequest(
  req: any
): Pick<AuditEntry, 'tenantId' | 'userId' | 'userEmail' | 'ip' | 'userAgent'> {
  const isApiKey = req?.user?.authType === 'api_key';
  return {
    tenantId: req?.tenantId || req?.user?.tenantId || null,
    userId: isApiKey ? null : req?.user?.id || null,
    userEmail: isApiKey ? `api-key:${req.user.apiKeyName}` : req?.user?.email || null,
    ip: req?.ip || null,
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 500) || null,
  };
}

/**
 * سجل تدقيق أمني لأحداث التجار (تسجيل الدخول، إدارة المستخدمين والصلاحيات،
 * مفاتيح الـ API، الاستيراد...). المدير العام يشوفه من صفحة التاجر.
 * فشل التسجيل لا يكسر العملية الأساسية أبداً.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO audit_logs (tenant_id, user_id, user_email, user_ip, user_agent, action,
                                 entity_type, entity_id, old_values, new_values, description, severity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'tenant',$11)`,
        [
          entry.tenantId || null,
          entry.userId || null,
          entry.userEmail || null,
          entry.ip || null,
          entry.userAgent || null,
          entry.action,
          entry.entityType || null,
          entry.entityId || null,
          entry.oldValues === undefined ? null : JSON.stringify(entry.oldValues),
          entry.newValues === undefined ? null : JSON.stringify(entry.newValues),
          entry.severity || 'info',
        ]
      );
    } catch (error) {
      this.logger.warn(`Audit log failed for ${entry.action}: ${(error as Error).message}`);
    }
  }

  async listForTenant(tenantId: string, options: { limit?: number; action?: string } = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
    const params: unknown[] = [tenantId, limit];
    let filter = '';
    if (options.action) {
      params.push(options.action);
      filter = `AND action = $3`;
    }
    return this.dataSource.query(
      `SELECT id, user_id AS "userId", user_email AS "userEmail", user_ip AS "ip",
              user_agent AS "userAgent", action, entity_type AS "entityType", entity_id AS "entityId",
              new_values AS "details", severity, created_at AS "createdAt"
       FROM audit_logs
       WHERE tenant_id = $1 AND description = 'tenant' ${filter}
       ORDER BY created_at DESC LIMIT $2`,
      params
    );
  }
}
