import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import Servico from "./models/Servico.js";
import Cliente from "./models/Cliente.js";
import Agendamento from "./models/Agendamento.js";
import adminRoutes, { autenticar } from "./routes/admin.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");

// ==================== SEGURANÇA ====================
// Headers de segurança. CSP desligada: esta API só devolve JSON.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS restrito: só o site oficial e ambientes locais de desenvolvimento.
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
      // Sem Origin = requisição de servidor (curl, webhook). Não é browser.
      if (!origem) return callback(null, true);
      if (ORIGENS_PERMITIDAS.includes(origem) || ORIGEM_LOCAL.test(origem)) {
        return callback(null, true);
      }
      return callback(new Error("Origem não permitida"));
    }
  })
);

// Limite de tamanho do corpo: nada de payload gigante.
app.use(express.json({ limit: "10kb" }));

// Limite geral por IP (evita varredura e força bruta distribuída).
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { erro: "Muitas requisições. Aguarde um minuto." }
  })
);

// Limite específico para criação de agendamento (evita spam de reservas).
const limiteAgendamento = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas de agendamento. Aguarde um minuto." }
});

app.use("/api/admin", adminRoutes);

// ==================== CONEXÃO COM MONGODB ====================
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅ MongoDB conectado com sucesso");
    // Garante que o índice único de horário exista (blinda app × bot).
    // Falha aqui não pode derrubar a API: só avisa no log.
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

// ==================== HORÁRIOS DISPONÍVEIS ====================
const HORARIOS_FIXOS = [
  "09:00", "10:00", "11:00",
  "14:00", "15:00", "16:00", "17:00", "18:00"
];

// ==================== VALIDAÇÃO ====================
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_WHATSAPP = /^\d{10,13}$/;
const MAX_NOME = 80;
const MAX_OBS = 300;

function validarCriacaoAgendamento(body) {
  const { clienteNome, clienteWhatsapp, servicoId, data, hora, observacoes } = body;

  if (!clienteNome || typeof clienteNome !== "string") {
    return "Nome é obrigatório";
  }
  if (clienteNome.trim().length < 2 || clienteNome.trim().length > MAX_NOME) {
    return `Nome deve ter entre 2 e ${MAX_NOME} caracteres`;
  }
  if (!clienteWhatsapp || typeof clienteWhatsapp !== "string") {
    return "WhatsApp é obrigatório";
  }
  if (!RE_WHATSAPP.test(clienteWhatsapp.replace(/\D/g, ""))) {
    return "WhatsApp inválido";
  }
  if (!servicoId || !mongoose.Types.ObjectId.isValid(servicoId)) {
    return "Serviço inválido";
  }
  if (!data || !RE_DATA.test(data)) {
    return "Data inválida";
  }
  if (!hora || !HORARIOS_FIXOS.includes(hora)) {
    return "Horário inválido";
  }
  if (observacoes && String(observacoes).length > MAX_OBS) {
    return `Observações devem ter no máximo ${MAX_OBS} caracteres`;
  }
  return null;
}

// Chave única do horário.
const montarSlot = (data, hora) => `${data}T${hora}`;

// ==================== ROTAS ====================

// Rota de teste
app.get("/", (req, res) => {
  res.json({ ok: true, mensagem: "API Marina Aglli funcionando ✨" });
});

// ---------- SERVIÇOS ----------

// Listar serviços ativos
app.get("/api/servicos", async (req, res) => {
  try {
    const servicos = await Servico.find({ ativo: true }).sort({ nome: 1 });
    res.json(servicos);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Criar serviço (admin)
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

// Editar serviço
app.put("/api/servicos/:id", autenticar, async (req, res) => {
  try {
    const servico = await Servico.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(servico);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Desativar serviço (soft delete)
app.delete("/api/servicos/:id", autenticar, async (req, res) => {
  try {
    await Servico.findByIdAndUpdate(req.params.id, { ativo: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- HORÁRIOS ----------

// Listar horários disponíveis numa data
app.get("/api/horarios/:data", async (req, res) => {
  try {
    const { data } = req.params;
    if (!RE_DATA.test(data)) {
      return res.status(400).json({ erro: "Data inválida" });
    }

    const ocupados = await Agendamento.find({
      data,
      status: { $in: ["confirmado", "concluido"] }
    }).select("hora -_id");

    const ocupadosSet = new Set(ocupados.map((a) => a.hora));
    const disponiveis = HORARIOS_FIXOS.map((h) => ({
      hora: h,
      disponivel: !ocupadosSet.has(h)
    }));

    res.json(disponiveis);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ---------- AGENDAMENTOS ----------

// Criar agendamento
app.post("/api/agendamentos", limiteAgendamento, async (req, res) => {
  try {
    const erro = validarCriacaoAgendamento(req.body);
    if (erro) return res.status(400).json({ erro });

    const { clienteNome, clienteWhatsapp, servicoId, data, hora, observacoes } = req.body;
    const whatsappLimpo = clienteWhatsapp.replace(/\D/g, "");

    // Buscar serviço
    const servico = await Servico.findById(servicoId);
    if (!servico || !servico.ativo) {
      return res.status(404).json({ erro: "Serviço não encontrado" });
    }

    // Verificar conflito (mensagem amigável antes de tentar gravar)
    const conflito = await Agendamento.findOne({
      data,
      hora,
      status: { $in: ["confirmado", "concluido"] }
    });
    if (conflito) {
      return res.status(409).json({ erro: "Esse horário já foi agendado. Escolha outro." });
    }

    // Criar agendamento. O índice único em `slot` é a garantia final:
    // se dois canais (site e WhatsApp) tentarem o mesmo horário juntos,
    // o Mongo recusa o segundo com E11000.
    const agendamento = await Agendamento.create({
      clienteNome: clienteNome.trim(),
      clienteWhatsapp: whatsappLimpo,
      servicoId: servico._id,
      servicoNome: servico.nome,
      servicoPreco: servico.preco,
      data,
      hora,
      slot: montarSlot(data, hora),
      observacoes: observacoes ? String(observacoes).slice(0, MAX_OBS) : ""
    });

    // Salvar/atualizar cliente
    await Cliente.findOneAndUpdate(
      { whatsapp: whatsappLimpo },
      { nome: clienteNome.trim() },
      { upsert: true, new: true }
    );

    res.status(201).json(agendamento);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ erro: "Esse horário acabou de ser reservado. Escolha outro." });
    }
    res.status(500).json({ erro: err.message });
  }
});

// Listar agendamentos (protegido: contém dados pessoais das clientes)
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

// Cancelar agendamento
app.patch("/api/agendamentos/:id/cancelar", autenticar, async (req, res) => {
  try {
    // $unset remove o slot: libera o horário para outra cliente.
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status: "cancelado", $unset: { slot: 1 } },
      { new: true }
    );
    if (!agendamento) return res.status(404).json({ erro: "Agendamento não encontrado" });
    res.json(agendamento);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Atualizar status
app.patch("/api/agendamentos/:id/status", autenticar, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["confirmado", "cancelado", "concluido"].includes(status)) {
      return res.status(400).json({ erro: "Status inválido" });
    }

    const atual = await Agendamento.findById(req.params.id);
    if (!atual) return res.status(404).json({ erro: "Agendamento não encontrado" });

    // Cancelado libera o horário; confirmado/concluído volta a ocupar.
    const atualizacao =
      status === "cancelado"
        ? { status, $unset: { slot: 1 } }
        : { status, slot: montarSlot(atual.data, atual.hora) };

    const ag = await Agendamento.findByIdAndUpdate(req.params.id, atualizacao, { new: true });
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
