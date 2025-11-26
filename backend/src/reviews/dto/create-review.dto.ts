import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  jobId!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}
