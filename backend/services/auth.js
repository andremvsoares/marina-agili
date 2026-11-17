// Hash de senha com scrypt (nativo do Node — sem dependência externa).
// Formato armazenado: scrypt$<salt hex>$<hash hex>

import crypto from "node:crypto";

const TAMANHO = 64;

export function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(senha), salt, TAMANHO).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verificarSenha(senha, armazenado) {
  if (!armazenado || typeof armazenado !== "string") return false;

  const partes = armazenado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;

  const [, salt, hashEsperado] = partes;

  let calculado;
  try {
    calculado = crypto.scryptSync(String(senha), salt, TAMANHO).toString("hex");
  } catch {
    return false;
  }

  const a = Buffer.from(calculado);
  const b = Buffer.from(hashEsperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Comparação em tempo constante para o login de emergência (variáveis de ambiente).
export function iguaisSeguro(a = "", b = "") {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
