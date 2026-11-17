import mongoose from "mongoose";

const UsuarioSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  // Identificador de login (sem acento, minúsculo).
  usuario: { type: String, required: true, trim: true, lowercase: true, unique: true },
  senhaHash: { type: String, required: true },

  // dono  = acesso total (gestão do negócio)
  // equipe = vê a agenda e marca presença/falta, nada além disso
  papel: { type: String, enum: ["dono", "equipe"], default: "equipe" },

  ativo: { type: Boolean, default: true },
  criadoEm: { type: Date, default: Date.now },
  ultimoAcessoEm: { type: Date, default: null }
});

export default mongoose.model("Usuario", UsuarioSchema);
