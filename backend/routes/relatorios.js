// Relatórios de gestão — somente a dona.
// Faturamento, custo de material, margem, faltas e ocupação.

import express from "express";
import Agendamento from "../models/Agendamento.js";
import Servico from "../models/Servico.js";
import Produto from "../models/Produto.js";
import Venda from "../models/Venda.js";
import { autenticar, exigirDono } from "./admin.js";
import { horariosDoDia, hojeSP } from "../services/agenda.js";
import { mapaCustoPorServico, mapaCustoUnitario, custoDaLista, arredondar } from "../services/custos.js";
import { resumoDoMes, somarMeses } from "../services/despesas.js";

const router = express.Router();

router.use(autenticar, exigirDono);

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function periodo(query) {
  const hoje = hojeSP();
  const de = RE_DATA.test(query.de || "") ? query.de : hoje.slice(0, 7) + "-01";
  const ate = RE_DATA.test(query.ate || "") ? query.ate : hoje;
  return { de, ate };
}

function somarDias(iso, dias) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function carregarPeriodo(de, ate) {
  const agendamentos = await Agendamento.find({ data: { $gte: de, $lte: ate } }).lean();
  return agendamentos;
}

// ---------- resumo ----------
router.get("/resumo", async (req, res) => {
  try {
    const { de, ate } = periodo(req.query);
    const agendamentos = await carregarPeriodo(de, ate);

    const concluidos = agendamentos.filter((a) => a.status === "concluido");
    const faltas = agendamentos.filter((a) => a.status === "nao_compareceu");
    const cancelados = agendamentos.filter((a) => a.status === "cancelado");
    const confirmados = agendamentos.filter((a) => a.status === "confirmado");

    const mapaServico = await mapaCustoPorServico();

    const receitaRealizada = concluidos.reduce((s, a) => s + a.servicoPreco, 0);
    const receitaPrevista = confirmados.reduce((s, a) => s + a.servicoPreco, 0);
    const custoMaterial = custoDaLista(concluidos, mapaServico);

    // Ocupação: quantos horários foram oferecidos no período.
    let slotsOferecidos = 0;
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      const horarios = await horariosDoDia(d);
      slotsOferecidos += horarios.length;
    }

    const ocupados = concluidos.length + faltas.length + confirmados.length;

    res.json({
      de,
      ate,
      atendimentos: concluidos.length,
      faltas: faltas.length,
      cancelados: cancelados.length,
      confirmadosFuturos: confirmados.length,
      receitaRealizada: arredondar(receitaRealizada),
      receitaPrevista: arredondar(receitaPrevista),
      custoMaterial: arredondar(custoMaterial),
      margem: arredondar(receitaRealizada - custoMaterial),
      ticketMedio: concluidos.length ? arredondar(receitaRealizada / concluidos.length) : 0,
      taxaFalta: concluidos.length + faltas.length
        ? arredondar((faltas.length / (concluidos.length + faltas.length)) * 100)
        : 0,
      ocupacao: slotsOferecidos ? arredondar((ocupados / slotsOferecidos) * 100) : 0,
      slotsOferecidos
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- por serviço ----------
router.get("/servicos", async (req, res) => {
  try {
    const { de, ate } = periodo(req.query);
    const agendamentos = await carregarPeriodo(de, ate);
    const concluidos = agendamentos.filter((a) => a.status === "concluido");

    const mapaServico = await mapaCustoPorServico();
    const servicos = await Servico.find().lean();
    const nomes = new Map(servicos.map((s) => [String(s._id), s.nome]));

    const porServico = new Map();
    for (const ag of concluidos) {
      const chave = String(ag.servicoId);
      if (!porServico.has(chave)) {
        porServico.set(chave, {
          servicoId: chave,
          nome: nomes.get(chave) || ag.servicoNome,
          quantidade: 0,
          receita: 0,
          custo: 0
        });
      }
      const item = porServico.get(chave);
      item.quantidade += 1;
      item.receita += ag.servicoPreco;
      item.custo += mapaServico.get(chave) || 0;
    }

    const lista = [...porServico.values()].map((i) => ({
      ...i,
      receita: arredondar(i.receita),
      custo: arredondar(i.custo),
      margem: arredondar(i.receita - i.custo),
      margemPercentual: i.receita ? arredondar(((i.receita - i.custo) / i.receita) * 100) : 0
    }));

    lista.sort((a, b) => b.receita - a.receita);
    res.json(lista);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- série diária ----------
router.get("/por-dia", async (req, res) => {
  try {
    const { de, ate } = periodo(req.query);
    const agendamentos = await carregarPeriodo(de, ate);
    const mapaServico = await mapaCustoPorServico();

    const dias = new Map();
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      dias.set(d, { data: d, receita: 0, custo: 0, atendimentos: 0, faltas: 0 });
    }

    for (const ag of agendamentos) {
      const item = dias.get(ag.data);
      if (!item) continue;
      if (ag.status === "concluido") {
        item.atendimentos += 1;
        item.receita += ag.servicoPreco;
        item.custo += mapaServico.get(String(ag.servicoId)) || 0;
      }
      if (ag.status === "nao_compareceu") item.faltas += 1;
    }

    res.json(
      [...dias.values()].map((d) => ({
        ...d,
        receita: arredondar(d.receita),
        custo: arredondar(d.custo)
      }))
    );
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- custo por produto ----------
router.get("/produtos", async (req, res) => {
  try {
    const { de, ate } = periodo(req.query);
    const agendamentos = await carregarPeriodo(de, ate);
    const concluidos = agendamentos.filter((a) => a.status === "concluido");

    const [servicos, produtos, unitario] = await Promise.all([
      Servico.find().lean(),
      Produto.find().lean(),
      mapaCustoUnitario()
    ]);

    const servicoPorId = new Map(servicos.map((s) => [String(s._id), s]));
    const produtoPorId = new Map(produtos.map((p) => [String(p._id), p]));

    const consumo = new Map();

    for (const ag of concluidos) {
      const servico = servicoPorId.get(String(ag.servicoId));
      if (!servico) continue;

      for (const insumo of servico.insumos || []) {
        const id = String(insumo.produtoId);
        const produto = produtoPorId.get(id);
        if (!produto) continue;

        const qtd = insumo.quantidade || 0;
        const custo = (unitario.get(id) || 0) * qtd;

        if (!consumo.has(id)) {
          consumo.set(id, {
            produtoId: id,
            nome: produto.nome,
            marca: produto.marca || "",
            unidade: produto.unidade,
            quantidade: 0,
            custo: 0,
            custoUnitario: arredondar(unitario.get(id) || 0)
          });
        }
        const item = consumo.get(id);
        item.quantidade += qtd;
        item.custo += custo;
      }
    }

    const lista = [...consumo.values()]
      .map((i) => ({
        ...i,
        quantidade: arredondar(i.quantidade),
        custo: arredondar(i.custo)
      }))
      .sort((a, b) => b.custo - a.custo);

    res.json(lista);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- resultado (receita - material - despesas) ----------
router.get("/resultado", async (req, res) => {
  try {
    const { de, ate } = periodo(req.query);

    const [agendamentos, vendas, mapaServico] = await Promise.all([
      Agendamento.find({ data: { $gte: de, $lte: ate } }).lean(),
      Venda.find({ data: { $gte: de, $lte: ate } }).lean(),
      mapaCustoPorServico()
    ]);

    const concluidos = agendamentos.filter((a) => a.status === "concluido");

    const meses = [];
    for (let mes = de.slice(0, 7); mes <= ate.slice(0, 7); mes = somarMeses(mes, 1)) {
      meses.push(mes);
    }

    const serie = [];

    for (const mes of meses) {
      const doMes = concluidos.filter((a) => a.data.slice(0, 7) === mes);
      const vendasDoMes = vendas.filter((v) => v.data.slice(0, 7) === mes);

      const receitaServicos = arredondar(doMes.reduce((s, a) => s + a.servicoPreco, 0));
      const receitaProdutos = arredondar(vendasDoMes.reduce((s, v) => s + v.total, 0));
      const custoMaterial = arredondar(custoDaLista(doMes, mapaServico));

      const despesas = await resumoDoMes(mes);

      const receita = arredondar(receitaServicos + receitaProdutos);
      const despesa = despesas.totais.total;
      const lucro = arredondar(receita - custoMaterial - despesa);

      serie.push({
        mes,
        receitaServicos,
        receitaProdutos,
        receita,
        custoMaterial,
        despesasFixas: despesas.totais.fixas,
        despesasCartao: despesas.totais.cartao,
        despesasAvulsas: despesas.totais.avulsas,
        despesa,
        lucro,
        margem: receita ? arredondar((lucro / receita) * 100) : 0
      });
    }

    const soma = (campo) => arredondar(serie.reduce((s, m) => s + m[campo], 0));

    const receitaServicos = soma("receitaServicos");
    const receitaProdutos = soma("receitaProdutos");
    const receita = soma("receita");
    const custoMaterial = soma("custoMaterial");
    const despesasFixas = soma("despesasFixas");
    const despesasCartao = soma("despesasCartao");
    const despesasAvulsas = soma("despesasAvulsas");
    const despesa = soma("despesa");
    const lucro = arredondar(receita - custoMaterial - despesa);

    res.json({
      de,
      ate,
      receitaServicos,
      receitaProdutos,
      receita,
      custoMaterial,
      despesasFixas,
      despesasCartao,
      despesasAvulsas,
      despesa,
      lucro,
      margem: receita ? arredondar((lucro / receita) * 100) : 0,
      serie
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- exportação CSV ----------
router.get("/csv", async (req, res) => {
  try {
    const { de, ate } = periodo(req.query);
    const agendamentos = await Agendamento.find({ data: { $gte: de, $lte: ate } })
      .sort({ data: 1, hora: 1 })
      .lean();

    const escapar = (valor) => {
      const texto = String(valor ?? "");
      return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    const linhas = [
      ["Data", "Hora", "Cliente", "WhatsApp", "Servico", "Valor", "Status", "Consentimento"].join(";")
    ];

    for (const a of agendamentos) {
      linhas.push(
        [
          a.data.split("-").reverse().join("/"),
          a.hora,
          escapar(a.clienteNome),
          a.clienteWhatsapp,
          escapar(a.servicoNome),
          String(a.servicoPreco).replace(".", ","),
          a.status,
          a.consentimento ? "sim" : "nao"
        ].join(";")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="agendamentos_${de}_a_${ate}.csv"`);
    res.send("\uFEFF" + linhas.join("\n"));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
