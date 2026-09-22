import mongoose from "mongoose";

const ClienteSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  whatsapp: { type: String, required: true, trim: true },
  observacoes: { type: String, default: "" },
  criadoEm: { type: Date, default: Date.now }
});

export default mongoose.model("Cliente", ClienteSchema);