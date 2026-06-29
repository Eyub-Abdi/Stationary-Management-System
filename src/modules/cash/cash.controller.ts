import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CashService } from './cash.service';
import {
  CashMovementDto,
  CashSessionQueryDto,
  CloseSessionDto,
  OpenSessionDto,
} from './dto/cash.dto';

@ApiTags('Cash')
@ApiBearerAuth()
@Controller('cash-sessions')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Post('open')
  @ApiOperation({ summary: 'Open a cash session (staff & admin)' })
  open(@Body() dto: OpenSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cash.open(dto, user.id);
  }

  @Post(':id/movements')
  @ApiOperation({ summary: 'Record a deposit/withdrawal on a session' })
  addMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cash.addMovement(id, dto, user.id, user.role === Role.ADMIN);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close a session; computes expected, actual & variance' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cash.close(id, dto, user.id, user.role === Role.ADMIN);
  }

  @Get()
  @ApiOperation({ summary: 'List cash sessions — your own; admins see everyone’s' })
  findAll(@Query() query: CashSessionQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cash.findAll(query, user.id, user.role === Role.ADMIN);
  }

  @Get('variances')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Review closed sessions with variances (admin)' })
  variances(@Query() query: CashSessionQueryDto) {
    return this.cash.variances(query);
  }

  @Get('opening-float')
  @ApiOperation({
    summary: 'Suggested opening float (carried over from the last closing count)',
  })
  openingFloat() {
    return this.cash.suggestedOpeningFloat();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Session summary with live cash breakdown (own; admins any)' })
  summary(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cash.summary(id, user.id, user.role === Role.ADMIN);
  }
}
