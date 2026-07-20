import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AuthService } from './auth.service.js';
import { isInternalWorkerServiceRoute } from './internal-worker-route.js';
import { attachSessionPrincipal } from './request-principal.js';

const PUBLIC_PATHS = new Set(['/health', '/ready', '/auth/login', '/auth/register']);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(cookieParser());
  const auth = app.get(AuthService);
  app.use(async (req: any, res: any, next: any) => {
    if (req.method === 'OPTIONS' || PUBLIC_PATHS.has(req.path) || isInternalWorkerServiceRoute(req.method, req.path)) return next();
    return attachSessionPrincipal(auth, req, res, next);
  });
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}
bootstrap();
