# Etapa 3 — o que foi feito e o que falta você fazer

Branch: `refatoracao/etapa-3` (6 commits, um por fase).

## ⚠️ Antes de testar: aplique as migrations

**Nada da fase A nem da fase D funciona sem isso.** Eu não tenho acesso
administrativo ao Supabase — a chave do `.env.local` é limitada pelo RLS e não
cria nem altera tabelas.

No painel do Supabase → **SQL Editor → New query**, rode nesta ordem:

1. `supabase/migrations/0004_school_provisioning.sql`
2. `supabase/migrations/0005_historical_import.sql`

As migrations `0001` a `0003` já estão aplicadas (confirmei pelo health check).

### Sobre zerar os dados

Você autorizou apagar tudo. Não fiz, por dois motivos: não tenho acesso para
isso, e **não é necessário** — nenhuma migration desta etapa altera tabela
existente de forma incompatível. A `0004` só adiciona uma função; a `0005`
adiciona outra e substitui um trigger por uma versão que aceita a exceção da
importação. Os dados atuais continuam válidos.

Se ainda quiser começar do zero, rode `0001_initial_schema.sql` num projeto
novo e depois as demais na ordem.

---

## O que mudou, por fase

| Fase | Entrega |
|---|---|
| **A** | Ambientes multi-escola: seletor na navegação, criação self-service, primeiro acesso |
| **B** | Recuperação de senha ponta a ponta |
| **C** | Histórico de conduta com evidências datadas (a dor original) |
| **D** | Importação de alunos, notas e frequência por planilha |
| **E** | Correção de 5 inconsistências do protótipo |
| **F** | Responsividade das telas densas |

### A — Ambientes
- `getAppContext` resolve a escola atual por cookie, não mais `.limit(1)`.
- Seletor no topo da navegação; nova área **Configurações → Ambientes**.
- Criar escola passa por `create_school_with_owner()` — `schools` não tem policy
  de INSERT, e abrir uma deixaria qualquer usuário se auto-vincular a qualquer
  escola existente.
- O aviso "rode o seed" virou redirecionamento para `/comecar`.

### B — Senha
- `/login/recuperar` e `/login/redefinir`, com link na tela de login.
- Trata os dois formatos de link que o Supabase pode mandar (`?code=` e `#token`).
- No painel, confira **Authentication → URL Configuration → Redirect URLs**:
  os curingas `http://localhost:3000/**` e o da Vercel já cobrem.

### C — Histórico de conduta
- Novo tipo de relatório em **Relatórios → Histórico do aluno**, e botão na
  ficha do aluno.
- Linha do tempo por período com data, categoria, peso e o que você escreveu;
  fechamentos ajustados aparecem com a justificativa registrada.
- Feito para imprimir e entregar numa reunião de pais (tem área de assinatura).
- Correção que apareceu ao ver pronto: elogio não é mais rotulado como
  "Grave" — passou a usar Simples/Relevante/Destaque.

### D — Importação
Fluxo em **Importar dados**: baixar modelo → preencher → enviar → conferir
prévia → confirmar.
- O modelo `.xlsx` vem com suas turmas, disciplinas e períodos em lista suspensa.
- Nada é gravado antes da sua confirmação; erros vêm com aba, linha e coluna.
- Um erro em qualquer linha barra tudo — importar "quase tudo" é pior.
- Importa em período já fechado, por uma exceção controlada (migration 0005).

### E — Correções
1. Boletim e Fechamento anual mostravam **médias anuais diferentes** para o
   mesmo aluno. Regra unificada em `annualAverage()`, no domínio.
2. Boletim ignorava configuração de nota **por disciplina**.
3. Boletim ignorava **frequência** na situação (coluna Freq. adicionada).
4. `renameTerm` existia sem tela; virou `updateTerm`, exposto em Períodos.
5. **Excluir turma/disciplina apagava o ano inteiro em cascata** com só um
   `confirm()` de defesa. Agora conta as dependências e recusa.

### F — Mobile
- Coluna de nome fixa na grade de frequência (a de notas já tinha).
- Tabelas largas rolam dentro da própria caixa, não arrastando a página.

---

## O que eu NÃO consegui verificar

Testei o que dá sem sessão: **83 testes** passando, `typecheck` limpo, build de
produção OK, telas públicas conferidas no navegador (incluindo link expirado de
recuperação e viewport de 375px).

Não entrei no app — senha é coisa que eu não uso, mesmo autorizado. Então estas
telas **precisam do seu olho**:

- [ ] Seletor de ambiente troca de escola e volta para o Painel
- [ ] Criar escola nova leva ao cadastro do ano letivo
- [ ] Recuperação de senha ponta a ponta (pedir → e-mail → nova senha → entrar)
- [ ] Histórico de conduta de um aluno com ocorrências reais, impresso em PDF
- [ ] Importação com uma planilha de verdade sua, num período fechado
- [ ] Boletim e Fechamento anual mostrando **a mesma média** para o mesmo aluno
- [ ] Tentar excluir uma turma com alunos — deve recusar explicando
- [ ] Notas e Frequência no celular

## Rodar

```bash
npm run dev
```

```bash
npm test
```
