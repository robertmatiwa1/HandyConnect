import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const corsOrigins = process.env.EXPO_DEV_HOST
    ? process.env.EXPO_DEV_HOST.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('HandyConnect API')
    .setDescription('API documentation for HandyConnect')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  await app.listen(process.env.PORT || 3000);
}

bootstrap();
