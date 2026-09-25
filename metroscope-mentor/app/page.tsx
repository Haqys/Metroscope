import { redirect } from 'next/navigation';

/** The mentor app has one home: /me. */
export default function RootPage() {
  redirect('/me');
}
