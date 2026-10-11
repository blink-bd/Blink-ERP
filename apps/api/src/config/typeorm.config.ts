import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env', '../../.env'] });
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * تسجيل استعلامات SQL: مقفول افتراضياً حتى في التطوير، لأنه بيطبع البيانات المرسلة
 * (ومنها hash كلمات المرور). فعّله مؤقتاً بـ DB_LOGGING=true عند الحاجة فقط.
 */
const dbLogging = () => process.env.DB_LOGGING === 'true';

/**
 * SSL لقاعدة البيانات في الإنتاج:
 * - DB_SSL=false               : بدون SSL (قاعدة على نفس الشبكة الخاصة/Docker)
 * - DB_SSL_CA=<PEM>            : تحقق كامل من شهادة السيرفر (الأفضل — يمنع MITM)
 * - DB_SSL_REJECT_UNAUTHORIZED : true لفرض التحقق بشهادات النظام
 * الافتراضي (للتوافق مع Render/Supabase): تشفير بدون تحقق من الشهادة.
 */
export const dbSslOptions = () => {
  if (process.env.NODE_ENV !== 'production' || process.env.DB_SSL === 'false') return false;
  const ca = process.env.DB_SSL_CA?.replace(/\\n/g, '\n');
  if (ca) return { ca, rejectUnauthorized: true };
  return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' };
};

export const typeormConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  return {
    type: 'postgres',
    url: configService.get('DATABASE_URL'),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: false, // Always use migrations in production
    logging: dbLogging(),
    ssl: dbSslOptions(),
    extra: {
      max: 20, // Maximum pool size
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    },
  };
};

// For TypeORM CLI
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: dbLogging(),
  ssl: dbSslOptions(),
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
