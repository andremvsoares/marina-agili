// Descriptografa um backup gerado por scripts/encrypt.mjs.
//
// Uso:
//   BACKUP_PASS="senha" node scripts/decrypt.mjs backup.tgz.enc backup.tgz

import fs from "node:fs/promises";
import crypto from "node:crypto";

const [entrada, saida] = process.argv.slice(2);
const senha = process.env.BACKUP_PASS;

if (!entrada || !saida) {
  console.error("uso: BACKUP_PASS=... node scripts/decrypt.mjs <entrada> <saida>");
  process.exit(1);
}
if (!senha) {
  console.error("❌ Defina BACKUP_PASS");
  process.exit(1);
}

const MAGIC = Buffer.from("MABK1");
const buffer = await fs.readFile(entrada);

if (!buffer.subarray(0, 5).equals(MAGIC)) {
  console.error("❌ Arquivo não é um backup criptografado deste projeto");
  process.exit(1);
}

const salt = buffer.subarray(5, 21);
const iv = buffer.subarray(21, 33);
const tag = buffer.subarray(33, 49);
const cifrado = buffer.subarray(49);

const chave = crypto.scryptSync(senha, salt, 32);
const decipher = crypto.createDecipheriv("aes-256-gcm", chave, iv);
decipher.setAuthTag(tag);

try {
  const dados = Buffer.concat([decipher.update(cifrado), decipher.final()]);
  await fs.writeFile(saida, dados);
  console.log(`✅ Descriptografado: ${saida} (${dados.length} bytes)`);
} catch {
  console.error("❌ Senha incorreta ou arquivo corrompido");
  process.exit(1);
}
