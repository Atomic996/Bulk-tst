
import { createClient } from '@supabase/supabase-js';
import { Candidate } from '../types';

const SUPABASE_URL = 'https://qjoixgkwpqnkmzqbsrct.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqb2l4Z2t3cHFua216cWJzcmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NDM0NzAsImV4cCI6MjA4NTMxOTQ3MH0.QcjUVEAlOlQuF1xQ49ln73RtD_w_vQkz4VMLOv-n3Go';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const cleanText = (str: string | null): string => {
  if (!str) return '';
  return str.trim().substring(0, 150);
};

export const databaseService = {
  async fetchGlobalCandidates(): Promise<Candidate[]> {
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('trust_score', { ascending: false });
      
      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: String(item.id),
        name: cleanText(item.name || 'Member'),
        handle: cleanText(item.handle || '@member'),
        profileImageUrl: `https://unavatar.io/twitter/${(item.handle || '').replace('@','')}`,
        profileUrl: `https://x.com/${(item.handle || '').replace('@','')}`,
        platform: 'Twitter',
        firstSeen: item.created_at || new Date().toISOString(),
        sharedCount: 0,
        trustScore: Math.max(0, parseInt(item.trust_score || 0, 10)),
        totalInteractions: 0
      }));
    } catch (e) {
      return [];
    }
  },

  // البحث عن حساب مرتبط ببصمة جهاز محددة
  async findByFingerprint(fingerprint: string): Promise<string | null> {
    const { data } = await supabase
      .from('candidates')
      .select('handle')
      .eq('fingerprint', fingerprint)
      .maybeSingle();
    return data ? data.handle : null;
  },

  async upsertCandidate(candidate: Candidate, fingerprint: string): Promise<boolean> {
    try {
      const handle = cleanText(candidate.handle);
      const { error } = await supabase
        .from('candidates')
        .upsert({
          id: candidate.id,
          name: cleanText(candidate.name),
          handle: handle,
          fingerprint: fingerprint, // تخزين البصمة لربطها بالحساب
          trust_score: candidate.trustScore || 0
        }, { onConflict: 'handle' });
      
      return !error;
    } catch (e) {
      return false;
    }
  },

  async incrementTrust(candidateId: string): Promise<boolean> {
    try {
      const { data } = await supabase.from('candidates').select('trust_score').eq('id', candidateId).single();
      if (!data) return false;
      const { error } = await supabase.from('candidates').update({ trust_score: (data.trust_score || 0) + 1 }).eq('id', candidateId);
      return !error;
    } catch (e) {
      return false;
    }
  }
};
