'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EventsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/calendar/?view=list');
  }, [router]);
  return null;
}
