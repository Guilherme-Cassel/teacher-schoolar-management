# Configuração — Supabase pessoal + Vercel

> Este projeto usa **exclusivamente o seu projeto Supabase pessoal**.
> Nada é criado ou alterado em nenhum outro projeto Supabase.

---

## 1. O que o app realmente precisa

Um esclarecimento importante antes de começar: **a connection string não é necessária para rodar o app.**

| Credencial | Para que serve | Onde vai | É segredo? |
|---|---|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | O app fala com o Supabase | `.env.local` + Vercel | Não |
| **anon / publishable key** | Autenticação do navegador | `.env.local` + Vercel | Não — é pública por design; quem protege os dados é o RLS |
| **Connection string** (`postgresql://...`) | Só para aplicar migrations pela CLI | Nunca sai da sua máquina | **Sim** — contém a senha do banco |
| **service_role key** | Não usamos | — | **Sim** — nunca coloque no frontend |

Ou seja: para o app funcionar bastam **URL + anon key**. A connection string só entra se você quiser aplicar as migrations pela linha de comando em vez do painel.

> 🔒 **Não cole a connection string nem a service_role key no chat.** Elas dão acesso total ao banco. Cole direto no `.env.local` e no painel da Vercel. A URL e a anon key podem ser compartilhadas sem problema.

---

## 2. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e entre na sua conta.
2. **New project** → nome `gestao-escolar`.
3. Defina uma senha de banco forte e **guarde no seu gerenciador de senhas**.
4. Region: **South America (São Paulo)** — menor latência para o Brasil.
5. Plano **Free**. Aguarde ~2 minutos até provisionar.

### Onde ficam as credenciais

O painel do Supabase mudou os nomes das chaves — o que a documentação antiga
chamava de `anon` hoje aparece como **publishable**:

- **Project Settings → API Keys**, aba *Publishable and secret*: a chave
  **Publishable** (`sb_publishable_...`) é a que vai em
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A aba *Legacy anon, service_role* ainda
  entrega o formato antigo (`eyJhbGci...`), que também funciona.
- **Ignore a Secret key** (`sb_secret_...`, antiga `service_role`): ela passa
  por cima de todo o RLS e não deve entrar no app.
- **Project Settings → Data API**: o `Project URL`. Se não achar, ele é o
  *project ref* que está na própria URL do painel
  (`supabase.com/dashboard/project/SEU_REF`) mais `.supabase.co`.
- **Project Settings → Database → Connection string** (aba *URI*): só é
  necessária para aplicar migrations pela CLI. Substitua `[YOUR-PASSWORD]`
  pela senha do passo 3.

## 3. Aplicar o schema

**Opção A — um arquivo só (mais simples):**

1. No projeto, abra **SQL Editor → New query**.
2. Cole o conteúdo de [`supabase/migrations.sql`](../supabase/migrations.sql)
   e clique em **Run**.
3. Confira em **Table Editor**: devem aparecer as tabelas com o cadeado de RLS ativo.

**Opção B — arquivo por arquivo:**

Rode os arquivos de `supabase/migrations/` **na ordem numérica**, um de cada vez,
colando cada um no SQL Editor. A ordem importa: as migrations posteriores
assumem que as anteriores já rodaram. Nunca edite um arquivo já aplicado —
crie um novo com o próximo número. `supabase/migrations.sql` é gerado a
partir desses arquivos, nesta ordem.

**Opção C — pela CLI** (se você já tiver o Supabase CLI):
```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

---

## 4. Criar o usuário e os dados iniciais

1. **Authentication → Users → Add user** → e-mail e senha da professora.
   Marque *Auto Confirm User* para não depender de e-mail de confirmação.
2. Cole `supabase/seed/0001_seed.sql` no **SQL Editor** e rode. Não precisa editar nada:
   o script localiza a conta sozinho.

Isso cria a escola, o ano letivo com 4 bimestres, disciplinas, uma turma de exemplo e vincula a professora.

Se o projeto tiver **mais de uma conta**, o script avisa e pede que você preencha
`v_user_email` na primeira linha do bloco. O seed também recusa rodar duas vezes,
para não duplicar a escola.

---

## 5. Rodar localmente

Crie o arquivo `.env.local` na raiz do projeto:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

```bash
npm install
npm run dev
```

Abra `http://localhost:3000` e entre com o usuário criado no passo 4.

---

## 6. Publicar na Vercel (grátis)

1. Suba o projeto para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com), **Add New → Project** e importe o repositório.
3. O framework Next.js é detectado sozinho — não mude nada no build.
4. Em **Environment Variables**, adicione as duas variáveis do passo 5
   (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) para
   *Production*, *Preview* e *Development*.
5. **Deploy**. Anote a URL final, algo como `https://gestao-escolar.vercel.app`.

### Passo que quase todo mundo esquece
Volte ao Supabase em **Authentication → URL Configuration** e cadastre:
- **Site URL**: `https://gestao-escolar.vercel.app`
- **Redirect URLs**: `https://gestao-escolar.vercel.app/**` e `http://localhost:3000/**`

Sem isso o login funciona local mas quebra em produção.

---

---

## 7. Recuperação de senha

A tela de login tem **Esqueci minha senha**, que leva a `/login/recuperar`.
O Supabase envia o e-mail e o link volta para `/login/redefinir`.

Para funcionar, em **Authentication → URL Configuration** as **Redirect URLs**
precisam cobrir esse caminho. Os curingas do passo anterior já resolvem:

- `https://gestao-escolar.vercel.app/**`
- `http://localhost:3000/**`

Se você preferir cadastrar sem curinga, inclua explicitamente
`https://gestao-escolar.vercel.app/login/redefinir` e
`http://localhost:3000/login/redefinir`.

### Detalhes que evitam suporte depois

- O link vale **uma hora** e só pode ser usado **uma vez**. Depois disso a tela
  mostra "Link inválido ou expirado" com um botão para pedir outro.
- A tela de recuperação **sempre** diz que o e-mail foi enviado, mesmo quando
  não existe conta com aquele endereço. É de propósito: a resposta contrária
  entregaria a estranhos quais e-mails têm cadastro.
- No plano gratuito o Supabase limita o envio de e-mails (poucos por hora) e
  usa um remetente compartilhado, que às vezes cai no spam. Para uso real,
  configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.
- A senha nova exige no mínimo 8 caracteres na tela. O mínimo do próprio
  Supabase é 6 e fica em **Authentication → Policies**; se você aumentá-lo lá,
  ajuste também `MIN_LENGTH` em `app/login/redefinir/page.tsx`.

## 8. Antes de mostrar para ela

- [ ] O login funciona na URL da Vercel, pelo celular.
- [ ] Existe uma turma com alunos de exemplo já cadastrados.
- [ ] O boletim imprime bem (Ctrl+P → Salvar como PDF).
- [ ] Há pelo menos um aluno na "zona dos 0,1" para demonstrar o fechamento.

## Limites do plano gratuito (bom saber)

- **Supabase Free**: 500 MB de banco — folgadíssimo aqui; uma escola inteira por
  ano não passa de alguns MB. O projeto **pausa após ~1 semana sem acesso** e é
  reativado com um clique no painel. Para uma demonstração, tudo bem; para uso
  real contínuo, vale o plano pago.
- **Vercel Hobby**: suficiente para uso pessoal. Uso **comercial** exige plano pago —
  relevante se um dia a escola quiser pagar pelo sistema.
