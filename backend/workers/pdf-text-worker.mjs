import { parentPort, workerData } from 'node:worker_threads';
import { promises as fs } from 'node:fs';
import { PDFParse } from 'pdf-parse';

const input = workerData;
const maxTextCharacters = Number(input?.maxTextCharacters);
const inputData = typeof input?.filePath === 'string'
  ? await fs.readFile(input.filePath)
  : Buffer.from(input?.data ?? []);
const parser = new PDFParse({
  data: inputData,
});

try {
  const parsed = await parser.getText();
  const text = typeof parsed.text === 'string' ? parsed.text : '';

  if (
    Number.isFinite(maxTextCharacters)
    && maxTextCharacters > 0
    && text.length > maxTextCharacters
  ) {
    parentPort?.postMessage({
      code: 'TEXT_TOO_LARGE',
      ok: false,
    });
  } else {
    parentPort?.postMessage({
      ok: true,
      text,
    });
  }
} catch {
  parentPort?.postMessage({
    code: 'PARSE_FAILED',
    ok: false,
  });
} finally {
  await parser.destroy().catch(() => undefined);
}
