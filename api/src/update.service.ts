import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

export type UpdateMode = 'status' | 'check' | 'apply';

export type UpdateResult = {
  enabled: boolean;
  mode: UpdateMode;
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  script: string | null;
};

const DEFAULT_SCRIPT = '/app/scripts/shore-sentinel-update.sh';

@Injectable()
export class UpdateService {
  isEnabled() {
    return process.env.SHORE_SENTINEL_ENABLE_SELF_UPDATE === 'true';
  }

  scriptPath() {
    return process.env.SHORE_SENTINEL_UPDATE_SCRIPT || DEFAULT_SCRIPT;
  }

  async run(mode: UpdateMode): Promise<UpdateResult> {
    const script = this.scriptPath();
    if (!this.isEnabled()) {
      return {
        enabled: false,
        mode,
        ok: false,
        stdout: 'Self-update is disabled. Set SHORE_SENTINEL_ENABLE_SELF_UPDATE=true and mount the update script, repository, and Docker socket to enable it.',
        stderr: '',
        exitCode: null,
        script,
      };
    }

    if (!existsSync(script)) {
      throw new ServiceUnavailableException(`Update script not found at ${script}`);
    }

    return new Promise((resolve) => {
      execFile(script, [mode], { timeout: mode === 'apply' ? 15 * 60_000 : 90_000 }, (error, stdout, stderr) => {
        const rawCode = (error as { code?: unknown } | null)?.code;
        const exitCode = typeof rawCode === 'number' ? rawCode : error ? 1 : 0;
        resolve({
          enabled: true,
          mode,
          ok: !error,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
          exitCode,
          script,
        });
      });
    });
  }
}
