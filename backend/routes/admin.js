import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

// ============ LOGIN ============
router.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: "Usuário e senha obrigatórios" });
  }

  if (usuario !== process.env.ADMIN_USER || senha !== process.env.ADMIN_PASS) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos" });
  }

  const token = jwt.sign({ usuario }, process.env.JWT_SECRET, {
    expiresIn: "7d"
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