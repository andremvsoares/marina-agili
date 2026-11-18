// Rotas de clientes: ranking, pendências e ficha detalhada.
// O "total gasto" soma atendimentos concluídos + produtos vendidos.

import express from "express";
import Agendamento from "../models/Agendamento.js";
import Cliente from "../models/Cliente.js";
import Venda from "../models/Venda.js";
import { autenticar, exigirDono } from "./admin.js";
import { saldoCredito, listarMovimentos, registrarCredito } from "../services/creditos.js";
import {
  buscarFicha,
  listarClientesComSinal,
  definirSinal,
  normalizarWhatsapp
} from "../services/clientes.js";

const router = express.Router();

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const arredondar = (n) => Math.round(Number(n || 0) * 100) / 100;

function intervalo(query) {
  const de = RE_DATA.test(query.de || "") ? query.de : null;
  const ate = RE_DATA.test(query.ate || "") ? query.ate : null;
  return { de, ate };
}

function filtroPorData(de, ate) {
  const filtro = {};
  if (de || ate) {
    filtro.data = {};
    if (de) filtro.data.$gte = de;
    if (ate) filtro.data.$lte = ate;
  }
  return filtro;
}

// ---------- ranking de clientes ----------
router.get("/", autenticar, exigirDono, async (req, res) => {
  try {
    const { de, ate } = intervalo(req.query);
    const filtro = filtroPorData(de, ate);

    const [porAtendimento, porVenda] = await Promise.all([
      Agendamento.aggregate([
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
        }
      ]),
      Venda.aggregate([
        { $match: filtro },
        {
          $group: {
            _id: "$clienteWhatsapp",
            nome: { $last: "$clienteNome" },
            quantidade: { $sum: 1 },
            receitaProdutos: { $sum: "$total" },
            ultimaVenda: { $max: "$data" }
          }
        }
      ])
    ]);

    const mapa = new Map();

    for (const c of porAtendimento) {
      mapa.set(c._id, {
        whatsapp: c._id,
        nome: c.nome,
        total: c.total,
        concluidos: c.concluidos,
        faltas: c.faltas,
        cancelados: c.cancelados,
        receita: arredondar(c.receita),
        receitaProdutos: 0,
        vendas: 0,
        ultimoAtendimento: c.ultimoAtendimento,
        ultimaCompra: null
      });
    }

    for (const v of porVenda) {
      const atual = mapa.get(v._id) || {
        whatsapp: v._id,
        nome: v.nome,
        total: 0,
        concluidos: 0,
        faltas: 0,
        cancelados: 0,
        receita: 0,
        ultimoAtendimento: null
      };
      atual.receitaProdutos = arredondar(v.receitaProdutos);
      atual.vendas = v.quantidade;
      atual.ultimaCompra = v.ultimaVenda;
      mapa.set(v._id, atual);
    }

    const numeros = [...mapa.keys()];
    const fichas = await Cliente.find({ whatsapp: { $in: numeros } })
      .select("whatsapp nome sinalObrigatorio")
      .lean();

    const porNumero = new Map(fichas.map((f) => [f.whatsapp, f]));

    let clientes = [...mapa.values()].map((c) => {
      const ficha = porNumero.get(c.whatsapp) || {};
      const totalGasto = arredondar(c.receita + c.receitaProdutos);
      const ultimaVisita = [c.ultimoAtendimento, c.ultimaCompra].filter(Boolean).sort().pop() || null;

      return {
        ...c,
        nome: ficha.nome || c.nome,
        totalGasto,
        ultimaVisita,
        sinalObrigatorio: ficha.sinalObrigatorio === true
      };
    });

    const busca = String(req.query.busca || "").trim().toLowerCase();
    if (busca) {
      const digitos = busca.replace(/\D/g, "");
      clientes = clientes.filter(
        (c) =>
          String(c.nome || "").toLowerCase().includes(busca) ||
          (digitos && String(c.whatsapp).includes(digitos))
      );
    }

    clientes.sort((a, b) => b.totalGasto - a.totalGasto);

    res.json({
      de,
      ate,
      totais: {
        clientes: clientes.length,
        receitaServicos: arredondar(clientes.reduce((s, c) => s + c.receita, 0)),
        receitaProdutos: arredondar(clientes.reduce((s, c) => s + c.receitaProdutos, 0)),
        totalGasto: arredondar(clientes.reduce((s, c) => s + c.totalGasto, 0)),
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

    res.json({ clientes: comSinal, agendamentos, total: agendamentos.length });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- clientes com sinal (cartões do painel) ----------
router.get("/sinal", autenticar, async (req, res) => {
  try {
    res.json(await listarClientesComSinal());
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- crédito da cliente ----------
router.get("/:whatsapp/credito", autenticar, async (req, res) => {
  try {
    const numero = normalizarWhatsapp(req.params.whatsapp);
    res.json({
      whatsapp: numero,
      saldo: await saldoCredito(numero),
      movimentos: await listarMovimentos(numero)
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/:whatsapp/credito", autenticar, exigirDono, async (req, res) => {
  try {
    const { valor, motivo, data } = req.body;

    const resultado = await registrarCredito({
      whatsapp: req.params.whatsapp,
      valor,
      motivo: motivo || "Crédito manual",
      data
    });

    if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });

    res.status(201).json({ saldo: resultado.saldo, movimento: resultado.movimento });
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
    const filtro = { clienteWhatsapp: numero, ...filtroPorData(de, ate) };

    const [agendamentos, vendas] = await Promise.all([
      Agendamento.find(filtro).sort({ data: -1, hora: -1 }).lean(),
      Venda.find(filtro).sort({ data: -1, criadoEm: -1 }).lean()
    ]);

    const concluidos = agendamentos.filter((a) => a.status === "concluido");
    const faltas = agendamentos.filter((a) => a.status === "nao_compareceu");
    const cancelados = agendamentos.filter((a) => a.status === "cancelado");

    const gastoServicos = arredondar(concluidos.reduce((s, a) => s + a.servicoPreco, 0));
    const gastoProdutos = arredondar(vendas.reduce((s, v) => s + v.total, 0));

    res.json({
      cliente,
      periodo: { de, ate },
      credito: await saldoCredito(numero),
      totais: {
        agendamentos: agendamentos.length,
        concluidos: concluidos.length,
        faltas: faltas.length,
        cancelados: cancelados.length,
        gastoServicos,
        gastoProdutos,
        gastoTotal: arredondar(gastoServicos + gastoProdutos),
        ticketMedio: concluidos.length
          ? arredondar(gastoServicos / concluidos.length)
          : 0,
        ultimoAtendimento: concluidos[0]?.data || null,
        compras: vendas.length
      },
      agendamentos,
      vendas
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
