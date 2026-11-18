// Lembrete do dia anterior.
//
// Regra combinada com a Marina:
// - atendimento ANTES das 14h  -> lembrete na VÉSPERA às 18h
//   (assim o botão "Cancelar" não cai dentro da multa de 3 horas)
// - atendimento A PARTIR das 14h -> lembrete no MESMO DIA às 8h

import Agendamento from "../models/Agendamento.js";
import { momentoSP, hojeSP } from "./agenda.js";
import { enviarTexto, botConfigurado } from "./whatsapp.js";
import { TEXTOS as T } from "../textos.js";

const HORA_LIMITE = 14; // antes disso, o lembrete vai na véspera

export const somarDias = (dataISO, dias) => {
  const d = new Date(`${dataISO}T12:00:00-03:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

// Quando o lembrete de um atendimento deve sair.
export function quandoEnviarLembrete(data, hora) {
  const horaDoAtendimento = Number(String(hora).slice(0, 2));
  const antesDoLimite = horaDoAtendimento < HORA_LIMITE;

  return antesDoLimite
    ? momentoSP(somarDias(data, -1), "18:00")
    : momentoSP(data, "08:00");
}

// Atendimentos que já passaram da hora de lembrar e ainda não foram lembrados.
export async function lembretesPendentes(agora = new Date()) {
  const candidatos = await Agendamento.find({
    status: "confirmado",
    data: { $gte: somarDias(hojeSP(), -1), $lte: somarDias(hojeSP(), 2) },
    lembreteEnviadoEm: null
  }).lean();

  return candidatos.filter((ag) => quandoEnviarLembrete(ag.data, ag.hora) <= agora);
}

export async function enviarLembretes({ simulado = false } = {}) {
  const pendentes = await lembretesPendentes();
  const enviados = [];

  for (const ag of pendentes) {
    const mensagem = T.lembrete(ag);

    if (simulado || !botConfigurado()) {
      console.log(`[lembrete simulado] ${ag.clienteWhatsapp} -> ${ag.data} ${ag.hora}`);
      enviados.push({ id: ag._id, simulado: true });
      continue;
    }

    const resultado = await enviarTexto(ag.clienteWhatsapp, mensagem);

    // Marca mesmo se falhar? Não: se falhou, tenta de novo no próximo ciclo.
    if (resultado.ok) {
      await Agendamento.updateOne({ _id: ag._id }, { lembreteEnviadoEm: new Date() });
      enviados.push({ id: ag._id, ok: true });
    } else {
      console.error(`❌ Lembrete não enviado para ${ag.clienteWhatsapp}:`, resultado.status);
      enviados.push({ id: ag._id, ok: false, status: resultado.status });
    }
  }

  return enviados;
}

// Roda a cada 10 minutos enquanto o servidor estiver de pé.
export function iniciarLembretes(intervaloMs = 10 * 60 * 1000) {
  const rodar = async () => {
    try {
      const agendamentos = await lembretesPendentes();
      if (!agendamentos.length) return;

      console.log(`🔔 ${agendamentos.length} lembrete(s) pendente(s)`);
      await enviarLembretes();
    } catch (err) {
      console.error("❌ Erro no lembrete:", err.message);
    }
  };

  setTimeout(rodar, 30 * 1000); // primeira checagem 30s após subir
  const timer = setInterval(rodar, intervaloMs);
  timer.unref?.();
  return timer;
}
