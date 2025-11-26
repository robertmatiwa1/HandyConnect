import { IsInt, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  jobId!: string;

  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsInt()
  @Min(0)
  commissionCents!: number;

  @IsInt()
  @Min(0)
  providerPayoutCents!: number;

  @IsString()
  method!: string;
}
