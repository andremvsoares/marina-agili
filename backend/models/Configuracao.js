import mongoose from "mongoose";

// Horários de atendimento por dia da semana (0 = domingo ... 6 = sábado).
// Lista vazia = fechado naquele dia.
export const HORARIOS_PADRAO = {
  0: [],
  1: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  2: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  3: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  4: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  5: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
  6: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"]
};

const ConfiguracaoSchema = new mongoose.Schema({
  nomeNegocio: { type: String, default: "Marina Agili Clinic Beauty" },

  horariosPorDia: {
    type: Object,
    default: () => ({ ...HORARIOS_PADRAO })
  },

  // Não aceitar agendamento faltando menos que isso para o horário.
  antecedenciaMinimaMinutos: { type: Number, default: 60 },

  // Janela máxima de agendamento pelo site/bot (dias).
  antecedenciaMaximaDias: { type: Number, default: 90 },

  atualizadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("Configuracao", ConfiguracaoSchema);
