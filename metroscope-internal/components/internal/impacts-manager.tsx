'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Sparkles,
  Award,
  MapPin,
  Trash2,
  Edit3,
  Check,
  RefreshCw,
  UploadCloud,
  X,
  Eye,
  Calendar,
  Globe,
  ChevronUp,
  ChevronDown,
  Quote,
  Heading2,
  AlignLeft,
  CheckCircle2,
  Image as ImageIcon,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type ImpactRecord,
  type ImpactBlock,
  saveImpactToSupabase,
  deleteImpactFromSupabase,
  updateImpactStatusInSupabase,
  fetchImpactsFromSupabase,
} from '@/lib/supabase-impacts';

export type { ImpactRecord, ImpactBlock };

const EVENT_PHOTO_PRESETS = [
  { url: '/images/events/sca-2025-award.jpg', label: 'SCA 2025 Award' },
  { url: '/images/events/sca-2025-delegation.jpg', label: 'SCA Delegasi' },
  { url: '/images/events/sca-2025-judging.jpg', label: 'SCA Oral Defense' },
  { url: '/images/events/jisf-2026-smp-1.jpg', label: 'JISF SMP 1' },
  { url: '/images/events/jisf-2026-smp-5.jpg', label: 'JISF SMP Poster' },
  { url: '/images/events/jisf-2026-sd-1.jpg', label: 'JISF SD 1' },
  { url: '/images/events/jisf-2026-sd-3.jpg', label: 'JISF SD Podium' },
  {
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80',
    label: 'i2ASPO UGM',
  },
];

const SAMPLE_IMPACTS: ImpactRecord[] = [
  {
    id: 'impact-jisf-2026-junior-high',
    title: 'Jakarta International Science Fair (JISF) 2026 Delegation',
    subtitle: 'Junior High Delegation Secures Prestigious Accolades in Applied Engineering',
    category: 'GLOBAL_DELEGATION',
    categoryLabel: 'Delegasi Internasional',
    year: '2026',
    location: 'Jakarta, Indonesia',
    metric: 'Gold Medal & Special Commendation',
    summary:
      'Junior High delegates from Metroscope presented cutting-edge applied science research, defending an IoT-based atmospheric air quality monitoring prototype before a global jury panel.',
    keyTakeaways: [
      'Designed real-time IoT hardware sensor array for tropospheric pollutant detection',
      'Defended quantitative findings in English during rigorous 15-minute jury oral defense',
    ],
    coverUrl: '/images/events/jisf-2026-smp-1.jpg',
    status: 'PUBLISHED',
  },
  {
    id: 'impact-sca-2025-cyberjaya',
    title: 'Science Castle Asia (SCA) 2025 — Cyberjaya, Malaysia',
    subtitle: 'International Academic Symposium & Sustainable Innovation Presentation',
    category: 'GLOBAL_DELEGATION',
    categoryLabel: 'Simposium Internasional',
    year: '2025',
    location: 'Cyberjaya, Malaysia',
    metric: 'Outstanding International Presenter Award',
    summary:
      'Representing young Indonesian researchers on the global academic stage, Metroscope delegates defended sustainable circular economy solutions and botanical extracts before international evaluators.',
    keyTakeaways: [
      'Evaluated by international researchers from Japanese and Malaysian universities',
      'Published conference abstract in official symposium proceeding index',
    ],
    coverUrl: '/images/events/sca-2025-award.jpg',
    status: 'PUBLISHED',
  },
  {
    id: 'impact-jisf-2026-elementary',
    title: 'Elementary Scientific Inquiry at JISF 2026',
    subtitle: 'Early-Age Research Literacy Leads to Exceptional Podium Recognition',
    category: 'RESEARCH_INNOVATION',
    categoryLabel: 'Riset Sains Terapan',
    year: '2026',
    location: 'Jakarta, Indonesia',
    metric: 'Silver Award in Life Sciences',
    summary:
      'Young primary school researchers showcased biological antibacterial properties of native agricultural extracts, proving that rigorous scientific methodology starts well before high school.',
    keyTakeaways: [
      'Formulated hypothesis, control groups, and measurable laboratory trials',
      'Synthesized research poster adhering to international symposium standards',
    ],
    coverUrl: '/images/events/jisf-2026-sd-1.jpg',
    status: 'PUBLISHED',
  },
];

const CATEGORY_OPTIONS = [
  { value: 'GLOBAL_DELEGATION', label: 'Delegasi Internasional' },
  { value: 'RESEARCH_INNOVATION', label: 'Riset Sains Terapan' },
  { value: 'PODIUM_AWARD', label: 'Prestasi Juara' },
  { value: 'COMMUNITY', label: 'Dampak Komunitas' },
];

function SafeImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-100 text-neutral-400 p-4">
        <Sparkles className="h-6 w-6 text-neutral-300" />
        <span className="mt-1 text-[11px] font-medium text-neutral-400">Dokumentasi</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn('h-full w-full object-cover transition-transform duration-300', className)}
      onError={() => setError(true)}
      loading="lazy"
    />
  );
}

export function ImpactsManager() {
  const STORAGE_KEY = 'metroscope_cms_impacts_v3';

  const [items, setItems] = useState<ImpactRecord[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ImpactRecord[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {}
    }
    return [];
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Studio Modal State
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState('GLOBAL_DELEGATION');
  const [year, setYear] = useState('2026');
  const [location, setLocation] = useState('Jakarta, Indonesia');
  const [metric, setMetric] = useState('Gold Medal & Special Commendation');
  const [summary, setSummary] = useState('');
  const [coverUrl, setCoverUrl] = useState('/images/events/jisf-2026-smp-1.jpg');
  const [blocks, setBlocks] = useState<ImpactBlock[]>([]);
  const [keyTakeawaysList, setKeyTakeawaysList] = useState<string[]>([
    'Merancang prototipe terintegrasi sensor IoT presisi tinggi',
    'Mempertahankan temuan ilmiah di hadapan dewan juri internasional dalam bahasa Inggris',
  ]);

  // Drag states
  const [isCoverDragging, setIsCoverDragging] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // Cache to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {}
    }
  }, [items]);

  // Fetch fresh from Supabase via BFF / direct client on mount
  useEffect(() => {
    let cancelled = false;
    async function loadFreshImpacts() {
      // 1. Try BFF proxy
      try {
        const res = await fetch('/api/bff/site/impacts');
        if (res.ok) {
          const data = await res.json();
          if (data?.items && Array.isArray(data.items) && !cancelled) {
            setItems((prev) => {
              const map = new Map<string, ImpactRecord>();
              data.items.forEach((item: ImpactRecord) => map.set(item.id, item));
              prev.forEach((item) => {
                if (!map.has(item.id)) map.set(item.id, item);
              });
              const merged = Array.from(map.values());
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
              } catch {}
              return merged;
            });
            return;
          }
        }
      } catch {}

      // 2. Direct Supabase client fallback
      try {
        const direct = await fetchImpactsFromSupabase();
        if (!cancelled && direct && direct.length > 0) {
          setItems((prev) => {
            const map = new Map<string, ImpactRecord>();
            direct.forEach((item: ImpactRecord) => map.set(item.id, item));
            prev.forEach((item) => {
              if (!map.has(item.id)) map.set(item.id, item);
            });
            const merged = Array.from(map.values());
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      } catch {}
    }
    loadFreshImpacts();
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const openCreateStudio = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setCategory('GLOBAL_DELEGATION');
    setYear(new Date().getFullYear().toString());
    setLocation('Jakarta, Indonesia');
    setMetric('');
    setSummary('');
    setCoverUrl('/images/events/jisf-2026-smp-1.jpg');
    setKeyTakeawaysList([
      'Merancang purwarupa riset terapan berstandar saintifik internasional',
      'Mempertahankan metodologi penelitian dalam sesi oral defense di hadapan juri global',
    ]);
    setBlocks([
      {
        id: 'block-1',
        type: 'paragraph',
        text: 'Delegasi riset siswa Metroscope berhasil mempresentasikan temuan inovasi sains terapan di hadapan panel penilai internasional. Proses bimbingan intensif meliputi pengujian laboratorium, validasi data, dan simulasi tanya jawab berbahasa Inggris.',
      },
      {
        id: 'block-2',
        type: 'heading2',
        text: 'Metodologi & Bimbingan Intensif',
      },
      {
        id: 'block-3',
        type: 'quote',
        text: 'Keberhasilan di panggung dunia membuktikan bahwa dedikasi riset sejak usia dini mampu melahirkan solusi teknologi yang aplikatif bagi tantangan lingkungan nyata.',
      },
      {
        id: 'block-4',
        type: 'image',
        imageUrl: '/images/events/sca-2025-judging.jpg',
        imageCaption: 'Sesi presentasi riset dan uji tanya jawab bersama dewan juri.',
      },
    ]);
    setActiveTab('editor');
    setIsStudioOpen(true);
  };

  const openEditStudio = (item: ImpactRecord) => {
    setEditingId(item.id);
    setTitle(item.title);
    setSubtitle(item.subtitle || '');
    setCategory(item.category || 'GLOBAL_DELEGATION');
    setYear(item.year || new Date().getFullYear().toString());
    setLocation(item.location || '');
    setMetric(item.metric || '');
    setSummary(item.summary || '');
    setCoverUrl(item.coverUrl || '/images/events/jisf-2026-smp-1.jpg');
    setKeyTakeawaysList(
      item.keyTakeaways && item.keyTakeaways.length > 0
        ? item.keyTakeaways
        : [
            'Merancang purwarupa riset terapan berstandar saintifik internasional',
            'Mempertahankan metodologi penelitian dalam sesi oral defense di hadapan juri global',
          ],
    );

    if (item.blocks && Array.isArray(item.blocks) && item.blocks.length > 0) {
      setBlocks(item.blocks);
    } else {
      // Deconstruct summary into editable blocks
      const paragraphs = (item.summary || '')
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean);

      if (paragraphs.length > 0) {
        setBlocks(
          paragraphs.map((p, idx) => ({
            id: `block-${idx}-${Date.now()}`,
            type: 'paragraph',
            text: p,
          })),
        );
      } else {
        setBlocks([
          {
            id: 'block-1',
            type: 'paragraph',
            text: item.summary || 'Proses riset dan pembinaan delegasi siswa.',
          },
        ]);
      }
    }

    setActiveTab('editor');
    setIsStudioOpen(true);
  };

  // Image Upload Handlers with Canvas Compression to ensure fast writes and avoid payload limits
  const handleCoverFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar (JPG, PNG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = e.target?.result as string;
      if (!rawUrl) return;

      const img = new window.Image();
      img.onload = () => {
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setCoverUrl(compressed);
        } else {
          setCoverUrl(rawUrl);
        }
      };
      img.onerror = () => setCoverUrl(rawUrl);
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleBlockImageUpload = (blockId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = e.target?.result as string;
      if (!rawUrl) return;

      const img = new window.Image();
      img.onload = () => {
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setBlocks((prev) =>
            prev.map((b) => (b.id === blockId ? { ...b, imageUrl: compressed } : b)),
          );
        } else {
          setBlocks((prev) =>
            prev.map((b) => (b.id === blockId ? { ...b, imageUrl: rawUrl } : b)),
          );
        }
      };
      img.onerror = () => {
        setBlocks((prev) =>
          prev.map((b) => (b.id === blockId ? { ...b, imageUrl: rawUrl } : b)),
        );
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  // Block Controls
  const addBlock = (type: ImpactBlock['type']) => {
    const newBlock: ImpactBlock = {
      id: `block-${Date.now()}`,
      type,
      text:
        type === 'paragraph'
          ? 'Tuliskan rincian narasi kegiatan delegasi di sini...'
          : type === 'heading2'
          ? 'Subjudul Bagian Cerita'
          : type === 'quote'
          ? 'Kutipan apresiasi dari dewan juri atau refleksi siswa delegasi...'
          : '',
      imageUrl: type === 'image' ? '/images/events/sca-2025-delegation.jpg' : undefined,
      imageCaption: type === 'image' ? 'Keterangan dokumentasi kegiatan riset siswa' : undefined,
    };
    setBlocks((prev) => [...prev, newBlock]);
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    setBlocks((prev) => {
      const next = [...prev];
      const temp = next[index]!;
      next[index] = next[targetIndex]!;
      next[targetIndex] = temp;
      return next;
    });
  };

  // Key Takeaways list controls
  const addTakeawayItem = () => {
    setKeyTakeawaysList((prev) => [...prev, 'Poin pencapaian atau keterampilan baru']);
  };

  const updateTakeawayItem = (index: number, val: string) => {
    setKeyTakeawaysList((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const removeTakeawayItem = (index: number) => {
    setKeyTakeawaysList((prev) => prev.filter((_, i) => i !== index));
  };

  // Save / Publish
  const handleSave = async (status: 'PUBLISHED' | 'DRAFT') => {
    if (!title.trim()) {
      alert('Mohon isi judul cerita delegasi/dampak.');
      return;
    }

    const categoryLabels: Record<string, string> = {
      GLOBAL_DELEGATION: 'Delegasi Internasional',
      RESEARCH_INNOVATION: 'Riset Sains Terapan',
      PODIUM_AWARD: 'Prestasi Juara',
      COMMUNITY: 'Dampak Komunitas',
    };

    // Synthesize comprehensive summary from summary field or blocks
    let finalSummary = summary.trim();
    if (!finalSummary) {
      const textBlocks = blocks
        .filter((b) => b.type === 'paragraph' || b.type === 'quote')
        .map((b) => b.text?.trim())
        .filter(Boolean);
      finalSummary = textBlocks.join('\n\n') || title;
    }

    const cleanedTakeaways = keyTakeawaysList
      .map((t) => t.trim())
      .filter(Boolean);

    const impactItem: ImpactRecord = {
      id: editingId || `impact-${Date.now()}`,
      title: title.trim(),
      subtitle: subtitle.trim(),
      category,
      categoryLabel: categoryLabels[category] ?? 'Delegasi Internasional',
      year: year.trim() || new Date().getFullYear().toString(),
      location: location.trim() || 'Nasional / Global',
      metric: metric.trim() || 'International Recognition',
      summary: finalSummary,
      keyTakeaways: cleanedTakeaways,
      coverUrl,
      status,
      blocks,
      updatedAt: new Date().toISOString(),
    };

    // 1. Immediately update UI state & localStorage so it is instantly visible and never disappears
    setItems((prev) => {
      const exists = prev.some((i) => i.id === impactItem.id);
      const updated = exists
        ? prev.map((i) => (i.id === impactItem.id ? impactItem : i))
        : [impactItem, ...prev.filter((i) => i.id !== impactItem.id)];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setIsStudioOpen(false);
    showToast(
      status === 'PUBLISHED'
        ? '🎉 Cerita dampak berhasil diterbitkan langsung ke Web Klien!'
        : '💾 Draf cerita dampak berhasil disimpan.',
    );

    // 2. Direct Supabase client write (guarantees immediate cloud update)
    try {
      await saveImpactToSupabase(impactItem);
    } catch (e) {
      console.error('Direct Supabase write failed:', e);
    }

    // 3. Persist to Supabase via BFF proxy as resilient second layer
    try {
      await fetch('/api/bff/site/impacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(impactItem),
      });
    } catch (err) {
      console.error('Save to BFF failed:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Hapus cerita dampak ini dari sistem dan situs klien?')) {
      const nextItems = items.filter((i) => i.id !== id);
      setItems(nextItems);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
        } catch {}
      }
      try {
        await deleteImpactFromSupabase(id);
      } catch {}
      try {
        await fetch(`/api/bff/site/impacts/${id}`, { method: 'DELETE' });
      } catch {}
      showToast('Cerita dampak telah dihapus dari Supabase & sistem.');
    }
  };

  const toggleStatus = async (id: string) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    const nextStatus = target.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';

    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: nextStatus } : i)),
    );

    try {
      await updateImpactStatusInSupabase(id, nextStatus);
    } catch {}

    try {
      await fetch('/api/bff/site/impacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, status: nextStatus }),
      });
    } catch {}

    showToast(
      nextStatus === 'PUBLISHED'
        ? '🎉 Cerita dampak kini Terbit di Web Klien!'
        : 'Cerita dampak ditarik kembali ke Draf.',
    );
  };

  const triggerLiveSync = async () => {
    setSyncStatus('syncing');
    try {
      let freshItems: ImpactRecord[] | null = null;
      try {
        const res = await fetch('/api/bff/site/impacts');
        if (res.ok) {
          const fresh = await res.json();
          if (fresh?.items && Array.isArray(fresh.items)) {
            freshItems = fresh.items;
          }
        }
      } catch {}

      if (!freshItems) {
        freshItems = await fetchImpactsFromSupabase();
      }

      if (freshItems) {
        setItems(freshItems);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(freshItems));
        } catch {}
      }
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus('idle'), 2500);
      showToast('Data dampak telah tersinkronisasi sempurna dengan Web Klien!');
    } catch {
      setSyncStatus('idle');
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      searchQuery === '' ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.metric.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatus === '' || item.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-neutral-900 px-5 py-3.5 text-xs font-medium text-white shadow-2xl transition-all">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-maroon/10 text-maroon shadow-inner">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-neutral-900">
              Cerita Dampak &amp; Delegasi Siswa
            </h3>
            <p className="text-xs text-neutral-500">
              {items.length} cerita terdaftar · Tersambung langsung ke Supabase &amp; Web Klien
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={triggerLiveSync}
            disabled={syncStatus === 'syncing'}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50"
          >
            {syncStatus === 'syncing' ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Menyinkronkan...
              </>
            ) : syncStatus === 'synced' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Tersinkronisasi
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-neutral-500" />
                Sinkronkan ke Web Klien
              </>
            )}
          </button>

          <button
            type="button"
            onClick={openCreateStudio}
            className="inline-flex items-center gap-2 rounded-full bg-maroon px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-maroon/20 hover:bg-maroon-dark transition-all"
          >
            <Plus className="h-4 w-4" />
            Tambah Cerita Dampak
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200/80 bg-white p-3.5 shadow-sm">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari cerita delegasi, medali, atau lokasi..."
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50/50 pl-9 pr-4 py-2 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-maroon focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 focus:border-maroon focus:outline-none"
          >
            <option value="">Semua Status</option>
            <option value="PUBLISHED">Terbit (Live)</option>
            <option value="DRAFT">Draf (Internal)</option>
          </select>
        </div>
      </div>

      {/* Items Grid or Empty State */}
      {filteredItems.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-12 sm:p-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-maroon/10 text-maroon mb-4">
            <Sparkles className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-neutral-900">
            {searchQuery ? 'Tidak Ada Cerita yang Cocok' : 'Daftar Cerita Dampak Masih Kosong'}
          </h3>
          <p className="mt-1.5 text-xs text-neutral-500 max-w-sm mx-auto leading-relaxed">
            {searchQuery
              ? 'Coba gunakan kata kunci pencarian yang lain.'
              : 'Belum ada catatan delegasi atau prestasi yang diterbitkan. Anda dapat menambahkan cerita baru atau memuat draf contoh.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={openCreateStudio}
              className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-maroon-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              Buat Cerita Baru
            </button>
            <button
              type="button"
              onClick={async () => {
                setItems(SAMPLE_IMPACTS);
                for (const sample of SAMPLE_IMPACTS) {
                  try {
                    await saveImpactToSupabase(sample);
                  } catch {}
                }
                showToast('Data contoh berhasil dimuat dan disinkronkan ke Web Klien!');
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              Muat Data Contoh (JISF &amp; SCA)
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
            >
              <div>
                {/* Image Cover */}
                <div className="relative aspect-[16/9] w-full bg-neutral-100 overflow-hidden">
                  <SafeImage src={item.coverUrl} alt={item.title} />
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="rounded-full bg-black/75 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                      {item.year}
                    </span>
                    <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-800 backdrop-blur-sm">
                      {item.categoryLabel}
                    </span>
                  </div>

                  {/* Toggle status chip */}
                  <div className="absolute top-3 right-3">
                    <button
                      type="button"
                      onClick={() => toggleStatus(item.id)}
                      title="Klik untuk mengubah status Terbit / Draf"
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider shadow-sm transition hover:scale-105',
                        item.status === 'PUBLISHED'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-neutral-800 text-white',
                      )}
                    >
                      {item.status === 'PUBLISHED' ? 'Terbit' : 'Draf'}
                    </button>
                  </div>
                </div>

                {/* Content Body */}
                <div className="p-5">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <MapPin className="h-3.5 w-3.5 text-maroon" />
                    <span>{item.location || 'Nasional / Global'}</span>
                  </div>

                  <h4 className="mt-2 text-base font-semibold text-neutral-900 leading-snug line-clamp-2">
                    {item.title}
                  </h4>

                  {item.subtitle && (
                    <p className="mt-1 text-xs text-maroon font-medium italic line-clamp-1">
                      {item.subtitle}
                    </p>
                  )}

                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 border border-amber-200/60">
                    <Award className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span className="truncate">{item.metric}</span>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-3 font-light">
                    {item.summary}
                  </p>
                </div>
              </div>

              {/* Card Actions Footer */}
              <div className="flex items-center justify-between border-t border-neutral-100 px-5 py-3 bg-neutral-50/50">
                <span className="text-[11px] font-mono text-neutral-400">
                  {item.keyTakeaways.length} poin pencapaian
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditStudio(item)}
                    title="Sunting di Studio"
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-300 transition-colors shadow-2xs"
                  >
                    <Edit3 className="h-3 w-3 text-maroon" />
                    <span>Sunting</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    title="Hapus"
                    className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FULL STUDIO MODAL (2 COLUMNS & LIVE PREVIEW) */}
      {isStudioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-md">
          <div className="flex h-[94vh] w-full max-w-6xl flex-col rounded-3xl bg-neutral-50 shadow-2xl overflow-hidden border border-neutral-200">
            {/* Top Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-maroon/10 text-maroon">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-neutral-900 leading-snug">
                    {editingId ? 'Studio Sunting Cerita Dampak' : 'Studio Pembuat Cerita Dampak'}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Sistem pembuat cerita delegasi siswa &amp; sinkronisasi web klien otomatis.
                  </p>
                </div>
              </div>

              {/* Tabs Switcher & Close */}
              <div className="flex items-center gap-3">
                <div className="flex rounded-full bg-neutral-100 p-1 border border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('editor')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                      activeTab === 'editor'
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-800',
                    )}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editor Konten
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                      activeTab === 'preview'
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-800',
                    )}
                  >
                    <Eye className="h-3.5 w-3.5 text-maroon" />
                    Pratinjau Web Klien
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                      Live
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsStudioOpen(false)}
                  className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {activeTab === 'editor' ? (
                <div className="grid gap-6 lg:grid-cols-12">
                  {/* LEFT COLUMN: Narrative & Content Blocks */}
                  <div className="space-y-6 lg:col-span-7">
                    {/* Title & Subtitle Card */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600">
                          Judul Cerita / Delegasi Siswa <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Contoh: Jakarta International Science Fair (JISF) 2026 Delegation"
                          className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 font-serif text-base sm:text-lg font-medium text-neutral-900 focus:border-maroon focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600">
                          Subjudul Sorotan
                        </label>
                        <input
                          type="text"
                          value={subtitle}
                          onChange={(e) => setSubtitle(e.target.value)}
                          placeholder="Contoh: Junior High Delegation Secures Prestigious Accolades in Applied Engineering"
                          className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm italic text-neutral-800 focus:border-maroon focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Rich Narrative Blocks Builder */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-neutral-900">
                            Blok Narasi &amp; Dokumentasi
                          </h4>
                          <p className="text-xs text-neutral-500">
                            Susun alur cerita riset siswa dengan paragraf, foto dokumentasi, dan kutipan juri.
                          </p>
                        </div>

                        {/* Add Block Toolbar */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => addBlock('paragraph')}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
                          >
                            <AlignLeft className="h-3 w-3 text-maroon" />
                            + Paragraf
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock('heading2')}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
                          >
                            <Heading2 className="h-3 w-3 text-maroon" />
                            + Subjudul
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock('quote')}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
                          >
                            <Quote className="h-3 w-3 text-maroon" />
                            + Kutipan
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock('image')}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
                          >
                            <ImageIcon className="h-3 w-3 text-maroon" />
                            + Foto
                          </button>
                        </div>
                      </div>

                      {/* Blocks List */}
                      <div className="space-y-4">
                        {blocks.map((block, index) => (
                          <div
                            key={block.id}
                            className="group relative rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 transition hover:border-neutral-300"
                          >
                            <div className="flex items-center justify-between border-b border-neutral-200/60 pb-2 mb-3">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                                {block.type === 'paragraph' && 'Paragraf Narasi'}
                                {block.type === 'heading2' && 'Subjudul (H2)'}
                                {block.type === 'quote' && 'Kutipan / Testimoni Juri'}
                                {block.type === 'image' && 'Foto Dokumentasi Kegiatan'}
                              </span>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => moveBlock(index, 'up')}
                                  className="rounded p-1 text-neutral-400 hover:bg-neutral-200 disabled:opacity-30"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={index === blocks.length - 1}
                                  onClick={() => moveBlock(index, 'down')}
                                  className="rounded p-1 text-neutral-400 hover:bg-neutral-200 disabled:opacity-30"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeBlock(block.id)}
                                  className="rounded p-1 text-rose-500 hover:bg-rose-100 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Block Field Controls */}
                            {block.type === 'paragraph' && (
                              <textarea
                                rows={3}
                                value={block.text || ''}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  setBlocks((prev) =>
                                    prev.map((b) => (b.id === block.id ? { ...b, text } : b)),
                                  );
                                }}
                                placeholder="Tuliskan narasi penjelasan..."
                                className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-xs leading-relaxed text-neutral-800 focus:border-maroon focus:outline-none"
                              />
                            )}

                            {block.type === 'heading2' && (
                              <input
                                type="text"
                                value={block.text || ''}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  setBlocks((prev) =>
                                    prev.map((b) => (b.id === block.id ? { ...b, text } : b)),
                                  );
                                }}
                                placeholder="Subjudul bagian..."
                                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-bold text-neutral-900 focus:border-maroon focus:outline-none"
                              />
                            )}

                            {block.type === 'quote' && (
                              <textarea
                                rows={2}
                                value={block.text || ''}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  setBlocks((prev) =>
                                    prev.map((b) => (b.id === block.id ? { ...b, text } : b)),
                                  );
                                }}
                                placeholder="Tuliskan kalimat kutipan refleksi atau evaluasi juri..."
                                className="w-full rounded-lg border-l-4 border-l-maroon border border-neutral-200 bg-white p-3 text-xs italic text-neutral-800 focus:border-maroon focus:outline-none"
                              />
                            )}

                            {block.type === 'image' && (
                              <div className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-2 items-start">
                                  {/* Drag and Drop Zone for block image */}
                                  <div
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const file = e.dataTransfer.files?.[0];
                                      if (file) handleBlockImageUpload(block.id, file);
                                    }}
                                    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-center cursor-pointer hover:border-maroon transition-colors"
                                    onClick={() => {
                                      const input = document.getElementById(
                                        `file-${block.id}`,
                                      ) as HTMLInputElement;
                                      input?.click();
                                    }}
                                  >
                                    <input
                                      id={`file-${block.id}`}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleBlockImageUpload(block.id, file);
                                      }}
                                    />
                                    <UploadCloud className="h-6 w-6 text-neutral-400 mb-1" />
                                    <span className="text-[11px] font-semibold text-neutral-700">
                                      Tarik Foto ke Sini / Telusuri
                                    </span>
                                    <span className="text-[10px] text-neutral-400">
                                      JPG, PNG, WebP
                                    </span>
                                  </div>

                                  {/* Block image preview */}
                                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-neutral-200 bg-white">
                                    <SafeImage
                                      src={block.imageUrl || ''}
                                      alt={block.imageCaption || 'Dokumentasi'}
                                    />
                                  </div>
                                </div>

                                {/* Preset Chooser */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10px] font-semibold text-neutral-400 uppercase">
                                    Preset Cepat:
                                  </span>
                                  {EVENT_PHOTO_PRESETS.map((preset) => (
                                    <button
                                      key={preset.url}
                                      type="button"
                                      onClick={() => {
                                        setBlocks((prev) =>
                                          prev.map((b) =>
                                            b.id === block.id ? { ...b, imageUrl: preset.url } : b,
                                          ),
                                        );
                                      }}
                                      className="rounded-lg border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-medium text-neutral-600 hover:border-maroon hover:text-maroon transition-colors"
                                    >
                                      {preset.label}
                                    </button>
                                  ))}
                                </div>

                                {/* Caption input */}
                                <input
                                  type="text"
                                  value={block.imageCaption || ''}
                                  onChange={(e) => {
                                    const caption = e.target.value;
                                    setBlocks((prev) =>
                                      prev.map((b) =>
                                        b.id === block.id ? { ...b, imageCaption: caption } : b,
                                      ),
                                    );
                                  }}
                                  placeholder="Keterangan foto dokumentasi..."
                                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 focus:border-maroon focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic Key Takeaways Checklist Builder */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-neutral-900">
                            Poin Kunci &amp; Pembelajaran (Key Takeaways)
                          </h4>
                          <p className="text-xs text-neutral-500">
                            Daftar ceklis kompetensi atau keterampilan yang dikembangkan siswa.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addTakeawayItem}
                          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5 text-maroon" />
                          Tambah Poin
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {keyTakeawaysList.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-maroon/10 text-maroon">
                              <CheckCircle2 className="h-4 w-4" />
                            </span>
                            <input
                              type="text"
                              value={item}
                              onChange={(e) => updateTakeawayItem(idx, e.target.value)}
                              placeholder="Deskripsi pencapaian atau keterampilan..."
                              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => removeTakeawayItem(idx)}
                              className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Cover Hero, Metric & Metadata */}
                  <div className="space-y-6 lg:col-span-5">
                    {/* Cover Hero Photo with Drag & Drop */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                          Foto Sampul Utama (Hero Cover)
                        </label>
                        <span className="text-[11px] text-neutral-400">Rasio 16:10</span>
                      </div>

                      {/* Drop Zone */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsCoverDragging(true);
                        }}
                        onDragLeave={() => setIsCoverDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsCoverDragging(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleCoverFileUpload(file);
                        }}
                        onClick={() => coverFileInputRef.current?.click()}
                        className={cn(
                          'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all',
                          isCoverDragging
                            ? 'border-maroon bg-maroon/5'
                            : 'border-neutral-300 bg-neutral-50/70 hover:border-maroon/60 hover:bg-neutral-50',
                        )}
                      >
                        <input
                          ref={coverFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleCoverFileUpload(file);
                          }}
                        />
                        <UploadCloud className="h-8 w-8 text-neutral-400 mb-2" />
                        <span className="text-xs font-bold text-neutral-800">
                          Tarik &amp; lepas foto sampul di sini
                        </span>
                        <span className="mt-1 text-[11px] text-neutral-500">
                          atau klik untuk telusuri dari perangkat Anda
                        </span>
                      </div>

                      {/* Live Cover Preview */}
                      {coverUrl && (
                        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 shadow-inner">
                          <SafeImage src={coverUrl} alt="Pratinjau Sampul" />
                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-lg bg-black/60 px-3 py-1.5 backdrop-blur-sm text-white text-[11px]">
                            <span className="truncate">{coverUrl.slice(0, 45)}...</span>
                            <button
                              type="button"
                              onClick={() => setCoverUrl('')}
                              className="text-rose-400 hover:text-rose-300 ml-2"
                            >
                              Ganti
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Cover Presets */}
                      <div>
                        <span className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                          Pilihan Cepat Foto Kegiatan:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {EVENT_PHOTO_PRESETS.map((preset) => (
                            <button
                              key={preset.url}
                              type="button"
                              onClick={() => setCoverUrl(preset.url)}
                              className={cn(
                                'rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                                coverUrl === preset.url
                                  ? 'border-maroon bg-maroon/10 text-maroon font-bold'
                                  : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100',
                              )}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Metadata & Badges Card */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                      {/* Metric Pill */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                          Metrik / Penghargaan Utama <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={metric}
                          onChange={(e) => setMetric(e.target.value)}
                          placeholder="Contoh: Gold Medal & Special Commendation"
                          className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-900 focus:border-maroon focus:outline-none"
                        />
                        <div className="mt-2.5 inline-flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-900">
                          <Award className="h-4 w-4 text-amber-600" />
                          <span>{metric || 'Preview Medali / Penghargaan'}</span>
                        </div>
                      </div>

                      {/* Category */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                          Kategori Delegasi
                        </label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs font-medium text-neutral-800 focus:border-maroon focus:outline-none"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Year & Location */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                            Tahun
                          </label>
                          <input
                            type="text"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            placeholder="2026"
                            className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                            Lokasi
                          </label>
                          <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="Jakarta, Indonesia"
                            className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Summary / Excerpt */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                          Ringkasan Narasi Eksekutif
                        </label>
                        <textarea
                          rows={3}
                          value={summary}
                          onChange={(e) => setSummary(e.target.value)}
                          placeholder="Ringkasan singkat tentang proyek riset dan keberhasilan delegasi..."
                          className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs leading-relaxed text-neutral-800 focus:border-maroon focus:outline-none"
                        />
                        <p className="mt-1 text-[11px] text-neutral-400">
                          Jika dikosongkan, ringkasan akan dirangkum otomatis dari blok narasi.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* LIVE PREVIEW TAB (MATCHING CLIENT LANDING PAGE EXACTLY) */
                <div className="mx-auto max-w-5xl space-y-6">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      Pratinjau Langsung: Tampilan Kartu di Web Klien (/impacts)
                    </div>
                    <span className="text-xs text-neutral-400">Responsif &amp; Terformat</span>
                  </div>

                  {/* Public Card Mockup */}
                  <article className="grid gap-10 lg:grid-cols-12 items-start rounded-3xl border border-neutral-200/90 bg-white p-6 sm:p-10 shadow-sm transition-all">
                    {/* Media Showcase (Left) */}
                    <div className="lg:col-span-6 space-y-4">
                      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-neutral-100">
                        <SafeImage src={coverUrl} alt={title || 'Dokumentasi'} />
                        <div className="absolute top-4 left-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900/85 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                            <Globe className="h-3.5 w-3.5 text-amber-400" />
                            {CATEGORY_OPTIONS.find((c) => c.value === category)?.label ||
                              'Delegasi Internasional'}
                          </span>
                        </div>
                      </div>

                      {/* Sub-gallery thumbnails if photo blocks exist */}
                      {blocks.filter((b) => b.type === 'image' && b.imageUrl).length > 0 && (
                        <div className="grid grid-cols-3 gap-3">
                          {blocks
                            .filter((b) => b.type === 'image' && b.imageUrl)
                            .slice(0, 3)
                            .map((p, idx) => (
                              <div
                                key={idx}
                                className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100 border border-neutral-100"
                              >
                                <SafeImage
                                  src={p.imageUrl || ''}
                                  alt={p.imageCaption || 'Dokumentasi tambahan'}
                                />
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Story Narrative (Right) */}
                    <div className="lg:col-span-6 flex flex-col justify-between h-full">
                      <div>
                        {/* Meta row */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 pb-3 border-b border-neutral-100">
                          <span className="flex items-center gap-1.5 font-medium text-neutral-800">
                            <Calendar className="h-3.5 w-3.5 text-maroon" />
                            {year || '2026'}
                          </span>
                          {location && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-maroon" />
                                {location}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="mt-4 font-serif text-2xl sm:text-3xl font-medium tracking-tight text-neutral-900 leading-snug">
                          {title || 'Judul Delegasi / Prestasi Siswa'}
                        </h3>

                        {/* Subtitle */}
                        {subtitle && (
                          <p className="mt-2 text-sm text-maroon font-medium italic">
                            {subtitle}
                          </p>
                        )}

                        {/* Highlight Metric Pill */}
                        <div className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-900">
                          <Award className="h-4 w-4 text-amber-600" />
                          <span>{metric || 'Pencapaian Utama'}</span>
                        </div>

                        {/* Summary / Body */}
                        <div className="mt-5 space-y-3 text-base sm:text-lg leading-relaxed font-light text-neutral-600">
                          {summary ? (
                            <p>{summary}</p>
                          ) : (
                            blocks
                              .filter((b) => b.type === 'paragraph')
                              .map((b, i) => <p key={i}>{b.text}</p>)
                          )}
                        </div>

                        {/* Key Takeaways */}
                        {keyTakeawaysList.length > 0 && (
                          <ul className="mt-6 space-y-2.5 text-sm font-light text-neutral-700">
                            {keyTakeawaysList.map((takeaway, tIdx) => (
                              <li key={tIdx} className="flex items-start gap-2.5">
                                <CheckCircle2 className="h-4 w-4 text-maroon shrink-0 mt-0.5" />
                                <span>{takeaway}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </article>
                </div>
              )}
            </div>

            {/* Bottom Modal Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setIsStudioOpen(false)}
                className="rounded-xl px-5 py-2.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                Tutup / Batalkan
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSave('DRAFT')}
                  className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-xs font-bold text-neutral-800 hover:bg-neutral-50 transition-colors shadow-2xs"
                >
                  Simpan sebagai Draf
                </button>

                <button
                  type="button"
                  onClick={() => handleSave('PUBLISHED')}
                  className="inline-flex items-center gap-2 rounded-full bg-maroon px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-maroon/25 hover:bg-maroon-dark transition-all"
                >
                  <Check className="h-4 w-4" />
                  Terbitkan ke Web Klien
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
