import 'dotenv/config';
import { createApp } from './app.ts';
import { ensureRuntimeDirectories, port, mediaRoot } from './core.ts';
import { ensureSchema } from './db.ts';

const app = createApp();

app.listen(port, () => {
  console.log(`Bangla Voice API running at http://127.0.0.1:${port}`);
  console.log(`Serving media from ${mediaRoot}`);

  ensureRuntimeDirectories()
    .then(() => ensureSchema())
    .then(() => {
      console.log('PostgreSQL schema is ready.');
    })
    .catch((error) => {
      console.warn('Runtime setup is incomplete. Database-backed routes will fail until the environment is ready.');
      console.warn(error instanceof Error ? error.message : error);
    });
});
