import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export {};

process.env.NODE_ENV = 'production';
process.env.TTS_PDF_EXTRACTION_TIMEOUT_MS = '5000';
process.env.TTS_PDF_MAX_EXTRACTED_CHARS = '30000';
process.env.TTS_PDF_MAX_CONCURRENT_EXTRACTIONS = '2';

const {
  countBillableWordsForTts,
  extractPdfText,
  extractPdfTextFromFile,
  resolveTtsQualityPreset,
} = await import('../services/tts-jobs.ts');
const {
  fetchSafeProviderAudio,
  readResponseBufferWithLimit,
} = await import('../services/provider-audio-fetch.ts');
const { pool } = await import('../db.ts');

function getStatusCode(error: unknown) {
  return error instanceof Error
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
    ? error.statusCode
    : null;
}

async function assertRejected(
  label: string,
  expectedStatusCode: number,
  operation: () => unknown | Promise<unknown>,
) {
  try {
    await operation();
  } catch (error) {
    if (getStatusCode(error) === expectedStatusCode) {
      return;
    }

    throw new Error(
      `${label} returned ${String(getStatusCode(error))} instead of ${expectedStatusCode}.`,
    );
  }

  throw new Error(`${label} unexpectedly succeeded.`);
}

function escapePdfText(value: string) {
  return value.replace(/([\\()])/g, '\\$1');
}

function buildTextPdf(text: string) {
  const pageTextSize = 2_400;
  const pageTexts: string[] = [];

  for (let offset = 0; offset < text.length; offset += pageTextSize) {
    pageTexts.push(text.slice(offset, offset + pageTextSize));
  }

  const pageObjectIds = pageTexts.map((_pageText, index) => 4 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  for (const [pageIndex, pageText] of pageTexts.entries()) {
    const pageObjectId = pageObjectIds[pageIndex];
    const contentObjectId = pageObjectId + 1;
    const textChunks: string[] = [];

    for (let offset = 0; offset < pageText.length; offset += 80) {
      textChunks.push(pageText.slice(offset, offset + 80));
    }

    const textCommands = textChunks
      .map((chunk) => `(${escapePdfText(chunk)}) Tj\nT*`)
      .join('\n');
    const stream = `BT\n/F1 12 Tf\n14 TL\n72 720 Td\n${textCommands}\nET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream`,
    );
  }
  let body = '%PDF-1.4\n';
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'ascii');
}

async function assertPdfBoundaries() {
  const expectedText = 'Security boundary text extracted from a generated PDF.';
  const extracted = await extractPdfText(buildTextPdf(expectedText));

  if (!extracted.includes(expectedText)) {
    throw new Error('Isolated PDF extraction did not return the expected text.');
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bangla-speech-pdf-boundary-'));
  const pdfPath = path.join(tempDirectory, 'valid.pdf');
  try {
    await fs.writeFile(pdfPath, buildTextPdf(expectedText));
    const extractedFromFile = await extractPdfTextFromFile(pdfPath);
    if (!extractedFromFile.includes(expectedText)) {
      throw new Error('Disk-backed PDF extraction did not return the expected text.');
    }
  } finally {
    await fs.rm(tempDirectory, { force: true, recursive: true });
  }

  await assertRejected(
    'Invalid PDF signature guard',
    400,
    () => extractPdfText(Buffer.from('not a PDF')),
  );
  await assertRejected(
    'PDF extracted-text size guard',
    400,
    () => extractPdfText(buildTextPdf('oversized '.repeat(4_000))),
  );
}

async function assertProviderFetchBoundaries() {
  const baseInput = {
    apiKey: 'test-provider-secret',
    providerApiUrl: 'https://api.keypillar.org/v1/voice/generate',
    timeoutMs: 5_000,
  };

  await assertRejected(
    'Provider file URL guard',
    502,
    () => fetchSafeProviderAudio({
      ...baseInput,
      audioUrl: 'file:///etc/passwd',
    }),
  );
  await assertRejected(
    'Provider private-address guard',
    502,
    () => fetchSafeProviderAudio({
      ...baseInput,
      audioUrl: 'https://127.0.0.1/private.wav',
    }),
  );
  await assertRejected(
    'Provider credential-bearing URL guard',
    502,
    () => fetchSafeProviderAudio({
      ...baseInput,
      audioUrl: 'https://username:password@api.keypillar.org/private.wav',
    }),
  );
  await assertRejected(
    'Provider unapproved-host guard',
    502,
    () => fetchSafeProviderAudio({
      ...baseInput,
      audioUrl: 'https://example.com/private.wav',
    }),
  );
  await assertRejected(
    'Provider content-length guard',
    502,
    () => readResponseBufferWithLimit(
      new Response(Buffer.alloc(10), {
        headers: { 'content-length': '10' },
      }),
      5,
    ),
  );

  const oversizedStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(4));
      controller.enqueue(new Uint8Array(4));
      controller.close();
    },
  });
  await assertRejected(
    'Provider streamed-body size guard',
    502,
    () => readResponseBufferWithLimit(new Response(oversizedStream), 5),
  );
}

async function assertTtsInputBoundaries() {
  await assertRejected(
    'Unsupported quality preset guard',
    400,
    () => resolveTtsQualityPreset('lossless-super-premium'),
  );
  await assertRejected(
    'Oversized text input guard',
    400,
    () => countBillableWordsForTts('word '.repeat(7_000)),
  );
}

try {
  await assertPdfBoundaries();
  await assertProviderFetchBoundaries();
  await assertTtsInputBoundaries();
  console.log('Security boundary verification passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
