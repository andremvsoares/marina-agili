import express from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import Usuario from "../models/Usuario.js";
import { verificarSenha, iguaisSeguro } from "../services/auth.js";

const router = express.Router();

// ============ PROTEÇÃO CONTRA FORÇA BRUTA ============
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas de login. Tente novamente em 15 minutos." }
});

// ============ LOGIN ============
router.post("/login", limiteLogin, async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: "Usuário e senha obrigatórios" });
  }

  try {
    // 1) Usuário cadastrado no painel
    const encontrado = await Usuario.findOne({
      usuario: String(usuario).trim().toLowerCase()
    });

    if (encontrado) {
      if (!encontrado.ativo) {
        return res.status(401).json({ erro: "Usuário ou senha inválidos" });
      }
      if (!verificarSenha(senha, encontrado.senhaHash)) {
        return res.status(401).json({ erro: "Usuário ou senha inválidos" });
      }

      encontrado.ultimoAcessoEm = new Date();
      await encontrado.save();

      const token = assinarToken({
        id: String(encontrado._id),
        nome: encontrado.nome,
        papel: encontrado.papel
      });

      return res.json({
        token,
        usuario: encontrado.usuario,
        nome: encontrado.nome,
        papel: encontrado.papel
      });
    }

    // 2) Acesso de emergência pelas variáveis de ambiente (dono).
    // Serve para o primeiro acesso e para recuperar o painel se algo der errado.
    const usuarioOk = iguaisSeguro(usuario, process.env.ADMIN_USER);
    const senhaOk = iguaisSeguro(senha, process.env.ADMIN_PASS);

    if (usuarioOk && senhaOk) {
      const token = assinarToken({ id: "env", nome: "Administrador", papel: "dono" });
      return res.json({ token, usuario: "admin", nome: "Administrador", papel: "dono" });
    }

    return res.status(401).json({ erro: "Usuário ou senha inválidos" });
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).json({ erro: "Erro ao fazer login" });
  }
});

function assinarToken(dados) {
  return jwt.sign(
    { sub: dados.id, nome: dados.nome, papel: dados.papel },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// ============ MIDDLEWARES ============

export function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token não enviado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = {
      id: decoded.sub || "env",
      nome: decoded.nome || "Administrador",
      // Tokens antigos (antes dos usuários) não têm papel: eram do dono.
      papel: decoded.papel || "dono"
    };
    next();
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }
}

// Só a dona gerencia o negócio (serviços, produtos, relatórios, usuários...).
export function exigirDono(req, res, next) {
  if (req.usuario?.papel !== "dono") {
    return res.status(403).json({ erro: "Acesso restrito à administração" });
  }
  next();
}

export default router;
