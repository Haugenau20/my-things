import { spawn } from 'node:child_process';

export function runNode(script, args = [], env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: 'inherit',
      env,
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code ?? 'interrupted'})`));
    });
  });
}
