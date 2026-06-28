import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

const PRODUCT_INCLUDE = {
  category: true,
  variants: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    // Product group SKU is optional — generate one when omitted.
    let sku = dto.sku?.trim();
    if (sku) {
      const exists = await this.prisma.product.findUnique({ where: { sku } });
      if (exists) throw new ConflictException('SKU already exists');
    } else {
      sku = await this.generateProductSku(dto.name);
    }

    // A bulk unit only makes sense with a pack size > 1.
    const bulkUnit = dto.bulkUnit?.trim() || null;
    const unitSize = bulkUnit ? Math.max(1, dto.unitSize ?? 1) : 1;

    // Resolve each variant's SKU and prices up-front (so we fail before insert).
    const variants = await this.buildVariantRows(dto.variants, dto.name, !!bulkUnit, true);

    return this.prisma.product.create({
      data: {
        sku,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        categoryId: dto.categoryId,
        baseUnit: dto.baseUnit?.trim() || 'pcs',
        bulkUnit,
        unitSize,
        status: dto.status,
        variants: { create: variants },
      },
      include: PRODUCT_INCLUDE,
    });
  }

  /** Builds variant create rows, generating unique SKUs and validating bulk price. */
  private async buildVariantRows(
    variants: CreateVariantDto[],
    productName: string,
    hasBulk: boolean,
    markFirstDefault: boolean,
  ): Promise<Prisma.ProductVariantCreateWithoutProductInput[]> {
    const seenSkus = new Set<string>();
    const rows: Prisma.ProductVariantCreateWithoutProductInput[] = [];

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      let sku = v.sku?.trim();
      if (sku) {
        if (seenSkus.has(sku)) throw new ConflictException(`Duplicate variant SKU "${sku}"`);
        const taken = await this.prisma.productVariant.findUnique({ where: { sku } });
        if (taken) throw new ConflictException(`Variant SKU "${sku}" already exists`);
      } else {
        sku = await this.generateVariantSku(productName, v.label, seenSkus);
      }
      seenSkus.add(sku);

      rows.push({
        sku,
        label: v.label.trim(),
        sellingPrice: toPrisma(v.sellingPrice ?? 0),
        buyingPrice: toPrisma(v.buyingPrice ?? 0),
        bulkSellingPrice:
          hasBulk && v.bulkSellingPrice !== undefined ? toPrisma(v.bulkSellingPrice) : null,
        minStockLevel: v.minStockLevel ?? 0,
        status: v.status,
        isDefault: markFirstDefault && i === 0,
      });
    }
    return rows;
  }

  private async generateProductSku(name: string): Promise<string> {
    const base = this.skuBase(name) || 'PRD';
    for (let i = 0; i < 8; i++) {
      const candidate = `${base}-${this.rand()}`;
      const taken = await this.prisma.product.findUnique({ where: { sku: candidate } });
      if (!taken) return candidate;
    }
    return `PRD-${Date.now().toString(36).toUpperCase()}`;
  }

  private async generateVariantSku(
    name: string,
    label: string,
    seen: Set<string>,
  ): Promise<string> {
    const base = [this.skuBase(name), this.skuBase(label)].filter(Boolean).join('-') || 'VAR';
    for (let i = 0; i < 8; i++) {
      const candidate = `${base}-${this.rand()}`;
      if (seen.has(candidate)) continue;
      const taken = await this.prisma.productVariant.findUnique({ where: { sku: candidate } });
      if (!taken) return candidate;
    }
    return `VAR-${Date.now().toString(36).toUpperCase()}`;
  }

  private skuBase(s: string): string {
    return s
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 8);
  }

  private rand(): string {
    return Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  async findAll(query: ProductQueryDto) {
    // Low-stock filter operates on variant stock; resolve matching product ids.
    let lowStockIds: string[] | undefined;
    if (query.lowStock) {
      const rows = await this.prisma.$queryRaw<{ productId: string }[]>(Prisma.sql`
        SELECT DISTINCT "productId" FROM product_variants
        WHERE status = 'ACTIVE' AND "currentStock" <= "minStockLevel"
      `);
      lowStockIds = rows.map((r) => r.productId);
      if (lowStockIds.length === 0) lowStockIds = ['00000000-0000-0000-0000-000000000000'];
    }

    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(lowStockIds ? { id: { in: lowStockIds } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
              { variants: { some: { label: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.findOne(id);

    const data: Prisma.ProductUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      ...(dto.categoryId !== undefined
        ? { category: dto.categoryId ? { connect: { id: dto.categoryId } } : { disconnect: true } }
        : {}),
      ...(dto.baseUnit !== undefined ? { baseUnit: dto.baseUnit?.trim() || 'pcs' } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    // Clearing the bulk unit resets pack size to 1 and drops all bulk prices.
    if (dto.bulkUnit !== undefined) {
      const bulkUnit = dto.bulkUnit?.trim() || null;
      data.bulkUnit = bulkUnit;
      data.unitSize = bulkUnit ? Math.max(1, dto.unitSize ?? current.unitSize) : 1;
      if (!bulkUnit) {
        await this.prisma.productVariant.updateMany({
          where: { productId: id },
          data: { bulkSellingPrice: null },
        });
      }
    } else if (dto.unitSize !== undefined) {
      data.unitSize = Math.max(1, dto.unitSize);
    }

    return this.prisma.product.update({ where: { id }, data, include: PRODUCT_INCLUDE });
  }

  // ---- Variants -----------------------------------------------------------

  async addVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.findOne(productId);
    const [row] = await this.buildVariantRows([dto], product.name, !!product.bulkUnit, false);
    return this.prisma.productVariant.create({
      data: { ...row, product: { connect: { id: productId } } },
    });
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { bulkUnit: true } } },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const hasBulk = !!variant.product.bulkUnit;

    const data: Prisma.ProductVariantUpdateInput = {
      ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
      ...(dto.sellingPrice !== undefined ? { sellingPrice: toPrisma(dto.sellingPrice) } : {}),
      ...(dto.buyingPrice !== undefined ? { buyingPrice: toPrisma(dto.buyingPrice) } : {}),
      ...(dto.minStockLevel !== undefined ? { minStockLevel: dto.minStockLevel } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.bulkSellingPrice !== undefined
        ? { bulkSellingPrice: hasBulk ? toPrisma(dto.bulkSellingPrice) : null }
        : {}),
    };
    return this.prisma.productVariant.update({ where: { id: variantId }, data });
  }

  /** Soft-deactivate a variant (preserves its transaction history). */
  async deactivateVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: { status: 'INACTIVE' },
    });
  }

  /** Permanently delete a variant — only if it has never been transacted. */
  async removeVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found');
    const remaining = await this.prisma.productVariant.count({
      where: { productId: variant.productId },
    });
    if (remaining <= 1) {
      throw new ConflictException('A product must keep at least one variant.');
    }
    await this.assertNoVariantHistory(variantId);
    await this.prisma.productVariant.delete({ where: { id: variantId } });
    return { id: variantId };
  }

  private async assertNoVariantHistory(variantId: string) {
    const [sales, purchases, batches, movements, adjustments] =
      await this.prisma.$transaction([
        this.prisma.saleItem.count({ where: { variantId } }),
        this.prisma.purchaseItem.count({ where: { variantId } }),
        this.prisma.inventoryBatch.count({ where: { variantId } }),
        this.prisma.inventoryMovement.count({ where: { variantId } }),
        this.prisma.inventoryAdjustment.count({ where: { variantId } }),
      ]);
    if (sales + purchases + batches + movements + adjustments > 0) {
      throw new ConflictException(
        'This variant has transaction history and cannot be deleted. Deactivate it instead.',
      );
    }
  }

  /** Attach/replace a product's image URL (called after a file upload). */
  async setImage(id: string, imageUrl: string) {
    await this.findOne(id);
    return this.prisma.product.update({ where: { id }, data: { imageUrl } });
  }

  /** Soft-deactivate (never hard delete — historical sales reference products). */
  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  /**
   * Permanently deletes a product and its variants. Only possible when nothing
   * has ever been transacted against any of its variants — history keeps FK
   * references, so a product with history must be deactivated instead.
   */
  async remove(id: string) {
    await this.findOne(id);
    const [sales, purchases, batches, movements, adjustments] =
      await this.prisma.$transaction([
        this.prisma.saleItem.count({ where: { productId: id } }),
        this.prisma.purchaseItem.count({ where: { productId: id } }),
        this.prisma.inventoryBatch.count({ where: { productId: id } }),
        this.prisma.inventoryMovement.count({ where: { productId: id } }),
        this.prisma.inventoryAdjustment.count({ where: { productId: id } }),
      ]);
    if (sales + purchases + batches + movements + adjustments > 0) {
      throw new ConflictException(
        'This product has transaction history and cannot be deleted. Deactivate it instead.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.productVariant.deleteMany({ where: { productId: id } }),
      this.prisma.product.delete({ where: { id } }),
    ]);
    return { id };
  }

  /** Variants at or below their minimum stock level. */
  lowStock() {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT v.id AS "variantId",
             v.sku AS sku,
             p.name || CASE WHEN v.label <> 'Default' THEN ' — ' || v.label ELSE '' END AS name,
             v."currentStock",
             v."minStockLevel"
      FROM product_variants v
      JOIN products p ON p.id = v."productId"
      WHERE v.status = 'ACTIVE' AND v."currentStock" <= v."minStockLevel"
      ORDER BY (v."currentStock" - v."minStockLevel") ASC;
    `);
  }
}
