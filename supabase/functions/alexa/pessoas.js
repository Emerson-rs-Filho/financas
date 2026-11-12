// Quem está falando: a Alexa manda um personId quando reconhece a voz (perfil de voz + Skill Personalization).
// O nome de cada pessoa fica em alexa_pessoas, que só a função (chave de serviço) lê e grava.
import { capital, limparNome } from './comum.js';

export async function nomeDaPessoa(db, personId) {
  if (!personId) return null;
  const { data, error } = await db.from('alexa_pessoas').select('nome').eq('person_id', personId).limit(1);
  if (error) { console.warn('alexa: pessoas:', error.message); return undefined; } // tabela ainda não criada: segue sem nome e sem perguntar
  return data[0]?.nome ?? null;
}

// "Erminho", "é Erminho", "o Erminho". Só as duas primeiras palavras, para não gravar uma frase inteira.
export function lerNome(texto) {
  const t = limparNome(String(texto || '').replace(/^(?:é|eh)\s+/i, ''), ['eu sou', 'sou']);
  return t.split(' ').slice(0, 2).map(capital).join(' ');
}

export async function salvarNome(db, personId, texto) {
  const nome = lerNome(texto);
  if (!nome) return { texto: 'Como você se chama?', repetir: true };
  if (!personId) return 'Ainda não reconheço vozes nesta skill. No aplicativo Alexa, crie o seu perfil de voz e ative a personalização da skill Nossa Casa.';
  const { error } = await db.from('alexa_pessoas').upsert({ person_id: personId, nome }, { onConflict: 'person_id' });
  if (error) throw error;
  return { texto: `Prazer, ${nome}! O que deseja fazer?`, nome };
}
