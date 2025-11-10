import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { JobsService } from '../src/jobs/jobs.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaTestService } from './utils/prisma-test.service';

describe('JobsController (e2e)', () => {
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
      .expect(201);

    return response.body.accessToken;
  }

  async function loginProvider() {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: prisma.seeds.provider.email,
        password: prisma.seeds.provider.password,
      })
      .expect(201);

    return response.body.accessToken;
  }

  it('creates a job for the customer', async () => {
    const customerToken = await loginCustomer();

    const response = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        providerId: prisma.seeds.provider.profileId,
        notes: 'Please help with a leaking pipe.',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      message: 'Job created',
      job: expect.objectContaining({
        providerId: prisma.seeds.provider.profileId,
        status: 'PENDING',
      }),
    });
  });

  it('lists jobs for the authenticated customer', async () => {
    const customerToken = await loginCustomer();

    const createdJob = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerId: prisma.seeds.provider.profileId })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(listResponse.body.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createdJob.body.job.id, status: 'PENDING' }),
      ]),
    );
  });

  it('updates the job status for the provider', async () => {
    const customerToken = await loginCustomer();
    const providerToken = await loginProvider();

    const createdJob = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ providerId: prisma.seeds.provider.profileId })
      .expect(201);

    const jobId = createdJob.body.job.id;

    const updateResponse = await request(app.getHttpServer())
      .patch(`/jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    expect(updateResponse.body).toMatchObject({
      message: 'Job status updated to ACCEPTED',
      job: expect.objectContaining({ id: jobId, status: 'ACCEPTED' }),
    });
  });
});
