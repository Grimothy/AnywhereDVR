import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load .env from project root (two levels up from packages/server/src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('production'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  databaseUrl: z.string().url(),
  recordingsPath: z.string().default('/recordings'),
  tmdbApiKey: z.string().default(''),
  tz: z.string().default('America/New_York'),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse({
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  logLevel: process.env.LOG_LEVEL,
  databaseUrl: process.env.DATABASE_URL,
  recordingsPath: process.env.RECORDINGS_PATH,
  tmdbApiKey: process.env.TMDB_API_KEY,
  tz: process.env.TZ,
});
