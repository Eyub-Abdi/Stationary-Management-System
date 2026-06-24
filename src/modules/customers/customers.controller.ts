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
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CustomerQueryDto,
  RecordCustomerPaymentDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a customer (debtor)' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List customers (search, filter debtors, paginate)' })
  findAll(@Query() query: CustomerQueryDto) {
    return this.customers.findAll(query);
  }

  @Get('aging')
  @ApiOperation({ summary: 'Accounts-receivable aging across all debtors' })
  aging() {
    return this.customers.aging();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer with recent credit sales & payments' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record a repayment against the customer balance' })
  @ApiHeader({
    name: IDEMPOTENCY_HEADER,
    required: false,
    description: 'Unique key to safely retry without recording a duplicate payment.',
  })
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCustomerPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
  ) {
    return this.customers.recordPayment(id, dto, user.id, idempotencyKey);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'List repayments for a customer' })
  payments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.customers.payments(id, query);
  }
}
