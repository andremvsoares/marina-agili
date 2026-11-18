import mongoose from "mongoose";

// Movimento de crédito da cliente.
// valor positivo = crédito a favor dela; negativo = uso do crédito.
const MovimentoCreditoSchema = new mongoose.Schema({
  clienteWhatsapp: { type: String, required: true, trim: true },

  valor: { type: Number, required: true }, // positivo credita, negativo debita
  tipo: { type: String, enum: ["credito", "uso", "ajuste"], default: "credito" },

  motivo: { type: String, default: "" },
  data: { type: String, required: true }, // "2026-11-17"

  agendamentoId: { type: mongoose.Schema.Types.ObjectId, ref: "Agendamento", default: null },

  criadoEm: { type: Date, default: Date.now }
});

MovimentoCreditoSchema.index({ clienteWhatsapp: 1, criadoEm: -1 });

export default mongoose.model("MovimentoCredito", MovimentoCreditoSchema);
