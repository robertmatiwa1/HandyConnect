import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '../src/users/user-role.enum';
import { PrismaTestService } from './utils/prisma-test.service';

type AuthenticatedUser = { id: string; role: UserRole };

let currentUser: AuthenticatedUser | null = null;

class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (currentUser) {
      const request = context.switchToHttp().getRequest();
      request.user = currentUser;
    }

    return true;
  }
}

describe('Application E2E', () => {
  let app: INestApplication;
  let prisma: PrismaTestService;

  beforeAll(async () => {
    prisma = new PrismaTestService();
    await prisma.seed();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideGuard(JwtAuthGuard)
      .useClass(MockJwtAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    currentUser = null;
    await prisma.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new user via POST /auth/register', async () => {
    const email = 'integration-user@example.com';

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        name: 'Integration User',
        password: 'SafePass123!',
        role: 'CUSTOMER',
      })
      .expect(201);

    expect(response.body.user).toMatchObject({
      email,
      name: 'Integration User',
      role: 'CUSTOMER',
    });
    expect(response.body.accessToken).toBeDefined();
  });

  it('logs in an existing user via POST /auth/login and returns a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: prisma.seeds.customer.email,
        password: prisma.seeds.customer.password,
      })
      .expect(201);

    expect(response.body.user).toMatchObject({
      email: prisma.seeds.customer.email,
    });
    expect(response.body.accessToken).toBeDefined();
  });

  it('lists providers via GET /providers', async () => {
    const response = await request(app.getHttpServer()).get('/providers').expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('creates a job for the authenticated customer via POST /jobs', async () => {
    currentUser = { id: prisma.seeds.customer.id, role: UserRole.CUSTOMER };

    const response = await request(app.getHttpServer())
      .post('/jobs')
      .send({
        providerId: prisma.seeds.provider.profileId,
        notes: 'Fix a leaking sink',
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

  it('allows a provider to update job status via PATCH /jobs/:id/status', async () => {
    currentUser = { id: prisma.seeds.customer.id, role: UserRole.CUSTOMER };

    const jobResponse = await request(app.getHttpServer())
      .post('/jobs')
      .send({ providerId: prisma.seeds.provider.profileId })
      .expect(201);

    const jobId = jobResponse.body.job.id;

    currentUser = { id: prisma.seeds.provider.id, role: UserRole.PROVIDER };

    const updateResponse = await request(app.getHttpServer())
      .patch(`/jobs/${jobId}/status`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    expect(updateResponse.body).toMatchObject({
      message: 'Job status updated to ACCEPTED',
      job: expect.objectContaining({ id: jobId, status: 'ACCEPTED' }),
    });
  });
});
