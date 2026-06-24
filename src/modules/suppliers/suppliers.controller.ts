import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IDEMPOTENCY_HEADER } from '../../common/constants';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  CreateSupplierDto,
  RecordSupplierPaymentDto,
  SupplierQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a supplier (admin)' })
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Get()
  findAll(@Query() query: SupplierQueryDto) {
    return this.suppliers.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Aggregate payables across all suppliers (admin)' })
  summary() {
    return this.suppliers.summary();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record a payment to a supplier against what we owe' })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER,
    required: false,
    description: 'Unique key to safely retry without recording a duplicate payment.',
  })
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordSupplierPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.suppliers.recordPayment(id, dto, user.id, idempotencyKey);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'List payments made to a supplier' })
  payments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.suppliers.payments(id, query);
  }
}
