import mongoose from "mongoose";

const ClienteSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  whatsapp: { type: String, required: true, trim: true, unique: true },
  observacoes: { type: String, default: "" },

  // "YYYY-MM-DD" — usado para aniversariantes e para o presente na agenda.
  dataNascimento: { type: String, default: "" },

  // ---------- histórico de comparecimento ----------
  // Usado para exigir sinal de quem já faltou sem avisar.
  noShows: { type: Number, default: 0 },
  cancelamentosTardios: { type: Number, default: 0 },
  ultimoProblemaEm: { type: Date, default: null },

  // Quando true, o próximo agendamento exige sinal de 20%.
  // Sai sozinho quando a cliente comparece a um atendimento.
  sinalObrigatorio: { type: Boolean, default: false },
  sinalDesde: { type: Date, default: null },

  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("Cliente", ClienteSchema);
