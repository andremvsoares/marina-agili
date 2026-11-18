// Cálculo de despesas e previsão mensal.

import DespesaFixa from "../models/DespesaFixa.js";
import CartaoCredito from "../models/CartaoCredito.js";
import CompraCartao from "../models/CompraCartao.js";
import DespesaAvulsa from "../models/DespesaAvulsa.js";

export const arredondar = (n) => Math.round(Number(n || 0) * 100) / 100;

export const mesAtual = () => {
  const sp = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return sp.toISOString().slice(0, 7);
};

export const somarMeses = (mes, quantidade) => {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + quantidade, 1));
  return d.toISOString().slice(0, 7);
};

export const diferencaMeses = (de, para) => {
  const [anoA, mesA] = de.split("-").map(Number);
  const [anoB, mesB] = para.split("-").map(Number);
  return (anoB - anoA) * 12 + (mesB - mesA);
};

/**
 * Em qual mês cai a primeira parcela.
 * Compra feita depois do fechamento entra na fatura seguinte.
 */
export function primeiroMesDaCompra(dataCompra, diaFechamento = 5) {
  const mes = dataCompra.slice(0, 7);
  const dia = Number(dataCompra.slice(8, 10));
  return dia > diaFechamento ? somarMeses(mes, 1) : mes;
}

/** Valor da parcela `indice` (1-based), com ajuste de centavos na última. */
export function valorDaParcela(compra, indice) {
  const parcela = arredondar(compra.valorTotal / compra.parcelas);
  if (indice === compra.parcelas) {
    return arredondar(compra.valorTotal - parcela * (compra.parcelas - 1));
  }
  return parcela;
}

/** Parcelas de cartão que caem no mês pedido. */
export function parcelasNoMes(compras, mes) {
  const resultado = [];

  for (const compra of compras) {
    const indice = diferencaMeses(compra.primeiroMes, mes) + 1;

    if (indice < 1 || indice > compra.parcelas) continue;

    resultado.push({
      compra,
      indice,
      totalParcelas: compra.parcelas,
      valor: valorDaParcela(compra, indice)
    });
  }

  return resultado;
}

/** Despesas fixas válidas no mês. */
export function fixasNoMes(fixas, mes) {
  return fixas.filter((f) => {
    if (!f.ativo) return false;
    if (f.inicioEm > mes) return false;
    if (f.fimEm && f.fimEm < mes) return false;
    return true;
  });
}

/**
 * Resumo completo de um mês.
 */
export async function resumoDoMes(mes) {
  const [fixas, cartoes, compras, avulsas] = await Promise.all([
    DespesaFixa.find({}).lean(),
    CartaoCredito.find({}).lean(),
    CompraCartao.find({}).lean(),
    DespesaAvulsa.find({ data: { $regex: "^" + mes } }).lean()
  ]);

  const fixasDoMes = fixasNoMes(fixas, mes);
  const parcelas = parcelasNoMes(compras, mes);

  const porCartao = new Map(cartoes.map((c) => [String(c._id), c]));

  const itensCartao = parcelas.map((p) => ({
    compraId: String(p.compra._id),
    descricao: p.compra.descricao,
    categoria: p.compra.categoria,
    cartao: porCartao.get(String(p.compra.cartaoId))?.nome || "Cartão",
    cor: porCartao.get(String(p.compra.cartaoId))?.cor || "#7C9EB2",
    parcela: p.indice,
    totalParcelas: p.totalParcelas,
    valor: p.valor,
    valorTotal: p.compra.valorTotal,
    dataCompra: p.compra.dataCompra
  }));

  const totalFixas = arredondar(fixasDoMes.reduce((s, f) => s + f.valor, 0));
  const totalCartao = arredondar(itensCartao.reduce((s, i) => s + i.valor, 0));
  const totalAvulsas = arredondar(avulsas.reduce((s, a) => s + a.valor, 0));

  const categorias = new Map();
  const somarCategoria = (categoria, valor) => {
    categorias.set(categoria, arredondar((categorias.get(categoria) || 0) + valor));
  };

  for (const f of fixasDoMes) somarCategoria(f.categoria, f.valor);
  for (const i of itensCartao) somarCategoria(i.categoria, i.valor);
  for (const a of avulsas) somarCategoria(a.categoria, a.valor);

  return {
    mes,
    fixas: fixasDoMes.map((f) => ({
      _id: String(f._id),
      nome: f.nome,
      valor: f.valor,
      categoria: f.categoria,
      diaVencimento: f.diaVencimento,
      formaPagamento: f.formaPagamento,
      inicioEm: f.inicioEm,
      fimEm: f.fimEm,
      ativo: f.ativo
    })),
    cartao: itensCartao,
    avulsas: avulsas.map((a) => ({
      _id: String(a._id),
      nome: a.nome,
      valor: a.valor,
      categoria: a.categoria,
      data: a.data,
      formaPagamento: a.formaPagamento
    })),
    porCategoria: [...categorias.entries()]
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor),
    totais: {
      fixas: totalFixas,
      cartao: totalCartao,
      avulsas: totalAvulsas,
      total: arredondar(totalFixas + totalCartao + totalAvulsas)
    }
  };
}

/**
 * Previsão dos próximos meses (inclui parcelas já contratadas).
 */
export async function previsao(meses = 6, inicio = mesAtual()) {
  const [fixas, compras] = await Promise.all([
    DespesaFixa.find({}).lean(),
    CompraCartao.find({}).lean()
  ]);

  const lista = [];

  for (let i = 0; i < Math.min(Math.max(meses, 1), 24); i++) {
    const mes = somarMeses(inicio, i);
    const totalFixas = arredondar(
      fixasNoMes(fixas, mes).reduce((s, f) => s + f.valor, 0)
    );
    const totalCartao = arredondar(
      parcelasNoMes(compras, mes).reduce((s, p) => s + p.valor, 0)
    );

    lista.push({
      mes,
      fixas: totalFixas,
      cartao: totalCartao,
      total: arredondar(totalFixas + totalCartao)
    });
  }

  return lista;
}
