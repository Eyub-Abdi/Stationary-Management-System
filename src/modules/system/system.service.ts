import { BadRequestException, Injectable } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export interface StartupStatus {
  /** Whether automatic startup can be managed on this host (Windows only). */
  supported: boolean;
  /** Whether the STMS Windows service is installed. */
  installed: boolean;
  /** Whether the service is set to start automatically on boot. */
  enabled: boolean;
  platform: string;
  /** Whether a production build exists so the service can actually serve. */
  productionReady: boolean;
  /** URL the app is served at. */
  url: string;
  /** Name of the Windows service. */
  serviceName: string;
}

const APP_URL = 'http://localhost:3000';
const SERVICE_NAME = 'STMS';

/**
 * Controls whether the STMS Windows service starts automatically on boot —
 * the "Run on startup" toggle. The service itself is installed once from a
 * terminal (`npm run service:install`, as Administrator); this only flips its
 * start mode between Automatic and Manual, so it never stops or removes the
 * running app. Changing the start mode needs admin rights, which the app has
 * when it runs as the service (LocalSystem).
 */
@Injectable()
export class SystemService {
  private readonly projectRoot = process.cwd();

  /** Run `sc.exe`, returning its exit code and combined output (never throws). */
  private sc(args: string[]): { code: number; out: string } {
    try {
      const out = execFileSync('sc', args, { encoding: 'utf8', windowsHide: true });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer; message?: string };
      const out =
        (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '') + (err.message ?? '');
      return { code: err.status ?? 1, out };
    }
  }

  /** Whether the service exists and its start mode (auto / manual / disabled). */
  private queryService(): {
    installed: boolean;
    startType: 'auto' | 'manual' | 'disabled' | null;
  } {
    if (process.platform !== 'win32') return { installed: false, startType: null };
    const { code, out } = this.sc(['qc', SERVICE_NAME]);
    if (code !== 0 || /does not exist/i.test(out)) return { installed: false, startType: null };
    const m = /START_TYPE\s*:\s*(\d)/i.exec(out);
    const t = m?.[1];
    const startType = t === '2' ? 'auto' : t === '3' ? 'manual' : t === '4' ? 'disabled' : null;
    return { installed: true, startType };
  }

  private productionReady(): boolean {
    return (
      existsSync(join(this.projectRoot, 'dist', 'src', 'main.js')) &&
      existsSync(join(this.projectRoot, 'frontend', 'dist', 'index.html'))
    );
  }

  status(): StartupStatus {
    const { installed, startType } = this.queryService();
    return {
      supported: process.platform === 'win32',
      installed,
      enabled: installed && startType === 'auto',
      platform: process.platform,
      productionReady: this.productionReady(),
      url: APP_URL,
      serviceName: SERVICE_NAME,
    };
  }

  setEnabled(enabled: boolean): StartupStatus {
    if (process.platform !== 'win32') {
      throw new BadRequestException('Automatic startup is only supported on Windows.');
    }
    if (!this.queryService().installed) {
      throw new BadRequestException(
        'The STMS background service is not installed yet. On this computer, open a terminal as ' +
          'Administrator and run "npm run service:install" once.',
      );
    }
    // `sc config <svc> start= auto|demand` — the space after "start=" is required.
    const res = this.sc(['config', SERVICE_NAME, 'start=', enabled ? 'auto' : 'demand']);
    if (res.code !== 0) {
      if (/access is denied/i.test(res.out)) {
        throw new BadRequestException(
          'Changing startup needs administrator rights. This works when the app runs as the STMS ' +
            'service; otherwise use an elevated terminal.',
        );
      }
      throw new BadRequestException(`Could not change startup: ${res.out.trim().slice(0, 200)}`);
    }
    // Turning it on: also start it now if it isn't already (ignore "already running").
    if (enabled) this.sc(['start', SERVICE_NAME]);
    return this.status();
  }
}
