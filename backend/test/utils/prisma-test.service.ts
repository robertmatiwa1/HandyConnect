import * as argon2 from 'argon2';

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

export class PrismaTestService {
  private users: InMemoryUser[] = [];
  private providerProfiles: InMemoryProviderProfile[] = [];
  private reviews: InMemoryReview[] = [];

  private initialUsers: InMemoryUser[] = [];
  private initialProviderProfiles: InMemoryProviderProfile[] = [];
  private initialReviews: InMemoryReview[] = [];

  private userCounter = 1;
  private providerCounter = 1;
  private reviewCounter = 1;

  private initialUserCounter = 1;
  private initialProviderCounter = 1;
  private initialReviewCounter = 1;

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
    this.userCounter = 1;
    this.providerCounter = 1;
    this.reviewCounter = 1;

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
    this.initialUserCounter = this.userCounter;
    this.initialProviderCounter = this.providerCounter;
    this.initialReviewCounter = this.reviewCounter;
  }

  async reset() {
    this.users = this.initialUsers.map(cloneUser);
    this.providerProfiles = this.initialProviderProfiles.map(cloneProvider);
    this.reviews = this.initialReviews.map(cloneReview);
    this.userCounter = this.initialUserCounter;
    this.providerCounter = this.initialProviderCounter;
    this.reviewCounter = this.initialReviewCounter;
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
}
