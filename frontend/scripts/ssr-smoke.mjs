// Smoke test for the crawler SSR path: serves the built `dist/` in the Workers runtime
// (`wrangler pages dev`), fetches pages as a bot, and fails on bad responses or server-log errors.
// Run after `npm run build`.
import {spawn, spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";

const PORT = Number(process.env.SSR_SMOKE_PORT ?? 8788);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const HUMAN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const STARTUP_TIMEOUT_MS = 120_000;
// Any of these in the worker's output after startup means a render or data load went wrong.
const LOG_ERROR_PATTERN = /\[ERROR]|\[spacetime]|EvalError|Uncaught|ReferenceError|TypeError|is not defined|Error:/;

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(path.dirname(createRequire(import.meta.url).resolve("wrangler/package.json")), "bin", "wrangler.js");

const failures = [];
const fail = (message) => failures.push(message);

const logLines = [];
const wrangler = spawn(
    process.execPath,
    [wranglerBin, "pages", "dev", "dist", "--port", String(PORT), "--ip", "127.0.0.1", "--compatibility-flag", "nodejs_compat"],
    {
        cwd: frontendDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: {...process.env, NO_COLOR: "1", WRANGLER_SEND_METRICS: "false"},
        // Own process group on POSIX so the whole tree (wrangler + workerd) can be killed together.
        detached: process.platform !== "win32",
    },
);
for (const stream of [wrangler.stdout, wrangler.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => logLines.push(...chunk.split(/\r?\n/).filter(Boolean)));
}

function stopWrangler() {
    if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(wrangler.pid), "/T", "/F"], {stdio: "ignore"});
    } else {
        // Killing only wrangler orphans workerd, which keeps our stdio pipes (and this process) alive.
        try {
            process.kill(-wrangler.pid, "SIGKILL");
        } catch {
            // already exited
        }
    }
}

async function waitForServer() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (wrangler.exitCode !== null) throw new Error(`wrangler exited early (code ${wrangler.exitCode}):\n${logLines.join("\n")}`);
        try {
            await fetch(`${ORIGIN}/robots.txt`);
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    throw new Error(`wrangler did not start within ${STARTUP_TIMEOUT_MS / 1000}s:\n${logLines.join("\n")}`);
}

const get = (pathname, ua) => fetch(new URL(pathname, ORIGIN), {headers: {"user-agent": ua}, redirect: "manual"});

/** The index plus the first sitemap URL of each distinct section, so every route family renders once. */
async function pagesToCheck() {
    const sitemap = await (await get("/sitemap.xml", BOT_UA)).text();
    const firstPerSection = new Map();
    for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        const {pathname} = new URL(loc);
        const section = pathname.split("/").slice(0, 3).join("/");
        if (!firstPerSection.has(section)) firstPerSection.set(section, pathname);
    }
    if (firstPerSection.size < 5) fail(`sitemap.xml listed only ${firstPerSection.size} sections`);
    return ["/", ...firstPerSection.values()];
}

async function checkBotPage(pathname) {
    const res = await get(pathname, BOT_UA);
    const html = await res.text();
    const problems = [];
    if (res.status !== 200) problems.push(`status ${res.status}`);
    if (!/<title[^>]*>[^<]+<\/title>/.test(html)) problems.push("no <title>");
    if (!/<h1[\s>]/.test(html)) problems.push("no <h1> (route content missing)");
    if (/Internal Server Error|Unhandled Exception/i.test(html)) problems.push("error page body");
    if (problems.length) fail(`bot ${pathname}: ${problems.join(", ")}`);
}

async function checkHumanShell() {
    const res = await get("/", HUMAN_UA);
    const html = await res.text();
    if (res.status !== 200) fail(`human /: status ${res.status}`);
    if (/<h1[\s>]/.test(html)) fail("human /: server rendered page content (expected an empty shell)");
}

try {
    await waitForServer();
    const startupLogLength = logLines.length;
    const pages = await pagesToCheck();
    console.log(`Checking ${pages.length} pages as a bot…`);
    for (const pathname of pages) await checkBotPage(pathname);
    await checkHumanShell();
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const line of logLines.slice(startupLogLength)) {
        if (LOG_ERROR_PATTERN.test(line)) fail(`server log: ${line}`);
    }
} catch (error) {
    fail(String(error?.stack ?? error));
} finally {
    stopWrangler();
}

if (failures.length) {
    console.error(`\nSSR smoke test failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    console.error(`\n--- wrangler output ---\n${logLines.join("\n")}`);
    process.exit(1);
}
console.log("SSR smoke test passed.");
process.exit(0);
