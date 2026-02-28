"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import AltchaWidget from "@/components/AltchaWidget";

/* ── Types ──────────────────────────────────────────────────────────── */

interface PlayerInfo {
  id: number;
  firstName: string;
}

interface EventInfo {
  id: number;
  title: string;
  date: string;
}

interface ResolveResponse {
  players: PlayerInfo[];
  event: EventInfo;
}

interface SearchResponse {
  rsvpToken: string;
  playerInitials: string;
  eventTitle: string;
  eventDate: string;
}

interface ConfirmResponse {
  finalStatus: string;
}

type PageState = "loading" | "name_search" | "select_player" | "confirm" | "done" | "error";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/* ── Helpers ─────────────────────────────────────────────────────────── */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* ── Loading skeleton ────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-md animate-pulse space-y-6 p-6">
      <div className="h-6 w-2/3 rounded bg-gray-200" />
      <div className="h-4 w-1/2 rounded bg-gray-200" />
      <div className="flex gap-4">
        <div className="h-14 w-36 rounded-xl bg-gray-200" />
        <div className="h-14 w-36 rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}

/* ── Inner component (uses useSearchParams) ──────────────────────────── */

function RsvpInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const eventId = searchParams.get("event");

  const [state, setState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // Personalized mode data
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerInfo | null>(null);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);

  // Anonymous mode data
  const [childName, setChildName] = useState("");
  const [captchaPayload, setCaptchaPayload] = useState("");
  const [rsvpToken, setRsvpToken] = useState("");
  const [playerInitials, setPlayerInitials] = useState("");
  const [anonEventTitle, setAnonEventTitle] = useState("");
  const [anonEventDate, setAnonEventDate] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  // Confirm state
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [finalStatus, setFinalStatus] = useState("");

  /* ── Personalized mode: resolve token on mount ── */
  useEffect(() => {
    if (!eventId) {
      setErrorMsg("Dieser Link ist ungueltig oder abgelaufen.");
      setState("error");
      return;
    }

    if (token) {
      // Personalized mode
      fetch(`${API_URL}/api/rsvp/resolve?token=${encodeURIComponent(token)}&event=${encodeURIComponent(eventId)}`)
        .then((res) => {
          if (!res.ok) throw new Error("invalid");
          return res.json() as Promise<ResolveResponse>;
        })
        .then((data) => {
          setPlayers(data.players);
          setEventInfo(data.event);
          if (data.players.length === 1) {
            setSelectedPlayer(data.players[0]);
            setState("confirm");
          } else {
            setState("select_player");
          }
        })
        .catch(() => {
          setErrorMsg("Dieser Link ist ungueltig oder abgelaufen.");
          setState("error");
        });
    } else {
      // Anonymous mode
      setState("name_search");
    }
  }, [token, eventId]);

  /* ── Anonymous: search by name ── */
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!childName.trim() || !captchaPayload || !eventId) return;

    setSearchLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/rsvp/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: childName.trim(),
          eventId,
          captcha: captchaPayload,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "not_found");
      }
      const data = (await res.json()) as SearchResponse;
      setRsvpToken(data.rsvpToken);
      setPlayerInitials(data.playerInitials);
      setAnonEventTitle(data.eventTitle);
      setAnonEventDate(data.eventDate);
      setState("confirm");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("not_found") || msg.includes("No player") || msg.includes("404")) {
        setErrorMsg("Kein Spieler mit diesem Namen gefunden.");
      } else {
        setErrorMsg("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
      }
      setState("error");
    } finally {
      setSearchLoading(false);
    }
  }

  /* ── Confirm attendance ── */
  async function handleConfirm(status: "attending" | "absent") {
    setConfirmLoading(true);
    try {
      const body = token && selectedPlayer && eventId
        ? { accessToken: token, playerId: selectedPlayer.id, eventId, status }
        : { rsvpToken, status };

      const res = await fetch(`${API_URL}/api/rsvp/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("confirm_failed");
      const data = (await res.json()) as ConfirmResponse;
      setFinalStatus(data.finalStatus);
      setState("done");
    } catch {
      setErrorMsg("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
      setState("error");
    } finally {
      setConfirmLoading(false);
    }
  }

  /* ── Display name for the confirm screen ── */
  const displayName = token
    ? selectedPlayer?.firstName || ""
    : playerInitials;

  const displayEventTitle = token
    ? eventInfo?.title || ""
    : anonEventTitle;

  const displayEventDate = token
    ? eventInfo?.date || ""
    : anonEventDate;

  /* ── Render ── */

  if (state === "loading") return <LoadingSkeleton />;

  if (state === "error") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold text-red-800">Fehler</h2>
          <p className="text-sm text-red-600">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
          >
            Erneut versuchen
          </button>
        </div>
      </main>
    );
  }

  if (state === "name_search") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-gray-900">
            Anwesenheit melden
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            Gib den Namen deines Kindes ein, um die Anwesenheit zu melden.
          </p>

          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label
                htmlFor="child-name"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Name deines Kindes
              </label>
              <input
                id="child-name"
                type="text"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="Vor- oder Nachname"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <AltchaWidget onVerify={setCaptchaPayload} />

            <button
              type="submit"
              disabled={searchLoading || !captchaPayload || !childName.trim()}
              className="w-full rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {searchLoading ? "Suche..." : "Weiter"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (state === "select_player") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-gray-900">
            Spieler auswaehlen
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            Fuer welches Kind moechtest du die Anwesenheit melden?
          </p>

          <div className="space-y-3">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => {
                  setSelectedPlayer(player);
                  setState("confirm");
                }}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                {player.firstName}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (state === "confirm") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          <h1 className="mb-2 text-xl font-bold text-gray-900">
            Kommt {displayName} zum {displayEventTitle}?
          </h1>
          {displayEventDate && (
            <p className="mb-6 text-sm text-gray-500">
              {formatDate(displayEventDate)}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => handleConfirm("attending")}
              disabled={confirmLoading}
              className="flex-1 rounded-xl bg-emerald-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {confirmLoading ? "..." : "Anwesend"}
            </button>
            <button
              onClick={() => handleConfirm("absent")}
              disabled={confirmLoading}
              className="flex-1 rounded-xl bg-red-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-red-600 disabled:opacity-50"
            >
              {confirmLoading ? "..." : "Abwesend"}
            </button>
          </div>

          {/* Back to player selection if multiple players */}
          {token && players.length > 1 && (
            <button
              onClick={() => setState("select_player")}
              className="mt-4 text-sm text-emerald-600 underline hover:text-emerald-800"
            >
              Anderen Spieler auswaehlen
            </button>
          )}
        </div>
      </main>
    );
  }

  if (state === "done") {
    const isAttending = finalStatus === "attending";
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              isAttending ? "bg-emerald-100" : "bg-red-100"
            }`}
          >
            <span className="text-3xl">{isAttending ? "\u2713" : "\u2717"}</span>
          </div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">
            {isAttending ? "Angemeldet!" : "Abgemeldet!"}
          </h1>
          <p className="text-sm text-gray-500">
            {displayName} wurde als{" "}
            <span
              className={`font-semibold ${
                isAttending ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {isAttending ? "anwesend" : "abwesend"}
            </span>{" "}
            fuer {displayEventTitle} eingetragen.
          </p>

          {/* Allow confirming another player if multiple */}
          {token && players.length > 1 && (
            <button
              onClick={() => setState("select_player")}
              className="mt-6 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-600 transition hover:bg-emerald-50"
            >
              Weiteren Spieler eintragen
            </button>
          )}
        </div>
      </main>
    );
  }

  return null;
}

/* ── Outer wrapper with Suspense boundary ────────────────────────────── */

export default function RsvpClient() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <RsvpInner />
    </Suspense>
  );
}
