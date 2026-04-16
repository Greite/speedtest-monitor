import { runMigrations } from '../lib/db/migrate';

runMigrations();
console.log('migrations applied');
process.exit(0);
