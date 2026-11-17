# Regras do projeto — Marina Aglli

> Arquivo de memória do projeto. Deve ir para o repositório (`marina-agili`) junto com o código.

## Regra #1 — INViolável

**Qualquer ação que possa afetar o WhatsApp da Marina exige aviso prévio e aprovação explícita do André ANTES de prosseguir.**

Vale para: onboarding no Gupshup, coexistência, re-registro do número, troca de BSP,
migração de WABA, alteração de perfil comercial, Meta Verified, e qualquer operação
que toque na conta dela.

Motivo: ela atende clientes pelo número. Transtorno = perda de agendamento = prejuízo real.

Operações que **não** tocam no WhatsApp dela (podem seguir sem aviso):
- alterar o número no `frontend/app.js` (é só texto para montar link `wa.me`)
- correções de segurança no backend
- bot rodando com número de teste da Meta
- alterações de código que não são deployadas

## Decisões tomadas

| Data | Decisão |
|---|---|
| 2026-11-17 | Manter o número atual com coexistência (requisito da Marina — "questão de honra") |
| 2026-11-17 | Provedor: **Gupshup** — sem mensalidade, US$ 0,0010/mensagem (entrada e saída) + tarifa Meta |
| 2026-11-17 | Custo estimado: ~R$ 4/mês no cenário de 100 agendamentos; carteira pré-paga mínima US$ 10 |
| 2026-11-17 | Bot = front-end conversacional do mesmo backend (fonte única de verdade) |
| 2026-11-17 | Ordem de trabalho: Segurança → Robustez → Marca → Bot → Onboarding |

## Estado do projeto (2026-11-17)

- Frontend: `https://marina-agili.vercel.app` (Vercel)
- Backend: `https://marina-agili.onrender.com` (Render free — dorme após 15 min)
- Banco: MongoDB Atlas M0 (sem backup automático)
- Repo: `github.com/andremvsoares/marina-agili` — 2 commits, limpo

## Pendências críticas

1. `GET /api/agendamentos` público — expõe nome + WhatsApp de todas as clientes (LGPD)
2. CORS `*`
3. Login sem rate limit; segredos vazados no `.rar` (Mongo, admin, JWT) — **rotacionar**
4. `manifest.json` e `sw.js` ainda dizem "Studio Belle"
5. Número do WhatsApp = placeholder `5511999999999`
6. Sem índice único de horário (corrida app × bot)
7. Render free + Atlas M0 sem backup
