import { spawn } from 'child_process';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

console.log('ffprobe path:', ffprobeInstaller.path);

const proc = spawn(ffprobeInstaller.path, ['-version'], { shell: true });

proc.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString().split('\n')[0]);
});

proc.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

proc.on('close', (code) => {
  console.log('Process exited with code:', code);
});
