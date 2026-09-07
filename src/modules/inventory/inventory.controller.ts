import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { RecordOpeningStockDto } from './dto/opening-stock.dto';
import { RecordWastageDto } from './dto/record-wastage.dto';
import { InventoryAdminService } from './inventory-admin.service';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryAdminService) {}

  @Get('movements')
  @ApiOperation({ summary: 'Inventory movement ledger (audit trail)' })
  movements(@Query() query: MovementQueryDto) {
    return this.inventory.listMovements(query);
  }

  @Roles(Role.ADMIN)
  @Get('valuation')
  @ApiOperation({ summary: 'Current FIFO inventory valuation (admin)' })
  valuation() {
    return this.inventory.valuation();
  }

  @Permission('inventory')
  @Get('opening-stock')
  @ApiOperation({ summary: 'Stock already recorded as being on the shelf at setup' })
  openingStock() {
    return this.inventory.listOpeningStock();
  }

  // Setup, not trading. The stock is real and costed, but no money left the
  // till today and nothing was lost, so this is the only stock-in that reaches
  // neither the purchase totals nor the wastage figures.
  @Permission('inventory')
  @Post('opening-stock')
  @ApiOperation({
    summary: 'Record the shelf as it stood when the shop started using the system',
  })
  recordOpeningStock(@Body() dto: RecordOpeningStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventory.recordOpeningStock(dto, user.id);
  }

  @Permission('inventory')
  @Post('adjust')
  @ApiOperation({
    summary: 'Manually adjust stock with reason (admin, or staff who manage inventory)',
  })
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventory.adjust(dto, user.id);
  }

  // Open to any signed-in user, unlike /adjust. A jam happens at the printer
  // while the cashier is mid-job, and waste nobody is able to record is waste
  // nobody records. The trade is guarded rather than prevented: only spoilage
  // reasons are accepted, the quantity is capped, and every entry is stamped
  // with who made it and shows up in the wastage report.
  @Post('wastage')
  @ApiOperation({
    summary: 'Record stock spoiled during a job (any signed-in user)',
  })
  wastage(@Body() dto: RecordWastageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventory.recordWastage(dto, user.id);
  }
}
