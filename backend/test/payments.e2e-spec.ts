import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { JobsService } from '../src/jobs/jobs.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaTestService } from './utils/prisma-test.service';

describe('PaymentsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaTestService;
  let jobsService: JobsService;
  let paymentsService: PaymentsService;

  beforeAll(async () => {
    prisma = new PrismaTestService();
    await prisma.seed();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    jobsService = app.get(JobsService);
    paymentsService = app.get(PaymentsService);
  });

  beforeEach(async () => {
    await prisma.reset();
    (jobsService as any).jobs = [];
    (paymentsService as any).payments = new Map();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginCustomer() {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: prisma.seeds.customer.email,
        password: prisma.seeds.customer.password,
      })
      .expect(200);

    return response.body.accessToken as string;
  }

  it('creates a checkout session and processes payment webhooks', async () => {
    const customerToken = await loginCustomer();

    const jobResponse = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerId: prisma.seeds.provider.profileId })
      .expect(201);

    const jobId = jobResponse.body.job.id;
    const amountCents = jobResponse.body.job.priceCents ?? 9000;

    const checkoutResponse = await request(app.getHttpServer())
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ jobId, amountCents })
      .expect(201);

    expect(checkoutResponse.body).toMatchObject({
      message: 'Checkout created',
      checkoutUrl: expect.stringContaining(jobId),
    });

    const escrowResponse = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send({ jobId, status: 'ESCROW' })
      .expect(201);

    expect(escrowResponse.body).toMatchObject({
      message: 'Payment marked as ESCROW',
      payment: expect.objectContaining({ status: 'ESCROW' }),
    });

    const paidResponse = await request(app.getHttpServer())
      .post('/payments/webhook')
      .send({ jobId, status: 'PAID' })
      .expect(201);

    expect(paidResponse.body).toMatchObject({
      message: 'Payment marked as PAID',
      payment: expect.objectContaining({ status: 'PAID' }),
    });
  });
});
