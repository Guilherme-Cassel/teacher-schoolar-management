/**
 * Mensagens do Supabase Auth em português.
 *
 * O Supabase responde sempre em inglês e com texto técnico ("Auth session
 * missing!"). Três telas — login, recuperar e redefinir — precisam das mesmas
 * traduções, então elas vivem aqui em vez de repetidas em cada uma.
 */

const EXACT: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Este e-mail ainda não foi confirmado.',
  'Auth session missing!': 'Sessão expirada. Peça um novo link de recuperação.',
  'User not found': 'Não encontramos uma conta com esse e-mail.',
  'New password should be different from the old password.':
    'A nova senha precisa ser diferente da anterior.',
}

const PATTERNS: [RegExp, string][] = [
  [/password.*at least (\d+)/i, 'A senha precisa ter pelo menos $1 caracteres.'],
  [/only request this after (\d+) seconds/i,
    'Aguarde $1 segundos antes de pedir outro link.'],
  [/rate limit/i, 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'],
  [/(token|link).*(expired|invalid)/i,
    'Este link expirou ou já foi usado. Peça um novo.'],
  [/expired/i, 'Este link expirou. Peça um novo.'],
  [/email.*invalid|invalid.*email/i, 'Informe um e-mail válido.'],
  [/network|fetch failed/i, 'Sem conexão com o servidor. Verifique sua internet.'],
]

export function translateAuthError(message: string | undefined | null): string {
  if (!message) return 'Não foi possível concluir. Tente novamente.'

  const exact = EXACT[message.trim()]
  if (exact) return exact

  for (const [re, replacement] of PATTERNS) {
    const match = message.match(re)
    if (match) {
      return replacement.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? '')
    }
  }

  return message
}
