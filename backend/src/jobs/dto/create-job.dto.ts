import { IsString, IsOptional, IsDateString, IsInt, Min } from 'class-validator';

export class CreateJobDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsString()
  description!: string;

  @IsString()
  suburb!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsInt()
  @Min(0)
  priceCents!: number;
}
