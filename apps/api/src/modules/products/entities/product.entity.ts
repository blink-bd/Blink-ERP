import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '@/database/entities/base.entity';
import { Category } from './category.entity';
import { Brand } from './brand.entity';

@Entity('products')
export class Product extends TenantBaseEntity {
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId?: string;

  @Column({ name: 'brand_id', type: 'uuid', nullable: true })
  brandId?: string;

  @Column({ length: 500 })
  name: string;

  @Column({ length: 100, nullable: true })
  sku?: string;

  @Column({ length: 100, nullable: true })
  barcode?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', default: {} })
  specifications: Record<string, any>;

  @Column({ name: 'cost_price', type: 'decimal', precision: 15, scale: 4, default: 0 })
  costPrice: number;

  @Column({ name: 'selling_price', type: 'decimal', precision: 15, scale: 4 })
  sellingPrice: number;

  @Column({ name: 'wholesale_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  wholesalePrice?: number;

  /** سعر نصف الجملة — يظهر/يُحفظ فقط إذا كانت ميزة half_wholesale_pricing مفعّلة للتاجر. */
  @Column({
    name: 'half_wholesale_price',
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
  })
  halfWholesalePrice?: number;

  @Column({ name: 'distributor_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  distributorPrice?: number;

  @Column({ name: 'min_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  minPrice?: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxRate: number;

  @Column({ name: 'is_tax_inclusive', default: false })
  isTaxInclusive: boolean;

  @Column({ name: 'track_inventory', default: true })
  trackInventory: boolean;

  @Column({ name: 'min_stock_level', type: 'int', default: 0 })
  minStockLevel: number;

  @Column({ name: 'max_stock_level', type: 'int', nullable: true })
  maxStockLevel?: number;

  @Column({ name: 'reorder_point', type: 'int', nullable: true })
  reorderPoint?: number;

  @Column({ length: 50, default: 'piece' })
  unit: string;

  @Column({ name: 'image_url', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ type: 'jsonb', default: [] })
  images: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_featured', default: false })
  isFeatured: boolean;

  @Column({ name: 'parent_product_id', type: 'uuid', nullable: true })
  parentProductId?: string;

  @Column({ name: 'variant_attributes', type: 'jsonb', default: {} })
  variantAttributes: Record<string, any>;

  @Column({ name: 'needs_price_review', default: false })
  needsPriceReview: boolean;

  @Column({ name: 'price_review_note', type: 'text', nullable: true })
  priceReviewNote?: string;

  @ManyToOne(() => Category)
  @JoinColumn({ name: 'category_id' })
  category?: Category;

  @ManyToOne(() => Brand)
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand;
}
