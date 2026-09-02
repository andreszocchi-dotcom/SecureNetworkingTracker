import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? '/contacts' : '/sign-in');
}
