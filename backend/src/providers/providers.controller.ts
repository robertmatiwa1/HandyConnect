import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { JwtAuthGuard } from '../auth/jjwt.guard';
import { ProviderProfileDto } from './dto/provider-profile.dto';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  async upsertProfile(@Req() req, @Body() body: ProviderProfileDto) {
    const userId = req.user.userId;
    return this.providersService.upsertProfile(userId, body);
  }
}
