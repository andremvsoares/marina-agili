// Cadastro de produtos (insumos) — somente a dona.

import express from "express";
import mongoose from "mongoose";
import Produto from "../models/Produto.js";
import Servico from "../models/Servico.js";
import { autenticar, exigirDono } from "./admin.js";

const router = express.Router();

const UNIDADES = ["ml", "g", "un"];

router.get("/", autenticar, async (req, res) => {
  try {
    const filtro = req.query.todos === "1" ? {} : { ativo: true };
    const produtos = await Produto.find(filtro).sort({ nome: 1 });
    res.json(produtos.map((p) => p.toJSON()));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.post("/", autenticar, exigirDono, async (req, res) => {
  try {
    const { nome, marca, unidade, quantidadeEmbalagem, precoEmbalagem } = req.body;

    if (!nome || !String(nome).trim()) return res.status(400).json({ erro: "Nome é obrigatório" });
    if (!UNIDADES.includes(unidade || "ml")) return res.status(400).json({ erro: "Unidade inválida" });

    const quantidade = Number(quantidadeEmbalagem);
    const preco = Number(precoEmbalagem);

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return res.status(400).json({ erro: "Quantidade da embalagem inválida" });
    }
    if (!Number.isFinite(preco) || preco < 0) {
      return res.status(400).json({ erro: "Preço da embalagem inválido" });
    }

    const produto = await Produto.create({
      nome: String(nome).trim(),
      marca: marca ? String(marca).trim() : "",
      unidade: unidade || "ml",
      quantidadeEmbalagem: quantidade,
      precoEmbalagem: preco
    });

    res.status(201).json(produto.toJSON());
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.patch("/:id", autenticar, exigirDono, async (req, res) => {
  try {
    const produto = await Produto.findById(req.params.id);
    if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });

    const { nome, marca, unidade, quantidadeEmbalagem, precoEmbalagem, ativo } = req.body;

    if (nome !== undefined) produto.nome = String(nome).trim();
    if (marca !== undefined) produto.marca = String(marca).trim();
    if (unidade !== undefined) {
      if (!UNIDADES.includes(unidade)) return res.status(400).json({ erro: "Unidade inválida" });
      produto.unidade = unidade;
    }
    if (quantidadeEmbalagem !== undefined) {
      const q = Number(quantidadeEmbalagem);
      if (!Number.isFinite(q) || q <= 0) return res.status(400).json({ erro: "Quantidade inválida" });
      produto.quantidadeEmbalagem = q;
    }
    if (precoEmbalagem !== undefined) {
      const p = Number(precoEmbalagem);
      if (!Number.isFinite(p) || p < 0) return res.status(400).json({ erro: "Preço inválido" });
      produto.precoEmbalagem = p;
    }
    if (typeof ativo === "boolean") produto.ativo = ativo;

    await produto.save();
    res.json(produto.toJSON());
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.delete("/:id", autenticar, exigirDono, async (req, res) => {
  try {
    const produto = await Produto.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
    if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- ficha técnica ----------

router.get("/servico/:servicoId", autenticar, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.servicoId)) {
      return res.status(400).json({ erro: "Serviço inválido" });
    }
    const servico = await Servico.findById(req.params.servicoId).populate("insumos.produtoId");
    if (!servico) return res.status(404).json({ erro: "Serviço não encontrado" });
    res.json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

router.put("/servico/:servicoId", autenticar, exigirDono, async (req, res) => {
  try {
    const servico = await Servico.findById(req.params.servicoId);
    if (!servico) return res.status(404).json({ erro: "Serviço não encontrado" });

    const lista = Array.isArray(req.body.insumos) ? req.body.insumos : [];

    const insumos = [];
    for (const item of lista) {
      if (!mongoose.Types.ObjectId.isValid(item.produtoId)) continue;
      const quantidade = Number(item.quantidade);
      if (!Number.isFinite(quantidade) || quantidade <= 0) continue;
      insumos.push({ produtoId: item.produtoId, quantidade });
    }

    servico.insumos = insumos;
    await servico.save();

    res.json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
