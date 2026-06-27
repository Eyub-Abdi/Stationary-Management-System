import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateServiceDto,
  CreateServiceVariantDto,
  UpdateServiceDto,
  UpdateServiceVariantDto,
} from './dto/service.dto';

const SERVICE_INCLUDE = {
  variants: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ServiceInclude;

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateServiceDto) {
    return this.prisma.service.create({
      data: {
        name: dto.name,
        type: dto.type,
        pricingType: dto.pricingType,
        status: dto.status,
        variants: {
          create: dto.variants.map((v, i) => ({
            label: v.label.trim(),
            unitPrice: toPrisma(v.unitPrice),
            status: v.status,
            isDefault: i === 0,
          })),
        },
      },
      include: SERVICE_INCLUDE,
    });
  }

  findAll(includeInactive = false, search?: string) {
    const where: Prisma.ServiceWhereInput = {
      ...(includeInactive ? {} : { status: 'ACTIVE' }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    return this.prisma.service.findMany({
      where,
      include: SERVICE_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: SERVICE_INCLUDE,
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.findOne(id);
    return this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.pricingType !== undefined ? { pricingType: dto.pricingType } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: SERVICE_INCLUDE,
    });
  }

  // ---- Variants (priced options) ------------------------------------------

  async addVariant(serviceId: string, dto: CreateServiceVariantDto) {
    await this.findOne(serviceId);
    return this.prisma.serviceVariant.create({
      data: {
        serviceId,
        label: dto.label.trim(),
        unitPrice: toPrisma(dto.unitPrice),
        status: dto.status,
      },
    });
  }

  async updateVariant(variantId: string, dto: UpdateServiceVariantDto) {
    const variant = await this.prisma.serviceVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Service option not found');
    return this.prisma.serviceVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.unitPrice !== undefined ? { unitPrice: toPrisma(dto.unitPrice) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async deactivateVariant(variantId: string) {
    const variant = await this.prisma.serviceVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Service option not found');
    return this.prisma.serviceVariant.update({
      where: { id: variantId },
      data: { status: 'INACTIVE' },
    });
  }

  async removeVariant(variantId: string) {
    const variant = await this.prisma.serviceVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Service option not found');
    const remaining = await this.prisma.serviceVariant.count({
      where: { serviceId: variant.serviceId },
    });
    if (remaining <= 1) {
      throw new ConflictException('A service must keep at least one option.');
    }
    const used = await this.prisma.saleItem.count({ where: { serviceVariantId: variantId } });
    if (used > 0) {
      throw new ConflictException(
        'This option is used by existing sales and cannot be deleted. Deactivate it instead.',
      );
    }
    await this.prisma.serviceVariant.delete({ where: { id: variantId } });
    return { id: variantId };
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.service.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: SERVICE_INCLUDE,
    });
  }

  async reactivate(id: string) {
    await this.findOne(id);
    return this.prisma.service.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: SERVICE_INCLUDE,
    });
  }

  /**
   * Permanently removes a service and its options. Blocked when referenced by
   * existing sales — those must keep their snapshot, so deactivate instead.
   */
  async remove(id: string) {
    await this.findOne(id);
    const referencingSales = await this.prisma.saleItem.count({
      where: { serviceId: id },
    });
    if (referencingSales > 0) {
      throw new ConflictException(
        'This service is used by existing sales and cannot be deleted. Deactivate it instead.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.serviceVariant.deleteMany({ where: { serviceId: id } }),
      this.prisma.service.delete({ where: { id } }),
    ]);
    return { id };
  }
}
