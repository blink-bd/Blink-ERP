import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '@/config/typeorm.config';
import { seedPermissions } from './permissions.seed';
import { seedFeatures } from './features.seed';
import { seedMasterAdmin } from './master-admin.seed';

async function runSeed() {
  const dataSource = new DataSource(dataSourceOptions);

  try {
    await dataSource.initialize();
    console.log('🔌 Database connected');

    await seedPermissions(dataSource);
    await seedFeatures(dataSource);
    await seedMasterAdmin(dataSource);

    console.log('✅ All seeds completed successfully');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runSeed();
