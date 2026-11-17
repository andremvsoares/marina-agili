// Configuração do negócio: horário de funcionamento e antecedências.

import express from "express";
import { autenticar, exigirDono } from "./admin.js";
import { obterConfig } from "../services/agenda.js";

const router = express.Router();

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizarHorarios(valor) {
  const resultado = {};
  for (const dia of [0, 1, 2, 3, 4, 5, 6]) {
    const lista = Array.isArray(valor?.[dia]) ? valor[dia] : [];
    const limpa = [...new Set(lista.filter((h) => RE_HORA.test(String(h))))].sort();
    resultado[dia] = limpa;
  }
  return resultado;
}

// Público: o site precisa saber os horários para mostrar as datas.
router.get("/", async (req, res) => {
  try {
    const config = await obterConfig();
    res.json({
      nomeNegocio: config.nomeNegocio,
      horariosPorDia: config.horariosPorDia,
      antecedenciaMinimaMinutos: config.antecedenciaMinimaMinutos,
      antecedenciaMaximaDias: config.antecedenciaMaximaDias
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.put("/", autenticar, exigirDono, async (req, res) => {
  try {
    const config = await obterConfig();
    const { nomeNegocio, horariosPorDia, antecedenciaMinimaMinutos, antecedenciaMaximaDias } =
      req.body;

    if (nomeNegocio) config.nomeNegocio = String(nomeNegocio).slice(0, 80);
    if (horariosPorDia) config.horariosPorDia = normalizarHorarios(horariosPorDia);

    if (antecedenciaMinimaMinutos !== undefined) {
      const numero = Number(antecedenciaMinimaMinutos);
      if (!Number.isFinite(numero) || numero < 0 || numero > 2880) {
        return res.status(400).json({ erro: "Antecedência mínima inválida (0 a 2880 minutos)" });
      }
      config.antecedenciaMinimaMinutos = numero;
    }

    if (antecedenciaMaximaDias !== undefined) {
      const numero = Number(antecedenciaMaximaDias);
      if (!Number.isFinite(numero) || numero < 1 || numero > 365) {
        return res.status(400).json({ erro: "Antecedência máxima inválida (1 a 365 dias)" });
      }
      config.antecedenciaMaximaDias = numero;
    }

    config.atualizadoEm = new Date();
    await config.save();

    res.json(config);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
