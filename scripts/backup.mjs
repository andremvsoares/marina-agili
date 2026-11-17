// Exporta o banco inteiro para JSON (formato EJSON, preserva os tipos do Mongo).
//
// Uso:
//   MONGODB_URI="mongodb+srv://..." node scripts/backup.mjs
//
// Gera um arquivo por coleção em ./out e imprime a contagem de documentos.
// Restauração: scripts/restore.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient, BSON } from "mongodb";

// Usa o EJSON do BSON que acompanha o driver.
// Instalar `bson` à parte pode trazer uma versão incompatível e quebrar a serialização.
const { EJSON } = BSON;

const URI = process.env.MONGODB_URI;
const SAIDA = process.env.SAIDA || "out";

if (!URI) {
  console.error("❌ Defina MONGODB_URI");
  process.exit(1);
}

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 20000 });

try {
  await client.connect();
  const db = client.db();

  await fs.mkdir(SAIDA, { recursive: true });

  const colecoes = await db.listCollections().toArray();
  const resumo = {};

  for (const { name } of colecoes) {
    const docs = await db.collection(name).find({}).toArray();
    // EJSON preserva ObjectId, Date, etc. JSON puro corromperia essas datas.
    const conteudo = EJSON.stringify(
      { colecao: name, banco: db.databaseName, exportadoEm: new Date(), documentos: docs },
      null,
      0
    );
    await fs.writeFile(path.join(SAIDA, `${name}.json`), conteudo, "utf8");
    resumo[name] = docs.length;
  }

  const meta = {
    banco: db.databaseName,
    exportadoEm: new Date().toISOString(),
    colecoes: resumo
  };
  await fs.writeFile(path.join(SAIDA, "_meta.json"), JSON.stringify(meta, null, 2), "utf8");

  console.log("✅ Backup concluído:", JSON.stringify(resumo));
} catch (err) {
  console.error("❌ Falha no backup:", err.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
