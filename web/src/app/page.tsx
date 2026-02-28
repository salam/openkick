import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">OpenKick</h1>
      <p className="text-lg text-gray-600">Youth Football Management</p>

      <div className="flex gap-4">
        <Link
          href="/login/"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          Login
        </Link>
        <Link
          href="/dashboard/"
          className="rounded-lg border border-gray-300 px-6 py-3 hover:bg-gray-50"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
