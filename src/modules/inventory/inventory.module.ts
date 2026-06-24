import { Module } from '@nestjs/common';
import { InventoryAdminService } from './inventory-admin.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryAdminService],
  // InventoryService (the FIFO engine) is consumed by purchases & sales.
  exports: [InventoryService],
})
export class InventoryModule {}
