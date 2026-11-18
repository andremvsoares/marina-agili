import mongoose from "mongoose";

// Venda de produto para uma cliente.
// Entra no total gasto dela, junto com os atendimentos.
const VendaSchema = new mongoose.Schema({
  clienteWhatsapp: { type: String, required: true, trim: true },
  clienteNome: { type: String, required: true, trim: true },

  itens: [
    {
      produtoId: { type: mongoose.Schema.Types.ObjectId, ref: "ProdutoVenda", required: true },
      nome: { type: String, required: true },
      quantidade: { type: Number, required: true, min: 0.01 },
      precoUnitario: { type: Number, required: true, min: 0 }
    }
  ],

  total: { type: Number, required: true, min: 0 },
  data: { type: String, required: true }, // "2026-11-17"

  observacoes: { type: String, default: "" },
  criadoPor: { type: String, default: "" },
  criadoEm: { type: Date, default: Date.now }
});

VendaSchema.index({ clienteWhatsapp: 1, data: -1 });

export default mongoose.model("Venda", VendaSchema);
