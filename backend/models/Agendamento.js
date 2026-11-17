import mongoose from "mongoose";

const AgendamentoSchema = new mongoose.Schema({
  clienteNome: { type: String, required: true, trim: true },
  clienteWhatsapp: { type: String, required: true, trim: true },
  servicoId: { type: mongoose.Schema.Types.ObjectId, ref: "Servico", required: true },
  servicoNome: { type: String, required: true }, // cópia pra não perder histórico
  servicoPreco: { type: Number, required: true },
  data: { type: String, required: true },        // "2026-02-15"
  hora: { type: String, required: true },        // "10:00"

  // Chave única do horário ("2026-02-15T10:00").
  // Existe só para horários ativos: é removida (unset) quando o agendamento
  // é cancelado. O índice unique+sparse abaixo é o que impede o app e o bot
  // de reservarem o mesmo horário no mesmo instante.
  slot: { type: String, unique: true, sparse: true },

  status: {
    type: String,
    enum: ["confirmado", "cancelado", "concluido"],
    default: "confirmado"
  },
  observacoes: { type: String, default: "" },
  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("Agendamento", AgendamentoSchema);
