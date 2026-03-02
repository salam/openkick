import LiveTickerClient from './LiveTickerClient';

export async function generateStaticParams() {
  return [{ tournamentId: '_' }];
}

export default function LivePage() {
  return <LiveTickerClient />;
}
