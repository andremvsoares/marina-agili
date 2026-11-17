# Regras do projeto — Marina Aglli

> Arquivo de memória do projeto. Deve ir para o repositório (`marina-agili`) junto com o código.

## Regra #1 — INViolÁVEL

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

**Deploy também exige aviso**: não toca no WhatsApp dela, mas muda o site que os
clientes estão usando naquele momento.

## Decisões tomadas

| Data | Decisão |
|---|---|
| 2026-11-17 | Manter o número atual com coexistência (requisito da Marina — "questão de honra") |
| 2026-11-17 | Provedor: **Gupshup** — sem mensalidade, US$ 0,0010/mensagem (entrada e saída) + tarifa Meta |
| 2026-11-17 | Custo estimado: ~R$ 4/mês no cenário de 100 agendamentos; carteira pré-paga mínima US$ 10 |
| 2026-11-17 | Bot = front-end conversacional do mesmo backend (fonte única de verdade) |
| 2026-11-17 | Ordem de trabalho: Segurança → Robustez → Marca → Bot → Onboarding |
| 2026-11-17 | Coexistence exige: número no WhatsApp Business App há 3+ meses, sem forma de pagamento vinculada, app 2.24.17+ |

## Estado do projeto (2026-11-17)

- Frontend: `https://marina-agili.vercel.app` (Vercel)
- Backend: `https://marina-agili.onrender.com` (Render free — dorme após 15 min)
- Banco: MongoDB Atlas M0, banco `test`, usuário `marina_app`
- Repo: `github.com/andremvsoares/marina-agili`

## Pendências

### Resolvido em 2026-11-17
- [x] `GET /api/agendamentos` agora exige token (expunha nome + WhatsApp das clientes)
- [x] CORS restrito ao domínio do site; Helmet; limite de corpo e de requisições
- [x] Login com limite de 5 tentativas/15 min e comparação em tempo constante
- [x] Segredos rotacionados: `JWT_SECRET`, `ADMIN_PASS` e usuário do Mongo
      (novo usuário `marina_app`; o antigo foi apagado no Atlas e o `.rar` virou inofensivo)
- [x] Índice único em `slot` (impede site e bot reservarem o mesmo horário)
- [x] Número real do WhatsApp em `frontend/app.js` (5519998985805)
- [x] `manifest.json` e `sw.js` rebatizados de "Studio Belle" para "Marina Aglli"

### Em aberto
- [ ] Render free (dorme após 15 min) → plano pago
- [ ] Atlas M0 sem backup automático
- [ ] Domínio próprio
- [ ] Política de privacidade + opt-in explícito para mensagens
- [ ] Bot do WhatsApp (webhook, sessão, fluxo, handoff)
- [ ] Onboarding no Gupshup (só com autorização explícita do André)
