import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
  @Roles(UserRole.CUSTOMER)
  createCheckout(@Body() body: { jobId: string; amountCents: number; method?: string }) {
    const result = this.paymentsService.createCheckout(body.jobId, body.amountCents, body.method);
    return {
      message: 'Checkout created',
      ...result,
    };
  }

  @Post(':paymentId/escrow')
  @Roles(UserRole.PROVIDER)
  markEscrow(@Param('paymentId') paymentId: string) {
    return this.paymentsService.handleEscrowWebhook(paymentId);
  }

  @Post(':paymentId/captured')
  @Roles(UserRole.PROVIDER)
  markCaptured(@Param('paymentId') paymentId: string) {
    return this.paymentsService.handlePaymentCapturedWebhook(paymentId);
  }
}
