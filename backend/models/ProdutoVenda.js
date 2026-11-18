import mongoose from "mongoose";

// Produto de VENDA (revenda para a cliente) — diferente de insumo.
// Insumo entra no custo do serviço; este entra na receita e no histórico da cliente.
const ProdutoVendaSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  marca: { type: String, default: "", trim: true },

  preco: { type: Number, required: true, min: 0 },   // preço de venda
  custo: { type: Number, default: 0, min: 0 },        // quanto a Marina pagou

  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("ProdutoVenda", ProdutoVendaSchema);
