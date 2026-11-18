# Regras do projeto — Marina Agili

> Arquivo de memória do projeto. Deve ir para o repositório (`marina-agili`) junto com o código.

## Regra #1 — INVIOLÁVEL

**Qualquer ação que possa afetar o WhatsApp da Marina exige aviso prévio e aprovação explícita do André ANTES de prosseguir.**

Vale para: onboarding no Gupshup, coexistência, re-registro do número, troca de BSP,
migração de WABA, alteração de perfil comercial, Meta Verified, e qualquer operação
que toque na conta dela.

Motivo: ela atende clientes pelo número. Transtorno = perda de agendamento = prejuízo real.

Operações que **não** tocam no WhatsApp dela:
- alterar o número no `frontend/app.js`
- correções de segurança no backend
- bot rodando em modo simulado ou com número de teste da Meta
- alterações de código que não são deployadas

**Deploy também exige aviso**: não toca no WhatsApp dela, mas muda o site que os
clientes estão usando naquele momento.

## Decisões tomadas

| Data | Decisão |
|---|---|
| 2026-11-17 | Manter o número atual com coexistência (requisito da Marina) |
| 2026-11-17 | Provedor: **Gupshup** — sem mensalidade, US$ 0,0010/mensagem (entrada e saída) + tarifa Meta |
| 2026-11-17 | Custo estimado: ~R$ 4/mês no cenário de 100 agendamentos; carteira pré-paga mínima US$ 10 |
| 2026-11-17 | Bot = front-end conversacional do mesmo backend (fonte única: `services/booking.js`) |
| 2026-11-17 | Ordem de trabalho: Segurança → Robustez → Marca → Bot → Onboarding |
| 2026-11-17 | **Reserva paga: Pix automático via gateway**, Mercado Pago preferido (0,49%–0,99%); alternativa Asaas (R$ 1,99/transação). Pix manual descartado por exigir confirmação humana a cada reserva |
| 2026-11-17 | Pagamento deve ser **abstraído atrás de um adaptador** para permitir trocar de gateway sem reescrever o fluxo |
| 2026-11-17 | **Sinal de 20% só para quem falta**: a Marina marca "não veio" no painel; a cliente passa a precisar de sinal; ao comparecer, a restrição cai sozinha; nova falta religa |
| 2026-11-17 | **Cancelamento com menos de 3 horas** de antecedência conta como problema e também liga o sinal |
| 2026-11-17 | Sinal de 20% é **abatido do valor do serviço** (não é taxa perdida) |
| 2026-11-17 | **Lembrete na manhã do atendimento** (template de utilidade). Exceção: horários antes das 14h recebem na véspera às 18h, para o "Cancelar" não cair dentro da regra das 3h e punir a cliente |
| 2026-11-17 | Coexistence exige: número no WhatsApp Business App há 3+ meses, sem forma de pagamento vinculada, app 2.24.17+ |

## Arquitetura

```
Site (Vercel) ─┐
               ├─► services/booking.js ─► MongoDB
Bot WhatsApp ──┘        (regras únicas)
```

- `backend/services/booking.js` — regras de agendamento (site e bot)
- `backend/services/whatsapp.js` — envio pela Cloud API (modo simulado sem token)
- `backend/services/sessao.js` — estado da conversa por telefone (Mongo, ou memória no simulado)
- `backend/routes/whatsapp.js` — webhook + fluxo conversacional
- `backend/models/Conversa.js` — sessão persistida
- **`backend/textos.js` — TODAS as mensagens do bot** (editar aqui, só texto, sem lógica)
- `backend/services/agenda.js` — horário de funcionamento, bloqueios e disponibilidade
- `backend/services/clientes.js` — falta, cancelamento tardio (<3h), sinal obrigatório
- `backend/services/custos.js` — custo de material por serviço (ficha técnica)
- `backend/routes/relatorios.js` — faturamento, custo, margem, faltas, ocupação e CSV

## Papéis de acesso

| Papel | Pode |
|---|---|
| **dono** | tudo: serviços, produtos, relatórios, horários, bloqueios, usuários |
| **equipe** | agenda e marcação de presença/falta |

Login de emergência pelas variáveis `ADMIN_USER`/`ADMIN_PASS` continua valendo (papel dono).

## Como testar o bot sem número real

```bash
# terminal 1
cd backend
BOT_DRY_RUN=1 PORT=4127 node server.js

# terminal 2
node scripts/simular-conversa.mjs http://127.0.0.1:4127   # fluxo completo
node scripts/simular-casos.mjs   http://127.0.0.1:4127   # bordas + handoff
```

No modo simulado nada é enviado e **nada é gravado no banco**.

## Estado do projeto (2026-11-17)

- Frontend: `https://marina-agili.vercel.app` (Vercel)
- Backend: `https://marina-agili.onrender.com` (Render free — dorme após 15 min)
- Banco: MongoDB Atlas M0, banco `test`, usuário `marina_app`
- Repo: `github.com/andremvsoares/marina-agili`

## Pendências

### Resolvido
- [x] `GET /api/agendamentos` exige token (expunha nome + WhatsApp das clientes)
- [x] CORS restrito; Helmet; limites de corpo e de requisições
- [x] Login com limite de 5 tentativas/15 min e comparação em tempo constante
- [x] Segredos rotacionados (`JWT_SECRET`, `ADMIN_PASS`, usuário do Mongo)
- [x] Índice único em `slot` (site e bot não reservam o mesmo horário)
- [x] Número real do WhatsApp em `frontend/app.js` (5519998985805)
- [x] `manifest.json` e `sw.js` rebatizados de "Studio Belle" para "Marina Agili"
- [x] Backup diário criptografado no GitHub Actions (90 dias) + `restore.mjs` testado
- [x] Monitor da API a cada 15 min (e-mail em caso de falha)
- [x] Política de privacidade + consentimento gravado no agendamento
- [x] Bot do WhatsApp (webhook, sessão, fluxo, handoff) — testado em modo simulado
- [x] **Ficha da cliente**: histórico de faltas, cancelamento tardio (<3h), sinal obrigatório,
      endpoints `/api/clientes` e botões "Compareceu"/"Não veio" no painel — 16 testes passando
- [x] Textos do bot centralizados em `backend/textos.js`
- [x] **Painel de gestão**: agenda do dia, bloqueio de horário/dia, horário de funcionamento
      configurável, antecedência mínima, usuários com papéis (dono/equipe)
- [x] **Produtos e ficha técnica**: custo por unidade, consumo por serviço, custo real do atendimento
- [x] **Relatórios**: faturamento, custo de material, margem, ticket médio, faltas, ocupação,
      gráficos (Chart.js) e exportação CSV
- [x] **Remarcar agendamento** e **ficha da cliente** no painel

### Em aberto
- [ ] Render free (dorme após 15 min) → plano pago
- [ ] Domínio próprio (`marinagili.com.br` está livre)
- [ ] Número de teste da Meta → trocar do modo simulado para o real
- [ ] Onboarding no Gupshup (só com autorização explícita do André)
