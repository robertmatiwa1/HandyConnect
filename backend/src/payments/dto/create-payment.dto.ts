import { IsInt, IsString } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  jobId: string;

  @IsInt()
  amountCents: number;

  @IsInt()
  commissionCents: number;

  @IsInt()
  providerPayoutCents: number;

  @IsString()
  method: string;
}
