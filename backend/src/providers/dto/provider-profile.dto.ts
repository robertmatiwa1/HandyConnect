import { IsString, IsArray, IsNumber } from 'class-validator';

export class ProviderProfileDto {
  @IsString()
  suburb: string;

  @IsString()
  skillCategory: string;

  @IsNumber()
  hourlyRate: number;

  @IsArray()
  certifications: string[];

  @IsArray()
  portfolioUrls: string[];
}
