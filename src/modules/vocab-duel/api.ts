import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { LevelId } from '../../content/types';
import type { PersonajeId } from '../vocab-game/logic';

/**
 * Acceso a los duelos en Supabase. Las tablas solo se leen; todo cambio pasa por
 * funciones RPC del servidor (supabase/migrations/20261103000000_vocab_duels.sql),
 * que comprueban la sesión con 2FA y calculan el combate.
 */

export type PersonajeDuelo = Extract<PersonajeId, 'paladin' | 'asesino' | 'mago' | 'arquero'>;

export interface Duelo {
  id: string;
  challenger: string;
  opponent: string;
  challenger_name: string;
  opponent_name: string;
  level: LevelId;
  /** Game being played ('boss' = Boss Battle, or an arcade game id). */
  game: string;
  challenger_char: PersonajeDuelo;
  opponent_char: PersonajeDuelo | null;
  status: 'pending' | 'active' | 'finished' | 'declined' | 'cancelled' | 'expired';
  seed: number | null;
  c_hp: number | null;
  o_hp: number | null;
  c_hp_max: number | null;
  o_hp_max: number | null;
  c_streak: number;
  o_streak: number;
  c_q: number;
  o_q: number;
  c_ok: number;
  o_ok: number;
  c_last: string | null;
  o_last: string | null;
  winner: string | null;
  finish_reason: 'ko' | 'forfeit' | 'abandon' | null;
  created_at: string;
}

export interface Jugada {
  id: number;
  duel_id: string;
  player: string;
  q_index: number;
  correct: boolean;
  dodged: boolean;
  hits: number;
  damage: number;
  critical: boolean;
  target_hp: number;
}

export interface EnSala {
  id: string;
  name: string;
  level: LevelId;
  busy: boolean;
}

const MENSAJES: Record<string, string> = {
  not_authenticated: 'Your session expired. Please sign in again.',
  invalid_opponent: 'That player is not available.',
  invalid_character: 'Only regular characters can be used in duels.',
  invalid_level: 'Invalid level.',
  invalid_game: 'Invalid game.',
  rate_limited: 'Too many challenges in a row. Wait a minute.',
  not_found: 'That duel no longer exists.',
  not_pending: 'That challenge is no longer pending.',
  not_active: 'The duel is already over.',
  out_of_order: 'The game got out of sync. Reloading…',
  too_fast: 'Slow down 🙂',
  not_abandoned: 'Your rival is still playing.',
};

export class DueloError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fallo(e: { message?: string } | null): never {
  const code = Object.keys(MENSAJES).find((k) => e?.message?.includes(k)) ?? 'unknown';
  throw new DueloError(code, MENSAJES[code] ?? 'Could not reach the server. Please try again.');
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) fallo(error);
  return data as T;
}

export const desafiar = (c: SupabaseClient, rival: string, nivel: LevelId, personaje: PersonajeDuelo, juego = 'boss') =>
  rpc<Duelo>(c, 'duel_challenge', { p_opponent: rival, p_level: nivel, p_char: personaje, p_game: juego });
export const responderDesafio = (c: SupabaseClient, duelo: string, aceptar: boolean, personaje: PersonajeDuelo) =>
  rpc<Duelo>(c, 'duel_respond', { p_duel: duelo, p_accept: aceptar, p_char: personaje });
export const cancelarDesafio = (c: SupabaseClient, duelo: string) => rpc<null>(c, 'duel_cancel', { p_duel: duelo });
export const jugar = (c: SupabaseClient, duelo: string, indice: number, acierto: boolean) =>
  rpc<Jugada>(c, 'duel_answer', { p_duel: duelo, p_q: indice, p_correct: acierto });
export const rendirse = (c: SupabaseClient, duelo: string) => rpc<Duelo>(c, 'duel_forfeit', { p_duel: duelo });
export const reclamarAbandono = (c: SupabaseClient, duelo: string) => rpc<Duelo>(c, 'duel_claim_abandon', { p_duel: duelo });

export async function leerDuelo(c: SupabaseClient, id: string): Promise<Duelo | null> {
  const { data, error } = await c.from('vocab_duels').select('*').eq('id', id).maybeSingle();
  if (error) fallo(error);
  return data as Duelo | null;
}

/** Duelo activo o desafío recibido hace menos de 60 s (para retomar al recargar). */
export async function pendientes(c: SupabaseClient, yo: string): Promise<{ activo: Duelo | null; recibido: Duelo | null }> {
  const { data, error } = await c
    .from('vocab_duels')
    .select('*')
    .or(`challenger.eq.${yo},opponent.eq.${yo}`)
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) fallo(error);
  const filas = (data ?? []) as Duelo[];
  const hace60 = Date.now() - 60_000;
  return {
    activo: filas.find((d) => d.status === 'active') ?? null,
    recibido: filas.find((d) => d.status === 'pending' && d.opponent === yo && Date.parse(d.created_at) > hace60) ?? null,
  };
}

/** Cambios de mis duelos (desafíos recibidos, aceptados, combate, final). */
export function escucharMisDuelos(c: SupabaseClient, yo: string, alCambiar: (d: Duelo) => void): RealtimeChannel {
  const recibir = (p: { new: unknown }) => {
    if (p.new && typeof p.new === 'object' && 'id' in p.new) alCambiar(p.new as Duelo);
  };
  return c
    .channel(`vbg-duelos-${yo}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vocab_duels', filter: `opponent=eq.${yo}` }, recibir)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vocab_duels', filter: `challenger=eq.${yo}` }, recibir)
    .subscribe();
}

export function escucharJugadas(c: SupabaseClient, duelo: string, alJugar: (j: Jugada) => void): RealtimeChannel {
  return c
    .channel(`vbg-jugadas-${duelo}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vocab_duel_moves', filter: `duel_id=eq.${duelo}` }, (p) =>
      alJugar(p.new as Jugada),
    )
    .subscribe();
}

/** Sala de espera (presencia en un canal privado de Realtime, solo usuarios con 2FA). */
export async function entrarEnSala(
  c: SupabaseClient,
  yo: EnSala,
  alCambiar: (jugadores: EnSala[]) => void,
  alEstado: (ok: boolean) => void,
): Promise<{ canal: RealtimeChannel; actualizar: (datos: EnSala) => void }> {
  await c.realtime.setAuth();
  const canal = c.channel('vbg-lobby', { config: { private: true, presence: { key: yo.id } } });
  canal.on('presence', { event: 'sync' }, () => {
    const estado = canal.presenceState<EnSala>();
    const lista: EnSala[] = [];
    for (const [id, metas] of Object.entries(estado)) {
      const m = metas[metas.length - 1];
      if (m && id !== yo.id) lista.push({ id, name: String(m.name ?? '').slice(0, 40), level: m.level, busy: !!m.busy });
    }
    alCambiar(lista.sort((a, b) => a.name.localeCompare(b.name)));
  });
  canal.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      alEstado(true);
      void canal.track(yo);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      alEstado(false);
    }
  });
  return { canal, actualizar: (datos) => void canal.track(datos) };
}
