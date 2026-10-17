// Regenerates ./stelo from the live stelofinance-prod schema (third-party module, no local source).
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HOST = process.env.STELO_HOST ?? 'maincloud.spacetimedb.com';
const DATABASE = process.env.STELO_DATABASE ?? 'stelofinance-prod';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'stelo');

const res = await fetch(`https://${HOST}/v1/database/${DATABASE}/schema?version=10`);
if (!res.ok) throw new Error(`schema fetch failed: ${res.status} ${res.statusText}`);
const schema = await res.json();

const scratch = mkdtempSync(join(tmpdir(), 'stelo-bindings-'));
try {
  const moduleDef = join(scratch, 'schema.v10.json');
  writeFileSync(moduleDef, JSON.stringify({ V10: schema }));
  // `generate --module-def` only runs once a buildable-module check passes; an empty spacetimedb/ dir satisfies it.
  const cwd = join(scratch, 'cwd');
  mkdirSync(join(cwd, 'spacetimedb'), { recursive: true });

  rmSync(outDir, { recursive: true, force: true });
  const r = spawnSync(
    process.platform === 'win32' ? 'spacetime.exe' : 'spacetime',
    ['generate', '-y', '--module-def', moduleDef, '--lang', 'typescript', '--out-dir', outDir],
    { cwd, stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error(`spacetime generate exited with ${r.status ?? r.error}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
