import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.FASTCOM_DB_PATH ?? './fastcom.db',
  },
} satisfies Config;
