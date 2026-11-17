// Restaura um backup gerado por scripts/backup.mjs.
//
// Uso:
//   MONGODB_URI="mongodb+srv://..." node scripts/restore.mjs out
//
// Por padrão faz upsert pelo _id — não apaga nada existente.
// Para recriar do zero: LIMPAR=1 (APAGA as coleções antes).

import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";
import { EJSON } from "bson";

const URI = process.env.MONGODB_URI;
const ORIGEM = process.argv[2] || "out";
const LIMPAR = process.env.LIMPAR === "1";

if (!URI) {
  console.error("❌ Defina MONGODB_URI");
  process.exit(1);
}

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 20000 });

try {
  await client.connect();
  const db = client.db();

  const arquivos = (await fs.readdir(ORIGEM)).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_")
  );

  if (LIMPAR) console.log("⚠️  LIMPAR=1: apagando coleções existentes...");

  for (const arquivo of arquivos) {
    const bruto = await fs.readFile(path.join(ORIGEM, arquivo), "utf8");
    const pacote = EJSON.parse(bruto);
    const nome = pacote.colecao || path.basename(arquivo, ".json");
    const docs = pacote.documentos || [];
    const col = db.collection(nome);

    if (LIMPAR) await col.deleteMany({});

    if (docs.length > 0) {
      await col.bulkWrite(
        docs.map((d) => ({
          replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true }
        })),
        { ordered: false }
      );
    }
    console.log(`✅ ${nome}: ${docs.length} documentos`);
  }
} catch (err) {
  console.error("❌ Falha na restauração:", err.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
