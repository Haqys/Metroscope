import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

const DEFAULT_SUPABASE_URL = 'https://rspwvpdefslffvxkddig.supabase.co';
const ENCODED_ANON =
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW5KemNIZDJjR1JsWm5Oc1ptWjJlR3RrWkdsbklpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzT1RBeU9USTBNVElzSW1WNGNDSTZNakV3TlRnMk9EUXhNbjAucGY5dHRNZk1ONUtwTi1vZFBtaW96blFWMTI4Q0RsWjYtSGtFZTJlNzdMRQ==';

function getFallbackAnonKey(): string {
  try {
    if (typeof atob === 'function') {
      return atob(ENCODED_ANON);
    }
    return Buffer.from(ENCODED_ANON, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export function getSupabase(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || url.includes('your-project')) {
    url = DEFAULT_SUPABASE_URL;
  }
  if (!anonKey || anonKey.includes('your-anon-key')) {
    anonKey = getFallbackAnonKey();
  }

  if (!url || !anonKey) return null;

  cachedClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

export interface ImpactBlock {
  id: string;
  type: 'paragraph' | 'heading2' | 'heading3' | 'quote' | 'bulletList' | 'image';
  text?: string;
  items?: string[];
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
}

export interface ImpactRecord {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  categoryLabel: string;
  year: string;
  location: string;
  metric: string;
  summary: string;
  keyTakeaways: string[];
  coverUrl: string;
  status: 'PUBLISHED' | 'DRAFT';
  blocks?: ImpactBlock[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SupabaseImpactRow {
  id: string;
  title: string;
  subtitle?: string | null;
  category: string;
  category_label?: string | null;
  year: string;
  location?: string | null;
  metric?: string | null;
  summary: string;
  key_takeaways?: string[] | null;
  cover_url?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface GenericImpactInput {
  id?: string;
  title?: string;
  subtitle?: string | null;
  category?: string;
  categoryLabel?: string;
  category_label?: string;
  year?: string;
  location?: string | null;
  metric?: string | null;
  summary?: string;
  keyTakeaways?: string[];
  key_takeaways?: string[];
  coverUrl?: string;
  cover_url?: string;
  status?: string;
  blocks?: ImpactBlock[];
  created_at?: string;
  updated_at?: string;
}

const CATEGORY_LABEL_MAP: Record<string, string> = {
  GLOBAL_DELEGATION: 'Delegasi Internasional',
  RESEARCH_INNOVATION: 'Riset Sains Terapan',
  PODIUM_AWARD: 'Prestasi Juara',
  COMMUNITY: 'Dampak Komunitas',
};

export function impactItemToRow(item: GenericImpactInput): SupabaseImpactRow {
  const category = item.category || 'GLOBAL_DELEGATION';
  const categoryLabel =
    item.categoryLabel ||
    item.category_label ||
    CATEGORY_LABEL_MAP[category] ||
    'Delegasi Internasional';

  let takeaways: string[] = [];
  if (Array.isArray(item.keyTakeaways)) {
    takeaways = item.keyTakeaways;
  } else if (Array.isArray(item.key_takeaways)) {
    takeaways = item.key_takeaways;
  } else if (typeof item.keyTakeaways === 'string') {
    try {
      const parsed = JSON.parse(item.keyTakeaways);
      if (Array.isArray(parsed)) takeaways = parsed;
    } catch {}
  } else if (typeof item.key_takeaways === 'string') {
    try {
      const parsed = JSON.parse(item.key_takeaways);
      if (Array.isArray(parsed)) takeaways = parsed;
    } catch {}
  }

  const coverUrl =
    item.coverUrl ||
    item.cover_url ||
    '/images/events/jisf-2026-smp-1.jpg';

  return {
    id: item.id || `impact-${Date.now()}`,
    title: item.title || '',
    subtitle: item.subtitle || null,
    category,
    category_label: categoryLabel,
    year: String(item.year || new Date().getFullYear()),
    location: item.location || null,
    metric: item.metric || null,
    summary: item.summary || '',
    key_takeaways: takeaways,
    cover_url: coverUrl,
    status: item.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    updated_at: new Date().toISOString(),
  };
}

export function rowToImpactRecord(row: SupabaseImpactRow): ImpactRecord {
  let takeaways: string[] = [];
  if (Array.isArray(row.key_takeaways)) {
    takeaways = row.key_takeaways;
  } else if (typeof row.key_takeaways === 'string') {
    try {
      const parsed = JSON.parse(row.key_takeaways);
      if (Array.isArray(parsed)) takeaways = parsed;
    } catch {}
  }

  return {
    id: row.id,
    title: row.title || '',
    subtitle: row.subtitle || '',
    category: row.category || 'GLOBAL_DELEGATION',
    categoryLabel: row.category_label || CATEGORY_LABEL_MAP[row.category] || 'Delegasi Internasional',
    year: row.year || new Date().getFullYear().toString(),
    location: row.location || '',
    metric: row.metric || '',
    summary: row.summary || '',
    keyTakeaways: takeaways,
    coverUrl: row.cover_url || '/images/events/jisf-2026-smp-1.jpg',
    status: row.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchImpactsFromSupabase(): Promise<ImpactRecord[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('impacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[supabase-impacts] fetch failed:', error.message);
      return [];
    }

    return (data as SupabaseImpactRow[]).map(rowToImpactRecord);
  } catch (err) {
    console.error('[supabase-impacts] error:', err);
    return [];
  }
}

export async function saveImpactToSupabase(item: GenericImpactInput): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const payload = impactItemToRow(item);

  try {
    const { error } = await supabase.from('impacts').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('[supabase-impacts] upsert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[supabase-impacts] upsert exception:', err);
    return false;
  }
}

export async function deleteImpactFromSupabase(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase.from('impacts').delete().eq('id', id);
    if (error) {
      console.error('[supabase-impacts] delete failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[supabase-impacts] delete exception:', err);
    return false;
  }
}

export async function updateImpactStatusInSupabase(
  id: string,
  status: 'PUBLISHED' | 'DRAFT',
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('impacts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('[supabase-impacts] update status failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[supabase-impacts] update status exception:', err);
    return false;
  }
}
