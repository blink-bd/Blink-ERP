import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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
