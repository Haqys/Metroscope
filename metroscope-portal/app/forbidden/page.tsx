import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-6">
      <EmptyState
        title="Kamu tidak punya akses ke halaman ini"
        description="Akun ini tidak memiliki peran yang diizinkan untuk aplikasi ini. Hubungi Ketua jika kamu merasa ini keliru."
        action={
          <Button asChild>
            <Link href="/">Kembali</Link>
          </Button>
        }
      />
    </main>
  );
}
