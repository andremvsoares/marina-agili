import mongoose from "mongoose";
import { CATEGORIAS_DESPESA } from "./DespesaFixa.js";

// Despesa avulsa: pagamento único fora do cartão (pix, dinheiro, boleto).
const DespesaAvulsaSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  valor: { type: Number, required: true, min: 0 },
  categoria: { type: String, enum: CATEGORIAS_DESPESA, default: "outro" },

  data: { type: String, required: true }, // "2026-11-17"
  formaPagamento: { type: String, default: "pix" }, // pix | boleto | debito | dinheiro

  observacoes: { type: String, default: "" },
  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("DespesaAvulsa", DespesaAvulsaSchema);
