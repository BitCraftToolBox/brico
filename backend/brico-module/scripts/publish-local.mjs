#!/usr/bin/env node
// `spacetime publish --server local --yes`, but with `localhost` temporarily trusted as a JWT
// issuer in auth.ts for the duration of the publish. Local dev servers issue `localhost` tokens
// for tokenless connections; a published module must never trust them, so this is reverted
// (even on failure) rather than left as a permanent default in auth.ts.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.join(scriptDir, '..');
const authPath = path.join(moduleDir, 'spacetimedb', 'src', 'lib', 'auth.ts');

const original = readFileSync(authPath, 'utf8');
const productionLine = 'const ACCEPTED_ISSUERS = [SPACETIMEAUTH_ISSUER];';
const localLine = "const ACCEPTED_ISSUERS = [SPACETIMEAUTH_ISSUER, 'localhost'];";

if (!original.includes(productionLine)) {
    throw new Error(
        `auth.ts no longer contains the expected ACCEPTED_ISSUERS line — update publish-local.mjs to match.`,
    );
}

writeFileSync(authPath, original.replace(productionLine, localLine));

let restored = false;
const restore = () => {
    if (restored) return;
    restored = true;
    writeFileSync(authPath, original);
};
process.on('exit', restore);

// Extract arguments after `--`
const doubleHyphenIndex = process.argv.indexOf('--');
const extraArgs = doubleHyphenIndex !== -1 ? process.argv.slice(doubleHyphenIndex + 1) : [];

try {
    execFileSync('spacetime', ['publish', '--server', 'local', '--yes', ...extraArgs], {
        cwd: moduleDir,
        stdio: 'inherit',
        shell: true,
    });
} finally {
    restore();
}
