import mongoose from "mongoose";

// Bloqueio de agenda: dia inteiro (hora = null) ou um horário específico.
// Usado para folga, almoço, dentista, férias, feriado.
const BloqueioSchema = new mongoose.Schema({
  data: { type: String, required: true }, // "2026-11-20"
  hora: { type: String, default: null },  // null = dia inteiro
  motivo: { type: String, default: "" },
  criadoPor: { type: String, default: "" },
  criadoEm: { type: Date, default: Date.now }
});

BloqueioSchema.index({ data: 1, hora: 1 });

export default mongoose.model("Bloqueio", BloqueioSchema);
