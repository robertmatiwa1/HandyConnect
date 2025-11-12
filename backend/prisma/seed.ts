import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

type CreatedProvider = {
  userId: string;
  profileId: string;
  name: string;
  suburb: string;
  skill: string;
};

type CreatedCustomer = {
  id: string;
  name: string;
};

const prisma = new PrismaClient();

const SKILL_CATEGORIES = [
  'Electrical',
  'Plumbing',
  'Carpentry',
  'Landscaping',
  'Cleaning',
  'Painting',
  'Appliance Repair',
  'HVAC Maintenance',
];

const SUBURBS = [
  'Sydney CBD',
  'Parramatta',
  'Bondi',
  'Manly',
  'Newtown',
  'Chatswood',
  'Surry Hills',
  'Glebe',
  'Alexandria',
  'Marrickville',
];

function getRandomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function buildEmailFromName(name: string) {
  const [firstName, ...rest] = name.split(' ');
  const lastName = rest.join(' ') || undefined;
  return faker.internet.email({ firstName, lastName });
}

async function resetDatabase() {
  await prisma.review.deleteMany();
  await prisma.job.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.user.deleteMany();
}

async function createCustomers(): Promise<CreatedCustomer[]> {
  const customers: CreatedCustomer[] = [];

  for (let index = 0; index < 5; index += 1) {
    const name = faker.person.fullName();
    const customer = await prisma.user.create({
      data: {
        email: buildEmailFromName(name),
        password: faker.internet.password({ length: 12 }),
        name,
        role: 'CUSTOMER',
      },
    });

    customers.push({ id: customer.id, name: customer.name });
  }

  return customers;
}

async function createProviders(): Promise<CreatedProvider[]> {
  const providers: CreatedProvider[] = [];

  for (let index = 0; index < 5; index += 1) {
    const name = faker.person.fullName();
    const suburb = getRandomItem(SUBURBS);
    const skill = getRandomItem(SKILL_CATEGORIES);

    const user = await prisma.user.create({
      data: {
        email: buildEmailFromName(name),
        password: faker.internet.password({ length: 12 }),
        name,
        role: 'PROVIDER',
      },
    });

    const profile = await prisma.providerProfile.create({
      data: {
        userId: user.id,
        skill,
        suburb,
        hourlyRate: faker.number.int({ min: 4000, max: 12000 }),
        bio: faker.person.bio(),
        experienceYears: faker.number.int({ min: 1, max: 20 }),
        verified: faker.datatype.boolean({ probability: 0.4 }),
        portfolio: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () =>
          faker.image.urlPicsumPhotos({ width: 640, height: 480 }),
        ),
      },
    });

    providers.push({
      userId: user.id,
      profileId: profile.id,
      name: user.name,
      suburb,
      skill,
    });
  }

  return providers;
}

async function createJobs(customers: CreatedCustomer[], providers: CreatedProvider[]) {
  const jobsByProvider = new Map<string, { id: string; customerId: string }[]>();

  for (let index = 0; index < 10; index += 1) {
    const provider = getRandomItem(providers);
    const customer = getRandomItem(customers);

    const scheduledAt = faker.date.soon({ days: 30 });
    const status = faker.helpers.arrayElement([
      'PENDING',
      'ACCEPTED',
      'IN_PROGRESS',
      'COMPLETED',
    ]);
    const notes = faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.6 }) ?? null;

    const job = await prisma.job.create({
      data: {
        customerId: customer.id,
        providerProfileId: provider.profileId,
        title: `${provider.skill} service for ${customer.name}`,
        notes,
        scheduledAt,
        suburb: provider.suburb,
        priceCents: faker.number.int({ min: 5000, max: 20000 }),
        status,
      },
    });

    const jobsForProvider = jobsByProvider.get(provider.profileId) ?? [];
    jobsForProvider.push({ id: job.id, customerId: customer.id });
    jobsByProvider.set(provider.profileId, jobsForProvider);
  }

  return jobsByProvider;
}

async function createReviews(
  jobsByProvider: Map<string, { id: string; customerId: string }[]>,
) {
  for (const [providerId, jobs] of jobsByProvider) {
    if (!jobs.length) continue;

    const jobForReview = jobs[0];

    await prisma.job.update({
      where: { id: jobForReview.id },
      data: { status: 'COMPLETED' },
    });

    const rating = faker.number.int({ min: 3, max: 5 });

    await prisma.review.create({
      data: {
        jobId: jobForReview.id,
        providerId,
        customerId: jobForReview.customerId,
        rating,
        comment: faker.lorem.sentence(),
      },
    });
  }
}

async function main() {
  console.info('Clearing existing data...');
  await resetDatabase();

  console.info('Creating customers...');
  const customers = await createCustomers();

  console.info('Creating providers...');
  const providers = await createProviders();

  console.info('Creating jobs...');
  const jobsByProvider = await createJobs(customers, providers);

  console.info('Creating reviews...');
  await createReviews(jobsByProvider);

  console.info('Seeding completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
