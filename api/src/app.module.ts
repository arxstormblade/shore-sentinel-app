import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { ArtifactService } from './artifact.service.js';
import { AuthService } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import { QueueService } from './queue.service.js';
import { UpdateService } from './update.service.js';

@Module({ controllers: [AppController], providers: [DatabaseService, AuthService, QueueService, ArtifactService, UpdateService] })
export class AppModule {}
