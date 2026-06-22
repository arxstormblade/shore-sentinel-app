# Shore Sentinel API

NestJS API foundation for Shore Sentinel.

Implemented:
- local cookie-session auth with seeded admin
- single internal tenant seed, roles, and role/feature permission matrix
- PostgreSQL schema for users, roles, settings, managed machines, one-time audits, scan jobs/runs, findings, remediation, artifacts, notifications, knowledgebase, and audit log
- canonical job/run subject model with exactly-one target constraint
- one-time audit and managed-machine scan-job launch endpoints
- Redis enqueue/lease helpers for scan jobs and artifact processing
- MinIO/S3 presigned upload metadata flow
- SSE progress stream

Default local seed login: admin@shore360.local / ChangeMe123! (override with SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD).
