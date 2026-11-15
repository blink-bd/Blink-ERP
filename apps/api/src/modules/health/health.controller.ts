import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * فحص حياة (liveness): بيرد 200 من غير ما يلمس قاعدة البيانات.
   * ده اللي بيتحط في healthCheckPath على Render/أي منصة، عشان لو قاعدة البيانات
   * (Supabase مثلاً) بقت paused أو الشبكة اتقطعت شوية، المنصة ما تعلنش إن
   * النشر فاشل أو تعيد تشغيل الخدمة في حلقة مقفولة.
   */
  @Get('live')
  getLiveness() {
    return {
      success: true,
      data: {
        status: 'alive',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * فحص جاهزية (readiness): بيتأكد إن قاعدة البيانات بتستجيب فعلاً.
   * بيرد 503 لو قاعدة البيانات واقعة — المراقبة الخارجية تستخدمه،
   * لكن فحص حياة المنصة يستخدم /health/live.
   */
  @Get()
  async getHealth() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        success: true,
        data: { status: 'ok', database: 'ok', timestamp: new Date().toISOString() },
      };
    } catch {
      throw new ServiceUnavailableException({
        success: false,
        data: {
          status: 'unavailable',
          database: 'unavailable',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}
