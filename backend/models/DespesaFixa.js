import mongoose from "mongoose";

export const CATEGORIAS_DESPESA = [
  "aluguel",
  "internet",
  "energia",
  "agua",
  "telefone",
  "salario",
  "software",
  "marketing",
  "material",
  "manutencao",
  "impostos",
  "outro"
];

// Despesa que se repete todo mês (aluguel, internet, energia...).
const DespesaFixaSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  valor: { type: Number, required: true, min: 0 },
  categoria: { type: String, enum: CATEGORIAS_DESPESA, default: "outro" },

  diaVencimento: { type: Number, min: 1, max: 31, default: 5 },
  formaPagamento: { type: String, default: "pix" }, // pix | boleto | debito | dinheiro

  // Vigência: a despesa entra na previsão dos meses dentro desse intervalo.
  inicioEm: { type: String, required: true }, // "2026-11"
  fimEm: { type: String, default: null },      // null = sem fim

  ativo: { type: Boolean, default: true },
  observacoes: { type: String, default: "" },
  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("DespesaFixa", DespesaFixaSchema);
