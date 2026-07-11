import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { env } from './shared/config/env';
import helmet from 'helmet';
import { RouteParameterPipe } from './shared/validation/route-parameter.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: false,
  });

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.useGlobalPipes(new RouteParameterPipe());
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  await app.listen(env.API_PORT);
}

void bootstrap();
