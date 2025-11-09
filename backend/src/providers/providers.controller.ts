import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { UpdateProviderProfileDto } from './dto/update-provider-profile.dto';
import { ProvidersService } from './providers.service';

type RequestWithUser = Request & { user: { id: string } };

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  list(@Query('skill') skill?: string, @Query('suburb') suburb?: string) {
    return this.providersService.list({ skill, suburb });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.providersService.getById(id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROVIDER)
  updateMe(@Req() req: RequestWithUser, @Body() dto: UpdateProviderProfileDto) {
    return this.providersService.updateForUser(req.user.id, dto);
  }
}
