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
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    // SKU is optional from the client — generate a unique one when omitted.
    let sku = dto.sku?.trim();
    if (sku) {
      const exists = await this.prisma.product.findUnique({ where: { sku } });
      if (exists) throw new ConflictException('SKU already exists');
    } else {
      sku = await this.generateSku(dto.name);
    }

    // A bulk unit only makes sense with a pack size > 1.
    const bulkUnit = dto.bulkUnit?.trim() || null;
    const unitSize = bulkUnit ? Math.max(1, dto.unitSize ?? 1) : 1;

    return this.prisma.product.create({
      data: {
        sku,
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        categoryId: dto.categoryId,
        sellingPrice: toPrisma(dto.sellingPrice),
        buyingPrice: toPrisma(dto.buyingPrice ?? 0),
        baseUnit: dto.baseUnit?.trim() || 'pcs',
        bulkUnit,
        unitSize,
        bulkSellingPrice:
          bulkUnit && dto.bulkSellingPrice !== undefined
            ? toPrisma(dto.bulkSellingPrice)
            : null,
        minStockLevel: dto.minStockLevel ?? 0,
        status: dto.status,
        // currentStock starts at 0 and only changes via inventory operations.
      },
    });
  }

  /**
   * Builds a unique, human-readable SKU from the product name plus a short
   * random suffix, retrying on the (very unlikely) chance of a collision.
   */
  private async generateSku(name: string): Promise<string> {
    const base =
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 8) || 'PRD';

    for (let i = 0; i < 8; i++) {
      const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
      const candidate = `${base}-${suffix}`;
      const taken = await this.prisma.product.findUnique({ where: { sku: candidate } });
      if (!taken) return candidate;
    }
    return `PRD-${Date.now().toString(36).toUpperCase()}`;
  }

  async findAll(query: ProductQueryDto) {
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      // Low-stock filter: currentStock <= minStockLevel.
      ...(query.lowStock
        ? { currentStock: { lte: this.prisma.product.fields.minStockLevel } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: true },
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
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.findOne(id);

    // Resolve the bulk-unit trio coherently: clearing the bulk unit resets the
    // pack size to 1 and drops the bulk price.
    const data: Prisma.ProductUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      ...(dto.categoryId !== undefined
        ? { category: dto.categoryId ? { connect: { id: dto.categoryId } } : { disconnect: true } }
        : {}),
      ...(dto.sellingPrice !== undefined
        ? { sellingPrice: toPrisma(dto.sellingPrice) }
        : {}),
      ...(dto.buyingPrice !== undefined
        ? { buyingPrice: toPrisma(dto.buyingPrice) }
        : {}),
      ...(dto.baseUnit !== undefined ? { baseUnit: dto.baseUnit?.trim() || 'pcs' } : {}),
      ...(dto.minStockLevel !== undefined
        ? { minStockLevel: dto.minStockLevel }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    if (dto.bulkUnit !== undefined) {
      const bulkUnit = dto.bulkUnit?.trim() || null;
      data.bulkUnit = bulkUnit;
      data.unitSize = bulkUnit ? Math.max(1, dto.unitSize ?? current.unitSize) : 1;
      data.bulkSellingPrice = bulkUnit
        ? dto.bulkSellingPrice !== undefined
          ? toPrisma(dto.bulkSellingPrice)
          : current.bulkSellingPrice
        : null;
    } else {
      if (dto.unitSize !== undefined) data.unitSize = Math.max(1, dto.unitSize);
      if (dto.bulkSellingPrice !== undefined) {
        data.bulkSellingPrice = toPrisma(dto.bulkSellingPrice);
      }
    }

    return this.prisma.product.update({ where: { id }, data });
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
   * Permanently deletes a product. Only possible when it has never been
   * transacted — any sale, purchase, stock batch, movement or adjustment keeps
   * a foreign-key reference to it, so a product with history must be
   * deactivated instead to preserve that history.
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
    await this.prisma.product.delete({ where: { id } });
    return { id };
  }

  /** Products at or below their minimum stock level. */
  lowStock() {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT id, sku, name, "currentStock", "minStockLevel"
      FROM products
      WHERE status = 'ACTIVE' AND "currentStock" <= "minStockLevel"
      ORDER BY ("currentStock" - "minStockLevel") ASC;
    `);
  }
}
