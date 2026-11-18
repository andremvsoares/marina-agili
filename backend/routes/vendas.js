// Produtos de venda e vendas vinculadas à cliente.

import express from "express";
import mongoose from "mongoose";
import ProdutoVenda from "../models/ProdutoVenda.js";
import Venda from "../models/Venda.js";
import { autenticar, exigirDono } from "./admin.js";
import { obterOuCriarCliente, normalizarWhatsapp } from "../services/clientes.js";
import { hojeSP } from "../services/agenda.js";

const router = express.Router();

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

router.use(autenticar);

// ==================== CATÁLOGO ====================

router.get("/produtos", async (req, res) => {
  try {
    const filtro = req.query.todos === "1" ? {} : { ativo: true };
    res.json(await ProdutoVenda.find(filtro).sort({ nome: 1 }));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/produtos", exigirDono, async (req, res) => {
  try {
    const { nome, marca, preco, custo } = req.body;

    if (!nome || !String(nome).trim()) return res.status(400).json({ erro: "Nome é obrigatório" });

    const precoNum = Number(preco);
    const custoNum = Number(custo || 0);

    if (!Number.isFinite(precoNum) || precoNum < 0) {
      return res.status(400).json({ erro: "Preço inválido" });
    }
    if (!Number.isFinite(custoNum) || custoNum < 0) {
      return res.status(400).json({ erro: "Custo inválido" });
    }

    const produto = await ProdutoVenda.create({
      nome: String(nome).trim(),
      marca: marca ? String(marca).trim() : "",
      preco: precoNum,
      custo: custoNum
    });

    res.status(201).json(produto);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.patch("/produtos/:id", exigirDono, async (req, res) => {
  try {
    const produto = await ProdutoVenda.findById(req.params.id);
    if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });

    const { nome, marca, preco, custo, ativo } = req.body;

    if (nome !== undefined) produto.nome = String(nome).trim();
    if (marca !== undefined) produto.marca = String(marca).trim();
    if (preco !== undefined) {
      const p = Number(preco);
      if (!Number.isFinite(p) || p < 0) return res.status(400).json({ erro: "Preço inválido" });
      produto.preco = p;
    }
    if (custo !== undefined) {
      const c = Number(custo);
      if (!Number.isFinite(c) || c < 0) return res.status(400).json({ erro: "Custo inválido" });
      produto.custo = c;
    }
    if (typeof ativo === "boolean") produto.ativo = ativo;

    await produto.save();
    res.json(produto);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete("/produtos/:id", exigirDono, async (req, res) => {
  try {
    const produto = await ProdutoVenda.findByIdAndUpdate(
      req.params.id,
      { ativo: false },
      { new: true }
    );
    if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ==================== VENDAS ====================

router.get("/", async (req, res) => {
  try {
    const filtro = {};

    if (RE_DATA.test(req.query.de || "")) filtro.data = { $gte: req.query.de };
    if (RE_DATA.test(req.query.ate || "")) {
      filtro.data = { ...(filtro.data || {}), $lte: req.query.ate };
    }
    if (req.query.cliente) {
      filtro.clienteWhatsapp = normalizarWhatsapp(req.query.cliente);
    }

    const vendas = await Venda.find(filtro).sort({ data: -1, criadoEm: -1 }).limit(200).lean();

    res.json({
      total: Math.round(vendas.reduce((s, v) => s + v.total, 0) * 100) / 100,
      quantidade: vendas.length,
      vendas
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/", exigirDono, async (req, res) => {
  try {
    const { clienteWhatsapp, clienteNome, itens, data, observacoes } = req.body;

    const numero = normalizarWhatsapp(clienteWhatsapp);
    if (numero.length < 10) {
      return res.status(400).json({ erro: "Informe o WhatsApp da cliente" });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Adicione pelo menos um produto" });
    }

    const dia = RE_DATA.test(data || "") ? data : hojeSP();

    const preparados = [];
    for (const item of itens) {
      if (!mongoose.Types.ObjectId.isValid(item.produtoId)) {
        return res.status(400).json({ erro: "Produto inválido" });
      }
      const quantidade = Number(item.quantidade);
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return res.status(400).json({ erro: "Quantidade inválida" });
      }

      const produto = await ProdutoVenda.findById(item.produtoId);
      if (!produto || !produto.ativo) {
        return res.status(404).json({ erro: "Produto não encontrado" });
      }

      preparados.push({
        produtoId: produto._id,
        nome: produto.nome,
        quantidade,
        precoUnitario: produto.preco
      });
    }

    const total = preparados.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);

    const cliente = await obterOuCriarCliente(
      numero,
      clienteNome ? String(clienteNome).trim() : "Cliente"
    );

    const venda = await Venda.create({
      clienteWhatsapp: numero,
      clienteNome: cliente.nome || clienteNome || "Cliente",
      itens: preparados,
      total: Math.round(total * 100) / 100,
      data: dia,
      observacoes: observacoes ? String(observacoes).slice(0, 300) : "",
      criadoPor: req.usuario?.nome || ""
    });

    res.status(201).json(venda);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete("/:id", exigirDono, async (req, res) => {
  try {
    const removida = await Venda.findByIdAndDelete(req.params.id);
    if (!removida) return res.status(404).json({ erro: "Venda não encontrada" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
