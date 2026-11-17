// Rotas da ficha da cliente (painel administrativo).

import express from "express";
import { autenticar } from "./admin.js";
import {
  buscarFicha,
  listarClientesComSinal,
  definirSinal
} from "../services/clientes.js";

const router = express.Router();

// Lista de clientes com sinal obrigatório — usada para marcar os cartões no painel.
router.get("/sinal", autenticar, async (req, res) => {
  try {
    res.json(await listarClientesComSinal());
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Ficha completa de uma cliente.
router.get("/:whatsapp", autenticar, async (req, res) => {
  try {
    const cliente = await buscarFicha(req.params.whatsapp);
    if (!cliente) return res.status(404).json({ erro: "Cliente não encontrada" });
    res.json(cliente);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Correção manual do sinal (erro de marcação, segunda chance...).
router.patch("/:whatsapp/sinal", autenticar, async (req, res) => {
  try {
    const { obrigatorio } = req.body;
    if (typeof obrigatorio !== "boolean") {
      return res.status(400).json({ erro: "Informe obrigatorio: true ou false" });
    }
    const resultado = await definirSinal(req.params.whatsapp, obrigatorio);
    if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });
    res.json(resultado.cliente);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
