import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AuthService } from './auth.service.js';

const PUBLIC_PATHS = new Set(['/health', '/ready', '/auth/login', '/auth/register']);

function tokenFrom(req: { cookies?: Record<string, string>; headers: Record<string, string | string[] | undefined> }) {
  const cookieToken = req.cookies?.shore_session;
  const auth = req.headers.authorization;
  const authValue = Array.isArray(auth) ? auth[0] : auth;
  return cookieToken ?? (authValue?.startsWith('Bearer ') ? authValue.slice(7) : undefined);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(cookieParser());
  const auth = app.get(AuthService);
  app.use(async (req: any, res: any, next: any) => {
    if (req.method === 'OPTIONS' || PUBLIC_PATHS.has(req.path)) return next();
    try {
      await auth.me(tokenFrom(req));
      return next();
    } catch {
      return res.status(401).json({ statusCode: 401, message: 'Authentication required', error: 'Unauthorized' });
    }
  });
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}
bootstrap();
