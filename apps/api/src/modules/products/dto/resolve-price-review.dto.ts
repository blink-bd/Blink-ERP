import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * حسم تنبيه مراجعة التسعير بعد ما ينزل المنتج من المورد بتكلفة مختلفة.
 * التاجر يختار التكلفة اللي هيبني عليها تسعيره (السابقة ولا الجديدة) ويحدّث أسعار البيع.
 */
export class ResolvePriceReviewDto {
  /** previous = التكلفة المسجلة قبل الفاتورة، new = التكلفة اللي نزلت من المورد. */
  @IsIn(['previous', 'new'])
  costChoice: 'previous' | 'new';

  /** سعر البيع القطاعي الجديد. */
  @IsNumber()
  @Min(0.0001)
  sellingPrice: number;

  /** سعر الجملة الجديد (اختياري — لو مش متبعت يفضل زي ما هو). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;

  /** سعر نصف الجملة الجديد (اختياري — محتاج ميزة تسعير نصف الجملة). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  halfWholesalePrice?: number;
}
