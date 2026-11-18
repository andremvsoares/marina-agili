// Crédito da cliente (troco que fica para o próximo serviço).

import MovimentoCredito from "../models/MovimentoCredito.js";
import { normalizarWhatsapp } from "./clientes.js";
import { hojeSP } from "./agenda.js";

export const arredondar = (n) => Math.round(Number(n || 0) * 100) / 100;

export async function saldoCredito(whatsapp) {
  const numero = normalizarWhatsapp(whatsapp);
  const movimentos = await MovimentoCredito.find({ clienteWhatsapp: numero }).lean();
  return arredondar(movimentos.reduce((s, m) => s + m.valor, 0));
}

export async function listarMovimentos(whatsapp) {
  const numero = normalizarWhatsapp(whatsapp);
  return MovimentoCredito.find({ clienteWhatsapp: numero })
    .sort({ criadoEm: -1 })
    .limit(50)
    .lean();
}

export async function registrarCredito({
  whatsapp,
  valor,
  tipo = "credito",
  motivo = "",
  data,
  agendamentoId = null
}) {
  const numero = normalizarWhatsapp(whatsapp);
  const quantia = arredondar(Math.abs(Number(valor)));

  if (!(quantia > 0)) return { ok: false, status: 400, erro: "Valor inválido" };

  if (tipo === "uso") {
    const saldo = await saldoCredito(numero);
    if (quantia > saldo + 0.001) {
      return { ok: false, status: 400, erro: `Saldo insuficiente (disponível R$ ${saldo.toFixed(2)})` };
    }
  }

  const movimento = await MovimentoCredito.create({
    clienteWhatsapp: numero,
    valor: tipo === "uso" ? -quantia : quantia,
    tipo,
    motivo,
    data: data || hojeSP(),
    agendamentoId
  });

  return { ok: true, movimento, saldo: await saldoCredito(numero) };
}
