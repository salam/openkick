import { fetchSettingsServer } from '@/lib/settings-server';
import HomeClient from '@/components/HomeClient';

export default async function Home() {
  const settings = await fetchSettingsServer();
  return <HomeClient initialSettings={settings} />;
}
