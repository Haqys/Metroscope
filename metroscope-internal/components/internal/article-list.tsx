'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Clock,
  ImageOff,
  Plus,
  Search,
  Star,
  Sparkles,
  ExternalLink,
  Edit3,
  Trash2,
  Check,
  Eye,
  RefreshCw,
  UploadCloud,
  X,
  ChevronUp,
  ChevronDown,
  Quote,
  Heading2,
  Heading3,
  AlignLeft,
  List,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react';

import type { ArticleCategory, ArticleListItem, ArticleTag, ProseNode } from '@/lib/api';
import { cn } from '@/lib/utils';
import { createArticle } from '@/lib/article-actions';

const EVENT_PHOTO_PRESETS = [
  { url: '/images/events/sca-2025-award.jpg', label: 'Science Castle Asia Award 2025' },
  { url: '/images/events/sca-2025-delegation.jpg', label: 'Science Castle Asia Delegation' },
  { url: '/images/events/sca-2025-judging.jpg', label: 'Science Castle Asia Oral Judging' },
  { url: '/images/events/jisf-2026-smp-5.jpg', label: 'JISF 2026 SMP Research Poster' },
  { url: '/images/events/jisf-2026-smp-1.jpg', label: 'JISF 2026 SMP Delegation Exhibition' },
  { url: '/images/events/jisf-2026-sd-1.jpg', label: 'JISF 2026 SD Young Researchers' },
  { url: '/images/events/jisf-2026-sd-3.jpg', label: 'JISF 2026 SD Podium Recognition' },
  { url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80', label: 'i2ASPO Applied Science UGM' },
];

export interface ArticleBlock {
  id: string;
  type: 'paragraph' | 'heading2' | 'heading3' | 'quote' | 'bulletList' | 'image';
  text?: string;
  items?: string[];
  imageUrl?: string;
  imageAlt?: string;
  imageCaption?: string;
}

interface ArticleRecord extends ArticleListItem {
  subtitle?: string | null;
  blocks?: ArticleBlock[];
  rawBody?: ProseNode;
}

const STATUS_CONFIG: Record<string, { label: string; tone: string; dot: string }> = {
  PUBLISHED: {
    label: 'Terbit',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  DRAFT: {
    label: 'Draf',
    tone: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    dot: 'bg-neutral-400',
  },
};

export function ArticleList({
  items: initialItems,
  categories,
}: {
  items: ArticleListItem[];
  total: number;
  categories: ArticleCategory[];
  tags: (ArticleTag & { articleCount: number })[];
  filters: { q?: string; status?: string; categoryId?: string; tagId?: string };
}) {
  // Local storage cache key
  const STORAGE_KEY = 'metroscope_cms_articles_v2';

  const [articles, setArticles] = useState<ArticleRecord[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ArticleRecord[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const map = new Map<string, ArticleRecord>();
            initialItems.forEach((item) => map.set(item.id, item as ArticleRecord));
            parsed.forEach((item) => map.set(item.id, item));
            return Array.from(map.values());
          }
        }
      } catch {}
    }
    return initialItems as ArticleRecord[];
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Studio / Creator Modal State
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [categoryName, setCategoryName] = useState('International Competition');
  const [excerpt, setExcerpt] = useState('');
  const [authorName, setAuthorName] = useState('Metroscope Academic Board');
  const [readingMin, setReadingMin] = useState(5);
  const [featured, setFeatured] = useState(false);
  const [coverUrl, setCoverUrl] = useState('/images/events/sca-2025-award.jpg');
  const [coverAlt, setCoverAlt] = useState('');
  const [tags, setTags] = useState<string[]>(['International Competition', 'IoT']);
  const [tagInput, setTagInput] = useState('');
  const [blocks, setBlocks] = useState<ArticleBlock[]>([]);

  // File drag states
  const [isCoverDragging, setIsCoverDragging] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // Persist to localStorage whenever articles change
  useEffect(() => {
    if (typeof window !== 'undefined' && articles.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
      } catch {}
    }
  }, [articles]);

  // Fetch fresh articles from Supabase / BFF on mount to guarantee real-time sync
  useEffect(() => {
    let cancelled = false;
    async function loadFreshArticles() {
      try {
        const res = await fetch('/api/bff/site/articles');
        if (res.ok) {
          const body = await res.json();
          if (body?.items && Array.isArray(body.items) && body.items.length > 0 && !cancelled) {
            setArticles(body.items);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(body.items));
            } catch {}
          }
        }
      } catch {}
    }
    loadFreshArticles();
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const calculateReadingMin = (contentBlocks: ArticleBlock[]): number => {
    const totalWords = contentBlocks.reduce((acc, block) => {
      if (block.text) return acc + block.text.trim().split(/\s+/).length;
      if (block.items) return acc + block.items.join(' ').split(/\s+/).length;
      return acc;
    }, 0);
    return Math.max(1, Math.round(totalWords / 180));
  };

  const openNewArticleStudio = () => {
    setEditingArticleId(null);
    setTitle('');
    setSubtitle('');
    setCategoryName('International Competition');
    setExcerpt('');
    setAuthorName('Metroscope Academic Board');
    setReadingMin(5);
    setFeatured(false);
    setCoverUrl('/images/events/sca-2025-award.jpg');
    setCoverAlt('');
    setTags(['International Competition', 'IoT', 'Inovasi Siswa']);
    setBlocks([
      {
        id: 'block-1',
        type: 'paragraph',
        text: 'Tuliskan pengantar cerita keberhasilan atau wawasan riset siswa di sini. Deskripsikan konteks kompetisi, tantangan yang dihadapi, dan semangat tim Metroscope dalam menghasilkan inovasi berdampak nyata.',
      },
      {
        id: 'block-2',
        type: 'heading2',
        text: 'Dedikasi Riset & Bimbingan Intensif',
      },
      {
        id: 'block-3',
        type: 'paragraph',
        text: 'Melalui program bimbingan mentor Metroscope, para siswa melakukan pengujian laboratorium mendalam, penyusunan naskah penelitian berstandar internasional, serta simulasi presentasi di hadapan dewan juri.',
      },
      {
        id: 'block-4',
        type: 'image',
        imageUrl: '/images/events/sca-2025-judging.jpg',
        imageAlt: 'Sesi presentasi dan penilaian riset siswa di hadapan juri internasional',
        imageCaption: 'Delegasi Metroscope mempertahankan metodologi riset di hadapan dewan juri.',
      },
      {
        id: 'block-5',
        type: 'quote',
        text: 'Keberhasilan di panggung dunia membuktikan bahwa usia muda bukanlah halangan untuk menghasilkan karya sains yang presisi dan aplikatif bagi masyarakat.',
      },
      {
        id: 'block-6',
        type: 'heading2',
        text: 'Dampak & Rekomendasi Selanjutnya',
      },
      {
        id: 'block-7',
        type: 'bulletList',
        items: [
          'Pengembangan purwarupa terintegrasi sensor presisi tinggi',
          'Publikasi prosiding konferensi sains terindeks internasional',
          'Peluang beasiswa dan apresiasi jalur prestasi akademik',
        ],
      },
    ]);
    setActiveTab('editor');
    setIsStudioOpen(true);
  };

function parseProseToBlocks(doc?: ProseNode): ArticleBlock[] {
  if (!doc || !doc.content || !Array.isArray(doc.content)) return [];
  const parsed: ArticleBlock[] = [];
  doc.content.forEach((node, idx) => {
    if (node.type === 'paragraph') {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('');
      if (text.trim()) {
        parsed.push({ id: `block-${idx}-${Date.now()}`, type: 'paragraph', text });
      }
    } else if (node.type === 'heading') {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('');
      const level = node.attrs?.level === 3 ? 'heading3' : 'heading2';
      parsed.push({ id: `block-${idx}-${Date.now()}`, type: level, text });
    } else if (node.type === 'blockquote') {
      const text = (node.content ?? [])
        .map((p) => (p.content ?? []).map((c) => c.text ?? '').join(''))
        .join('\n');
      parsed.push({ id: `block-${idx}-${Date.now()}`, type: 'quote', text });
    } else if (node.type === 'bulletList') {
      const items = (node.content ?? []).map((li) =>
        (li.content ?? [])
          .map((p) => (p.content ?? []).map((c) => c.text ?? '').join(''))
          .join(''),
      );
      parsed.push({ id: `block-${idx}-${Date.now()}`, type: 'bulletList', items });
    } else if (node.type === 'image') {
      const imageUrl = (node.attrs?.src as string) || '';
      const imageAlt = (node.attrs?.alt as string) || '';
      parsed.push({
        id: `block-${idx}-${Date.now()}`,
        type: 'image',
        imageUrl,
        imageAlt,
        imageCaption: imageAlt,
      });
    }
  });
  return parsed;
}

  const openEditArticleStudio = (article: ArticleRecord) => {
    setEditingArticleId(article.id);
    setTitle(article.title);
    setSubtitle(article.subtitle ?? '');
    setCategoryName(article.categoryName ?? 'International Competition');
    setExcerpt(article.excerpt ?? '');
    setAuthorName(article.authorName ?? 'Metroscope Academic Board');
    setReadingMin(article.readingMin || 5);
    setFeatured(article.featured);
    setCoverUrl(article.coverUrl ?? '/images/events/sca-2025-award.jpg');
    setCoverAlt(article.coverAlt ?? article.title);
    setTags(article.tags.map((t) => t.name));

    const existingBlocks =
      article.blocks && article.blocks.length > 0
        ? article.blocks
        : parseProseToBlocks(article.body || article.rawBody);

    if (existingBlocks.length > 0) {
      setBlocks(existingBlocks);
    } else {
      setBlocks([
        {
          id: 'block-1',
          type: 'paragraph',
          text: article.excerpt || article.title,
        },
      ]);
    }
    setActiveTab('editor');
    setIsStudioOpen(true);
  };

  const handleImageFileDrop = (file: File, target: 'cover' | 'block', blockId?: string) => {
    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar (.png, .jpg, .webp)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (target === 'cover') {
        setCoverUrl(dataUrl);
        if (!coverAlt) setCoverAlt(file.name.replace(/\.[^/.]+$/, ''));
        showToast('Foto sampul berhasil diunggah!');
      } else if (target === 'block' && blockId) {
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  imageUrl: dataUrl,
                  imageAlt: file.name.replace(/\.[^/.]+$/, ''),
                  imageCaption: file.name.replace(/\.[^/.]+$/, ''),
                }
              : b,
          ),
        );
        showToast('Foto berhasil disisipkan ke artikel!');
      }
    };
    reader.readAsDataURL(file);
  };

  const addBlock = (type: ArticleBlock['type']) => {
    const newBlock: ArticleBlock = {
      id: `block-${Date.now()}`,
      type,
      text:
        type === 'heading2'
          ? 'Judul Bagian Baru'
          : type === 'heading3'
            ? 'Sub-Judul Bagian'
            : type === 'quote'
              ? 'Kutipan penting atau pesan kunci dari mentor/siswa...'
              : 'Tulis paragraf baru di sini...',
      items: type === 'bulletList' ? ['Poin pertama', 'Poin kedua'] : undefined,
      imageUrl: type === 'image' ? '/images/events/jisf-2026-smp-1.jpg' : undefined,
      imageAlt: type === 'image' ? 'Foto dokumentasi kegiatan' : undefined,
      imageCaption: type === 'image' ? 'Keterangan dokumentasi kegiatan riset' : undefined,
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

  const handleSaveArticle = async (status: 'PUBLISHED' | 'DRAFT') => {
    if (!title.trim()) {
      alert('Mohon masukkan judul artikel.');
      return;
    }

    const calculatedMin = calculateReadingMin(blocks);
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || `artikel-${Date.now()}`;

    // Convert blocks to TipTap / ProseNode
    const proseNodes: ProseNode[] = blocks.map((b) => {
      if (b.type === 'heading2') {
        return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: b.text || '' }] };
      }
      if (b.type === 'heading3') {
        return { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: b.text || '' }] };
      }
      if (b.type === 'quote') {
        return {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: b.text || '' }] }],
        };
      }
      if (b.type === 'bulletList') {
        return {
          type: 'bulletList',
          content: (b.items || []).map((it) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: it }] }],
          })),
        };
      }
      if (b.type === 'image') {
        return {
          type: 'image',
          attrs: { src: b.imageUrl || coverUrl, alt: b.imageCaption || b.imageAlt || '' },
        };
      }
      return { type: 'paragraph', content: [{ type: 'text', text: b.text || '' }] };
    });

    const parsedTags = tags.map((t) => ({
      id: `tag-${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: t,
      slug: t.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    }));

    const articleData: ArticleRecord = {
      id: editingArticleId || `art-${Date.now()}`,
      slug,
      title,
      subtitle: subtitle || null,
      excerpt: excerpt || title,
      locale: 'id',
      status,
      version: 1,
      featured,
      pinnedRank: featured ? 1 : null,
      readingMin: calculatedMin,
      viewCount: 0,
      publishAt: new Date().toISOString(),
      publishedAt: status === 'PUBLISHED' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      categoryId: `cat-${categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      categoryName,
      authorId: 'author-metroscope',
      authorName,
      coverId: `cov-${Date.now()}`,
      coverKey: null,
      coverUrl,
      coverAlt: coverAlt || title,
      competitionTargetId: null,
      studentId: null,
      consentSource: 'METROSCOPE_CONSENT_REGISTRY',
      tags: parsedTags,
      blocks,
      rawBody: { type: 'doc', content: proseNodes },
    };

    if (editingArticleId) {
      setArticles((prev) =>
        prev.map((a) => (a.id === editingArticleId ? { ...a, ...articleData } : a)),
      );
    } else {
      setArticles((prev) => [articleData, ...prev]);
    }

    try {
      const res = await fetch('/api/bff/site/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(articleData),
      });
      if (res.ok) {
        const freshRes = await fetch('/api/bff/site/articles');
        if (freshRes.ok) {
          const freshData = await freshRes.json();
          if (freshData?.items && Array.isArray(freshData.items)) {
            setArticles(freshData.items);
          }
        }
      }
    } catch {}

    setIsStudioOpen(false);
    showToast(
      status === 'PUBLISHED'
        ? '🎉 Artikel berhasil diterbitkan langsung ke Web Klien!'
        : '💾 Draf artikel berhasil disimpan.',
    );
  };

  const handleDeleteArticle = async (id: string) => {
    if (confirm('Hapus artikel ini dari sistem?')) {
      setArticles((prev) => prev.filter((a) => a.id !== id));
      try {
        await fetch(`/api/bff/site/articles/${id}`, { method: 'DELETE' });
      } catch {}
      showToast('Artikel telah dihapus dari Supabase & sistem.');
    }
  };

  const toggleArticleStatus = async (id: string) => {
    const target = articles.find((a) => a.id === id);
    if (!target) return;
    const next = target.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    setArticles((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          return {
            ...a,
            status: next,
            publishedAt: next === 'PUBLISHED' ? new Date().toISOString() : a.publishedAt,
          };
        }
        return a;
      }),
    );
    try {
      await fetch('/api/bff/site/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, status: next }),
      });
    } catch {}
    showToast(
      next === 'PUBLISHED'
        ? '🎉 Artikel berhasil diterbitkan langsung ke Web Klien!'
        : 'Artikel ditarik kembali ke Draf.',
    );
  };

  const triggerLiveSync = async () => {
    setSyncStatus('syncing');
    try {
      const res = await fetch('/api/bff/site/articles');
      if (res.ok) {
        const body = await res.json();
        if (body?.items && Array.isArray(body.items)) {
          setArticles(body.items);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(body.items));
          } catch {}
        }
      }
      setSyncStatus('synced');
      showToast('Semua artikel telah disinkronkan dengan Supabase & Web Klien!');
      setTimeout(() => setSyncStatus('idle'), 2500);
    } catch {
      setSyncStatus('idle');
      showToast('Gagal sinkronisasi data artikel.');
    }
  };

  const filteredArticles = articles.filter((a) => {
    if (selectedStatus && a.status !== selectedStatus) return false;
    if (selectedCategory && a.categoryId !== selectedCategory && a.categoryName !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = a.title.toLowerCase().includes(q);
      const matchExcerpt = (a.excerpt ?? '').toLowerCase().includes(q);
      const matchSubtitle = (a.subtitle ?? '').toLowerCase().includes(q);
      return matchTitle || matchExcerpt || matchSubtitle;
    }
    return true;
  });

  const publishedCount = articles.filter((a) => a.status === 'PUBLISHED').length;
  const draftCount = articles.filter((a) => a.status === 'DRAFT').length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-xl animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Header & Synchronization Action Bar */}
      <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-maroon/10 text-maroon">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-neutral-900">Artikel &amp; Publikasi Klien</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-Connect Aktif
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                Terhubung langsung dengan halaman Wawasan &amp; Artikel klien di{' '}
                <code className="text-maroon font-semibold">metroscope.id/articles</code>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={triggerLiveSync}
              disabled={syncStatus === 'syncing'}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
            >
              {syncStatus === 'syncing' ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-maroon" />
                  Menyinkronkan...
                </>
              ) : syncStatus === 'synced' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Tersinkronisasi
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 text-neutral-400" />
                  Sinkronkan
                </>
              )}
            </button>

            <a
              href="http://localhost:3004/articles"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:border-maroon/40 hover:text-maroon"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Lihat di Web Klien
            </a>

            <button
              type="button"
              onClick={openNewArticleStudio}
              className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-maroon-dark"
            >
              <Plus className="h-4 w-4" />
              Buat Artikel Baru
            </button>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50/70 p-3.5">
            <span className="text-[11px] font-medium text-neutral-500">Total Artikel</span>
            <p className="mt-1 text-2xl font-bold text-neutral-900">{articles.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3.5">
            <span className="text-[11px] font-medium text-emerald-700">Terbit di Web Utama</span>
            <p className="mt-1 text-2xl font-bold text-emerald-800">{publishedCount}</p>
          </div>
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50/70 p-3.5">
            <span className="text-[11px] font-medium text-neutral-500">Draf / Menunggu</span>
            <p className="mt-1 text-2xl font-bold text-neutral-700">{draftCount}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3.5">
            <span className="text-[11px] font-medium text-amber-700">Artikel Unggulan</span>
            <p className="mt-1 text-2xl font-bold text-amber-800">
              {articles.filter((a) => a.featured).length}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul artikel, topik, atau kata kunci..."
            className="w-full rounded-full border border-neutral-300 bg-white py-2.5 pr-4 pl-10 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-maroon focus:ring-1 focus:ring-maroon focus:outline-none"
          />
        </div>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          aria-label="Saring status"
          className="rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-xs text-neutral-700 focus:border-maroon focus:outline-none"
        >
          <option value="">Semua Status</option>
          <option value="PUBLISHED">Terbit ({publishedCount})</option>
          <option value="DRAFT">Draf ({draftCount})</option>
        </select>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          aria-label="Saring kategori"
          className="rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-xs text-neutral-700 focus:border-maroon focus:outline-none"
        >
          <option value="">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Article Cards Grid / List */}
      {filteredArticles.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <ImageOff className="mx-auto h-10 w-10 text-neutral-300" />
          <h3 className="mt-3 text-sm font-bold text-neutral-900">Tidak ada artikel ditemukan</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Coba ubah kata kunci pencarian atau buat artikel baru untuk web klien.
          </p>
          <button
            type="button"
            onClick={openNewArticleStudio}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-maroon-dark"
          >
            <Plus className="h-4 w-4" />
            Tulis Artikel Baru Sekarang
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredArticles.map((article) => {
            const status = STATUS_CONFIG[article.status] ?? STATUS_CONFIG.DRAFT!;
            return (
              <div
                key={article.id}
                className="group relative flex flex-col sm:flex-row gap-5 rounded-3xl border border-neutral-200/90 bg-white p-5 shadow-sm transition hover:border-maroon/40 hover:shadow-md"
              >
                {/* Thumbnail Image */}
                <div className="relative h-44 sm:h-auto sm:w-56 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
                  {article.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.coverUrl}
                      alt={article.coverAlt ?? article.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-300">
                      <ImageOff className="h-8 w-8" />
                    </div>
                  )}
                  {article.featured && (
                    <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-xs">
                      <Star className="h-3 w-3 fill-current" />
                      Unggulan
                    </span>
                  )}
                </div>

                {/* Content Info */}
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
                          status.tone,
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                        {status.label}
                      </span>

                      {article.categoryName && (
                        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600">
                          {article.categoryName}
                        </span>
                      )}

                      <span className="ml-auto text-[11px] text-neutral-400">
                        {new Date(article.publishedAt ?? article.updatedAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-bold text-neutral-900 group-hover:text-maroon transition-colors">
                      {article.title}
                    </h3>

                    {article.subtitle && (
                      <p className="mt-1 text-xs text-neutral-500 italic line-clamp-1">
                        {article.subtitle}
                      </p>
                    )}

                    {article.excerpt && (
                      <p className="mt-1.5 text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                        {article.excerpt}
                      </p>
                    )}
                  </div>

                  {/* Metadata and Actions */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                      <span className="inline-flex items-center gap-1 font-medium text-neutral-600">
                        <Clock className="h-3.5 w-3.5 text-neutral-400" />
                        {article.readingMin} menit baca
                      </span>
                      <span>·</span>
                      <span>{article.authorName ?? 'Metroscope Academic Board'}</span>
                      {article.tags.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-[11px] text-neutral-500">
                            {article.tags.map((t) => `#${t.name}`).slice(0, 3).join(' ')}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleArticleStatus(article.id)}
                        className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                        title={article.status === 'PUBLISHED' ? 'Kembalikan ke Draf' : 'Terbitkan langsung'}
                      >
                        {article.status === 'PUBLISHED' ? 'Tarik ke Draf' : 'Terbitkan'}
                      </button>

                      <a
                        href={`http://localhost:3004/articles/${article.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-maroon/40 hover:text-maroon"
                        title="Buka pratinjau halaman di situs utama"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Lihat
                      </a>

                      <button
                        type="button"
                        onClick={() => openEditArticleStudio(article)}
                        className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-800 transition hover:bg-neutral-200"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Sunting
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteArticle(article.id)}
                        className="rounded-full p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Hapus artikel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL ARTICLE CREATOR & STUDIO MODAL */}
      {isStudioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
          <div className="relative flex flex-col w-full max-w-5xl rounded-3xl bg-white shadow-2xl max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 bg-neutral-50/80">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-maroon text-white font-bold text-sm">
                  MS
                </span>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    {editingArticleId ? 'Sunting Artikel Web Klien' : 'Buat Artikel Baru Lengkap'}
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Otomatis sinkron dengan tampilan dan desain situs utama Metroscope.
                  </p>
                </div>
              </div>

              {/* View Switcher Tabs */}
              <div className="flex items-center gap-2">
                <div className="flex rounded-full bg-neutral-200/80 p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('editor')}
                    className={cn(
                      'rounded-full px-4 py-1.5 transition',
                      activeTab === 'editor'
                        ? 'bg-white text-neutral-900 shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900',
                    )}
                  >
                    Editor Konten
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className={cn(
                      'rounded-full px-4 py-1.5 transition flex items-center gap-1.5',
                      activeTab === 'preview'
                        ? 'bg-white text-maroon shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900',
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Pratinjau Web Klien
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsStudioOpen(false)}
                  className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 ml-2"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              {activeTab === 'editor' ? (
                <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
                  {/* Left Column: Full Long Content Builder */}
                  <div className="space-y-6">
                    {/* Title & Subtitle */}
                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                        Judul Utama Artikel
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Contoh: Science Castle Asia 2025: Inovasi IoT Siswa Raih Prestasi Dunia"
                        className="w-full rounded-2xl border border-neutral-300 p-4 text-xl sm:text-2xl font-bold text-neutral-900 placeholder:text-neutral-300 focus:border-maroon focus:ring-1 focus:ring-maroon focus:outline-none"
                      />

                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider pt-1">
                        Sub-Judul (Opsional)
                      </label>
                      <input
                        type="text"
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="Contoh: Membawa riset lingkungan dan biomedis anak bangsa ke panggung internasional di MMU Cyberjaya"
                        className="w-full rounded-xl border border-neutral-200 p-3 text-sm italic text-neutral-700 placeholder:text-neutral-400 focus:border-maroon focus:outline-none"
                      />
                    </div>

                    {/* Section Blocks Builder */}
                    <div className="space-y-4 pt-4 border-t border-neutral-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-neutral-900">
                            Isi Konten &amp; Foto Artikel
                          </h4>
                          <p className="text-xs text-neutral-500">
                            Tulis artikel panjang lengkap dengan foto dokumentasi drag &amp; drop, kutipan, dan sub-judul.
                          </p>
                        </div>
                      </div>

                      {/* Blocks List */}
                      <div className="space-y-4">
                        {blocks.map((block, index) => (
                          <div
                            key={block.id}
                            className="relative rounded-2xl border border-neutral-200/90 bg-neutral-50/50 p-4 transition hover:border-neutral-300"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-neutral-200/70 pb-2 mb-3">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 uppercase tracking-wider">
                                {block.type === 'heading2' && <Heading2 className="h-3.5 w-3.5 text-maroon" />}
                                {block.type === 'heading3' && <Heading3 className="h-3.5 w-3.5 text-maroon" />}
                                {block.type === 'paragraph' && <AlignLeft className="h-3.5 w-3.5 text-neutral-500" />}
                                {block.type === 'quote' && <Quote className="h-3.5 w-3.5 text-amber-600" />}
                                {block.type === 'bulletList' && <List className="h-3.5 w-3.5 text-neutral-500" />}
                                {block.type === 'image' && <ImageIcon className="h-3.5 w-3.5 text-blue-600" />}
                                Bagian {index + 1}: {block.type}
                              </span>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveBlock(index, 'up')}
                                  disabled={index === 0}
                                  className="rounded p-1 text-neutral-400 hover:bg-neutral-200 disabled:opacity-30"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveBlock(index, 'down')}
                                  disabled={index === blocks.length - 1}
                                  className="rounded p-1 text-neutral-400 hover:bg-neutral-200 disabled:opacity-30"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeBlock(block.id)}
                                  className="rounded p-1 text-neutral-400 hover:bg-rose-100 hover:text-rose-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Block Type Renderers */}
                            {block.type === 'paragraph' && (
                              <textarea
                                rows={4}
                                value={block.text ?? ''}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  setBlocks((prev) =>
                                    prev.map((b) => (b.id === block.id ? { ...b, text } : b)),
                                  );
                                }}
                                placeholder="Tuliskan isi paragraf di sini..."
                                className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm text-neutral-800 leading-relaxed focus:border-maroon focus:outline-none"
                              />
                            )}

                            {block.type === 'heading2' && (
                              <input
                                type="text"
                                value={block.text ?? ''}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  setBlocks((prev) =>
                                    prev.map((b) => (b.id === block.id ? { ...b, text } : b)),
                                  );
                                }}
                                placeholder="Judul Bagian H2 (contoh: Menuju Pentas Dunia)"
                                className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-base font-bold text-neutral-900 focus:border-maroon focus:outline-none"
                              />
                            )}

                            {block.type === 'heading3' && (
                              <input
                                type="text"
                                value={block.text ?? ''}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  setBlocks((prev) =>
                                    prev.map((b) => (b.id === block.id ? { ...b, text } : b)),
                                  );
                                }}
                                placeholder="Sub-Judul Bagian H3"
                                className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-sm font-semibold text-neutral-800 focus:border-maroon focus:outline-none"
                              />
                            )}

                            {block.type === 'quote' && (
                              <textarea
                                rows={2}
                                value={block.text ?? ''}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  setBlocks((prev) =>
                                    prev.map((b) => (b.id === block.id ? { ...b, text } : b)),
                                  );
                                }}
                                placeholder="Tulis kutipan / highlight penting..."
                                className="w-full rounded-xl border-l-4 border-l-gold border-neutral-300 bg-white p-3 text-sm italic text-neutral-700 focus:border-maroon focus:outline-none"
                              />
                            )}

                            {block.type === 'bulletList' && (
                              <div className="space-y-2">
                                {(block.items ?? []).map((it, itIdx) => (
                                  <div key={itIdx} className="flex items-center gap-2">
                                    <span className="text-neutral-400 font-bold">•</span>
                                    <input
                                      type="text"
                                      value={it}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setBlocks((prev) =>
                                          prev.map((b) => {
                                            if (b.id === block.id) {
                                              const newItems = [...(b.items ?? [])];
                                              newItems[itIdx] = val;
                                              return { ...b, items: newItems };
                                            }
                                            return b;
                                          }),
                                        );
                                      }}
                                      className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBlocks((prev) =>
                                          prev.map((b) => {
                                            if (b.id === block.id) {
                                              return {
                                                ...b,
                                                items: (b.items ?? []).filter((_, idx) => idx !== itIdx),
                                              };
                                            }
                                            return b;
                                          }),
                                        );
                                      }}
                                      className="text-neutral-400 hover:text-rose-600 p-1"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBlocks((prev) =>
                                      prev.map((b) => {
                                        if (b.id === block.id) {
                                          return { ...b, items: [...(b.items ?? []), 'Poin baru'] };
                                        }
                                        return b;
                                      }),
                                    );
                                  }}
                                  className="text-xs font-semibold text-maroon hover:underline mt-1"
                                >
                                  + Tambah Poin Daftar
                                </button>
                              </div>
                            )}

                            {/* PHOTO BLOCK WITH DRAG & DROP */}
                            {block.type === 'image' && (
                              <div className="space-y-3">
                                <div
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const file = e.dataTransfer.files[0];
                                    if (file) handleImageFileDrop(file, 'block', block.id);
                                  }}
                                  className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-4 transition hover:border-maroon/50"
                                >
                                  {block.imageUrl ? (
                                    <div className="w-full">
                                      <div className="h-44 w-full overflow-hidden rounded-xl bg-neutral-100">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={block.imageUrl}
                                          alt={block.imageAlt ?? ''}
                                          className="h-full w-full object-cover"
                                        />
                                      </div>
                                      <p className="mt-2 text-center text-[11px] text-neutral-400">
                                        Seret file foto lain ke sini untuk mengganti
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="py-6 text-center">
                                      <UploadCloud className="mx-auto h-8 w-8 text-neutral-400" />
                                      <p className="mt-1 text-xs font-semibold text-neutral-700">
                                        Drag &amp; Drop Foto ke Sini
                                      </p>
                                      <p className="text-[11px] text-neutral-400">
                                        atau pilih salah satu foto kegiatan dari galeri preset di bawah
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Quick Preset Selector for Photos */}
                                <div>
                                  <label className="block text-[11px] font-semibold text-neutral-500 mb-1.5">
                                    Pilih Cepat dari Galeri Kegiatan Metroscope:
                                  </label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {EVENT_PHOTO_PRESETS.slice(0, 6).map((preset, pIdx) => (
                                      <button
                                        key={pIdx}
                                        type="button"
                                        onClick={() => {
                                          setBlocks((prev) =>
                                            prev.map((b) =>
                                              b.id === block.id
                                                ? {
                                                    ...b,
                                                    imageUrl: preset.url,
                                                    imageAlt: preset.label,
                                                    imageCaption: preset.label,
                                                  }
                                                : b,
                                            ),
                                          );
                                        }}
                                        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:border-maroon hover:text-maroon transition"
                                      >
                                        {preset.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <input
                                  type="text"
                                  value={block.imageCaption ?? ''}
                                  onChange={(e) => {
                                    const imageCaption = e.target.value;
                                    setBlocks((prev) =>
                                      prev.map((b) => (b.id === block.id ? { ...b, imageCaption } : b)),
                                    );
                                  }}
                                  placeholder="Keterangan Foto (Caption yang muncul di bawah gambar)"
                                  className="w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add Block Toolbar */}
                      <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/50 p-4">
                        <span className="block text-xs font-bold text-neutral-600 mb-2.5">
                          + Sisipkan Bagian Baru ke Artikel:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => addBlock('paragraph')}
                            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:text-maroon transition"
                          >
                            <AlignLeft className="h-3.5 w-3.5" />
                            Paragraf
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock('heading2')}
                            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:text-maroon transition"
                          >
                            <Heading2 className="h-3.5 w-3.5" />
                            Sub-Judul (H2)
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock('heading3')}
                            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:text-maroon transition"
                          >
                            <Heading3 className="h-3.5 w-3.5" />
                            Sub-Judul Kecil (H3)
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock('image')}
                            className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/50 px-3.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            Foto Dokumentasi
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock('quote')}
                            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:text-maroon transition"
                          >
                            <Quote className="h-3.5 w-3.5" />
                            Kutipan / Highlight
                          </button>
                          <button
                            type="button"
                            onClick={() => addBlock('bulletList')}
                            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-maroon hover:text-maroon transition"
                          >
                            <List className="h-3.5 w-3.5" />
                            Daftar Poin
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Metadata, Cover Photo, Categories */}
                  <div className="space-y-5">
                    {/* Cover Photo Dropzone */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs">
                      <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider mb-2">
                        Foto Sampul Utama (Cover Hero)
                      </label>

                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsCoverDragging(true);
                        }}
                        onDragLeave={() => setIsCoverDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsCoverDragging(false);
                          const file = e.dataTransfer.files[0];
                          if (file) handleImageFileDrop(file, 'cover');
                        }}
                        className={cn(
                          'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 transition cursor-pointer',
                          isCoverDragging
                            ? 'border-maroon bg-maroon/5'
                            : 'border-neutral-300 bg-neutral-50/60 hover:border-neutral-400',
                        )}
                        onClick={() => coverFileInputRef.current?.click()}
                      >
                        <input
                          ref={coverFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageFileDrop(file, 'cover');
                          }}
                        />

                        {coverUrl ? (
                          <div className="w-full">
                            <div className="h-36 w-full overflow-hidden rounded-xl bg-neutral-100">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={coverUrl}
                                alt={coverAlt || title}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <p className="mt-2 text-center text-[11px] font-semibold text-maroon">
                              Klik atau Drag &amp; Drop untuk Ganti Foto Sampul
                            </p>
                          </div>
                        ) : (
                          <div className="py-6 text-center">
                            <UploadCloud className="mx-auto h-7 w-7 text-neutral-400" />
                            <p className="mt-1.5 text-xs font-semibold text-neutral-700">
                              Drag &amp; Drop Foto Sampul
                            </p>
                            <p className="text-[10px] text-neutral-400">
                              Format JPG, PNG, WebP (Rasio 16:9 disarankan)
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Cover Preset Selector */}
                      <div className="mt-3">
                        <span className="text-[11px] font-semibold text-neutral-500 block mb-1">
                          Preset Sampul Kegiatan:
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {EVENT_PHOTO_PRESETS.slice(0, 4).map((p, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => {
                                setCoverUrl(p.url);
                                setCoverAlt(p.label);
                              }}
                              className="rounded-lg border border-neutral-200 p-1 text-left text-[10px] text-neutral-600 hover:border-maroon hover:text-maroon truncate transition"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Excerpt / Ringkasan */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs">
                      <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider">
                        Ringkasan Kartu &amp; SEO
                      </label>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Teks yang tampil pada kartu artikel di katalog utama dan cuplikan Google.
                      </p>
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={excerpt}
                        onChange={(e) => setExcerpt(e.target.value)}
                        placeholder="Contoh: Belasan peneliti muda dari 5 sekolah mewakili Metroscope di Science Castle Asia 2025..."
                        className="mt-2 w-full rounded-xl border border-neutral-300 p-2.5 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                      />
                      <span className="block text-right text-[10px] text-neutral-400 mt-1">
                        {excerpt.length}/500 karakter
                      </span>
                    </div>

                    {/* Category & Byline */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider mb-1">
                          Kategori
                        </label>
                        <select
                          value={categoryName}
                          onChange={(e) => setCategoryName(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 p-2 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                        >
                          <option value="International Competition">International Competition</option>
                          <option value="Life Sciences">Life Sciences</option>
                          <option value="Applied Science">Applied Science</option>
                          <option value="Riset & Inovasi">Riset &amp; Inovasi</option>
                          <option value="Tips Lomba">Tips Lomba</option>
                          <option value="Panduan Orang Tua">Panduan Orang Tua</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider mb-1">
                          Nama Penulis (Byline)
                        </label>
                        <input
                          type="text"
                          value={authorName}
                          onChange={(e) => setAuthorName(e.target.value)}
                          className="w-full rounded-xl border border-neutral-300 p-2 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider mb-1">
                          Estimasi Waktu Baca
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={readingMin}
                            onChange={(e) => setReadingMin(Number(e.target.value) || 5)}
                            className="w-20 rounded-xl border border-neutral-300 p-2 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                          />
                          <span className="text-xs text-neutral-500">Menit baca</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-neutral-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={featured}
                            onChange={(e) => setFeatured(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-300 text-maroon focus:ring-maroon"
                          />
                          <span className="text-xs font-semibold text-neutral-800">
                            Tampilkan sebagai Artikel Unggulan (Pinned Header)
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs">
                      <label className="block text-xs font-bold text-neutral-900 uppercase tracking-wider mb-2">
                        Tag &amp; Topik
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {tags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700"
                          >
                            #{tag}
                            <button
                              type="button"
                              onClick={() => setTags((prev) => prev.filter((_, idx) => idx !== tIdx))}
                              className="text-neutral-400 hover:text-rose-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                                setTags((prev) => [...prev, tagInput.trim()]);
                                setTagInput('');
                              }
                            }
                          }}
                          placeholder="Tambah tag lalu Enter..."
                          className="flex-1 rounded-xl border border-neutral-300 px-3 py-1.5 text-xs text-neutral-800 focus:border-maroon focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                              setTags((prev) => [...prev, tagInput.trim()]);
                              setTagInput('');
                            }
                          }}
                          className="rounded-xl bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
                        >
                          Tambah
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* LIVE CLIENT WEB PREVIEW TAB */
                <div className="mx-auto max-w-3xl space-y-8 rounded-3xl border border-neutral-200 bg-white p-6 sm:p-10 shadow-sm">
                  {/* Client Web Breadcrumbs & Category Badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-maroon/10 px-3 py-1 text-xs font-bold text-maroon">
                      {categoryName}
                    </span>
                    <span className="text-xs text-neutral-400">·</span>
                    <span className="text-xs text-neutral-500">
                      {new Date().toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-xs text-neutral-400">·</span>
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                      <Clock className="h-3.5 w-3.5" />
                      {readingMin} menit baca
                    </span>
                  </div>

                  {/* Header Title */}
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight leading-tight">
                      {title || 'Judul Artikel Anda'}
                    </h1>
                    {subtitle && (
                      <p className="mt-3 text-lg font-normal text-neutral-600 leading-relaxed">
                        {subtitle}
                      </p>
                    )}
                  </div>

                  {/* Author Byline */}
                  <div className="flex items-center gap-3 border-y border-neutral-100 py-3">
                    <div className="h-10 w-10 rounded-full bg-maroon flex items-center justify-center text-white font-bold text-sm">
                      M
                    </div>
                    <div>
                      <p className="text-xs font-bold text-neutral-900">{authorName}</p>
                      <p className="text-[11px] text-neutral-500">Metroscope Mentorship Board</p>
                    </div>
                  </div>

                  {/* Hero Cover Image */}
                  {coverUrl && (
                    <figure className="overflow-hidden rounded-2xl bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={coverUrl}
                        alt={coverAlt || title}
                        className="w-full max-h-[26rem] object-cover"
                      />
                      {coverAlt && (
                        <figcaption className="p-3 text-center text-xs text-neutral-500 italic">
                          {coverAlt}
                        </figcaption>
                      )}
                    </figure>
                  )}

                  {/* Excerpt Lead */}
                  {excerpt && (
                    <p className="text-base font-medium text-neutral-700 leading-relaxed border-l-4 border-l-maroon pl-4 italic">
                      {excerpt}
                    </p>
                  )}

                  {/* Render Section Blocks */}
                  <div className="space-y-6 pt-2">
                    {blocks.map((block) => {
                      if (block.type === 'heading2') {
                        return (
                          <h2
                            key={block.id}
                            className="mt-8 text-2xl font-bold tracking-tight text-neutral-900 border-b border-neutral-100 pb-2"
                          >
                            {block.text}
                          </h2>
                        );
                      }
                      if (block.type === 'heading3') {
                        return (
                          <h3 key={block.id} className="mt-6 text-xl font-bold text-neutral-900">
                            {block.text}
                          </h3>
                        );
                      }
                      if (block.type === 'quote') {
                        return (
                          <blockquote
                            key={block.id}
                            className="my-6 rounded-2xl border-l-4 border-l-gold bg-amber-50/40 p-4 text-base italic text-neutral-700"
                          >
                            &ldquo;{block.text}&rdquo;
                          </blockquote>
                        );
                      }
                      if (block.type === 'bulletList') {
                        return (
                          <ul
                            key={block.id}
                            className="my-4 list-disc space-y-2 pl-6 text-sm text-neutral-700"
                          >
                            {(block.items ?? []).map((it, i) => (
                              <li key={i}>{it}</li>
                            ))}
                          </ul>
                        );
                      }
                      if (block.type === 'image') {
                        return (
                          <figure key={block.id} className="my-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={block.imageUrl}
                              alt={block.imageAlt ?? ''}
                              className="w-full rounded-2xl object-cover max-h-[22rem]"
                            />
                            {block.imageCaption && (
                              <figcaption className="mt-2 text-center text-xs text-neutral-500 italic">
                                {block.imageCaption}
                              </figcaption>
                            )}
                          </figure>
                        );
                      }
                      return (
                        <p key={block.id} className="text-sm leading-relaxed text-neutral-700">
                          {block.text}
                        </p>
                      );
                    })}
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-6">
                      <span className="text-xs font-semibold text-neutral-400">Topik:</span>
                      {tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer / Save & Publish Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-6 py-4 bg-neutral-50/80">
              <button
                type="button"
                onClick={() => setIsStudioOpen(false)}
                className="rounded-full border border-neutral-300 bg-white px-5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                Tutup / Batalkan
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveArticle('DRAFT')}
                  className="rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-xs font-semibold text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
                >
                  Simpan sebagai Draf
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveArticle('PUBLISHED')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-maroon-dark transition"
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
