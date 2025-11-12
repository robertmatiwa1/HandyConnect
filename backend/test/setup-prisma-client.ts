const role = {
  CUSTOMER: 'CUSTOMER',
  PROVIDER: 'PROVIDER',
  ADMIN: 'ADMIN',
} as const;

const jobStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

const paymentStatus = {
  PENDING: 'PENDING',
  ESCROW: 'ESCROW',
  PAID: 'PAID',
} as const;

const disputeStatus = {
  OPEN: 'OPEN',
  AWAITING_MERCHANT_EVIDENCE: 'AWAITING_MERCHANT_EVIDENCE',
  CHARGEBACK_FILED: 'CHARGEBACK_FILED',
  WON: 'WON',
  LOST: 'LOST',
} as const;

const refundStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

class PrismaClientMock {}

type PrismaNamespace = Record<string, unknown>;

jest.mock('@prisma/client', () => ({
  PrismaClient: PrismaClientMock,
  Prisma: {} as PrismaNamespace,
  Role: role,
  JobStatus: jobStatus,
  PaymentStatus: paymentStatus,
  DisputeStatus: disputeStatus,
  RefundStatus: refundStatus,
}));
