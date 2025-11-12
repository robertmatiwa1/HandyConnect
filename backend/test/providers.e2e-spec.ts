import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaTestService } from './utils/prisma-test.service';

describe('ProvidersController (e2e)', () => {
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

  it('returns the seeded providers list', async () => {
    const response = await request(app.getHttpServer()).get('/providers').expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(2);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: prisma.seeds.provider.profileId,
          name: prisma.seeds.provider.name,
          skill: 'Plumbing',
          suburb: 'Cape Town',
          rating: 4.5,
          ratingCount: 2,
        }),
      ]),
    );
  });

  it('filters providers by skill', async () => {
    const response = await request(app.getHttpServer())
      .get('/providers')
      .query({ skill: 'elect' })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: prisma.seeds.secondaryProvider.profileId,
      skill: 'Electrical',
    });
  });

  it('retrieves a provider by id', async () => {
    const response = await request(app.getHttpServer())
      .get(`/providers/${prisma.seeds.provider.profileId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: prisma.seeds.provider.profileId,
      name: prisma.seeds.provider.name,
      suburb: 'Cape Town',
      rating: 4.5,
      ratingCount: 2,
    });
  });

  it('updates the provider profile for the authenticated provider', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: prisma.seeds.provider.email,
        password: prisma.seeds.provider.password,
      })
      .expect(200);

    const updateResponse = await request(app.getHttpServer())
      .patch('/providers/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .send({
        bio: 'Updated provider bio for testing.',
        hourlyRate: 12000,
      })
      .expect(200);

    expect(updateResponse.body).toMatchObject({
      id: prisma.seeds.provider.profileId,
      bio: 'Updated provider bio for testing.',
      hourlyRate: 12000,
    });
  });
});
