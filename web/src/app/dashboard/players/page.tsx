'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPlayersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/players/');
  }, [router]);
  return null;
}
