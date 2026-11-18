import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import Servico from "./models/Servico.js";
import Agendamento from "./models/Agendamento.js";
import adminRoutes, { autenticar, exigirDono } from "./routes/admin.js";
import whatsappRoutes from "./routes/whatsapp.js";
import clientesRoutes from "./routes/clientes.js";
import usuariosRoutes from "./routes/usuarios.js";
import configRoutes from "./routes/config.js";
import bloqueiosRoutes from "./routes/bloqueios.js";
import agendaRoutes from "./routes/agenda.js";
import produtosRoutes from "./routes/produtos.js";
import relatoriosRoutes from "./routes/relatorios.js";
import vendasRoutes from "./routes/vendas.js";
import despesasRoutes from "./routes/despesas.js";
import {
  marcarFalta,
  registrarComparecimento,
  registrarCancelamento
} from "./services/clientes.js";
import { criarAgendamento, horariosDisponiveis } from "./services/booking.js";
import { validarAgendamento } from "./services/agenda.js";
import { registrarCredito, saldoCredito } from "./services/creditos.js";
import { iniciarLembretes } from "./services/lembretes.js";
import { botConfigurado } from "./services/whatsapp.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");

// ==================== SEGURANÇA ====================
app.use(helmet({ contentSecurityPolicy: false }));

const ORIGENS_PERMITIDAS = (
  process.env.CORS_ORIGINS ||
  [
    "https://marina-agili.vercel.app",
    "https://marinagili.app.br",
    "https://www.marinagili.app.br"
  ].join(",")
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ORIGEM_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;

app.use(
  cors({
    origin(origem, callback) {
      if (!origem) return callback(null, true);
      if (ORIGENS_PERMITIDAS.includes(origem) || ORIGEM_LOCAL.test(origem)) {
        return callback(null, true);
      }
      return callback(new Error("Origem não permitida"));
    }
  })
);

// Guarda o corpo cru: o webhook do WhatsApp precisa dele para validar a
// assinatura HMAC (X-Hub-Signature-256).
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { erro: "Muitas requisições. Aguarde um minuto." }
  })
);

const limiteAgendamento = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas de agendamento. Aguarde um minuto." }
});

app.use("/api/admin", adminRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/config", configRoutes);
app.use("/api/bloqueios", bloqueiosRoutes);
app.use("/api/agenda", agendaRoutes);
app.use("/api/produtos", produtosRoutes);
app.use("/api/relatorios", relatoriosRoutes);
app.use("/api/vendas", vendasRoutes);
app.use("/api/despesas", despesasRoutes);

// Webhook do WhatsApp. O rate limit global é generoso de propósito:
// a Meta pode entregar vários eventos seguidos.
app.use("/webhook/whatsapp", whatsappRoutes);

// ==================== CONEXÃO COM MONGODB ====================
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅ MongoDB conectado com sucesso");
    try {
      await Agendamento.createIndexes();
      console.log("✅ Índices sincronizados");
    } catch (err) {
      console.error("⚠️ Não foi possível sincronizar índices:", err.message);
    }
  })
  .catch((err) => {
    console.error("❌ Erro ao conectar no MongoDB:", err.message);
    process.exit(1);
  });

// ==================== VALIDAÇÃO ====================
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_COR = /^#[0-9a-fA-F]{6}$/;
const RE_WHATSAPP = /^\d{10,13}$/;
const MAX_NOME = 80;
const MAX_OBS = 300;

function validarCriacaoAgendamento(body) {
  const { clienteNome, clienteWhatsapp, servicoId, data, hora, observacoes } = body;

  if (!clienteNome || typeof clienteNome !== "string") return "Nome é obrigatório";
  if (clienteNome.trim().length < 2 || clienteNome.trim().length > MAX_NOME) {
    return `Nome deve ter entre 2 e ${MAX_NOME} caracteres`;
  }
  if (!clienteWhatsapp || typeof clienteWhatsapp !== "string") return "WhatsApp é obrigatório";
  if (!RE_WHATSAPP.test(clienteWhatsapp.replace(/\D/g, ""))) return "WhatsApp inválido";
  if (!servicoId || !mongoose.Types.ObjectId.isValid(servicoId)) return "Serviço inválido";
  if (!data || !RE_DATA.test(data)) return "Data inválida";
  if (!hora || !RE_HORA.test(hora)) return "Horário inválido";
  if (observacoes && String(observacoes).length > MAX_OBS) {
    return `Observações devem ter no máximo ${MAX_OBS} caracteres`;
  }
  return null;
}

// ==================== ROTAS ====================

app.get("/", (req, res) => {
  res.json({ ok: true, mensagem: "API Marina Agili funcionando ✨" });
});

// ---------- SERVIÇOS ----------

app.get("/api/servicos", async (req, res) => {
  try {
    const servicos = await Servico.find({ ativo: true }).sort({ nome: 1 });
    res.json(servicos);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/api/servicos", autenticar, exigirDono, async (req, res) => {
  try {
    const { nome, preco, duracao, cor } = req.body;
    if (!nome || preco === undefined) {
      return res.status(400).json({ erro: "Nome e preço são obrigatórios" });
    }
    if (typeof preco !== "number" || preco < 0) {
      return res.status(400).json({ erro: "Preço inválido" });
    }
    if (cor !== undefined && !RE_COR.test(String(cor))) {
      return res.status(400).json({ erro: "Cor inválida" });
    }
    const servico = await Servico.create({ nome, preco, duracao, cor });
    res.status(201).json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/api/servicos/:id", autenticar, exigirDono, async (req, res) => {
  try {
    const { nome, preco, duracao, cor, ativo } = req.body;
    const dados = {};

    if (nome !== undefined) dados.nome = String(nome).trim();
    if (preco !== undefined) {
      if (typeof preco !== "number" || preco < 0) {
        return res.status(400).json({ erro: "Preço inválido" });
      }
      dados.preco = preco;
    }
    if (duracao !== undefined) dados.duracao = Number(duracao) || 60;
    if (ativo !== undefined) dados.ativo = Boolean(ativo);
    if (cor !== undefined) {
      if (!RE_COR.test(String(cor))) return res.status(400).json({ erro: "Cor inválida" });
      dados.cor = cor;
    }

    const servico = await Servico.findByIdAndUpdate(req.params.id, dados, { new: true });
    if (!servico) return res.status(404).json({ erro: "Serviço não encontrado" });

    res.json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete("/api/servicos/:id", autenticar, exigirDono, async (req, res) => {
  try {
    await Servico.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- HORÁRIOS ----------

app.get("/api/horarios/:data", async (req, res) => {
  try {
    const { data } = req.params;
    if (!RE_DATA.test(data)) {
      return res.status(400).json({ erro: "Data inválida" });
    }
    res.json(await horariosDisponiveis(data));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- AGENDAMENTOS ----------

app.post("/api/agendamentos", limiteAgendamento, async (req, res) => {
  try {
    const erro = validarCriacaoAgendamento(req.body);
    if (erro) return res.status(400).json({ erro });

    const { clienteNome, clienteWhatsapp, servicoId, data, hora, observacoes } = req.body;

    const resultado = await criarAgendamento({
      clienteNome,
      clienteWhatsapp,
      servicoId,
      data,
      hora,
      observacoes,
      consentimento: req.body.consentimento === true,
      dataNascimento: req.body.dataNascimento
    });

    if (!resultado.ok) {
      return res.status(resultado.status).json({ erro: resultado.erro });
    }

    res.status(201).json(resultado.agendamento);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ erro: "Esse horário acabou de ser reservado. Escolha outro." });
    }
    res.status(500).json({ erro: err.message });
  }
});

app.get("/api/agendamentos", autenticar, async (req, res) => {
  try {
    const { data, status, whatsapp } = req.query;
    const filtro = {};
    if (data) filtro.data = data;
    if (status) filtro.status = status;
    if (whatsapp) filtro.clienteWhatsapp = whatsapp;

    const agendamentos = await Agendamento.find(filtro).sort({ data: 1, hora: 1 });
    res.json(agendamentos);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.patch("/api/agendamentos/:id/cancelar", autenticar, async (req, res) => {
  try {
    const resultado = await registrarCancelamento(req.params.id);
    if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });

    const agendamento = resultado.agendamento.toObject
      ? resultado.agendamento.toObject()
      : resultado.agendamento;

    res.json({ ...agendamento, cancelamentoTardio: resultado.tardio });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Remarcar: muda data/hora mantendo o mesmo agendamento.
app.patch("/api/agendamentos/:id/remarcar", autenticar, async (req, res) => {
  try {
    const { data, hora } = req.body;

    if (!data || !RE_DATA.test(data)) return res.status(400).json({ erro: "Data inválida" });
    if (!hora || !RE_HORA.test(hora)) return res.status(400).json({ erro: "Hora inválida" });

    const agendamento = await Agendamento.findById(req.params.id);
    if (!agendamento) return res.status(404).json({ erro: "Agendamento não encontrado" });

    if (agendamento.status === "cancelado") {
      return res.status(400).json({ erro: "Agendamento cancelado não pode ser remarcado" });
    }

    const problema = await validarAgendamento(data, hora);
    if (problema) return res.status(400).json({ erro: problema });

    const conflito = await Agendamento.findOne({
      _id: { $ne: agendamento._id },
      data,
      hora,
      status: { $in: ["confirmado", "concluido"] }
    });

    if (conflito) {
      return res.status(409).json({ erro: "Já existe agendamento nesse horário" });
    }

    const atualizado = await Agendamento.findByIdAndUpdate(
      agendamento._id,
      { data, hora, slot: `${data}T${hora}`, status: "confirmado", remarcadoEm: new Date() },
      { new: true }
    );

    res.json(atualizado);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ erro: "Horário acabou de ser ocupado" });
    }
    res.status(500).json({ erro: err.message });
  }
});

// ---------- RECEBIMENTO ----------
const FORMAS_PAGAMENTO = ["dinheiro", "pix", "debito", "credito", "outro"];
const arredondar = (n) => Math.round(Number(n || 0) * 100) / 100;

app.patch("/api/agendamentos/:id/pagamento", autenticar, async (req, res) => {
  try {
    const agendamento = await Agendamento.findById(req.params.id);
    if (!agendamento) return res.status(404).json({ erro: "Agendamento não encontrado" });

    const total = arredondar(agendamento.servicoPreco);

    const lista = Array.isArray(req.body.pagamentos) ? req.body.pagamentos : [];
    const pagamentos = [];

    for (const item of lista) {
      if (!FORMAS_PAGAMENTO.includes(item.forma)) {
        return res.status(400).json({ erro: "Forma de pagamento inválida" });
      }
      const valor = arredondar(item.valor);
      if (!(valor > 0)) continue;
      pagamentos.push({ forma: item.forma, valor });
    }

    const usarCredito = arredondar(req.body.usarCredito);
    const saldo = await saldoCredito(agendamento.clienteWhatsapp);

    if (usarCredito > 0) {
      if (usarCredito > saldo + 0.001) {
        return res.status(400).json({ erro: `A cliente só tem R$ ${saldo.toFixed(2)} de crédito` });
      }
      if (usarCredito > total + 0.001) {
        return res.status(400).json({ erro: "Crédito maior que o valor do atendimento" });
      }
      pagamentos.push({ forma: "credito_cliente", valor: usarCredito });
    }

    const pago = arredondar(pagamentos.reduce((s, p) => s + p.valor, 0));

    if (pago + 0.01 < total) {
      return res.status(400).json({ erro: `Faltam R$ ${(total - pago).toFixed(2)} para fechar o valor` });
    }

    const troco = arredondar(pago - total);
    const trocoComoCredito = req.body.trocoCredito === true;

    if (troco > 0.01 && !trocoComoCredito) {
      return res.status(400).json({
        erro: `Valor acima do total em R$ ${troco.toFixed(2)}. Marque para deixar como crédito.`
      });
    }

    await Agendamento.updateOne(
      { _id: agendamento._id },
      { pagamentos, pagoEm: new Date() }
    );

    let saldoFinal = saldo;

    if (usarCredito > 0) {
      const uso = await registrarCredito({
        whatsapp: agendamento.clienteWhatsapp,
        valor: usarCredito,
        tipo: "uso",
        motivo: "Pagamento de atendimento",
        data: agendamento.data,
        agendamentoId: agendamento._id
      });
      if (uso.ok) saldoFinal = uso.saldo;
    }

    if (troco > 0.01 && trocoComoCredito) {
      const credito = await registrarCredito({
        whatsapp: agendamento.clienteWhatsapp,
        valor: troco,
        tipo: "credito",
        motivo: "Troco do atendimento",
        data: agendamento.data,
        agendamentoId: agendamento._id
      });
      if (credito.ok) saldoFinal = credito.saldo;
    }

    res.json({
      ok: true,
      pagamentos,
      troco,
      trocoComoCredito: troco > 0.01 && trocoComoCredito,
      saldoCredito: saldoFinal
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Marina confirmou que a cliente não apareceu.
app.patch("/api/agendamentos/:id/falta", autenticar, async (req, res) => {
  try {
    const resultado = await marcarFalta(req.params.id);
    if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });

    const agendamento = resultado.agendamento.toObject
      ? resultado.agendamento.toObject()
      : resultado.agendamento;

    res.json({ ...agendamento, sinalObrigatorio: resultado.cliente?.sinalObrigatorio === true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Atendimento aconteceu: a restrição de sinal cai.
app.patch("/api/agendamentos/:id/compareceu", autenticar, async (req, res) => {
  try {
    const resultado = await registrarComparecimento(req.params.id);
    if (!resultado.ok) return res.status(resultado.status).json({ erro: resultado.erro });

    const agendamento = resultado.agendamento.toObject
      ? resultado.agendamento.toObject()
      : resultado.agendamento;

    res.json({ ...agendamento, sinalObrigatorio: resultado.cliente?.sinalObrigatorio === true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.patch("/api/agendamentos/:id/status", autenticar, async (req, res) => {
  try {
    const { status } = req.body;
    const validos = ["confirmado", "cancelado", "concluido", "nao_compareceu"];

    if (!validos.includes(status)) {
      return res.status(400).json({ erro: "Status inválido" });
    }

    if (status === "cancelado") {
      const r = await registrarCancelamento(req.params.id);
      if (!r.ok) return res.status(r.status).json({ erro: r.erro });
      return res.json({ ...(r.agendamento.toObject?.() || r.agendamento), cancelamentoTardio: r.tardio });
    }

    if (status === "concluido") {
      const r = await registrarComparecimento(req.params.id);
      if (!r.ok) return res.status(r.status).json({ erro: r.erro });
      return res.json(r.agendamento);
    }

    if (status === "nao_compareceu") {
      const r = await marcarFalta(req.params.id);
      if (!r.ok) return res.status(r.status).json({ erro: r.erro });
      return res.json(r.agendamento);
    }

    // Voltar para "confirmado": reocupa o horário.
    const atual = await Agendamento.findById(req.params.id);
    if (!atual) return res.status(404).json({ erro: "Agendamento não encontrado" });

    const ag = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status, slot: `${atual.data}T${atual.hora}` },
      { new: true }
    );
    res.json(ag);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ erro: "Já existe outro agendamento nesse horário." });
    }
    res.status(500).json({ erro: err.message });
  }
});

// ==================== 404 e ERROS ====================
app.use((req, res) => {
  res.status(404).json({ erro: "Rota não encontrada" });
});

app.use((err, req, res, next) => {
  if (err && err.message === "Origem não permitida") {
    return res.status(403).json({ erro: "Origem não permitida" });
  }
  console.error(err);
  res.status(500).json({ erro: "Erro interno" });
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);

  // Lembrete de véspera: só roda quando ativado de propósito.
  // Protege contra disparo acidental quando o bot ainda está em testes.
  if (process.env.LEMBRETES_ATIVOS === "1" && botConfigurado()) {
    iniciarLembretes();
    console.log("🔔 Lembretes ativos (checagem a cada 10 min)");
  } else {
    console.log("🔕 Lembretes desligados (defina LEMBRETES_ATIVOS=1 para ativar)");
  }
});
