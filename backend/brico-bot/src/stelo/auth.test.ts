import assert from "node:assert/strict";
import {createServer, type Server} from "node:http";
import type {AddressInfo} from "node:net";
import {afterEach, describe, it} from "node:test";

import type {SteloConfig} from "../config.ts";
import type {Logger} from "../log.ts";
import type {TokenStore} from "../spacetime/token-store.ts";
import {createSteloAuth, ID_TOKEN_KEY, isAuthRejection, REFRESH_TOKEN_KEY} from "./auth.ts";

const quiet: Logger = {debug() {}, info() {}, warn() {}, error() {}, child: () => quiet};
const CLIENT_ID = "client_test";

function jwt(claims: Record<string, unknown>): string {
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${part({alg: "none", typ: "JWT"})}.${part(claims)}.`;
}

function memoryTokens(initial: Record<string, string> = {}): TokenStore & {values: Map<string, string>} {
    const values = new Map(Object.entries(initial));
    return {values, read: key => values.get(key), write: (key, token) => void values.set(key, token)};
}

/** A minimal OIDC provider: discovery plus a refresh-grant token endpoint that rotates the refresh token. */
async function fakeProvider(options: {fail?: () => boolean} = {}) {
    let issued = 0;
    const grants: string[] = [];
    const server: Server = createServer((req, res) => {
        const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        if (req.url === "/.well-known/openid-configuration") {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({issuer: origin, token_endpoint: `${origin}/token`, jwks_uri: `${origin}/jwks`}));
            return;
        }
        let body = "";
        req.on("data", chunk => (body += chunk));
        req.on("end", () => {
            const form = new URLSearchParams(body);
            grants.push(`${form.get("grant_type")}:${form.get("refresh_token")}`);
            res.setHeader("content-type", "application/json");
            if (options.fail?.()) {
                res.statusCode = 400;
                res.end(JSON.stringify({error: "invalid_grant"}));
                return;
            }
            issued += 1;
            const now = Math.floor(Date.now() / 1000);
            res.end(JSON.stringify({
                token_type: "Bearer",
                access_token: `access-${issued}`,
                refresh_token: `refresh-${issued}`,
                id_token: jwt({iss: origin, sub: "bot", aud: CLIENT_ID, iat: now, exp: now + 86_400}),
            }));
        });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    return {server, grants, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`};
}

function config(authority: string, webhook: string | null, refreshIntervalMs = 3_600_000): SteloConfig {
    return {
        target: {label: "stelo", uri: "http://x", database: "stelofinance"},
        auth: {mode: "refresh", authority, clientId: CLIENT_ID, refreshIntervalMs},
        authAlertWebhook: webhook,
        currencies: {},
        refPrefix: "bx",
        payoutIntervalMs: 1,
        minPayout: 1,
        retryBaseMs: 1,
        retryMaxMs: 1,
    };
}

const servers: Server[] = [];
afterEach(() => {
    for (const server of servers.splice(0)) server.close();
});

describe("isAuthRejection", () => {
    it("separates a rejected token from an outage", () => {
        assert.equal(isAuthRejection(new Error("Failed to verify token: Unauthorized")), true);
        assert.equal(isAuthRejection(new Error("Failed to verify token: Bad Gateway")), false);
        assert.equal(isAuthRejection(new Error("Received network error or non-101 status code.")), false);
        assert.equal(isAuthRejection(new TypeError("fetch failed")), false);
    });
});

describe("refresh mode", () => {
    it("renews on start when the id token is due, storing both new tokens", async () => {
        const provider = await fakeProvider();
        servers.push(provider.server);
        const old = Math.floor(Date.now() / 1000) - 7200;
        const tokens = memoryTokens({
            [ID_TOKEN_KEY]: jwt({iss: provider.origin, sub: "bot", aud: CLIENT_ID, iat: old, exp: old + 86_400}),
            [REFRESH_TOKEN_KEY]: "refresh-0",
        });
        const auth = createSteloAuth({config: config(provider.origin, null), tokens, log: quiet});
        auth.start();
        for (let i = 0; i < 100 && tokens.values.get(REFRESH_TOKEN_KEY) === "refresh-0"; i++) await new Promise(r => setTimeout(r, 20));
        auth.stop();
        assert.deepEqual(provider.grants, ["refresh_token:refresh-0"]);
        assert.equal(tokens.values.get(REFRESH_TOKEN_KEY), "refresh-1");
        assert.notEqual(tokens.values.get(ID_TOKEN_KEY), undefined);
        assert.equal(auth.tokens.read("ignored"), tokens.values.get(ID_TOKEN_KEY), "the dial token is the renewed id token");
    });

    it("alerts once when renewal fails, and says so when it recovers", async () => {
        let failing = true;
        const provider = await fakeProvider({fail: () => failing});
        servers.push(provider.server);
        const old = Math.floor(Date.now() / 1000) - 7200;
        const tokens = memoryTokens({
            [ID_TOKEN_KEY]: jwt({iss: provider.origin, sub: "bot", aud: CLIENT_ID, iat: old, exp: old + 86_400}),
            [REFRESH_TOKEN_KEY]: "refresh-0",
        });
        const messages: string[] = [];
        const fetchStub = (async (_url: unknown, init: {body: string}) => {
            messages.push(JSON.parse(init.body).content);
            return new Response(null, {status: 204});
        }) as unknown as typeof fetch;
        const auth = createSteloAuth({config: config(provider.origin, "http://hook"), tokens, log: quiet, fetch: fetchStub});
        auth.start();
        for (let i = 0; i < 100 && messages.length === 0; i++) await new Promise(r => setTimeout(r, 20));
        assert.equal(messages.length, 1);
        assert.match(messages[0], /cannot authenticate to Stelo: token renewal failed/);

        auth.noteConnectError(new Error("Failed to verify token: Unauthorized"));
        auth.noteConnectError(new Error("Failed to verify token: Unauthorized"));
        assert.equal(messages.length, 1, "one alert per failure episode");

        failing = false;
        auth.noteConnected();
        auth.stop();
        await new Promise(r => setTimeout(r, 20));
        assert.equal(messages.length, 2);
        assert.match(messages[1], /authenticated to Stelo again/);
    });

    it("creates the empty token files on start so a human can fill them in", () => {
        const tokens = memoryTokens();
        const auth = createSteloAuth({config: config("http://127.0.0.1:1", null), tokens, log: quiet});
        auth.start();
        auth.stop();
        assert.deepEqual([...tokens.values.entries()], [[ID_TOKEN_KEY, ""], [REFRESH_TOKEN_KEY, ""]]);
    });

    it("refuses to dial anonymously without an id token", () => {
        const auth = createSteloAuth({config: config("http://127.0.0.1:1", null), tokens: memoryTokens(), log: quiet});
        assert.throws(() => auth.tokens.read("x"), /missing/);
    });
});

describe("permanent mode", () => {
    it("passes the stored token store through and alerts on a rejected token", async () => {
        const messages: string[] = [];
        const fetchStub = (async (_url: unknown, init: {body: string}) => {
            messages.push(JSON.parse(init.body).content);
            return new Response(null, {status: 204});
        }) as unknown as typeof fetch;
        const tokens = memoryTokens();
        const auth = createSteloAuth({
            config: {...config("x", "http://hook"), auth: {mode: "permanent"}},
            tokens,
            log: quiet,
            fetch: fetchStub,
        });
        assert.equal(auth.tokens, tokens);
        auth.noteConnectError(new Error("Failed to verify token: Bad Gateway"));
        assert.equal(messages.length, 0, "an outage is not an auth failure");
        auth.noteConnectError(new Error("Failed to verify token: Unauthorized"));
        assert.equal(messages.length, 1);
    });
});
