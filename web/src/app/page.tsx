import Link from 'next/link';
import SubscribeCard from '@/components/SubscribeCard';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">OpenKick</h1>
      <p className="text-lg text-gray-600">Youth Football Management</p>

      <div className="flex gap-4">
        <Link
          href="/login/"
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-600"
        >
          Login
        </Link>
        <Link
          href="/dashboard/"
          className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Dashboard
        </Link>
      </div>

      <SubscribeCard />
    </main>
  );
}
