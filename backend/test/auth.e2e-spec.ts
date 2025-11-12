import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaTestService } from './utils/prisma-test.service';

describe('AuthController (e2e)', () => {
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
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await prisma.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new user and verifies email', async () => {
    const email = 'new-user@example.com';

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        name: 'New User',
        password: 'StrongPass123!',
        role: 'CUSTOMER',
      })
      .expect(201);

    expect(registerResponse.body.user).toMatchObject({
      email,
      name: 'New User',
      role: 'CUSTOMER',
    });
    expect(registerResponse.body.accessToken).toBeDefined();
    expect(registerResponse.body.emailVerificationCode).toBeDefined();

    const verifyResponse = await request(app.getHttpServer())
      .get(`/auth/verify-email/${registerResponse.body.emailVerificationCode}`)
      .expect(200);

    expect(verifyResponse.body).toMatchObject({
      message: 'Email verified successfully',
      user: {
        email,
        emailVerificationCode: null,
      },
    });
  });

  it('logs in the seeded customer and returns a token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: prisma.seeds.customer.email,
        password: prisma.seeds.customer.password,
      })
      .expect(200);

    expect(loginResponse.body.user).toMatchObject({
      email: prisma.seeds.customer.email,
      role: 'CUSTOMER',
    });
    expect(loginResponse.body.accessToken).toEqual(expect.any(String));
  });

  it('returns the authenticated profile', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: prisma.seeds.customer.email,
        password: prisma.seeds.customer.password,
      })
      .expect(200);

    const profileResponse = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(profileResponse.body).toMatchObject({
      email: prisma.seeds.customer.email,
      name: prisma.seeds.customer.name,
      role: 'CUSTOMER',
    });
  });
});
