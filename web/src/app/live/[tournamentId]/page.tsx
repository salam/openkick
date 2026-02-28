import LiveTickerClient from './LiveTickerClient';

export async function generateStaticParams() {
  return [{ tournamentId: '_placeholder' }];
}

export default function LivePage() {
  return <LiveTickerClient />;
}
