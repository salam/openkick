import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <p className="text-lg text-gray-600 mb-6">Page not found</p>
      <Link
        href="/"
        className="px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition"
      >
        Back to Home
      </Link>
    </main>
  );
}
