import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { ArtifactService } from './artifact.service.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import { QueueService } from './queue.service.js';
import { UpdateService } from './update.service.js';
import { SessionService } from './session/session.service.js';
import { AuthorizationService } from './engagement/authorization.service.js';
import { ExecutionGrantService } from './policy/execution-grant.service.js';
import { IdentityProviderService } from './identity/provider.service.js';
import { AccessGovernanceService } from './identity/access-governance.service.js';
import { MfaService } from './identity/mfa.service.js';

@Module({ controllers: [AppController], providers: [DatabaseService, SessionService, AuthService, IdentityProviderService, AccessGovernanceService, MfaService, AuthorizationService, ExecutionGrantService, QueueService, ArtifactService, UpdateService] })
export class AppModule {}
