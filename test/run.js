#!/usr/bin/env node
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import fs from 'node:fs';

const outputDir = path.resolve(import.meta.dirname, 'output');
fs.mkdirSync(outputDir, { recursive: true });

const now = Date.now();
const maxSafe = Number.MAX_SAFE_INTEGER;
const reverseKey = (BigInt(maxSafe) - BigInt(now))
  .toString()
  .padStart(String(maxSafe).length, '0');
const timestamp = new Date(now).toISOString().replace(/[:.]/g, '-');
const outputFile = path.resolve(outputDir, `${reverseKey}__results-${timestamp}.txt`);
const fileStream = fs.createWriteStream(outputFile);

const stream = run({
  concurrency: true,
  globPatterns: [
    path.resolve(import.meta.dirname, '**/*.mjs'),
  ],
})
  .on('test:fail', () => {
    process.exitCode = 1;
  })
  .compose(spec);

stream.pipe(process.stdout);
stream.pipe(fileStream);

stream.once('end', () => {
  if (!fileStream.closed) fileStream.end();
});
fileStream.once('finish', () => {
  process.exit(process.exitCode ?? 0);
});
