export {};

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required. Point it at a disposable fresh database before running verify:db:fresh.');
  process.exit(1);
}

const { ensureSchema } = await import('../db.ts');

try {
  await ensureSchema();
  console.log(`Fresh database schema verification passed for ${process.env.DATABASE_URL}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
