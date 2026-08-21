# Super-prompt de refatoração — Gestão Escolar

> Cole o conteúdo abaixo (dentro do bloco de código) numa sessão do Claude Code
> apontada para este repositório.

```
Este é o pedido de evolução do protótipo "Gestão Escolar" (Next.js 15 App
Router + Supabase), saindo de MVP de demonstração para uma versão que a
professora usa de verdade.

LIBERDADE TOTAL SOBRE O CÓDIGO EXISTENTE: o repositório atual é só uma
referência de requisitos e de uma abordagem que já foi validada com a
usuária final — NÃO é uma base que precisa ser preservada ou emendada aos
poucos. Você pode reescrever o projeto inteiro do zero (estrutura de
pastas, schema do banco, componentes, e até as regras de negócio abaixo)
se isso levar a um resultado melhor ou mais simples de manter. A única
restrição é a stack: continue em Next.js + Supabase. Tudo o resto —
arquitetura, padrões de código, organização de arquivos — fica a seu
critério. O que precisa ser entregue é o COMPORTAMENTO descrito abaixo,
não uma cópia do protótipo.

REGRAS DE NEGÓCIO — o que precisa funcionar (o protótipo é a referência de
como isso foi implementado e validado com a professora; reaproveite o
código se fizer sentido, ou reimplemente do seu jeito — o que importa é
o comportamento):
- Cálculo de média por aluno/disciplina/período, com métodos configuráveis
  (aritmética simples, ponderada por peso de avaliação, soma de pontos),
  normalização entre avaliações de escalas diferentes (ex. trabalho 0–5
  convertido pra mesma base de uma prova 0–10), casas decimais
  configuráveis, e recuperação (nota final = nota da recuperação, ou média
  entre as duas, dependendo da configuração). Referência: `lib/domain/grading.ts`.
- Saldo de conduta por aluno/período: cada ocorrência (elogio ou crítica)
  tem uma severidade de 1 a 3; o saldo é a soma dos elogios menos a das
  críticas, ponderada pela severidade; o saldo se traduz em faixas (muito
  positivo / positivo / neutro / atenção / crítico). Referência:
  `lib/domain/conduct.ts`.
- Motor de sugestão do fechamento de período — o coração do produto: quando
  a nota calculada do aluno fica perto (mas abaixo) da média de aprovação,
  o sistema cruza a distância até a média ("gap"), uma tolerância
  configurável, a frequência mínima e o saldo de conduta para sugerir
  "ajustar", "manter" ou "decisão livre" — nunca decide sozinho. Frequência
  abaixo do mínimo bloqueia qualquer sugestão de ajuste (falta não se
  resolve arredondando nota). Referência: `lib/domain/closure-suggestion.ts`.
- Auditoria não-negociável: a nota calculada nunca pode ser sobrescrita —
  um ajuste manual precisa registrar a nota final, quem decidiu, quando, e
  uma justificativa com tamanho mínimo, e essa exigência de justificativa
  precisa ser garantida pelo próprio banco (constraint), não só por
  validação de tela — para não dar pra burlar nem escrevendo direto no
  Postgres.
- Período fechado trava novo lançamento de nota/ocorrência (exceto pela
  importação de dados históricos da Fase D, que é uma exceção controlada e
  documentada, não uma brecha geral).

Se você decidir que alguma dessas regras merece ser desenhada de outro
jeito, tudo bem — só documente a decisão e o motivo, já que isso é o que a
professora já usa e entende hoje.

PADRÕES DE CÓDIGO — os pontos abaixo descrevem o que funcionou bem no
protótipo e podem servir de ponto de partida, mas não são obrigatórios se
você optar por uma reescrita:
- Separação entre regra de negócio pura e testável (equivalente a
  lib/domain/*), montagem de dados de tela (equivalente a lib/data/*) e
  escrita via Server Actions (equivalente a lib/actions/*) — evita
  duplicar lógica de negócio espalhada pela UI.
- RLS por escola em toda tabela (um usuário só enxerga linhas da escola de
  que é membro) — isso é requisito de segurança, não só um padrão de
  código; mantenha independente da arquitetura escolhida.
- Migrations versionadas para o schema do banco.

NAVEGAÇÃO — não é necessário manter uma sidebar com todas as funções como
itens de primeiro nível (como no protótipo). Conforme as fases abaixo
adicionarem área nova (ambientes, importação, relatório de conduta com
evidências), fique à vontade para criar sub-telas/seções aninhadas com
responsabilidade única em vez de espremer tudo na mesma lista plana — por
exemplo, agrupar "Ambientes"/"Nova escola" e futuras configurações sob uma
área de "Configurações", ou dar à importação sua própria seção com
sub-passos (template → upload → prévia → confirmação). Use julgamento: o
critério é cada tela ter uma responsabilidade clara, não minimizar o
número de rotas.

================================================================================
FASE A — Ambientes multi-escola (school switcher + criação self-service)
================================================================================

Contexto do modelo atual: `schools` já é o limite de tenant e `school_members`
já permite um usuário pertencer a várias escolas (unique school_id+user_id).
O que falta é inteiramente de UI/fluxo:

1. `lib/data/context.ts:getAppContext` hoje escolhe a escola do usuário com
   `.limit(1)` — sempre a primeira. Introduza o conceito de "escola atual":
   - Guarde a escola selecionada num cookie (ex. `current_school_id`), não em
     querystring (precisa persistir entre navegações e ser lido no server
     component de layout).
   - `getAppContext` deve: ler o cookie; se a escola não existir mais entre as
     memberships do usuário (ou não houver cookie), cair para a primeira
     escola por ordem de criação; expor também a LISTA de escolas do usuário
     (id, nome, papel) para alimentar o seletor.
   - Trate o caso de um usuário com ZERO escolas (hoje isso mostra um aviso
     pedindo para rodar o seed manualmente — esse caso vai sumir na prática
     porque a criação de ambiente passa a ser self-service, mas mantenha um
     fallback amigável, ex. redirecionar direto para o fluxo de criação de
     ambiente da Fase A.3).

2. Seletor de ambiente no `components/app-nav.tsx` (ou local equivalente):
   dropdown com o nome da escola atual, lista das demais escolas do usuário,
   e ação "Trocar" que grava o cookie e recarrega o contexto. Precisa
   funcionar bem em mobile (ver Fase F).

3. Fluxo "Nova escola" — tela/modal onde o usuário:
   - Informa o nome da escola (e opcionalmente fuso horário, mas
     'America/Sao_Paulo' como padrão já resolve o caso real).
   - Ao confirmar: cria a linha em `schools`, cria `school_members` com
     `role='teacher'` para o usuário atual (ela é dona do ambiente que criou;
     avalie se o primeiro membro de uma escola deveria ser `role='admin'` em
     vez de `teacher`, já que é ela quem vai gerenciar o ambiente — decida
     por consistência com o enum `member_role` existente), define esse novo
     `school_id` como escola atual (grava o cookie) e redireciona para o
     fluxo de criação do primeiro ano letivo (a tela /periodos já tem esse
     fluxo pronto — reaproveite, não recrie).
   - Essa ação é uma Server Action nova em lib/actions/registry.ts ou um
     arquivo lib/actions/schools.ts dedicado.

4. Não é necessário nesta fase: convite de outras professoras por e-mail,
   tela de administração de membros, papéis de coordenação. Construa o
   fluxo de forma que adicionar isso depois seja trivial (a tabela e RLS já
   suportam), mas não construa a UI de convite agora.

================================================================================
FASE B — Recuperação de senha
================================================================================

Hoje app/login/page.tsx só faz signInWithPassword, sem link de "esqueci minha
senha". Adicione o fluxo padrão do Supabase Auth:

1. Link "Esqueci minha senha" na tela de login, levando a uma tela nova
   (ex. app/login/recuperar/page.tsx) que pede o e-mail e chama
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: ... })`.
2. Uma rota de callback (ex. app/login/redefinir/page.tsx) que trata o
   retorno do link de recuperação enviado por e-mail e permite definir a
   nova senha via `supabase.auth.updateUser({ password })`.
3. Configuração de Redirect URLs no Supabase (documentar em docs/SETUP.md,
   já existe uma seção parecida para login — siga o mesmo padrão de
   instrução objetiva).
4. Mensagens de erro amigáveis em português, seguindo o padrão já usado em
   app/login/page.tsx (traduzir "Invalid login credentials", etc.).

Não é necessário nesta fase: cadastro (sign up) livre nem convite por e-mail
— contas continuam sendo criadas manualmente por enquanto.

================================================================================
FASE C — Relatório de conduta com evidências (histórico datado para os pais)
================================================================================

Esta é a dor original que motivou o projeto inteiro: comportamento é
interpretação humana da professora, não uma métrica como nota de prova, e
hoje não existe como documentar isso com evidência ao longo do tempo. O
saldo de conduta (lib/domain/conduct.ts) já é calculado corretamente — o que
falta é a APRESENTAÇÃO em forma de evidência, não um número isolado.

1. Crie uma nova visão de relatório por aluno (pode ser um terceiro `tipo`
   em app/(app)/relatorios/controls.tsx, ex. "Histórico de conduta", ao lado
   de "Boletim" e "Relatório de conduta" — ou substitua/expanda o atual
   `conduct-report.tsx`; decida pelo que ficar mais natural na navegação já
   existente). Quando um aluno específico é selecionado no filtro já
   existente (`?aluno=`), mostrar:
   - Linha do tempo cronológica de TODAS as ocorrências do aluno no período
     (ou ano, dependendo do filtro), com data, tipo (elogio/crítica),
     categoria, severidade e a descrição escrita pela professora — isso é a
     "prova com data" que faltava.
   - Resumo no topo: saldo total, contagem de elogios x críticas, faixa de
     conduta (reaproveitar `CONDUCT_BAND_LABEL`).
   - Se o aluno teve fechamento de período com nota ajustada
     (`term_closures.was_adjusted`), destaque isso na linha do tempo com a
     `justification` registrada — é literalmente a evidência formal de por
     que a decisão foi tomada, e reforça pros pais que a nota não foi um
     favor arbitrário.
   - Deve ficar bom impresso/PDF (reaproveitar a classe `print-sheet` e o
     botão "Imprimir / PDF" já existentes em controls.tsx), pensando no caso
     de uso real: a professora entrega isso numa reunião de pais impresso.

2. Quando NENHUM aluno específico está selecionado (visão da turma toda),
   mantenha uma versão resumida tipo ranking (como já existe hoje), mas
   adicione um indicador de "tem ocorrências recentes sem conversa
   registrada" ou similar — avalie se isso é útil, não é obrigatório.

3. Esse relatório também deve funcionar bem a partir da ficha do aluno
   (app/(app)/alunos/[id]/page.tsx), que já lista as últimas 100 ocorrências
   — considere linkar direto para essa visão de evidência em vez de duplicar
   a lógica de exibição.

================================================================================
FASE D — Importação de dados históricos (alunos, notas, frequência)
================================================================================

Esta é a funcionalidade mais importante da rodada. Hoje só existe
`importStudents` (lib/actions/registry.ts), que aceita texto colado
linha a linha, só para cadastro básico de aluno. É insuficiente: a professora
precisa trazer notas e frequência de bimestres já registrados nas planilhas
dela.

Abordagem recomendada — MODELO FIXO DE PLANILHA, não mapeamento livre de
colunas. É mais simples de construir, testar e validar, e evita importar
dado errado por ambiguidade de coluna:

1. **Template para download**: gere um arquivo .xlsx (ou .csv, decida pelo
   que for mais simples de implementar sem dependências pesadas — avalie uma
   lib leve de geração de xlsx compatível com o runtime do Next.js/Vercel)
   com uma estrutura fixa e auto-explicativa, por exemplo uma aba/seção por
   tipo de dado:
   - Alunos: nome, matrícula, data de nascimento, responsável, contato.
   - Notas: identificação do aluno (matrícula ou nome), disciplina, período
     (bimestre/trimestre), nome da avaliação, peso, nota máxima, nota obtida
     (ou "falta").
   - Frequência: identificação do aluno, disciplina, período, aulas dadas,
     faltas.
   O template deve ser gerado a partir das disciplinas/turmas/períodos JÁ
   CADASTRADOS no ambiente atual (turma e período aparecerem como valores
   sugeridos/validados), para reduzir erro de digitação.

2. **Tela de importação** (nova, ex. app/(app)/importar/page.tsx):
   - Upload do arquivo preenchido.
   - Parse no servidor (Server Action), validação linha a linha ANTES de
     gravar qualquer coisa: aluno existe (por matrícula/nome, com aviso de
     ambiguidade se houver nomes duplicados), disciplina/turma/período
     existem, nota dentro da escala, período existe. Nada é escrito no banco
     se houver erro bloqueante — mostre uma prévia com "X linhas prontas para
     importar / Y linhas com erro" e o detalhe de cada erro (linha, campo,
     motivo) para ela corrigir a planilha e tentar de novo.
   - Confirmação explícita antes de gravar (ela vê o resumo: quantos alunos
     novos, quantas notas, quantas linhas de frequência).
   - Alunos que não existem ainda são criados junto (reaproveite a lógica de
     lib/actions/registry.ts:saveStudent), não precisa de dois passos
     separados.

3. **Ponto técnico importante — período fechado trava lançamento**: o
   trigger `assert_term_open` (ver 0001_initial_schema.sql) recusa
   insert/update em `grades` e `occurrences` quando o período está `closed`.
   Isso é uma proteção correta para uso normal, mas a importação histórica
   PRECISA gravar em períodos que provavelmente já estão fechados (são dados
   do passado). Resolva isso sem enfraquecer a proteção para o uso comum:
   - Opção recomendada: crie uma nova migration com uma função
     `import_historical_grade(...)` (ou equivalente) `SECURITY DEFINER`,
     chamada só pela Server Action de importação, que grava diretamente
     ignorando o trigger de período aberto (ou usa
     `set_config('app.importing', 'true', true)` numa transação e ajusta o
     trigger para checar essa flag de sessão antes de bloquear). Documente
     claramente por que essa exceção existe, para não virar brecha de
     segurança — ela só deve ser alcançável pela Server Action de
     importação, nunca por escrita direta de UI.
   - Frequência histórica grava direto em `term_attendance` (não tem o
     mesmo trigger, mas confirme).
   - Depois de importado, os valores entram como se tivessem sido lançados
     normalmente — sem marca especial de "importado", a menos que você ache
     útil para auditoria (avalie: um campo/log de importação pode ajudar a
     rastrear no futuro se algo vier errado. Se adicionar, não é
     obrigatório expor na UI agora).

4. Trate explicitamente: aluno duplicado (nome igual, matrícula diferente ou
   ausente), planilha com abas fora de ordem, linhas vazias, encoding de
   acentuação. A prévia de erros da importação (ponto 2) é o que evita que
   isso vire dado sujo no banco.

================================================================================
FASE E — Correções de inconsistências encontradas no protótipo
================================================================================

Estas são lições já aprendidas com o protótipo. Se você optar por continuar
o código existente, corrija-as diretamente; se optar por reescrever do
zero, trate os pontos abaixo como armadilhas a NÃO repetir no novo design —
em ambos os casos, o resultado final não pode ter essas inconsistências:

1. **Divergência de média anual**: `lib/data/annual.ts:buildAnnualRows`
   calcula a média anual só com períodos já fechados (ignora os em aberto);
   `lib/data/report-card.ts:buildReportCard` usa `finalGrade ?? calculatedAverage`
   como fallback para período aberto. Escolha UMA regra (recomendado: a do
   boletim, que dá uma prévia mais útil durante o ano) e unifique — o
   Fechamento anual e o Boletim precisam mostrar o mesmo número para o
   mesmo aluno.
2. **Boletim ignora configuração por disciplina**: `report-card.ts` chama
   `getGradingConfig(ctx.schoolId)` sem passar `classSubjectId`, então usa
   sempre a config padrão da escola mesmo quando uma disciplina tem nota de
   aprovação/método diferentes. Corrija para buscar a config por oferta,
   como já é feito em `lib/data/closure.ts`.
3. **Boletim ignora frequência na situação acadêmica**: `resolveStatus` é
   chamado com `attendancePct: null` sempre no boletim, mas com o valor real
   no Fechamento por período — logo a mesma regra ("reprovado por falta")
   pode dar resultado diferente nas duas telas. Unifique passando a
   frequência real também no boletim.
4. **Ação órfã**: `renameTerm` (lib/actions/academic.ts) não é chamada por
   nenhuma tela. Ou remova, ou adicione a UI que falta em /periodos (decida
   pelo que fizer mais sentido — provavelmente vale expor, já que editar
   nome de período é uma necessidade real).
5. **Hard delete sem checagem de dependências**: excluir turma ou disciplina
   (lib/actions/registry.ts:deleteClass/deleteSubject) depende só de um
   `confirm()` no cliente; se houver notas/matrículas ligadas, o resultado
   depende do que a FK fizer (cascata silenciosa ou erro cru do Postgres).
   Adicione uma checagem explícita na Server Action: se houver dependências
   (matrículas ativas, avaliações lançadas, fechamentos), bloqueie a
   exclusão com uma mensagem clara em vez de deixar o banco decidir.

Não é escopo desta fase: paginação de alunos/ocorrências (mencionamos como
observação, mas não é dor real hoje — o volume de dados de uma escola/ano é
pequeno; reavalie só se a importação da Fase D trouxer uma base grande o
suficiente para a listagem ficar visivelmente lenta).

================================================================================
FASE F — Responsividade mobile completa
================================================================================

Uso real é tanto em celular (durante a aula, ex. lançar ocorrência e chamada
rápida) quanto em computador (fora da aula, ex. organizar fechamento). Audite
TODAS as telas, com atenção especial às que hoje são "planilha densa":

- app/(app)/notas/grade-grid.tsx e app/(app)/frequencia/attendance-grid.tsx
  são grades tipo planilha — em telas estreitas, considere scroll horizontal
  contido (nunca a página inteira) com a coluna de nome do aluno fixa
  (sticky), e alvo de toque grande o suficiente para lançar nota/falta com
  o dedo.
- app/(app)/ocorrencias/board.tsx (registrar elogio/crítica) é a tela mais
  provável de ser usada em pé, durante a aula — priorize poucos toques até
  salvar uma ocorrência.
- O novo seletor de ambiente (Fase A.2) e o ScopePicker
  (components/scope-picker.tsx) precisam funcionar bem como dropdown/sheet
  em tela pequena.
- Use os breakpoints e padrões que já existem em app/globals.css e nos
  componentes de components/ui/*; não introduza um sistema de design
  paralelo.

================================================================================
Verificação
================================================================================

- `npm run typecheck` e `npm test` (vitest) precisam continuar passando;
  adicione testes em lib/domain/__tests__/ para qualquer regra nova ou
  alterada (especialmente a unificação da Fase E.1-E.3).
- Teste manualmente o fluxo ponta a ponta: criar ambiente novo → criar ano
  letivo/período → importar planilha de exemplo com alunos+notas+frequência
  de um período já "fechado" → conferir que aparece corretamente no
  Fechamento, no Boletim e no Relatório de conduta, com os mesmos números.
- Teste em viewport mobile (375px) e desktop as telas de Notas, Frequência,
  Ocorrências e o seletor de ambiente.
- Teste recuperação de senha ponta a ponta (pedir reset → receber e-mail →
  definir nova senha → logar com a nova senha).
```
