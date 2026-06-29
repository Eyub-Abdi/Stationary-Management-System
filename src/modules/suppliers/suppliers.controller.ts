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
import { IDEMPOTENCY_HEADER } from '../../common/constants';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
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
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @Permission('suppliers')
  @ApiOperation({ summary: 'Create a supplier (admin)' })
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Get()
  @Permission('purchases', 'suppliers')
  @ApiOperation({ summary: 'List suppliers (admin, or staff who manage purchases)' })
  findAll(@Query() query: SupplierQueryDto) {
    return this.suppliers.findAll(query);
  }

  @Get('summary')
  @Permission('suppliers')
  @ApiOperation({ summary: 'Aggregate payables across all suppliers (admin)' })
  summary() {
    return this.suppliers.summary();
  }

  @Get(':id')
  @Permission('purchases', 'suppliers')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.findOne(id);
  }

  @Patch(':id')
  @Permission('suppliers')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  @Post(':id/payments')
  @Permission('suppliers')
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
  @Permission('suppliers')
  @ApiOperation({ summary: 'List payments made to a supplier' })
  payments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.suppliers.payments(id, query);
  }
}
