import { IsDateString, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateJobDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsString()
  @MinLength(5)
  description: string;

  @IsString()
  suburb: string;

  @IsDateString()
  scheduledAt: string;

  @IsInt()
  priceCents: number;
}
