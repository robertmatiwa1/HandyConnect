import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { PaymentStatus, PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  createCheckout(@Body() body: { jobId: string; amountCents: number }) {
    if (!body.jobId || typeof body.amountCents !== 'number') {
      throw new BadRequestException('jobId and amountCents are required');
    }

    const checkout = this.paymentsService.createCheckout(body.jobId, body.amountCents);

    return {
      message: 'Checkout created',
      checkoutUrl: checkout.checkoutUrl,
    };
  }

  @Post('webhook')
  handleWebhook(@Body() body: { jobId: string; status: PaymentStatus | string }) {
    if (!body.jobId || !body.status) {
      throw new BadRequestException('jobId and status are required');
    }

    const normalizedStatus =
      typeof body.status === 'string' ? (body.status.toUpperCase() as PaymentStatus) : body.status;

    if (!Object.values(PaymentStatus).includes(normalizedStatus)) {
      throw new BadRequestException('Unsupported payment status');
    }

    const payment = this.paymentsService.handleWebhook(body.jobId, normalizedStatus);

    return {
      message: `Payment marked as ${payment.status}`,
      payment,
    };
  }
}
