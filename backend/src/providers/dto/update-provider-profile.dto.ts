import { IsArray, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class UpdateProviderProfileDto {
  @IsOptional()
  @IsString()
  skill?: string;

  @IsOptional()
  @IsString()
  suburb?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  experienceYears?: number;

  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @IsOptional()
  @IsArray()
  @IsUrl(undefined, { each: true })
  portfolio?: string[];
}
