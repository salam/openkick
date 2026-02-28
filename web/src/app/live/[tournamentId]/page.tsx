'use client';

import { use } from 'react';
import LiveTickerDetail from '@/components/LiveTickerDetail';

export default function LivePage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);
  return <LiveTickerDetail tournamentId={tournamentId} />;
}
