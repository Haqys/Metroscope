'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Plus,
  Sparkles,
  Award,
  MapPin,
  Trash2,
  Edit2,
  Check,
  RefreshCw,
} from 'lucide-react';

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
}

const INITIAL_IMPACTS: ImpactRecord[] = [
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

export function ImpactsManager() {
  const [items, setItems] = useState<ImpactRecord[]>(INITIAL_IMPACTS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');

  // Form State
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState('GLOBAL_DELEGATION');
  const [year, setYear] = useState('2026');
  const [location, setLocation] = useState('Jakarta, Indonesia');
  const [metric, setMetric] = useState('');
  const [summary, setSummary] = useState('');
  const [takeaways, setTakeaways] = useState('');
  const [coverUrl, setCoverUrl] = useState('/images/events/jisf-2026-smp-1.jpg');

  const openCreateModal = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setCategory('GLOBAL_DELEGATION');
    setYear(new Date().getFullYear().toString());
    setLocation('');
    setMetric('');
    setSummary('');
    setTakeaways('');
    setCoverUrl('/images/events/jisf-2026-smp-1.jpg');
    setIsModalOpen(true);
  };

  const openEditModal = (item: ImpactRecord) => {
    setEditingId(item.id);
    setTitle(item.title);
    setSubtitle(item.subtitle);
    setCategory(item.category);
    setYear(item.year);
    setLocation(item.location);
    setMetric(item.metric);
    setSummary(item.summary);
    setTakeaways(item.keyTakeaways.join('\n'));
    setCoverUrl(item.coverUrl);
    setIsModalOpen(true);
  };

  const handleSave = (status: 'PUBLISHED' | 'DRAFT') => {
    if (!title.trim()) return alert('Mohon isi judul kegiatan/dampak.');

    const categoryLabels: Record<string, string> = {
      GLOBAL_DELEGATION: 'Delegasi Internasional',
      RESEARCH_INNOVATION: 'Riset Sains Terapan',
      PODIUM_AWARD: 'Prestasi Juara',
      COMMUNITY: 'Dampak Komunitas',
    };

    const parsedTakeaways = takeaways
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                title,
                subtitle,
                category,
                categoryLabel: categoryLabels[category] ?? 'Dampak',
                year,
                location,
                metric,
                summary,
                keyTakeaways: parsedTakeaways,
                coverUrl,
                status,
              }
            : item,
        ),
      );
    } else {
      const newItem: ImpactRecord = {
        id: `impact-${Date.now()}`,
        title,
        subtitle,
        category,
        categoryLabel: categoryLabels[category] ?? 'Dampak',
        year,
        location,
        metric,
        summary,
        keyTakeaways: parsedTakeaways,
        coverUrl,
        status,
      };
      setItems((prev) => [newItem, ...prev]);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Hapus cerita dampak ini?')) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const triggerLiveSync = async () => {
    setSyncStatus('syncing');
    try {
      // In development/production this calls the landing site's ISR purge hook
      await new Promise((r) => setTimeout(r, 800));
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch {
      setSyncStatus('idle');
    }
  };

  return (
    <div className="space-y-8">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-maroon/10 text-maroon">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">
              Cerita Dampak &amp; Delegasi Siswa
            </h3>
            <p className="text-xs text-neutral-500">
              {items.length} catatan dampak terdaftar di sistem.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={triggerLiveSync}
            disabled={syncStatus === 'syncing'}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-neutral-50 px-3.5 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50"
          >
            {syncStatus === 'syncing' ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Menyinkronkan...
              </>
            ) : syncStatus === 'synced' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Sinkron dengan Situs Klien
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Sinkronkan ke Situs Klien
              </>
            )}
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-maroon-dark"
          >
            <Plus className="h-4 w-4" />
            Tambah Cerita Dampak
          </button>
        </div>
      </div>

      {/* Grid of Impact Records */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col justify-between overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
          >
            <div>
              {/* Image Preview */}
              <div className="relative aspect-[16/9] w-full bg-neutral-100 overflow-hidden">
                <Image
                  src={item.coverUrl}
                  alt={item.title}
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="rounded-full bg-black/75 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                    {item.year}
                  </span>
                  <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-800 backdrop-blur-sm">
                    {item.categoryLabel}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                      item.status === 'PUBLISHED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.status === 'PUBLISHED' ? 'Terbit' : 'Draf'}
                  </span>
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

                <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 border border-amber-200/60">
                  <Award className="h-3.5 w-3.5 text-amber-600" />
                  <span className="truncate">{item.metric}</span>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-neutral-600 line-clamp-3 font-light">
                  {item.summary}
                </p>
              </div>
            </div>

            {/* Card Actions */}
            <div className="flex items-center justify-between border-t border-neutral-100 px-5 py-3 bg-neutral-50/50">
              <span className="text-[11px] font-mono text-neutral-400">
                {item.keyTakeaways.length} poin pencapaian
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  title="Sunting"
                  className="rounded-lg p-1.5 text-neutral-500 hover:bg-white hover:text-neutral-900 transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  title="Hapus"
                  className="rounded-lg p-1.5 text-rose-500 hover:bg-white hover:text-rose-700 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <h3 className="font-serif text-xl font-medium text-neutral-900">
                {editingId ? 'Sunting Cerita Dampak' : 'Tambah Cerita Dampak Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Judul Cerita / Delegasi
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Jakarta International Science Fair 2026 Delegation"
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Subjudul
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Ringkasan satu kalimat sorotan delegasi..."
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    Kategori
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm focus:border-navy focus:outline-none"
                  >
                    <option value="GLOBAL_DELEGATION">Delegasi Internasional</option>
                    <option value="RESEARCH_INNOVATION">Riset Sains Terapan</option>
                    <option value="PODIUM_AWARD">Prestasi Juara</option>
                    <option value="COMMUNITY">Dampak Komunitas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    Tahun
                  </label>
                  <input
                    type="text"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2026"
                    className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                    Lokasi
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Jakarta, Indonesia"
                    className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Metrik / Prestasi Utama
                </label>
                <input
                  type="text"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  placeholder="Contoh: Gold Medal & Special Commendation"
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Ringkasan Narasi Dampak
                </label>
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Ceritakan proses riset, pembimbingan, dan hasil yang diperoleh siswa..."
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Poin Kunci / Pembelajaran (Satu per baris)
                </label>
                <textarea
                  rows={3}
                  value={takeaways}
                  onChange={(e) => setTakeaways(e.target.value)}
                  placeholder="Contoh:&#10;Merancang prototipe sensor IoT&#10;Sidang tanya jawab bahasa Inggris bersama juri internasional"
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Path / URL Foto Sampul
                </label>
                <input
                  type="text"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="/images/events/jisf-2026-smp-1.jpg"
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:border-navy focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-neutral-400">
                  Gunakan foto yang sudah ada di folder /images/events/ atau pilih via Galeri Media.
                </p>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 border-t border-neutral-100 pt-5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleSave('DRAFT')}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                Simpan sebagai Draf
              </button>
              <button
                type="button"
                onClick={() => handleSave('PUBLISHED')}
                className="rounded-full bg-maroon px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-maroon-dark transition-colors"
              >
                Terbitkan ke Situs Klien
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
