# Gestão Escolar

Sistema web para uma professora controlar **notas**, **ocorrências de sala de aula**
e o **fechamento de período** num lugar só — substituindo as várias planilhas.

O diferencial está no fechamento: quando um aluno fica pouco abaixo da média, o
sistema cruza a nota com o histórico de elogios e críticas e **sugere** ajustar ou
manter. A decisão e a justificativa são sempre da professora, e ficam registradas.

## Começando

1. Siga [`docs/SETUP.md`](docs/SETUP.md) para criar o projeto Supabase, aplicar o
   schema e rodar o seed.
2. Crie o `.env.local` a partir de `.env.local.example`.
3. Instale e rode:

```bash
npm install
```

```bash
npm run dev
```

## Comandos

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm test
```

```bash
npm run typecheck
```

## Como está organizado

```
app/(app)/          telas autenticadas: painel, notas, ocorrências, fechamento…
app/login/          autenticação
components/         UI compartilhada (botões, modal, badges, navegação)
lib/domain/         REGRA DE NEGÓCIO — funções puras, cobertas por testes
lib/data/           montagem das telas a partir do banco
lib/actions/        Server Actions (escrita)
lib/supabase/       clientes browser/server e middleware de sessão
supabase/migrations schema versionado
supabase/seed/      dados iniciais
```

O coração do sistema são três arquivos, todos sem I/O e testados:

| Arquivo | Responsabilidade |
|---|---|
| `lib/domain/grading.ts` | médias (aritmética, ponderada, soma de pontos), frequência, situação |
| `lib/domain/conduct.ts` | saldo de conduta e suas faixas |
| `lib/domain/closure-suggestion.ts` | o motor de sugestão do fechamento |

## Regras principais

**Média** — configurável por escola ou por disciplina: valor de aprovação, método
de cálculo, casas decimais, recuperação e frequência mínima. Avaliações com
escalas diferentes são normalizadas antes de entrar na média (um trabalho de 0–5
vale o dobro por ponto de uma prova de 0–10).

**Conduta** — cada ocorrência tem tipo (elogio ou crítica) e severidade de 1 a 3.
O saldo do período é a soma dos elogios menos a das críticas, ponderada pela
severidade. Faixas: `≥ +3` muito positivo, `+1..+2` positivo, `0` neutro,
`−1..−2` atenção, `≤ −3` crítico.

**Sugestão de fechamento**

```
gap = média de aprovação − média calculada

frequência abaixo do mínimo  → sem sugestão (ajustar nota não resolve falta)
gap ≤ 0                      → já aprovado
gap > tolerância (0,5)       → fora da faixa de ajuste
0 < gap ≤ tolerância:
    conduta ≥ limiar         → SUGERIR ajustar
    conduta ≤ −limiar        → SUGERIR manter
    entre os dois            → decisão livre
```

**Auditoria** — `term_closures.calculated_average` nunca é sobrescrita. Um ajuste
grava `final_grade`, `justification`, `decided_by` e `decided_at`. A exigência de
justificativa é uma `CHECK constraint` no banco, não só validação de tela: nem
alterando direto no Postgres dá para ajustar uma nota sem registrar o motivo.

**Período fechado trava lançamento** — um trigger recusa inserir, alterar ou
apagar notas e ocorrências de um período com status `closed`.

## Segurança

Toda tabela tem RLS: você só enxerga as linhas da escola de que é membro
(`school_members`). O protótipo tem uma escola e uma usuária, mas o modelo já
suporta várias professoras compartilhando os mesmos alunos e turmas — o recorte
por professora vem de `class_subjects.teacher_id`.

A chave usada no navegador é a `anon key`, pública por design; quem protege os
dados é o RLS no Postgres. A connection string do banco **não** é usada pela
aplicação e não deve ir para o repositório.
