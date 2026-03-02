import PublicTournamentClient from './PublicTournamentClient';

export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default function PublicTournamentPage() {
  return <PublicTournamentClient />;
}
