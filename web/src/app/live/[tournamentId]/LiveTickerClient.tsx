'use client';

import { useParams } from 'next/navigation';
import LiveTickerDetail from '@/components/LiveTickerDetail';

export default function LiveTickerClient() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  return <LiveTickerDetail tournamentId={tournamentId} />;
}
