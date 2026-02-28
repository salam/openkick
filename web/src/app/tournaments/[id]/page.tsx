import PublicTournamentClient from './PublicTournamentClient';

export async function generateStaticParams() {
  return [{ id: '_placeholder' }];
}

export default function PublicTournamentPage() {
  return <PublicTournamentClient />;
}
