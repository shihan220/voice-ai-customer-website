import 'dotenv/config';
import { createApp } from './app.ts';
import { ensureRuntimeDirectories, port, mediaRoot } from './core.ts';
import { ensureSchema } from './db.ts';
import { startTtsJobWorker } from './services/tts-jobs.ts';

const app = createApp();

app.listen(port, () => {
  console.log(`BANGLA SPEECH AI API running at http://127.0.0.1:${port}`);
  console.log(`Serving media from ${mediaRoot}`);

  ensureRuntimeDirectories()
    .then(() => ensureSchema())
    .then(() => startTtsJobWorker())
    .then(() => {
      console.log('PostgreSQL schema is ready.');
      console.log('TTS job worker is running.');
    })
    .catch((error) => {
      console.warn('Runtime setup is incomplete. Database-backed routes will fail until the environment is ready.');
      console.warn(error instanceof Error ? error.message : error);
    });
});
