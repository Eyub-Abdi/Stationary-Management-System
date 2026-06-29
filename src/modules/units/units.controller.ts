import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/decorators/permission.decorator';
import { CreateUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { UnitsService } from './units.service';

@ApiTags('Units')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @ApiOperation({ summary: 'List all packaging/measure units' })
  findAll() {
    return this.units.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.units.findOne(id);
  }

  @Permission('purchases')
  @Post()
  @ApiOperation({ summary: 'Create a unit (admin)' })
  create(@Body() dto: CreateUnitDto) {
    return this.units.create(dto);
  }

  @Permission('purchases')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    return this.units.update(id, dto);
  }

  @Permission('purchases')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.units.remove(id);
  }
}
