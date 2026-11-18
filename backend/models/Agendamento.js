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
  // é cancelado. O índice unique+sparse é o que impede o app e o bot de
  // reservarem o mesmo horário no mesmo instante.
  slot: { type: String, unique: true, sparse: true },

  status: {
    type: String,
    enum: ["confirmado", "cancelado", "concluido", "nao_compareceu"],
    default: "confirmado"
  },

  // Quando o sinal de 20% passa a ser exigido para esta cliente.
  // Marcado no momento da criação; o pagamento (etapa futura) vai consumir.
  sinalPendente: { type: Boolean, default: false },

  observacoes: { type: String, default: "" },

  // Prova de opt-in (LGPD + exigência da Meta para mensagens de template).
  consentimento: { type: Boolean, default: false },
  consentimentoEm: { type: Date },

  // Histórico de mudanças de status (para a regra das 3 horas).
  canceladoEm: { type: Date, default: null },
  compareceuEm: { type: Date, default: null },
  remarcadoEm: { type: Date, default: null },

  // Como foi pago. Mais de um item = pagamento mesclado.
  pagamentos: [
    {
      forma: {
        type: String,
        enum: ["dinheiro", "pix", "debito", "credito", "credito_cliente", "outro"],
        required: true
      },
      valor: { type: Number, required: true, min: 0 }
    }
  ],
  pagoEm: { type: Date, default: null },

  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("Agendamento", AgendamentoSchema);
