import { DataSource } from 'typeorm';
import { Feature } from '@/modules/features/entities/feature.entity';
import { Plan } from '@/modules/features/entities/plan.entity';
import { FEATURE_CATALOG } from '@/modules/features/features.catalog';

export async function seedFeatures(dataSource: DataSource): Promise<void> {
  const featuresRepository = dataSource.getRepository(Feature);

  // 1) Upsert كل ميزة من الكتالوج (الاسم والوصف والتصنيف والأعلام تتحدّث في كل نشر)
  for (const def of FEATURE_CATALOG) {
    let feature = await featuresRepository.findOne({
      where: { code: def.code },
      withDeleted: true,
    });
    if (!feature) feature = featuresRepository.create({ code: def.code });
    Object.assign(feature, {
      name: def.name,
      nameAr: def.nameAr,
      descriptionAr: def.descriptionAr,
      category: def.category,
      isCore: !!def.isCore,
      isDefault: !!def.isDefault,
      requiresPlan: !!def.requiresPlan,
      sortOrder: def.sortOrder,
      isActive: true,
      deletedAt: null,
    });
    await featuresRepository.save(feature);
  }

  // 2) ربط الاعتماديات (depends_on مخزنة كـ UUIDs)
  const all = await featuresRepository.find();
  const idByCode = new Map(all.map((f) => [f.code, f.id]));
  for (const def of FEATURE_CATALOG) {
    const ids = (def.dependsOn || []).map((c) => idByCode.get(c)).filter(Boolean) as string[];
    await featuresRepository.update({ code: def.code }, { dependsOn: ids });
  }

  console.log('✅ Features seeded successfully');

  // Plans
  const plansRepository = dataSource.getRepository(Plan);
  const plans = [
    {
      name: 'basic',
      nameAr: 'أساسي',
      priceMonthly: 0,
      maxUsers: 2,
      maxBranches: 1,
      isPublic: true,
    },
    {
      name: 'professional',
      nameAr: 'احترافي',
      priceMonthly: 299,
      maxUsers: 10,
      maxBranches: 3,
      isPublic: true,
      badge: 'popular',
    },
    {
      name: 'enterprise',
      nameAr: 'مؤسسي',
      priceMonthly: 999,
      isPublic: true,
      badge: 'recommended',
    },
  ];

  for (const plan of plans) {
    const exists = await plansRepository.findOne({ where: { name: plan.name } });
    if (!exists) {
      await plansRepository.save(plan);
    }
  }

  console.log('✅ Plans seeded successfully');
}
