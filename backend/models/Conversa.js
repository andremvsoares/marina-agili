import mongoose from "mongoose";

const ConversaSchema = new mongoose.Schema({
  telefone: { type: String, required: true, unique: true },
  // inicio | servico | data | hora | nome | confirmar | concluido
  estado: { type: String, default: "inicio" },
  dados: { type: Object, default: {} },
  // Quando a Marina responde manualmente, o bot fica quieto até este horário.
  pausadaAte: { type: Date, default: null },
  atualizadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("Conversa", ConversaSchema);
