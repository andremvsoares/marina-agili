// Rotas de clientes: ranking, pendências e ficha detalhada.

import express from "express";
import Agendamento from "../models/Agendamento.js";
import Cliente from "../models/Cliente.js";
import { autenticar, exigirDono } from "./admin.js";
import {
  buscarFicha,
  listarClientesComSinal,
  definirSinal,
  normalizarWhatsapp
} from "../services/clientes.js";

const router = express.Router();

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function intervalo(query) {
  const de = RE_DATA.test(query.de || "") ? query.de : null;
  const ate = RE_DATA.test(query.ate || "") ? query.ate : null;
  return { de, ate };
}

// ---------- ranking de clientes ----------
router.get("/", autenticar, exigirDono, async (req, res) => {
  try {
    const { de, ate } = intervalo(req.query);

    const filtro = {};
    if (de || ate) {
      filtro.data = {};
      if (de) filtro.data.$gte = de;
      if (ate) filtro.data.$lte = ate;
    }

    const agregado = await Agendamento.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: "$clienteWhatsapp",
          nome: { $last: "$clienteNome" },
          total: { $sum: 1 },
          concluidos: { $sum: { $cond: [{ $eq: ["$status", "concluido"] }, 1, 0] } },
          faltas: { $sum: { $cond: [{ $eq: ["$status", "nao_compareceu"] }, 1, 0] } },
          cancelados: { $sum: { $cond: [{ $eq: ["$status", "cancelado"] }, 1, 0] } },
          receita: {
            $sum: { $cond: [{ $eq: ["$status", "concluido"] }, "$servicoPreco", 0] }
          },
          ultimoAtendimento: {
            $max: { $cond: [{ $eq: ["$status", "concluido"] }, "$data", null] }
          }
        }
      },
      { $sort: { receita: -1, concluidos: -1 } }
    ]);

    const numeros = agregado.map((c) => c._id);
    const fichas = await Cliente.find({ whatsapp: { $in: numeros } })
      .select("whatsapp nome sinalObrigatorio noShows cancelamentosTardios")
      .lean();

    const porNumero = new Map(fichas.map((f) => [f.whatsapp, f]));

    let clientes = agregado.map((c) => {
      const ficha = porNumero.get(c._id) || {};
      return {
        whatsapp: c._id,
        nome: ficha.nome || c.nome,
        total: c.total,
        concluidos: c.concluidos,
        faltas: c.faltas,
        cancelados: c.cancelados,
        receita: Math.round(c.receita * 100) / 100,
        ultimoAtendimento: c.ultimoAtendimento,
        sinalObrigatorio: ficha.sinalObrigatorio === true
      };
    });

    const busca = String(req.query.busca || "").trim().toLowerCase();
    if (busca) {
      clientes = clientes.filter(
        (c) =>
          String(c.nome || "").toLowerCase().includes(busca) ||
          String(c.whatsapp).includes(busca.replace(/\D/g, ""))
      );
    }

    res.json({
      de,
      ate,
      totais: {
        clientes: clientes.length,
        receita: Math.round(clientes.reduce((s, c) => s + c.receita, 0) * 100) / 100,
        atendimentos: clientes.reduce((s, c) => s + c.concluidos, 0),
        faltas: clientes.reduce((s, c) => s + c.faltas, 0),
        cancelamentos: clientes.reduce((s, c) => s + c.cancelados, 0)
      },
      clientes
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- pendências de pagamento ----------
router.get("/pendentes", autenticar, exigirDono, async (req, res) => {
  try {
    const comSinal = await listarClientesComSinal();

    const agendamentos = await Agendamento.find({
      sinalPendente: true,
      status: { $in: ["confirmado", "concluido"] }
    })
      .sort({ data: 1, hora: 1 })
      .lean();

    res.json({
      clientes: comSinal,
      agendamentos,
      total: agendamentos.length
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- clientes com sinal (usado para marcar cartões) ----------
router.get("/sinal", autenticar, async (req, res) => {
  try {
    res.json(await listarClientesComSinal());
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- ficha simples ----------
router.get("/:whatsapp", autenticar, async (req, res) => {
  try {
    const cliente = await buscarFicha(req.params.whatsapp);
    if (!cliente) return res.status(404).json({ erro: "Cliente não encontrada" });
    res.json(cliente);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- correção manual do sinal ----------
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

// ---------- histórico detalhado ----------
router.get("/:whatsapp/historico", autenticar, async (req, res) => {
  try {
    const numero = normalizarWhatsapp(req.params.whatsapp);
    const cliente = await buscarFicha(numero);

    const { de, ate } = intervalo(req.query);
    const filtro = { clienteWhatsapp: numero };
    if (de || ate) {
      filtro.data = {};
      if (de) filtro.data.$gte = de;
      if (ate) filtro.data.$lte = ate;
    }

    const agendamentos = await Agendamento.find(filtro).sort({ data: -1, hora: -1 }).lean();

    const concluidos = agendamentos.filter((a) => a.status === "concluido");
    const faltas = agendamentos.filter((a) => a.status === "nao_compareceu");
    const cancelados = agendamentos.filter((a) => a.status === "cancelado");

    res.json({
      cliente,
      periodo: { de, ate },
      totais: {
        agendamentos: agendamentos.length,
        concluidos: concluidos.length,
        faltas: faltas.length,
        cancelados: cancelados.length,
        gastoTotal: Math.round(concluidos.reduce((s, a) => s + a.servicoPreco, 0) * 100) / 100,
        ticketMedio: concluidos.length
          ? Math.round((concluidos.reduce((s, a) => s + a.servicoPreco, 0) / concluidos.length) * 100) / 100
          : 0,
        ultimoAtendimento: concluidos[0]?.data || null
      },
      agendamentos
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
