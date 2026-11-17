import mongoose from "mongoose";

// Produto usado nos atendimentos (insumo).
// O custo por unidade é calculado: preço da embalagem ÷ quantidade da embalagem.
const ProdutoSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  marca: { type: String, default: "", trim: true },

  // ml = mililitro, g = grama, un = unidade (pinça, luva, etc.)
  unidade: { type: String, enum: ["ml", "g", "un"], default: "ml" },

  quantidadeEmbalagem: { type: Number, required: true, min: 0.01 },
  precoEmbalagem: { type: Number, required: true, min: 0 },

  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now }
});

ProdutoSchema.virtual("custoUnitario").get(function () {
  if (!this.quantidadeEmbalagem) return 0;
  return this.precoEmbalagem / this.quantidadeEmbalagem;
});

ProdutoSchema.set("toJSON", { virtuals: true });
ProdutoSchema.set("toObject", { virtuals: true });

export default mongoose.model("Produto", ProdutoSchema);
