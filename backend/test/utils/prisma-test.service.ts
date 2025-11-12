import * as argon2 from 'argon2';

import { JobStatus } from '../../src/jobs/job-status.enum';
import { UserRole } from '../../src/users/user-role.enum';

interface InMemoryUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  emailVerificationCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InMemoryProviderProfile {
  id: string;
  userId: string;
  skill: string;
  suburb: string;
  hourlyRate: number | null;
  bio: string | null;
  experienceYears: number | null;
  verified: boolean;
  photoUrl: string | null;
  portfolio: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface InMemoryReview {
  id: string;
  jobId: string;
  providerId: string;
  customerId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

interface InMemoryJob {
  id: string;
  customerId: string;
  providerProfileId: string;
  title: string;
  notes: string | null;
  scheduledAt: Date;
  suburb: string;
  priceCents: number;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
}

type PaymentStatusValue = 'PENDING' | 'ESCROW' | 'PAID';

interface InMemoryPayment {
  jobId: string;
  amountCents: number;
  commissionCents: number;
  providerPayoutCents: number;
  checkoutUrl: string;
  status: PaymentStatusValue;
  createdAt: Date;
  updatedAt: Date;
}

type ProviderInclude = {
  user?: boolean;
  reviews?: boolean;
};

interface UserWhereUnique {
  email?: string;
  id?: string;
  emailVerificationCode?: string | null;
}

interface ProviderWhereUnique {
  id?: string;
  userId?: string;
}

interface ReviewWhereUnique {
  jobId?: string;
}

interface JobWhereUnique {
  id?: string;
}

type JobInclude = {
  provider?: { include?: { user?: boolean } } | boolean;
  review?: boolean;
  payment?: boolean;
};

type JobWhere = {
  customerId?: string;
  provider?: { userId?: string };
};

type OrderBy = {
  createdAt?: 'asc' | 'desc';
};

function cloneDate(value: Date) {
  return new Date(value.getTime());
}

function cloneUser(user: InMemoryUser): InMemoryUser {
  return { ...user, createdAt: cloneDate(user.createdAt), updatedAt: cloneDate(user.updatedAt) };
}

function cloneProvider(profile: InMemoryProviderProfile): InMemoryProviderProfile {
  return {
    ...profile,
    createdAt: cloneDate(profile.createdAt),
    updatedAt: cloneDate(profile.updatedAt),
    portfolio: [...profile.portfolio],
  };
}

function cloneReview(review: InMemoryReview): InMemoryReview {
  return { ...review, createdAt: cloneDate(review.createdAt) };
}

function cloneJob(job: InMemoryJob): InMemoryJob {
  return {
    ...job,
    scheduledAt: cloneDate(job.scheduledAt),
    createdAt: cloneDate(job.createdAt),
    updatedAt: cloneDate(job.updatedAt),
  };
}

function clonePayment(payment: InMemoryPayment): InMemoryPayment {
  return {
    ...payment,
    createdAt: cloneDate(payment.createdAt),
    updatedAt: cloneDate(payment.updatedAt),
  };
}

export class PrismaTestService {
  private users: InMemoryUser[] = [];
  private providerProfiles: InMemoryProviderProfile[] = [];
  private reviews: InMemoryReview[] = [];
  private jobs: InMemoryJob[] = [];
  private payments: InMemoryPayment[] = [];

  private initialUsers: InMemoryUser[] = [];
  private initialProviderProfiles: InMemoryProviderProfile[] = [];
  private initialReviews: InMemoryReview[] = [];
  private initialJobs: InMemoryJob[] = [];
  private initialPayments: InMemoryPayment[] = [];

  private userCounter = 1;
  private providerCounter = 1;
  private reviewCounter = 1;
  private jobCounter = 1;

  private initialUserCounter = 1;
  private initialProviderCounter = 1;
  private initialReviewCounter = 1;
  private initialJobCounter = 1;

  public seeds = {
    customer: {
      id: '',
      email: 'customer@example.com',
      password: 'CustomerPass123!',
      name: 'Charlie Customer',
      verificationCode: 'verify-customer',
    },
    provider: {
      id: '',
      email: 'provider@example.com',
      password: 'ProviderPass123!',
      name: 'Pat Provider',
      verificationCode: 'verify-provider',
      profileId: '',
    },
    secondaryProvider: {
      id: '',
      email: 'electrician@example.com',
      password: 'ElectricPass123!',
      name: 'Eddie Electrician',
      profileId: '',
    }
  };


  async seed() {
    this.users = [];
    this.providerProfiles = [];
    this.reviews = [];
    this.jobs = [];
    this.payments = [];
    this.userCounter = 1;
    this.providerCounter = 1;
    this.reviewCounter = 1;
    this.jobCounter = 1;

    const customer = await this.createSeedUser({
      email: this.seeds.customer.email,
      password: this.seeds.customer.password,
      name: this.seeds.customer.name,
      role: UserRole.CUSTOMER,
      emailVerificationCode: this.seeds.customer.verificationCode,
    });
    this.seeds.customer.id = customer.id;

    const provider = await this.createSeedUser({
      email: this.seeds.provider.email,
      password: this.seeds.provider.password,
      name: this.seeds.provider.name,
      role: UserRole.PROVIDER,
      emailVerificationCode: this.seeds.provider.verificationCode,
    });

    const providerProfile = this.createSeedProvider({
      userId: provider.id,
      skill: 'Plumbing',
      suburb: 'Cape Town',
      hourlyRate: 9000,
      bio: 'Experienced plumber available 24/7.',
      experienceYears: 8,
      verified: true,
      portfolio: ['https://example.com/portfolio/plumbing'],
    });

    const firstReviewDate = new Date();
    this.reviews.push({
      id: this.generateReviewId(),
      jobId: 'job_seed_1',
      providerId: providerProfile.id,
      customerId: customer.id,
      rating: 4,
      comment: 'Solid workmanship and fast response.',
      createdAt: firstReviewDate,
    });

    this.reviews.push({
      id: this.generateReviewId(),
      jobId: 'job_seed_2',
      providerId: providerProfile.id,
      customerId: customer.id,
      rating: 5,
      comment: 'Excellent service! Highly recommend.',
      createdAt: new Date(firstReviewDate.getTime() + 60_000),
    });

    const secondaryProvider = await this.createSeedUser({
      email: this.seeds.secondaryProvider.email,
      password: this.seeds.secondaryProvider.password,
      name: this.seeds.secondaryProvider.name,
      role: UserRole.PROVIDER,
      emailVerificationCode: null,
    });

    const secondaryProfile = this.createSeedProvider({
      userId: secondaryProvider.id,
      skill: 'Electrical',
      suburb: 'Johannesburg',
      hourlyRate: 10500,
      bio: 'Licensed electrician for residential work.',
      experienceYears: 6,
      verified: false,
      portfolio: [],
    });

    this.seeds.provider.id = provider.id;
    this.seeds.provider.profileId = providerProfile.id;
    this.seeds.secondaryProvider.id = secondaryProvider.id;
    this.seeds.secondaryProvider.profileId = secondaryProfile.id;

    this.initialUsers = this.users.map(cloneUser);
    this.initialProviderProfiles = this.providerProfiles.map(cloneProvider);
    this.initialReviews = this.reviews.map(cloneReview);
    this.initialJobs = this.jobs.map(cloneJob);
    this.initialPayments = this.payments.map(clonePayment);
    this.initialUserCounter = this.userCounter;
    this.initialProviderCounter = this.providerCounter;
    this.initialReviewCounter = this.reviewCounter;
    this.initialJobCounter = this.jobCounter;
  }

  async reset() {
    this.users = this.initialUsers.map(cloneUser);
    this.providerProfiles = this.initialProviderProfiles.map(cloneProvider);
    this.reviews = this.initialReviews.map(cloneReview);
    this.jobs = this.initialJobs.map(cloneJob);
    this.payments = this.initialPayments.map(clonePayment);
    this.userCounter = this.initialUserCounter;
    this.providerCounter = this.initialProviderCounter;
    this.reviewCounter = this.initialReviewCounter;
    this.jobCounter = this.initialJobCounter;
  }

  async $connect() {
    // noop for in-memory service
  }

  async $disconnect() {
    // noop for in-memory service
  }

  user = {
    create: async ({ data }: { data: any }) => {
      const user = this.createUserRecord(data);
      return cloneUser(user);
    },
    findUnique: async ({ where }: { where: UserWhereUnique }) => {
      const user = this.findUser(where);
      return user ? cloneUser(user) : null;
    },
    update: async ({ where, data }: { where: UserWhereUnique; data: any }) => {
      const user = this.findUser(where);
      if (!user) {
        return null;
      }

      if (Object.prototype.hasOwnProperty.call(data, 'email')) {
        user.email = data.email;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'password')) {
        user.password = data.password;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        user.name = data.name;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'role')) {
        user.role = data.role;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'emailVerificationCode')) {
        user.emailVerificationCode = data.emailVerificationCode;
      }
      user.updatedAt = new Date();

      return cloneUser(user);
    },
  };

  providerProfile = {
    findMany: async ({ where, include }: { where?: any; include?: ProviderInclude } = {}) => {
      const filters = where ?? {};
      const skillContains = filters.skill?.contains?.toLowerCase?.();
      const suburbContains = filters.suburb?.contains?.toLowerCase?.();
      const results = this.providerProfiles
        .filter((profile) => {
          const matchesSkill = skillContains
            ? profile.skill.toLowerCase().includes(skillContains)
            : true;
          const matchesSuburb = suburbContains
            ? profile.suburb.toLowerCase().includes(suburbContains)
            : true;
          return matchesSkill && matchesSuburb;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((profile) => this.applyInclude(profile, include));

      return results;
    },
    findUnique: async ({ where, include }: { where: ProviderWhereUnique; include?: ProviderInclude }) => {
      const profile = this.findProvider(where);
      return profile ? this.applyInclude(profile, include) : null;
    },
    upsert: async ({ where, update, create, include }: { where: ProviderWhereUnique; update: any; create: any; include?: ProviderInclude }) => {
      let profile = this.findProvider(where);
      if (profile) {
        if (Object.prototype.hasOwnProperty.call(update, 'skill') && update.skill !== undefined) {
          profile.skill = update.skill;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'suburb') && update.suburb !== undefined) {
          profile.suburb = update.suburb;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'hourlyRate')) {
          profile.hourlyRate = update.hourlyRate ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'bio')) {
          profile.bio = update.bio ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'experienceYears')) {
          profile.experienceYears = update.experienceYears ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'photoUrl')) {
          profile.photoUrl = update.photoUrl ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'portfolio')) {
          profile.portfolio = update.portfolio ?? [];
        }
        profile.updatedAt = new Date();
      } else {
        profile = {
          id: this.generateProviderId(),
          userId: create.userId,
          skill: create.skill,
          suburb: create.suburb,
          hourlyRate: create.hourlyRate ?? null,
          bio: create.bio ?? null,
          experienceYears: create.experienceYears ?? null,
          verified: create.verified ?? false,
          photoUrl: create.photoUrl ?? null,
          portfolio: create.portfolio ?? [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.providerProfiles.push(profile);
      }

      return this.applyInclude(profile, include);
    },
  };

  review = {
    findUnique: async ({ where }: { where: ReviewWhereUnique }) => {
      const review = this.reviews.find((item) => item.jobId === where.jobId);
      return review ? cloneReview(review) : null;
    },
  };

  job = {
    create: async ({ data, include }: { data: any; include?: JobInclude }) => {
      const now = new Date();
      const job: InMemoryJob = {
        id: this.generateJobId(),
        customerId: data.customerId,
        providerProfileId: data.providerProfileId,
        title: data.title,
        notes: data.notes ?? null,
        scheduledAt: data.scheduledAt ?? this.getDefaultScheduledAt(now),
        suburb: data.suburb,
        priceCents: data.priceCents ?? 0,
        status: data.status ?? JobStatus.PENDING,
        createdAt: now,
        updatedAt: now,
      };
      this.jobs.push(job);
      return this.applyJobInclude(job, include);
    },
    findMany: async ({ where, include, orderBy }: { where?: JobWhere; include?: JobInclude; orderBy?: OrderBy } = {}) => {
      let results = [...this.jobs];
      if (where?.customerId) {
        results = results.filter((job) => job.customerId === where.customerId);
      }
      if (where?.provider?.userId) {
        results = results.filter((job) => {
          const profile = this.providerProfiles.find((item) => item.id === job.providerProfileId);
          return profile ? profile.userId === where.provider?.userId : false;
        });
      }

      if (orderBy?.createdAt) {
        results.sort((a, b) =>
          orderBy.createdAt === 'desc'
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }

      return results.map((job) => this.applyJobInclude(job, include));
    },
    findFirst: async ({ where, include }: { where?: JobWhere; include?: JobInclude } = {}) => {
      const [first] = await this.job.findMany({ where, include });
      return first ?? null;
    },
    findUnique: async ({ where, include }: { where: JobWhereUnique; include?: JobInclude }) => {
      const job = this.jobs.find((item) => item.id === where.id);
      return job ? this.applyJobInclude(job, include) : null;
    },
    update: async ({ where, data, include }: { where: JobWhereUnique; data: any; include?: JobInclude }) => {
      const job = this.jobs.find((item) => item.id === where.id);
      if (!job) {
        return null;
      }

      if (Object.prototype.hasOwnProperty.call(data, 'status')) {
        job.status = data.status ?? job.status;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'notes')) {
        job.notes = data.notes ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'scheduledAt')) {
        job.scheduledAt = data.scheduledAt ?? job.scheduledAt;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'priceCents')) {
        job.priceCents = data.priceCents ?? job.priceCents;
      }
      job.updatedAt = new Date();

      return this.applyJobInclude(job, include);
    },
  };

  payment = {
    upsert: async ({ where, update, create }: { where: { jobId: string }; update: any; create: any }) => {
      let payment = this.payments.find((item) => item.jobId === where.jobId);
      if (payment) {
        if (Object.prototype.hasOwnProperty.call(update, 'amountCents')) {
          payment.amountCents = update.amountCents ?? payment.amountCents;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'commissionCents')) {
          payment.commissionCents = update.commissionCents ?? payment.commissionCents;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'providerPayoutCents')) {
          payment.providerPayoutCents = update.providerPayoutCents ?? payment.providerPayoutCents;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'checkoutUrl')) {
          payment.checkoutUrl = update.checkoutUrl ?? payment.checkoutUrl;
        }
        if (Object.prototype.hasOwnProperty.call(update, 'status')) {
          payment.status = update.status ?? payment.status;
        }
        payment.updatedAt = new Date();
      } else {
        const now = new Date();
        payment = {
          jobId: where.jobId,
          amountCents: create.amountCents,
          commissionCents: create.commissionCents ?? 0,
          providerPayoutCents: create.providerPayoutCents ?? 0,
          checkoutUrl: create.checkoutUrl ?? '',
          status: create.status ?? 'PENDING',
          createdAt: now,
          updatedAt: now,
        };
        this.payments.push(payment);
      }

      return clonePayment(payment);
    },
    update: async ({ where, data }: { where: { jobId: string }; data: any }) => {
      const payment = this.payments.find((item) => item.jobId === where.jobId);
      if (!payment) {
        return null;
      }

      if (Object.prototype.hasOwnProperty.call(data, 'status')) {
        payment.status = data.status ?? payment.status;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'checkoutUrl')) {
        payment.checkoutUrl = data.checkoutUrl ?? payment.checkoutUrl;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'amountCents')) {
        payment.amountCents = data.amountCents ?? payment.amountCents;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'commissionCents')) {
        payment.commissionCents = data.commissionCents ?? payment.commissionCents;
      }
      if (Object.prototype.hasOwnProperty.call(data, 'providerPayoutCents')) {
        payment.providerPayoutCents = data.providerPayoutCents ?? payment.providerPayoutCents;
      }
      payment.updatedAt = new Date();

      return clonePayment(payment);
    },
    findUnique: async ({ where }: { where: { jobId: string } }) => {
      const payment = this.payments.find((item) => item.jobId === where.jobId);
      return payment ? clonePayment(payment) : null;
    },
  };

  private async createSeedUser({
    email,
    password,
    name,
    role,
    emailVerificationCode,
  }: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    emailVerificationCode: string | null;
  }): Promise<InMemoryUser> {
    const now = new Date();
    const user: InMemoryUser = {
      id: this.generateUserId(),
      email,
      password: await argon2.hash(password),
      name,
      role,
      emailVerificationCode,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  private createSeedProvider({
    userId,
    skill,
    suburb,
    hourlyRate,
    bio,
    experienceYears,
    verified,
    portfolio,
  }: {
    userId: string;
    skill: string;
    suburb: string;
    hourlyRate: number;
    bio: string;
    experienceYears: number;
    verified: boolean;
    portfolio: string[];
  }): InMemoryProviderProfile {
    const now = new Date();
    const profile: InMemoryProviderProfile = {
      id: this.generateProviderId(),
      userId,
      skill,
      suburb,
      hourlyRate,
      bio,
      experienceYears,
      verified,
      photoUrl: null,
      portfolio,
      createdAt: now,
      updatedAt: now,
    };
    this.providerProfiles.push(profile);
    return profile;
  }

  private createUserRecord(data: any): InMemoryUser {
    const now = new Date();
    const user: InMemoryUser = {
      id: this.generateUserId(),
      email: data.email,
      password: data.password,
      name: data.name,
      role: data.role,
      emailVerificationCode: data.emailVerificationCode ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  private findUser(where: UserWhereUnique): InMemoryUser | undefined {
    if (where.email) {
      return this.users.find((user) => user.email === where.email);
    }
    if (where.id) {
      return this.users.find((user) => user.id === where.id);
    }
    if (where.emailVerificationCode) {
      return this.users.find((user) => user.emailVerificationCode === where.emailVerificationCode);
    }
    return undefined;
  }

  private findProvider(where: ProviderWhereUnique): InMemoryProviderProfile | undefined {
    if (where.id) {
      return this.providerProfiles.find((profile) => profile.id === where.id);
    }
    if (where.userId) {
      return this.providerProfiles.find((profile) => profile.userId === where.userId);
    }
    return undefined;
  }

  private applyInclude(profile: InMemoryProviderProfile, include?: ProviderInclude) {
    const result = cloneProvider(profile);
    const includeUser = include?.user ?? false;
    const includeReviews = include?.reviews ?? false;

    const enriched: any = { ...result };

    if (includeUser) {
      const user = this.users.find((item) => item.id === profile.userId);
      enriched.user = user ? cloneUser(user) : null;
    }

    if (includeReviews) {
      const reviews = this.reviews.filter((item) => item.providerId === profile.id).map(cloneReview);
      enriched.reviews = reviews;
    }

    return enriched;
  }

  private applyJobInclude(job: InMemoryJob, include?: JobInclude) {
    const result: any = cloneJob(job);

    if (include?.provider) {
      const providerProfile = this.providerProfiles.find((item) => item.id === job.providerProfileId);
      if (providerProfile) {
        const provider = cloneProvider(providerProfile);
        if (typeof include.provider === 'object' && include.provider?.include?.user) {
          const user = this.users.find((item) => item.id === providerProfile.userId);
          provider.user = user ? cloneUser(user) : null;
        }
        result.provider = provider;
      } else {
        result.provider = null;
      }
    }

    if (include?.review) {
      const review = this.reviews.find((item) => item.jobId === job.id);
      result.review = review ? cloneReview(review) : null;
    }

    if (include?.payment) {
      const payment = this.payments.find((item) => item.jobId === job.id);
      result.payment = payment ? clonePayment(payment) : null;
    }

    return result;
  }

  private getDefaultScheduledAt(now: Date) {
    const scheduled = new Date(now);
    scheduled.setDate(scheduled.getDate() + 2);
    scheduled.setHours(10, 0, 0, 0);
    return scheduled;
  }

  private generateUserId() {
    const id = `user_${this.userCounter++}`;
    return id;
  }

  private generateProviderId() {
    const id = `provider_${this.providerCounter++}`;
    return id;
  }

  private generateReviewId() {
    const id = `review_${this.reviewCounter++}`;
    return id;
  }

  private generateJobId() {
    const id = `job_${this.jobCounter++}`;
    return id;
  }
}
