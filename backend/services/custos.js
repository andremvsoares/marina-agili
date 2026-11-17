// Cálculo de custo dos atendimentos com base nos insumos (ficha técnica).

import Produto from "../models/Produto.js";
import Servico from "../models/Servico.js";

/** Mapa produtoId -> custo por unidade. */
export async function mapaCustoUnitario() {
  const produtos = await Produto.find().lean();
  const mapa = new Map();
  for (const p of produtos) {
    mapa.set(String(p._id), p.quantidadeEmbalagem ? p.precoEmbalagem / p.quantidadeEmbalagem : 0);
  }
  return mapa;
}

/** Custo de material de um serviço (uma execução). */
export function custoDoServico(servico, mapaUnitario) {
  const insumos = servico?.insumos || [];
  let total = 0;
  for (const item of insumos) {
    const unitario = mapaUnitario.get(String(item.produtoId)) || 0;
    total += unitario * (item.quantidade || 0);
  }
  return total;
}

/** Mapa servicoId -> custo de material por atendimento. */
export async function mapaCustoPorServico() {
  const [servicos, unitario] = await Promise.all([Servico.find().lean(), mapaCustoUnitario()]);
  const mapa = new Map();
  for (const s of servicos) {
    mapa.set(String(s._id), custoDoServico(s, unitario));
  }
  return mapa;
}

/** Custo total de uma lista de agendamentos (usa o serviço vinculado). */
export function custoDaLista(agendamentos, mapaServico) {
  let total = 0;
  for (const ag of agendamentos) {
    total += mapaServico.get(String(ag.servicoId)) || 0;
  }
  return total;
}

export const arredondar = (valor) => Math.round(Number(valor || 0) * 100) / 100;
