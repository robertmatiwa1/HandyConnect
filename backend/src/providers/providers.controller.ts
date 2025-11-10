import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { QueryProvidersDto } from './dto/query-providers.dto';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  findAll(@Query() query: QueryProvidersDto) {
    return this.providersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.providersService.findOne(id);
  }
}
