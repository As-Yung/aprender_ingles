import type { SupabaseClient } from '@supabase/supabase-js';
import { readJson, writeJson } from '../security/storage';
import { sanitizeProgress, type ProgressData, type ProgressRepository } from './types';

export class LocalProgressRepository implements ProgressRepository {
  async load(userId: string): Promise<ProgressData> {
    return sanitizeProgress(readJson('local', `ai.progress.${userId}`, null));
  }
  async save(userId: string, data: ProgressData): Promise<void> {
    writeJson('local', `ai.progress.${userId}`, data);
  }
}

/** Tabla public.user_progress protegida por RLS (solo el dueño con AAL2). */
export class SupabaseProgressRepository implements ProgressRepository {
  private local = new LocalProgressRepository();
  constructor(private client: SupabaseClient) {}

  async load(userId: string): Promise<ProgressData> {
    const { data, error } = await this.client.from('user_progress').select('data').eq('user_id', userId).maybeSingle();
    if (error) return this.local.load(userId); // sin conexión: usa la copia local
    return sanitizeProgress(data?.data);
  }
  async save(userId: string, data: ProgressData): Promise<void> {
    await this.local.save(userId, data);
    await this.client.from('user_progress').upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
  }
}
