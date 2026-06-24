import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
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

  @Roles(Role.ADMIN)
  @Post('adjust')
  @ApiOperation({ summary: 'Manually adjust stock with reason (admin)' })
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventory.adjust(dto, user.id);
  }
}
