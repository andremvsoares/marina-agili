// Visão de agenda para o painel: vários dias de uma vez.

import express from "express";
import { autenticar } from "./admin.js";
import Agendamento from "../models/Agendamento.js";
import {
  horariosDisponiveis,
  bloqueiosDoDia,
  diaDaSemana,
  hojeSP
} from "../services/agenda.js";

const router = express.Router();

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

const somarDias = (iso, dias) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

router.get("/", autenticar, async (req, res) => {
  try {
    const inicio = RE_DATA.test(req.query.inicio || "") ? req.query.inicio : hojeSP();
    const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 31);
    const fim = somarDias(inicio, dias - 1);

    const agendamentos = await Agendamento.find({
      data: { $gte: inicio, $lte: fim }
    }).sort({ data: 1, hora: 1 });

    const porData = new Map();
    for (const ag of agendamentos) {
      if (!porData.has(ag.data)) porData.set(ag.data, []);
      porData.get(ag.data).push(ag);
    }

    const resultado = [];
    for (let i = 0; i < dias; i++) {
      const data = somarDias(inicio, i);
      const horarios = await horariosDisponiveis(data);
      const bloqueios = await bloqueiosDoDia(data);

      resultado.push({
        data,
        diaSemana: diaDaSemana(data),
        fechado: horarios.length === 0,
        bloqueadoDiaInteiro: bloqueios.some((b) => !b.hora),
        horarios,
        bloqueios,
        agendamentos: porData.get(data) || []
      });
    }

    res.json({ inicio, fim, dias: resultado });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
