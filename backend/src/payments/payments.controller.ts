import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }
}
