import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { ProvidersModule } from './providers/providers.module';

@Module({
  imports: [
    UsersModule,
    ProvidersModule,
    // your other modules
  ],
})
export class AppModule {}

