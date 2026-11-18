import mongoose from "mongoose";
import { CATEGORIAS_DESPESA } from "./DespesaFixa.js";

// Compra no cartão, possivelmente parcelada.
// Cada parcela entra na previsão do mês correspondente.
const CompraCartaoSchema = new mongoose.Schema({
  cartaoId: { type: mongoose.Schema.Types.ObjectId, ref: "CartaoCredito", required: true },

  descricao: { type: String, required: true, trim: true },
  categoria: { type: String, enum: CATEGORIAS_DESPESA, default: "outro" },

  valorTotal: { type: Number, required: true, min: 0.01 },
  parcelas: { type: Number, required: true, min: 1, max: 48, default: 1 },

  dataCompra: { type: String, required: true }, // "2026-11-17"

  // Mês da primeira parcela (calculado pelo fechamento do cartão).
  primeiroMes: { type: String, required: true }, // "2026-12"

  observacoes: { type: String, default: "" },
  criadoEm: { type: Date, default: Date.now }
});

CompraCartaoSchema.index({ cartaoId: 1, primeiroMes: 1 });

CompraCartaoSchema.virtual("valorParcela").get(function () {
  return Math.round((this.valorTotal / this.parcelas) * 100) / 100;
});

CompraCartaoSchema.set("toJSON", { virtuals: true });
CompraCartaoSchema.set("toObject", { virtuals: true });

export default mongoose.model("CompraCartao", CompraCartaoSchema);
