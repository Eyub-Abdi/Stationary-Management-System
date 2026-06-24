import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toPrisma } from '../../common/utils/money';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateServiceDto) {
    return this.prisma.service.create({
      data: {
        name: dto.name,
        type: dto.type,
        pricingType: dto.pricingType,
        unitPrice: toPrisma(dto.unitPrice),
        status: dto.status,
      },
    });
  }

  findAll(includeInactive = false) {
    const where: Prisma.ServiceWhereInput = includeInactive
      ? {}
      : { status: 'ACTIVE' };
    return this.prisma.service.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
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
        ...(dto.unitPrice !== undefined ? { unitPrice: toPrisma(dto.unitPrice) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.service.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  async reactivate(id: string) {
    await this.findOne(id);
    return this.prisma.service.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  /**
   * Permanently removes a service. Blocked when the service is referenced by
   * existing sales — those must keep their snapshot, so deactivation is the
   * only safe option there.
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
    await this.prisma.service.delete({ where: { id } });
    return { id };
  }
}
