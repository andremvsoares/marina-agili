// Gestão de usuários do painel (somente a dona).

import express from "express";
import Usuario from "../models/Usuario.js";
import { autenticar, exigirDono } from "./admin.js";
import { hashSenha } from "../services/auth.js";

const router = express.Router();

router.use(autenticar, exigirDono);

const normalizar = (valor) => String(valor || "").trim().toLowerCase();

router.get("/", async (req, res) => {
  try {
    const usuarios = await Usuario.find()
      .select("nome usuario papel ativo criadoEm ultimoAcessoEm")
      .sort({ criadoEm: 1 });
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nome, usuario, senha, papel } = req.body;

    if (!nome || !usuario || !senha) {
      return res.status(400).json({ erro: "Nome, usuário e senha são obrigatórios" });
    }
    if (String(senha).length < 6) {
      return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres" });
    }
    if (!["dono", "equipe"].includes(papel || "equipe")) {
      return res.status(400).json({ erro: "Papel inválido" });
    }

    const login = normalizar(usuario);
    if (!/^[a-z0-9._-]{3,30}$/.test(login)) {
      return res.status(400).json({
        erro: "Usuário deve ter 3 a 30 caracteres: letras, números, ponto, hífen ou _"
      });
    }

    const existe = await Usuario.findOne({ usuario: login });
    if (existe) {
      return res.status(409).json({ erro: "Já existe um usuário com esse login" });
    }

    const criado = await Usuario.create({
      nome: String(nome).trim(),
      usuario: login,
      senhaHash: hashSenha(senha),
      papel: papel || "equipe"
    });

    res.status(201).json({
      _id: criado._id,
      nome: criado.nome,
      usuario: criado.usuario,
      papel: criado.papel,
      ativo: criado.ativo
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado" });

    const { nome, senha, papel, ativo } = req.body;

    if (nome) usuario.nome = String(nome).trim();
    if (papel) {
      if (!["dono", "equipe"].includes(papel)) {
        return res.status(400).json({ erro: "Papel inválido" });
      }
      usuario.papel = papel;
    }
    if (typeof ativo === "boolean") usuario.ativo = ativo;
    if (senha) {
      if (String(senha).length < 6) {
        return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres" });
      }
      usuario.senhaHash = hashSenha(senha);
    }

    await usuario.save();

    res.json({
      _id: usuario._id,
      nome: usuario.nome,
      usuario: usuario.usuario,
      papel: usuario.papel,
      ativo: usuario.ativo
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
