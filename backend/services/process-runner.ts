import { spawn } from 'node:child_process';

const defaultMediaProcessTimeoutMs = 180_000;
const maxCapturedOutputBytes = 1024 * 1024;

function getMediaProcessTimeoutMs() {
  const parsed = Number(process.env.MEDIA_PROCESS_TIMEOUT_MS ?? defaultMediaProcessTimeoutMs);

  if (!Number.isFinite(parsed)) {
    return defaultMediaProcessTimeoutMs;
  }

  return Math.max(5_000, Math.min(600_000, Math.floor(parsed)));
}

async function runMediaProcess(
  command: string,
  args: string[],
  capture: 'none' | 'stderr' | 'stdout',
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', capture === 'stdout' ? 'pipe' : 'ignore', 'pipe'],
    });
    const timeoutMs = getMediaProcessTimeoutMs();
    let capturedOutput = '';
    let diagnosticStderr = '';
    let outputExceeded = false;
    let timedOut = false;
    let settled = false;

    const appendOutput = (current: string, chunk: Buffer | string) => {
      if (Buffer.byteLength(current) >= maxCapturedOutputBytes) {
        outputExceeded = true;
        child.kill('SIGKILL');
        return current;
      }

      const remainingBytes = maxCapturedOutputBytes - Buffer.byteLength(current);
      const next = Buffer.from(chunk).subarray(0, remainingBytes).toString();
      if (Buffer.byteLength(chunk) > remainingBytes) {
        outputExceeded = true;
        child.kill('SIGKILL');
      }
      return current + next;
    };

    child.stdout?.on('data', (chunk) => {
      capturedOutput = appendOutput(capturedOutput, chunk);
    });

    child.stderr.on('data', (chunk) => {
      if (capture === 'stderr') {
        capturedOutput = appendOutput(capturedOutput, chunk);
      } else {
        diagnosticStderr = appendOutput(diagnosticStderr, chunk);
      }
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.once('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      if (timedOut) {
        reject(new Error(`${command} exceeded the ${Math.round(timeoutMs / 1_000)} second processing limit.`));
        return;
      }
      if (outputExceeded) {
        reject(new Error(`${command} produced too much diagnostic output.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(diagnosticStderr.trim() || capturedOutput.trim() || `${command} exited with code ${code ?? 'unknown'}.`));
        return;
      }

      resolve(capturedOutput);
    });
  });
}

export async function runMediaCommand(command: string, args: string[]) {
  await runMediaProcess(command, args, 'none');
}

export function runMediaCommandForStdout(command: string, args: string[]) {
  return runMediaProcess(command, args, 'stdout');
}

export function runMediaCommandForStderr(command: string, args: string[]) {
  return runMediaProcess(command, args, 'stderr');
}
