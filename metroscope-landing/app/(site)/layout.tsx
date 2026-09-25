import { Footer } from '@/components/marketing/footer';
import { Navbar } from '@/components/marketing/navbar';
import { ORGANIZATION } from '@/lib/organization';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/*
        Feed autodiscovery, on every marketing page.

        Here rather than in the root layout's `metadata.alternates`, because
        Next merges metadata shallowly: any page that sets its own `alternates`
        for a canonical URL, which is nearly all of them, would replace the
        parent's and drop this link. React hoists a `<link>` into `<head>` on
        its own, so this one cannot be overwritten by a child's metadata.
      */}
      <link
        rel="alternate"
        type="application/rss+xml"
        title={`${ORGANIZATION.name}. Artikel`}
        href="/rss.xml"
      />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
