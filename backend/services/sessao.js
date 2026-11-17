// Estado da conversa de cada número de WhatsApp.
//
// Persistido no Mongo para sobreviver a reinícios da Render.
// Em modo simulado (BOT_DRY_RUN=1) fica em memória, para não sujar o banco.

import Conversa from "../models/Conversa.js";

const memoria = new Map();
const simulado = () => process.env.BOT_DRY_RUN === "1";

const PADRAO = { estado: "inicio", dados: {}, pausadaAte: null };

export async function obterSessao(telefone) {
  if (simulado()) {
    return memoria.get(telefone) || { telefone, ...PADRAO };
  }

  const doc = await Conversa.findOne({ telefone });
  if (!doc) return { telefone, ...PADRAO };

  return {
    telefone: doc.telefone,
    estado: doc.estado,
    dados: doc.dados || {},
    pausadaAte: doc.pausadaAte
  };
}

export async function salvarSessao(sessao) {
  const { telefone, estado, dados, pausadaAte } = sessao;

  if (simulado()) {
    memoria.set(telefone, { telefone, estado, dados, pausadaAte });
    return;
  }

  await Conversa.findOneAndUpdate(
    { telefone },
    { estado, dados, pausadaAte, atualizadoEm: new Date() },
    { upsert: true }
  );
}

export async function limparSessao(telefone) {
  if (simulado()) {
    memoria.delete(telefone);
    return;
  }
  await Conversa.deleteOne({ telefone });
}

// A Marina assumiu a conversa no app? Bot fica quieto por um tempo.
export async function pausarBot(telefone, horas = 12) {
  const sessao = await obterSessao(telefone);
  sessao.pausadaAte = new Date(Date.now() + horas * 60 * 60 * 1000);
  await salvarSessao(sessao);
}

export function botPausado(sessao) {
  return sessao.pausadaAte ? new Date(sessao.pausadaAte) > new Date() : false;
}

// Controle de duplicidade: o WhatsApp reenvia eventos se não receber 200.
const vistos = new Set();
const LIMITE_VISTOS = 500;

export function eventoJaProcessado(id) {
  if (!id) return false;
  if (vistos.has(id)) return true;
  vistos.add(id);
  if (vistos.size > LIMITE_VISTOS) {
    vistos.delete(vistos.values().next().value);
  }
  return false;
}
