"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import AltchaWidget from "@/components/AltchaWidget";
import { t, getLanguage } from "@/lib/i18n";
import { formatDateLong } from "@/lib/date";

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

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
  const [, setLang] = useState(() => getLanguage());
  useEffect(() => {
    function onLangChange() { setLang(getLanguage()); }
    window.addEventListener("languagechange", onLangChange);
    return () => window.removeEventListener("languagechange", onLangChange);
  }, []);

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
  const [phone, setPhone] = useState("");
  const [requirePhone, setRequirePhone] = useState(false);

  // Confirm state
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [finalStatus, setFinalStatus] = useState("");

  // Resolved event ID — either from URL or auto-detected
  const [resolvedEventId, setResolvedEventId] = useState<string | null>(eventId);

  /* ── Auto-resolve next event when no event param provided ── */
  useEffect(() => {
    if (eventId) {
      setResolvedEventId(eventId);
      return;
    }
    // No event param — fetch the next upcoming event
    fetch(`${API_URL}/api/public/next-event`)
      .then((res) => {
        if (!res.ok) throw new Error("no_event");
        return res.json();
      })
      .then((data) => {
        setResolvedEventId(String(data.id));
      })
      .catch(() => {
        setErrorMsg(t("rsvp_link_invalid"));
        setState("error");
      });
  }, [eventId]);

  /* ── Personalized mode: resolve token on mount ── */
  useEffect(() => {
    if (!resolvedEventId) return; // wait for auto-resolution

    if (token) {
      // Personalized mode
      fetch(`${API_URL}/api/rsvp/resolve?token=${encodeURIComponent(token)}&event=${encodeURIComponent(resolvedEventId)}`)
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
          setErrorMsg(t("rsvp_link_invalid"));
          setState("error");
        });
    } else {
      // Anonymous mode
      setState("name_search");
    }
  }, [token, resolvedEventId]);

  /* ── Fetch RSVP settings (phone requirement) ── */
  useEffect(() => {
    fetch(`${API_URL}/api/rsvp/settings`)
      .then((res) => res.ok ? res.json() : { requirePhone: false })
      .then((data) => setRequirePhone(data.requirePhone))
      .catch(() => {});
  }, []);

  /* ── Anonymous: search by name ── */
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!childName.trim() || !captchaPayload || !resolvedEventId) return;

    setSearchLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/rsvp/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: childName.trim(),
          eventId: resolvedEventId,
          captcha: captchaPayload,
          ...(requirePhone && phone.trim() ? { phone: phone.trim() } : {}),
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
        setErrorMsg(t("rsvp_no_player_found"));
      } else if (msg.includes("Phone mismatch") || msg.includes("Phone required")) {
        setErrorMsg(t("rsvp_phone_mismatch"));
      } else {
        setErrorMsg(t("rsvp_error_generic"));
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
      const body = token && selectedPlayer && resolvedEventId
        ? { accessToken: token, playerId: selectedPlayer.id, eventId: resolvedEventId, status }
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
      setErrorMsg(t("rsvp_error_generic"));
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
          <h2 className="mb-2 text-lg font-semibold text-red-800">{t("rsvp_error")}</h2>
          <p className="text-sm text-red-600">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
          >
            {t("rsvp_retry")}
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
            {t("rsvp_report_attendance")}
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            {t("rsvp_enter_child_name")}
          </p>

          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label
                htmlFor="child-name"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                {t("rsvp_child_name_label")}
              </label>
              <input
                id="child-name"
                type="text"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder={t("rsvp_child_name_placeholder")}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {requirePhone && (
              <div>
                <label
                  htmlFor="phone"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  {t("rsvp_phone_label")}
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("rsvp_phone_placeholder")}
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            )}

            <AltchaWidget onVerify={setCaptchaPayload} />

            <button
              type="submit"
              disabled={searchLoading || !captchaPayload || !childName.trim() || (requirePhone && !phone.trim())}
              className="w-full rounded-xl bg-primary-500 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-primary-600 disabled:opacity-50"
            >
              {searchLoading ? t("rsvp_searching") : t("rsvp_continue")}
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
            {t("rsvp_select_player")}
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            {t("rsvp_select_player_hint")}
          </p>

          <div className="space-y-3">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => {
                  setSelectedPlayer(player);
                  setState("confirm");
                }}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900 transition hover:border-primary-300 hover:bg-primary-50"
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
            {t("rsvp_confirm_question").replace("{name}", displayName).replace("{event}", displayEventTitle)}
          </h1>
          {displayEventDate && (
            <p className="mb-6 text-sm text-gray-500">
              {formatDateLong(displayEventDate)}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => handleConfirm("attending")}
              disabled={confirmLoading}
              className="flex-1 rounded-xl bg-primary-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-primary-600 disabled:opacity-50"
            >
              {confirmLoading ? "..." : t("rsvp_attending")}
            </button>
            <button
              onClick={() => handleConfirm("absent")}
              disabled={confirmLoading}
              className="flex-1 rounded-xl bg-red-500 px-6 py-4 text-lg font-bold text-white shadow transition hover:bg-red-600 disabled:opacity-50"
            >
              {confirmLoading ? "..." : t("rsvp_absent")}
            </button>
          </div>

          {/* Back to player selection if multiple players */}
          {token && players.length > 1 && (
            <button
              onClick={() => setState("select_player")}
              className="mt-4 text-sm text-primary-600 underline hover:text-primary-800"
            >
              {t("rsvp_select_other")}
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
              isAttending ? "bg-primary-100" : "bg-red-100"
            }`}
          >
            <span className="text-3xl">{isAttending ? "\u2713" : "\u2717"}</span>
          </div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">
            {isAttending ? t("rsvp_registered") : t("rsvp_unregistered")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("rsvp_recorded_as")
              .replace("{name}", displayName)
              .replace("{status}", isAttending ? t("rsvp_status_attending") : t("rsvp_status_absent"))
              .replace("{event}", displayEventTitle)}
          </p>

          {/* Allow confirming another player if multiple */}
          {token && players.length > 1 && (
            <button
              onClick={() => setState("select_player")}
              className="mt-6 rounded-lg border border-primary-300 px-4 py-2 text-sm font-medium text-primary-600 transition hover:bg-primary-50"
            >
              {t("rsvp_confirm_another")}
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
