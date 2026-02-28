import EventDetailClient from './EventDetailClient';

export async function generateStaticParams() {
  return [{ id: '_placeholder' }];
}

export default function EventDetailPage() {
  return <EventDetailClient />;
}
