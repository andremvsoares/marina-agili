import mongoose from "mongoose";

// Registro de diagnóstico: toda requisição que chega no webhook fica guardada
// por 24h (índice TTL), mesmo que não seja possível processar.
const WebhookEventoSchema = new mongoose.Schema({
  recebidoEm: { type: Date, default: Date.now },
  tipo: { type: String, default: "" },   // campo do webhook (messages, statuses...)
  resumo: { type: String, default: "" },
  corpo: { type: Object }
});

WebhookEventoSchema.index({ recebidoEm: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model("WebhookEvento", WebhookEventoSchema);
