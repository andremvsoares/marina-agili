// Visão de agenda para o painel: vários dias de uma vez.

import express from "express";
import { autenticar } from "./admin.js";
import Agendamento from "../models/Agendamento.js";
import Bloqueio from "../models/Bloqueio.js";
import {
  horariosDisponiveis,
  bloqueiosDoDia,
  diaDaSemana,
  hojeSP,
  obterConfig,
  momentoSP
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

// ---------- visão de mês (calendário) ----------
router.get("/mes", autenticar, async (req, res) => {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || "")
      ? req.query.mes
      : hojeSP().slice(0, 7);

    const [ano, numeroMes] = mes.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate();

    const inicio = `${mes}-01`;
    const fim = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

    const config = await obterConfig();

    const [agendamentos, bloqueios] = await Promise.all([
      Agendamento.find({
        data: { $gte: inicio, $lte: fim },
        status: { $in: ["confirmado", "concluido"] }
      })
        .select("data hora -_id")
        .lean(),
      Bloqueio.find({ data: { $gte: inicio, $lte: fim } })
        .select("data hora -_id")
        .lean()
    ]);

    const ocupadosPorDia = new Map();
    for (const a of agendamentos) {
      if (!ocupadosPorDia.has(a.data)) ocupadosPorDia.set(a.data, new Set());
      ocupadosPorDia.get(a.data).add(a.hora);
    }

    const bloqueioDiaInteiro = new Set();
    const bloqueiosPorHora = new Map();
    for (const b of bloqueios) {
      if (!b.hora) {
        bloqueioDiaInteiro.add(b.data);
      } else {
        if (!bloqueiosPorHora.has(b.data)) bloqueiosPorHora.set(b.data, new Set());
        bloqueiosPorHora.get(b.data).add(b.hora);
      }
    }

    const limite = new Date(Date.now() + (config.antecedenciaMinimaMinutos || 0) * 60000);
    const hoje = hojeSP();

    const dias = [];
    for (let dia = 1; dia <= ultimoDia; dia++) {
      const data = `${mes}-${String(dia).padStart(2, "0")}`;
      const base = config.horariosPorDia?.[String(diaDaSemana(data))] || [];

      const ocupados = ocupadosPorDia.get(data) || new Set();
      const bloqueadas = bloqueiosPorHora.get(data) || new Set();
      const fechadoPeloDia = bloqueioDiaInteiro.has(data);

      let disponiveis = 0;

      if (!fechadoPeloDia) {
        for (const hora of base) {
          if (ocupados.has(hora) || bloqueadas.has(hora)) continue;
          if (momentoSP(data, hora) <= limite) continue;
          disponiveis++;
        }
      }

      dias.push({
        data,
        dia,
        diaSemana: diaDaSemana(data),
        total: base.length,
        disponiveis,
        ocupados: ocupados.size,
        fechado: base.length === 0,
        bloqueado: fechadoPeloDia,
        passado: data < hoje,
        hoje: data === hoje
      });
    }

    res.json({ mes, hoje, dias });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
