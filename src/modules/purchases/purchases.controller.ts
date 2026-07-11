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
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IDEMPOTENCY_HEADER } from '../../common/constants';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PurchaseQueryDto } from './dto/purchase-query.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('Purchases')
@ApiBearerAuth()
@Permission('purchases')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post()
  @ApiOperation({ summary: 'Record a purchase (admin). Creates FIFO batches & stock in.' })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER,
    required: false,
    description: 'Unique key to safely retry without recording a duplicate purchase.',
  })
  create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.purchases.create(dto, user.id, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'List purchases' })
  findAll(@Query() query: PurchaseQueryDto) {
    return this.purchases.findAll(query);
  }

  @Get('daily')
  @ApiOperation({ summary: 'Per-day purchase totals (count + total cost) for a date range' })
  daily(@Query() query: PurchaseQueryDto) {
    return this.purchases.daily(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.findOne(id);
  }
}
