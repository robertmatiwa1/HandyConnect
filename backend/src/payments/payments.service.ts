import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

export enum PaymentStatus {
  PENDING = 'PENDING',
  ESCROW = 'ESCROW',
  PAID = 'PAID',
}

export interface Payment {
  jobId: string;
  amountCents: number;
  commissionCents: number;
  providerPayoutCents: number;
  status: PaymentStatus;
  checkoutUrl: string;
}

@Injectable()
export class PaymentsService {
  private payments: Map<string, Payment> = new Map();

  createCheckout(jobId: string, amountCents: number) {
    if (!jobId) {
      throw new BadRequestException('jobId is required for checkout creation.');
    }

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive number.');
    }

    const commissionCents = Math.round(amountCents * 0.1);
    const providerPayoutCents = Math.max(amountCents - commissionCents, 0);
    const checkoutUrl = `https://sandbox.payfast.co.za/fake?id=${jobId}`;

    const payment: Payment = {
      jobId,
      amountCents,
      commissionCents,
      providerPayoutCents,
      status: PaymentStatus.PENDING,
      checkoutUrl,
    };

    this.payments.set(jobId, payment);

    return { checkoutUrl };
  }

  handleWebhook(jobId: string, status: PaymentStatus): Payment {
    switch (status) {
      case PaymentStatus.ESCROW:
        return this.moveToEscrow(jobId);
      case PaymentStatus.PAID:
        return this.releaseEscrow(jobId);
      case PaymentStatus.PENDING:
        throw new BadRequestException('Webhook cannot revert a payment to pending.');
      default:
        throw new BadRequestException(`Unsupported payment status: ${status}`);
    }
  }

  moveToEscrow(jobId: string): Payment {
    const payment = this.getPaymentOrThrow(jobId);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Payment for job ${jobId} cannot move to escrow from ${payment.status}`);
    }

    payment.status = PaymentStatus.ESCROW;
    this.payments.set(jobId, payment);
    return payment;
  }

  releaseEscrow(jobId: string): Payment {
    const payment = this.getPaymentOrThrow(jobId);

    if (payment.status !== PaymentStatus.ESCROW) {
      throw new BadRequestException(`Payment for job ${jobId} is not ready for release.`);
    }

    payment.status = PaymentStatus.PAID;
    this.payments.set(jobId, payment);
    return payment;
  }

  getPayment(jobId: string): Payment | undefined {
    return this.payments.get(jobId);
  }

  private getPaymentOrThrow(jobId: string): Payment {
    const payment = this.payments.get(jobId);
    if (!payment) {
      throw new NotFoundException(`Payment for job ${jobId} not found`);
    }
    return payment;
  }
}
