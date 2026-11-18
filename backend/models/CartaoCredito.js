import mongoose from "mongoose";

// Cartão de crédito da clínica.
const CartaoCreditoSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true }, // "Nubank", "Itaú Click"
  bandeira: { type: String, default: "" },            // visa | master | elo | outro
  ultimosDigitos: { type: String, default: "" },

  // Dia em que a fatura fecha — define em qual mês cada compra entra.
  diaFechamento: { type: Number, min: 1, max: 31, default: 5 },
  diaVencimento: { type: Number, min: 1, max: 31, default: 12 },

  limite: { type: Number, default: 0 },
  cor: { type: String, default: "#7C9EB2" },

  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("CartaoCredito", CartaoCreditoSchema);
