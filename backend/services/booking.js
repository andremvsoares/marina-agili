// Regras de agendamento — fonte única de verdade.
// Usado pela API REST (site/painel) e pelo bot do WhatsApp.
// Qualquer canal novo deve passar por aqui, senão as regras divergem.

import mongoose from "mongoose";
import Servico from "../models/Servico.js";
import Cliente from "../models/Cliente.js";
import Agendamento from "../models/Agendamento.js";

export const HORARIOS_FIXOS = [
  "09:00", "10:00", "11:00",
  "14:00", "15:00", "16:00", "17:00", "18:00"
];

export const montarSlot = (data, hora) => `${data}T${hora}`;

// ---------- leitura ----------

export async function listarServicos() {
  return Servico.find({ ativo: true }).sort({ nome: 1 });
}

export async function horariosDisponiveis(data) {
  const ocupados = await Agendamento.find({
    data,
    status: { $in: ["confirmado", "concluido"] }
  }).select("hora -_id");

  const ocupadosSet = new Set(ocupados.map((a) => a.hora));

  return HORARIOS_FIXOS.map((hora) => ({
    hora,
    disponivel: !ocupadosSet.has(hora)
  }));
}

// ---------- escrita ----------

/**
 * Cria um agendamento com todas as validações.
 * Devolve { ok: true, agendamento } ou { ok: false, status, erro }.
 */
export async function criarAgendamento({
  clienteNome,
  clienteWhatsapp,
  servicoId,
  data,
  hora,
  observacoes,
  consentimento,
  simulado = false
}) {
  if (!mongoose.Types.ObjectId.isValid(servicoId)) {
    return { ok: false, status: 400, erro: "Serviço inválido" };
  }

  const servico = await Servico.findById(servicoId);
  if (!servico || !servico.ativo) {
    return { ok: false, status: 404, erro: "Serviço não encontrado" };
  }

  if (!HORARIOS_FIXOS.includes(hora)) {
    return { ok: false, status: 400, erro: "Horário inválido" };
  }

  // Checagem amigável. A garantia real é o índice único em `slot`.
  const conflito = await Agendamento.findOne({
    data,
    hora,
    status: { $in: ["confirmado", "concluido"] }
  });
  if (conflito) {
    return { ok: false, status: 409, erro: "Esse horário já foi agendado. Escolha outro." };
  }

  const whatsappLimpo = String(clienteWhatsapp).replace(/\D/g, "");
  const nome = String(clienteNome).trim();

  // Modo simulado (teste do bot sem número real): valida tudo e devolve um
  // objeto falso, sem gravar nada no banco de produção.
  if (simulado) {
    return {
      ok: true,
      simulado: true,
      agendamento: {
        _id: "simulado",
        clienteNome: nome,
        clienteWhatsapp: whatsappLimpo,
        servicoId: servico._id,
        servicoNome: servico.nome,
        servicoPreco: servico.preco,
        data,
        hora,
        status: "confirmado"
      }
    };
  }

  try {
    const agendamento = await Agendamento.create({
      clienteNome: nome,
      clienteWhatsapp: whatsappLimpo,
      servicoId: servico._id,
      servicoNome: servico.nome,
      servicoPreco: servico.preco,
      data,
      hora,
      slot: montarSlot(data, hora),
      observacoes: observacoes ? String(observacoes).slice(0, 300) : "",
      consentimento: consentimento === true,
      consentimentoEm: consentimento === true ? new Date() : undefined
    });

    await Cliente.findOneAndUpdate(
      { whatsapp: whatsappLimpo },
      { nome },
      { upsert: true, new: true }
    );

    return { ok: true, agendamento };
  } catch (err) {
    if (err && err.code === 11000) {
      return { ok: false, status: 409, erro: "Esse horário acabou de ser reservado. Escolha outro." };
    }
    throw err;
  }
}

export async function cancelarAgendamento(id) {
  const agendamento = await Agendamento.findByIdAndUpdate(
    id,
    { status: "cancelado", $unset: { slot: 1 } },
    { new: true }
  );
  if (!agendamento) return { ok: false, status: 404, erro: "Agendamento não encontrado" };
  return { ok: true, agendamento };
}

// Cliente já conhecido? (para não pedir o nome de novo)
export async function buscarCliente(whatsapp) {
  const limpo = String(whatsapp).replace(/\D/g, "");
  return Cliente.findOne({ whatsapp: limpo });
}
