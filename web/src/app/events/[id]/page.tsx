import EventDetailClient from './EventDetailClient';

export async function generateStaticParams() {
  return [{ id: '_' }];
}

export default function EventDetailPage() {
  return <EventDetailClient />;
}
