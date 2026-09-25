import { redirect } from 'next/navigation';

/**
 * Every internal role lands on /home, which composes its widgets from the
 * page grants the account holds (doc 13 §8.2).
 */
export default function RootPage() {
  redirect('/home');
}
