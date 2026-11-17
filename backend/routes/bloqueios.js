// Bloqueios de agenda (folga, almoço, férias, feriado).

import express from "express";
import { autenticar, exigirDono } from "./admin.js";
import {
  criarBloqueio,
  removerBloqueio,
  listarBloqueios
} from "../services/agenda.js";

const router = express.Router();

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

router.get("/", autenticar, async (req, res) => {
  try {
    res.json(await listarBloqueios({ de: req.query.de, ate: req.query.ate }));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/", autenticar, exigirDono, async (req, res) => {
  try {
    const { data, hora, motivo } = req.body;

    if (!data || !RE_DATA.test(data)) {
      return res.status(400).json({ erro: "Data inválida" });
    }
    if (hora && !RE_HORA.test(hora)) {
      return res.status(400).json({ erro: "Hora inválida" });
    }

    const bloqueio = await criarBloqueio({
      data,
      hora: hora || null,
      motivo,
      criadoPor: req.usuario?.nome
    });

    res.status(201).json(bloqueio);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete("/:id", autenticar, exigirDono, async (req, res) => {
  try {
    const removido = await removerBloqueio(req.params.id);
    if (!removido) return res.status(404).json({ erro: "Bloqueio não encontrado" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
