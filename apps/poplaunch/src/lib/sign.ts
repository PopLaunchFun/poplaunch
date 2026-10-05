/** Draft-upload message, byte-identical to services/launchd/src/auth.ts. */
export function draftMessage(domain: string, payloadHash: string, signedAt: number): string {
  return `Pop Launch draft\nDomain: ${domain}\nPayload: ${payloadHash}\nSigned at: ${signedAt}\n\nThis signature only authorizes uploading launch metadata. It does not move funds.`;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
