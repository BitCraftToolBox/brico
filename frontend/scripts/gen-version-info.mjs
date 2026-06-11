#!/usr/bin/env node

import {execSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const bsatnPath = join(frontendRoot, "public", "bsatn");
const outputPath = join(frontendRoot, "src", "lib", "version.ts");
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

function escapeString(value) {
    return JSON.stringify(value);
}

function resolveCurrentTag() {
    try {
        const raw = execSync(`git -C "${bsatnPath}" --no-pager log --pretty=%s`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
        });

        const messages = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (messages.length === 0) return "Unknown";

        const currentMatch = messages[0].match(DATE_RE);
        if (!currentMatch) return "Unknown";

        const dateTag = currentMatch[1];
        let patchCount = 1;

        for (let i = 1; i < messages.length; i += 1) {
            const match = messages[i].match(DATE_RE);
            if (!match || match[1] !== dateTag) break;
            patchCount += 1;
        }

        return patchCount > 1 ? `${dateTag}-${patchCount}` : dateTag;
    } catch {
        return "Unknown";
    }
}

async function resolveVersionInfo() {
    const tag = resolveCurrentTag();
    const version = {tag};

    if (tag === "Unknown") return version;

    try {
        const response = await fetch("https://cereal-data.brico.app/versions.json");
        if (!response.ok) return version;

        const versions = await response.json();
        if (!Array.isArray(versions)) return version;

        const match = versions.find((entry) => entry && entry.tag === tag);
        if (!match) return version;

        if (typeof match.label === "string" && match.label.trim().length > 0) {
            version.label = match.label;
        }

        if (typeof match.description === "string" && match.description.trim().length > 0) {
            version.description = match.description;
        }
    } catch {
        // Network or parsing errors should not fail builds.
    }

    return version;
}

function writeVersionFile(version) {
    const lines = [
        "export type VersionInfo = {",
        "    tag: string;",
        "    label?: string;",
        "    description?: string;",
        "};",
        "",
        "export const CURRENT_VERSION: VersionInfo = {",
        `    tag: ${escapeString(version.tag)},`
    ];

    if (version.label) {
        lines.push(`    label: ${escapeString(version.label)},`);
    }

    if (version.description) {
        lines.push(`    description: ${escapeString(version.description)},`);
    }

    lines.push("};", "");

    writeFileSync(outputPath, lines.join("\n"), "utf8");
}

const versionInfo = await resolveVersionInfo();
writeVersionFile(versionInfo);
console.log(`Embedded data version: ${versionInfo.tag}`);
