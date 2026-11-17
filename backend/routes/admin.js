import express from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";

const router = express.Router();

// ============ PROTEÇÃO CONTRA FORÇA BRUTA ============
// 5 tentativas por IP a cada 15 minutos. Sem isso, o login era um alvo livre.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas de login. Tente novamente em 15 minutos." }
});

// Comparação em tempo constante: evita descobrir a senha medindo o tempo de resposta.
function iguaisSeguro(a = "", b = "") {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Compara contra si mesmo para gastar o mesmo tempo.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// ============ LOGIN ============
router.post("/login", limiteLogin, (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: "Usuário e senha obrigatórios" });
  }

  const usuarioOk = iguaisSeguro(usuario, process.env.ADMIN_USER);
  const senhaOk = iguaisSeguro(senha, process.env.ADMIN_PASS);

  if (!usuarioOk || !senhaOk) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos" });
  }

  const token = jwt.sign({ usuario }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });

  res.json({ token, usuario });
});

// ============ MIDDLEWARE DE AUTENTICAÇÃO ============
export function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token não enviado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded.usuario;
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }
}

export default router;
