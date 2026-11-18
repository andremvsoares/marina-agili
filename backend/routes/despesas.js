// Despesas da clínica: fixas, cartões, compras parceladas e avulsas.

import express from "express";
import mongoose from "mongoose";
import DespesaFixa, { CATEGORIAS_DESPESA } from "../models/DespesaFixa.js";
import CartaoCredito from "../models/CartaoCredito.js";
import CompraCartao from "../models/CompraCartao.js";
import DespesaAvulsa from "../models/DespesaAvulsa.js";
import { autenticar, exigirDono } from "./admin.js";
import {
  resumoDoMes,
  previsao,
  mesAtual,
  primeiroMesDaCompra,
  arredondar
} from "../services/despesas.js";

const router = express.Router();

router.use(autenticar, exigirDono);

const RE_MES = /^\d{4}-\d{2}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMAS = ["pix", "boleto", "debito", "dinheiro"];

const categoriaValida = (c) => !c || CATEGORIAS_DESPESA.includes(c);

// ==================== RESUMO E PREVISÃO ====================

router.get("/mes", async (req, res) => {
  try {
    const mes = RE_MES.test(req.query.mes || "") ? req.query.mes : mesAtual();
    res.json(await resumoDoMes(mes));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.get("/previsao", async (req, res) => {
  try {
    const meses = Number(req.query.meses) || 6;
    const inicio = RE_MES.test(req.query.inicio || "") ? req.query.inicio : mesAtual();
    res.json(await previsao(meses, inicio));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ==================== DESPESAS FIXAS ====================

router.get("/fixas", async (req, res) => {
  try {
    const filtro = req.query.todos === "1" ? {} : { ativo: true };
    res.json(await DespesaFixa.find(filtro).sort({ categoria: 1, nome: 1 }));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/fixas", async (req, res) => {
  try {
    const { nome, valor, categoria, diaVencimento, formaPagamento, inicioEm, fimEm, observacoes } =
      req.body;

    if (!nome || !String(nome).trim()) return res.status(400).json({ erro: "Informe o nome" });

    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      return res.status(400).json({ erro: "Valor inválido" });
    }
    if (!categoriaValida(categoria)) return res.status(400).json({ erro: "Categoria inválida" });

    const inicio = RE_MES.test(inicioEm || "") ? inicioEm : mesAtual();
    const fim = RE_MES.test(fimEm || "") ? fimEm : null;

    const despesa = await DespesaFixa.create({
      nome: String(nome).trim(),
      valor: valorNum,
      categoria: categoria || "outro",
      diaVencimento: Number(diaVencimento) || 5,
      formaPagamento: FORMAS.includes(formaPagamento) ? formaPagamento : "pix",
      inicioEm: inicio,
      fimEm: fim,
      observacoes: observacoes || ""
    });

    res.status(201).json(despesa);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.patch("/fixas/:id", async (req, res) => {
  try {
    const despesa = await DespesaFixa.findById(req.params.id);
    if (!despesa) return res.status(404).json({ erro: "Despesa não encontrada" });

    const { nome, valor, categoria, diaVencimento, formaPagamento, inicioEm, fimEm, ativo } =
      req.body;

    if (nome !== undefined) despesa.nome = String(nome).trim();
    if (valor !== undefined) {
      const v = Number(valor);
      if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ erro: "Valor inválido" });
      despesa.valor = v;
    }
    if (categoria !== undefined) {
      if (!categoriaValida(categoria)) return res.status(400).json({ erro: "Categoria inválida" });
      despesa.categoria = categoria;
    }
    if (diaVencimento !== undefined) despesa.diaVencimento = Number(diaVencimento) || 5;
    if (formaPagamento !== undefined && FORMAS.includes(formaPagamento)) {
      despesa.formaPagamento = formaPagamento;
    }
    if (RE_MES.test(inicioEm || "")) despesa.inicioEm = inicioEm;
    if (fimEm !== undefined) despesa.fimEm = RE_MES.test(fimEm || "") ? fimEm : null;
    if (typeof ativo === "boolean") despesa.ativo = ativo;

    await despesa.save();
    res.json(despesa);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete("/fixas/:id", async (req, res) => {
  try {
    const removida = await DespesaFixa.findByIdAndDelete(req.params.id);
    if (!removida) return res.status(404).json({ erro: "Despesa não encontrada" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ==================== CARTÕES ====================

router.get("/cartoes", async (req, res) => {
  try {
    res.json(await CartaoCredito.find({}).sort({ nome: 1 }));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/cartoes", async (req, res) => {
  try {
    const { nome, bandeira, ultimosDigitos, diaFechamento, diaVencimento, limite, cor } = req.body;

    if (!nome || !String(nome).trim()) return res.status(400).json({ erro: "Informe o nome" });

    const cartao = await CartaoCredito.create({
      nome: String(nome).trim(),
      bandeira: bandeira || "",
      ultimosDigitos: ultimosDigitos ? String(ultimosDigitos).slice(-4) : "",
      diaFechamento: Number(diaFechamento) || 5,
      diaVencimento: Number(diaVencimento) || 12,
      limite: Number(limite) || 0,
      cor: /^#[0-9a-fA-F]{6}$/.test(cor || "") ? cor : "#7C9EB2"
    });

    res.status(201).json(cartao);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.patch("/cartoes/:id", async (req, res) => {
  try {
    const cartao = await CartaoCredito.findById(req.params.id);
    if (!cartao) return res.status(404).json({ erro: "Cartão não encontrado" });

    const { nome, bandeira, ultimosDigitos, diaFechamento, diaVencimento, limite, cor, ativo } =
      req.body;

    if (nome !== undefined) cartao.nome = String(nome).trim();
    if (bandeira !== undefined) cartao.bandeira = bandeira;
    if (ultimosDigitos !== undefined) cartao.ultimosDigitos = String(ultimosDigitos).slice(-4);
    if (diaFechamento !== undefined) cartao.diaFechamento = Number(diaFechamento) || 5;
    if (diaVencimento !== undefined) cartao.diaVencimento = Number(diaVencimento) || 12;
    if (limite !== undefined) cartao.limite = Number(limite) || 0;
    if (cor !== undefined && /^#[0-9a-fA-F]{6}$/.test(cor)) cartao.cor = cor;
    if (typeof ativo === "boolean") cartao.ativo = ativo;

    await cartao.save();
    res.json(cartao);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete("/cartoes/:id", async (req, res) => {
  try {
    const cartao = await CartaoCredito.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
    if (!cartao) return res.status(404).json({ erro: "Cartão não encontrado" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ==================== COMPRAS NO CARTÃO ====================

router.get("/compras", async (req, res) => {
  try {
    const filtro = {};
    if (mongoose.Types.ObjectId.isValid(req.query.cartao || "")) {
      filtro.cartaoId = req.query.cartao;
    }

    const compras = await CompraCartao.find(filtro).sort({ dataCompra: -1 }).lean();
    res.json(compras);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/compras", async (req, res) => {
  try {
    const { cartaoId, descricao, categoria, valorTotal, parcelas, dataCompra, primeiroMes, observacoes } =
      req.body;

    if (!mongoose.Types.ObjectId.isValid(cartaoId)) {
      return res.status(400).json({ erro: "Escolha o cartão" });
    }

    const cartao = await CartaoCredito.findById(cartaoId);
    if (!cartao) return res.status(404).json({ erro: "Cartão não encontrado" });

    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({ erro: "Informe a descrição" });
    }

    const valor = Number(valorTotal);
    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({ erro: "Valor inválido" });
    }

    const numeroParcelas = Number(parcelas) || 1;
    if (numeroParcelas < 1 || numeroParcelas > 48) {
      return res.status(400).json({ erro: "Parcelas devem ser entre 1 e 48" });
    }

    const data = RE_DATA.test(dataCompra || "") ? dataCompra : new Date().toISOString().slice(0, 10);

    const mes = RE_MES.test(primeiroMes || "")
      ? primeiroMes
      : primeiroMesDaCompra(data, cartao.diaFechamento);

    const compra = await CompraCartao.create({
      cartaoId: cartao._id,
      descricao: String(descricao).trim(),
      categoria: categoriaValida(categoria) ? categoria || "outro" : "outro",
      valorTotal: arredondar(valor),
      parcelas: numeroParcelas,
      dataCompra: data,
      primeiroMes: mes,
      observacoes: observacoes || ""
    });

    res.status(201).json({
      ...compra.toObject(),
      valorParcela: arredondar(valor / numeroParcelas)
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete("/compras/:id", async (req, res) => {
  try {
    const removida = await CompraCartao.findByIdAndDelete(req.params.id);
    if (!removida) return res.status(404).json({ erro: "Compra não encontrada" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ==================== DESPESAS AVULSAS ====================

router.get("/avulsas", async (req, res) => {
  try {
    const filtro = {};
    if (RE_MES.test(req.query.mes || "")) {
      filtro.data = { $regex: "^" + req.query.mes };
    }
    res.json(await DespesaAvulsa.find(filtro).sort({ data: -1 }));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/avulsas", async (req, res) => {
  try {
    const { nome, valor, categoria, data, formaPagamento, observacoes } = req.body;

    if (!nome || !String(nome).trim()) return res.status(400).json({ erro: "Informe o nome" });

    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      return res.status(400).json({ erro: "Valor inválido" });
    }

    const dia = RE_DATA.test(data || "") ? data : new Date().toISOString().slice(0, 10);

    const despesa = await DespesaAvulsa.create({
      nome: String(nome).trim(),
      valor: valorNum,
      categoria: categoriaValida(categoria) ? categoria || "outro" : "outro",
      data: dia,
      formaPagamento: FORMAS.includes(formaPagamento) ? formaPagamento : "pix",
      observacoes: observacoes || ""
    });

    res.status(201).json(despesa);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete("/avulsas/:id", async (req, res) => {
  try {
    const removida = await DespesaAvulsa.findByIdAndDelete(req.params.id);
    if (!removida) return res.status(404).json({ erro: "Despesa não encontrada" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
