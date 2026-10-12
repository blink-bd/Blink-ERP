/**
 * تهيئة قاعدة اختبار التكامل: تفريغ المخطط ثم تشغيل كل الـ migrations والـ seeds.
 * تُنفَّذ داخل بيئة jest (قبل إنشاء التطبيق) حتى تعمل مسارات `@/` في ملفات الـ seeds.
 *
 * تحذير: تمسح المخطط بالكامل — لا تعمل إلا على قاعدة اختبار/مرحلة تجريبية.
 */
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { seedPermissions } from '@/database/seeds/permissions.seed';
import { seedFeatures } from '@/database/seeds/features.seed';
import { seedMasterAdmin } from '@/database/seeds/master-admin.seed';

function databaseName(url: string): string {
  // يدعم الروابط العادية وروابط socket مثل postgresql://user@/dbname?host=/var/run/postgresql
  const match = url.match(/^[a-z]+:\/\/[^/?]*\/([^?/]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function prepareDatabase(): Promise<string> {
  const url = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'اختبارات التكامل تحتاج E2E_DATABASE_URL (قاعدة اختبار/مرحلة تجريبية). مثال:\n' +
        '  E2E_DATABASE_URL=postgresql://user:pass@host:5432/blink_erp_test npm run test:e2e'
    );
  }
  const dbName = databaseName(url);
  if (!/test|staging|stage|ci|local/i.test(dbName)) {
    throw new Error(
      `اسم قاعدة البيانات "${dbName}" لا يبدو قاعدة اختبار، والاختبارات تُفرّغ المخطط بالكامل.\n` +
        'استخدم قاعدة باسم يحتوي test/staging/local أو عدّل الحماية في test/e2e/db-setup.ts بعد التأكد.'
    );
  }

  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query('DROP SCHEMA IF EXISTS public CASCADE');
  await admin.query('CREATE SCHEMA public');
  await admin.end();

  const dataSource = new DataSource({
    type: 'postgres',
    url,
    ssl: false,
    entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../../src/database/migrations/*.ts'],
    migrationsTableName: 'migrations',
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  await seedPermissions(dataSource);
  await seedFeatures(dataSource);
  await seedMasterAdmin(dataSource);
  await dataSource.destroy();
  return dbName;
}
