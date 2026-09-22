import mongoose from "mongoose";

const ServicoSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  preco: { type: Number, required: true, min: 0 },
  duracao: { type: Number, default: 60 }, // em minutos
  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("Servico", ServicoSchema);