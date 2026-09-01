/**
 * pkce.ts — Authorization Code + PKCE (S256) primitives, and a bare OAuth `state` generator.
 *
 * Only BitAuth's flow uses the challenge/verifier pair (a confidential OIDC client still gets PKCE
 * per the architecture doc); Discord's OAuth handshake below only needs `generateState`.
 */
import {createHash, randomBytes} from "node:crypto";

export function generateState(): string {
    return randomBytes(16).toString("hex");
}

export function generateCodeVerifier(): string {
    // 32 random bytes base64url-encoded is within the 43-128 char range RFC 7636 requires.
    return randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
}
