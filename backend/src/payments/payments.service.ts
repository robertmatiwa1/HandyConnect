import { Injectable, NotFoundException } from '@nestjs/common';

export enum PaymentStatus {
  PENDING = 'PENDING',
  ESCROW = 'ESCROW',
  PAID = 'PAID',
}

export interface Payment {
  id: string;
  jobId: string;
  amountCents: number;
  method: string;
  status: PaymentStatus;
  checkoutUrl: string;
}

export interface CheckoutResult {
  paymentId: string;
  checkoutUrl: string;
}

@Injectable()
export class PaymentsService {
  private payments: Map<string, Payment> = new Map();

  createCheckout(jobId: string, amountCents: number, method = 'payfast'): CheckoutResult {
    const paymentId = this.generatePaymentId();
    const checkoutUrl = this.generateCheckoutUrl(paymentId, method);

    const payment: Payment = {
      id: paymentId,
      jobId,
      amountCents,
      method,
      status: PaymentStatus.PENDING,
      checkoutUrl,
    };

    this.payments.set(paymentId, payment);

    return { paymentId, checkoutUrl };
  }

  handleEscrowWebhook(paymentId: string): Payment {
    const payment = this.getPaymentOrThrow(paymentId);
    payment.status = PaymentStatus.ESCROW;
    this.payments.set(paymentId, payment);
    return payment;
  }

  handlePaymentCapturedWebhook(paymentId: string): Payment {
    const payment = this.getPaymentOrThrow(paymentId);
    payment.status = PaymentStatus.PAID;
    this.payments.set(paymentId, payment);
    return payment;
  }

  getPayment(paymentId: string): Payment | undefined {
    return this.payments.get(paymentId);
  }

  private getPaymentOrThrow(paymentId: string): Payment {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment with id ${paymentId} not found`);
    }
    return payment;
  }

  private generatePaymentId(): string {
    return `pay_${Math.random().toString(36).substring(2, 12)}`;
  }

  private generateCheckoutUrl(paymentId: string, method: string): string {
    return `https://payments.example.com/${method}/checkout/${paymentId}`;
  }
}
