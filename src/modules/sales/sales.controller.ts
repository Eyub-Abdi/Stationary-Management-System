import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IDEMPOTENCY_HEADER } from '../../common/constants';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ReturnSaleDto } from './dto/return-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { VoidSaleDto } from './dto/void-sale.dto';
import { SalesService } from './sales.service';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a cash sale (products and/or services). Staff & admin.',
  })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER,
    required: false,
    description: 'Unique key to safely retry without creating a duplicate sale.',
  })
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.sales.create(dto, user.id, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'List sales (filter, search, paginate)' })
  findAll(@Query() query: SaleQueryDto) {
    return this.sales.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a sale with line items & COGS allocations' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.findOne(id);
  }

  @Post(':id/returns')
  @ApiOperation({
    summary: 'Partial return/refund of specific line items (staff & admin)',
  })
  returnSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.returnSale(id, dto, user.id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/void')
  @ApiOperation({
    summary: 'Void a sale (admin). Restores inventory & records the reversal.',
  })
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.void(id, dto.reason, user.id);
  }
}
