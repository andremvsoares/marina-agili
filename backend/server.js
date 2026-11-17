import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import Servico from "./models/Servico.js";
import Agendamento from "./models/Agendamento.js";
import adminRoutes, { autenticar } from "./routes/admin.js";
import whatsappRoutes from "./routes/whatsapp.js";
import clientesRoutes from "./routes/clientes.js";
import {
  marcarFalta,
  registrarComparecimento,
  registrarCancelamento
} from "./services/clientes.js";
import {
  criarAgendamento,
  horariosDisponiveis,
  HORARIOS_FIXOS
} from "./services/booking.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");

// ==================== SEGURANÇA ====================
app.use(helmet({ contentSecurityPolicy: false }));

const ORIGENS_PERMITIDAS = (
  process.env.CORS_ORIGINS || "https://marina-agili.vercel.app"
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
  if (!hora || !HORARIOS_FIXOS.includes(hora)) return "Horário inválido";
  if (observacoes && String(observacoes).length > MAX_OBS) {
    return `Observações devem ter no máximo ${MAX_OBS} caracteres`;
  }
  return null;
}

// ==================== ROTAS ====================

app.get("/", (req, res) => {
  res.json({ ok: true, mensagem: "API Marina Aglli funcionando ✨" });
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

app.post("/api/servicos", autenticar, async (req, res) => {
  try {
    const { nome, preco, duracao } = req.body;
    if (!nome || preco === undefined) {
      return res.status(400).json({ erro: "Nome e preço são obrigatórios" });
    }
    if (typeof preco !== "number" || preco < 0) {
      return res.status(400).json({ erro: "Preço inválido" });
    }
    const servico = await Servico.create({ nome, preco, duracao });
    res.status(201).json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/api/servicos/:id", autenticar, async (req, res) => {
  try {
    const servico = await Servico.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete("/api/servicos/:id", autenticar, async (req, res) => {
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
      consentimento: req.body.consentimento === true
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
});
