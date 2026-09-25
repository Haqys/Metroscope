import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-6">
      <EmptyState
        title="Halaman tidak ditemukan"
        description="Tautan mungkin sudah berubah atau dihapus."
        action={
          <Button asChild>
            <Link href="/">Kembali ke beranda</Link>
          </Button>
        }
      />
    </main>
  );
}
