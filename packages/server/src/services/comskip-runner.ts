// packages/server/src/services/comskip-runner.ts

import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { logger } from '../logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Commercial {
  start: number; // seconds
  end: number;   // seconds
}

export interface ComskipResult {
  status: 'done' | 'failed' | 'skipped';
  edlPath: string | null;
  commercials: Commercial[];
  errorMessage?: string;
}

// ── ComskipRunner ─────────────────────────────────────────────────────────────

/**
 * Runs comskip on a completed recording file and parses the resulting EDL file.
 *
 * EDL format (one line per segment):
 *   {start_seconds}\t{end_seconds}\t{action_type}
 * where action_type 3 = commercial break.
 */
export class ComskipRunner {
  constructor(
    private readonly comskipPath: string = '/usr/bin/comskip',
    private readonly iniPath: string = '/etc/comskip/comskip.ini',
  ) {}

  /**
   * Run comskip on the given file. Returns result including EDL path and parsed commercials.
   * Non-fatal: never throws — returns status='failed' or 'skipped' on error.
   */
  async run(filePath: string): Promise<ComskipResult> {
    // Check if comskip binary exists
    const available = await this.isAvailable();
    if (!available) {
      logger.debug({ comskipPath: this.comskipPath }, 'comskip binary not found — skipping');
      return { status: 'skipped', edlPath: null, commercials: [] };
    }

    logger.info({ filePath }, 'Running comskip');

    const args = [`--ini=${this.iniPath}`, filePath];

    try {
      await this.spawnComskip(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ filePath, err }, 'comskip exited with error');
      return { status: 'failed', edlPath: null, commercials: [], errorMessage: message };
    }

    // EDL file is written alongside the input file with the same basename
    const edlPath = join(dirname(filePath), basename(filePath).replace(/\.[^.]+$/, '.edl'));

    const edlExists = await fileExists(edlPath);
    if (!edlExists) {
      logger.warn({ filePath, edlPath }, 'comskip ran but no EDL file produced');
      return { status: 'done', edlPath: null, commercials: [] };
    }

    const commercials = await parseEdl(edlPath);

    logger.info({ filePath, edlPath, commercialCount: commercials.length }, 'comskip complete');

    return { status: 'done', edlPath, commercials };
  }

  /**
   * Check whether the comskip binary is accessible and executable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await access(this.comskipPath);
      return true;
    } catch {
      return false;
    }
  }

  private spawnComskip(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.comskipPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 4096) stderr = stderr.slice(-4096);
      });

      proc.on('exit', (code) => {
        // comskip exits 0 = ok, 1 = no commercials found (still success), other = error
        if (code === 0 || code === 1) {
          resolve();
        } else {
          reject(new Error(`comskip exited with code ${code}: ${stderr.slice(-300)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`comskip spawn error: ${err.message}`));
      });
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse an EDL file and return an array of commercial segments.
 * Only action type 3 (commercial break) is returned.
 */
async function parseEdl(edlPath: string): Promise<Commercial[]> {
  try {
    const content = await readFile(edlPath, 'utf-8');
    const commercials: Commercial[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split('\t');
      if (parts.length < 3) continue;

      const start = parseFloat(parts[0]);
      const end = parseFloat(parts[1]);
      const type = parseInt(parts[2], 10);

      if (!isNaN(start) && !isNaN(end) && type === 3) {
        commercials.push({ start, end });
      }
    }

    return commercials;
  } catch (err) {
    logger.warn({ edlPath, err }, 'Failed to parse EDL file');
    return [];
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Singleton instance
export const comskipRunner = new ComskipRunner();
