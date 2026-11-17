// Criptografa o arquivo de backup com AES-256-GCM.
// Usado no CI porque o repositório é público: artifact sem criptografia
// seria baixável por qualquer pessoa.
//
// Uso:
//   BACKUP_PASS="senha" node scripts/encrypt.mjs backup.tgz backup.tgz.enc

import fs from "node:fs/promises";
import crypto from "node:crypto";

const [entrada, saida] = process.argv.slice(2);
const senha = process.env.BACKUP_PASS;

if (!entrada || !saida) {
  console.error("uso: BACKUP_PASS=... node scripts/encrypt.mjs <entrada> <saida>");
  process.exit(1);
}
if (!senha) {
  console.error("❌ Defina BACKUP_PASS");
  process.exit(1);
}

const MAGIC = Buffer.from("MABK1");
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const chave = crypto.scryptSync(senha, salt, 32);

const cipher = crypto.createCipheriv("aes-256-gcm", chave, iv);
const dados = await fs.readFile(entrada);
const cifrado = Buffer.concat([cipher.update(dados), cipher.final()]);
const tag = cipher.getAuthTag();

// Layout: MAGIC | salt(16) | iv(12) | tag(16) | ciphertext
await fs.writeFile(saida, Buffer.concat([MAGIC, salt, iv, tag, cifrado]));
console.log(`✅ Criptografado: ${saida} (${(await fs.stat(saida)).size} bytes)`);
