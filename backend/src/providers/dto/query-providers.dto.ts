import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class QueryProvidersDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  suburb?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  skillCategory?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
