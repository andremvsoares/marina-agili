import mongoose from "mongoose";

const ServicoSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  preco: { type: Number, required: true, min: 0 },
  duracao: { type: Number, default: 60 }, // em minutos
  ativo: { type: Boolean, default: true },

  // Ficha técnica: quanto de cada produto é usado por atendimento.
  // Base para calcular o custo real do serviço.
  insumos: [
    {
      produtoId: { type: mongoose.Schema.Types.ObjectId, ref: "Produto", required: true },
      quantidade: { type: Number, required: true, min: 0 }
    }
  ],

  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("Servico", ServicoSchema);
