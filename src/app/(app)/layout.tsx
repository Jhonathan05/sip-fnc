import { redirect } from 'next/navigation';
import ClientLayout from '@/components/ClientLayout';
import { getSessionUser } from '@/lib/get-session-user';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return <ClientLayout user={user}>{children}</ClientLayout>;
}
