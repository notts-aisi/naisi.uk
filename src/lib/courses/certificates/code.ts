import "server-only";
import { randomBytes } from "node:crypto";
import { CODE_ALPHABET, CODE_LENGTH } from "./model";

/**
 * A new certificate code: `CODE_LENGTH` characters of `CODE_ALPHABET`, each
 * five bits from the operating system's random source. The alphabet has 32
 * symbols, so every byte's five bits map onto it with no bias. Whether a code
 * is free is the caller's question: the send asks the collection before it
 * creates a certificate with one.
 */
export function newCertificateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let at = 0; at < CODE_LENGTH; at += 1) code += CODE_ALPHABET[bytes[at] & 31];
  return code;
}
