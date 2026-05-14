"use client";

// "Connect WhatsApp Business" button + state machine for Meta's
// Embedded Signup popup flow. Loads the Meta JS SDK, captures the
// WA_EMBEDDED_SIGNUP postMessage (which carries phone_number_id +
// waba_id while the popup is open), then exchanges the auth code
// server-side via POST /api/whatsapp/embedded-signup to mint a
// long-lived token + subscribe webhooks + save creds to the User row.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { MetaSDKLoader } from "@/components/MetaSDK";

type SignupState =
  | "idle"
  | "loading"
  | "popup_open"
  | "processing"
  | "success"
  | "error";

interface EmbeddedSignupProps {
  /** Fired once the backend confirms the connection. Use this in the
   * parent to swap the UI to the success card with phone + WABA name. */
  onSuccess?: (data: {
    phoneNumberId: string;
    wabaId: string;
    phoneNumber?: string;
    verifiedName?: string;
    webhookSubscribed?: boolean;
  }) => void;
  onError?: (error: string) => void;
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const CONFIG_ID =
  process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID ?? "";

// Allowed origins for the WA_EMBEDDED_SIGNUP postMessage payload. Meta
// runs the popup under both facebook.com and web.facebook.com.
const ALLOWED_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
]);

// Translate raw Meta error strings → plain English. Keep this list
// short — the goal is to spare the user a copy of Meta's JSON dump.
function translateMetaError(error: string): string {
  if (!error) return "Something went wrong. Please try again.";
  if (/code expired|invalid_code/i.test(error))
    return "The connection timed out. Please try again.";
  if (/invalid_client|invalid app/i.test(error))
    return "App configuration error. Contact support.";
  if (/access_denied|user.*denied/i.test(error))
    return "You declined the connection. Try again and click Accept.";
  if (/popup.*block/i.test(error))
    return "Popup was blocked. Please allow popups for swiftreach.app and try again.";
  if (/400/.test(error))
    return "Invalid request. Make sure you completed all steps in the Meta popup.";
  return error;
}

export function EmbeddedSignup({ onSuccess, onError }: EmbeddedSignupProps) {
  const router = useRouter();
  const [state, setState] = useState<SignupState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [sdkReady, setSdkReady] = useState(false);

  // Capture phone_number_id + waba_id while the popup is open. Meta
  // emits a `WA_EMBEDDED_SIGNUP` postMessage; we store the IDs on
  // window so the FB.login callback (fires after the popup closes)
  // can pick them up. See types/global.d.ts for why `_wabaId` lives
  // on window.
  const sessionInfoListener = useCallback((message: MessageEvent) => {
    if (!ALLOWED_ORIGINS.has(message.origin)) return;
    try {
      const data = JSON.parse(message.data);
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH") {
        const { phone_number_id, waba_id } = data.data ?? {};
        if (phone_number_id) window._phoneNumberId = phone_number_id;
        if (waba_id) window._wabaId = waba_id;
      } else if (data.event === "CANCEL") {
        setState("idle");
      } else if (data.event === "ERROR") {
        setErrorMessage(
          translateMetaError(data.data?.error_message ?? "")
        );
        setState("error");
      }
    } catch {
      // Non-JSON message — not for us.
    }
  }, []);

  // Always tear down the postMessage listener if the component
  // unmounts mid-flow (e.g. user navigates away).
  useEffect(() => {
    return () => window.removeEventListener("message", sessionInfoListener);
  }, [sessionInfoListener]);

  const handleSignup = useCallback(() => {
    if (!META_APP_ID) {
      setErrorMessage(
        "Meta App ID not configured. Contact support."
      );
      setState("error");
      return;
    }
    if (!CONFIG_ID) {
      setErrorMessage(
        "Embedded Signup configuration missing. Contact support."
      );
      setState("error");
      return;
    }
    if (!sdkReady || !window.FB) {
      setErrorMessage("Meta SDK not loaded. Please refresh the page.");
      setState("error");
      return;
    }

    setState("popup_open");
    window.addEventListener("message", sessionInfoListener);

    window.FB.login(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: any) => {
        window.removeEventListener("message", sessionInfoListener);

        // User closed the popup without consenting.
        if (!response?.authResponse?.code) {
          setState("idle");
          return;
        }

        setState("processing");
        try {
          const r = await fetch("/api/whatsapp/embedded-signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: response.authResponse.code,
              phoneNumberId: window._phoneNumberId,
              wabaId: window._wabaId,
            }),
          });
          const json = await r.json();
          // apiResponse uses { ok: true, data: ... } shape — be liberal
          // about which one we see (top-level vs nested under .data).
          const data = json?.data ?? json;
          if (r.ok && (json?.ok || json?.success)) {
            setState("success");
            onSuccess?.({
              phoneNumberId: data.phoneNumberId,
              wabaId: data.wabaId,
              phoneNumber: data.phoneNumber,
              verifiedName: data.verifiedName,
              webhookSubscribed: data.webhookSubscribed,
            });
          } else {
            throw new Error(json?.error ?? "Connection failed");
          }
        } catch (err) {
          const raw = err instanceof Error ? err.message : "Unknown error";
          const translated = translateMetaError(raw);
          setErrorMessage(translated);
          setState("error");
          onError?.(raw);
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
        },
      }
    );
  }, [sdkReady, sessionInfoListener, onSuccess, onError]);

  return (
    <>
      <MetaSDKLoader
        appId={META_APP_ID}
        onLoad={() => setSdkReady(true)}
      />

      <div className="space-y-3">
        {state === "idle" && (
          <button
            onClick={handleSignup}
            disabled={!sdkReady}
            className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1ea855] disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl text-base transition-colors"
          >
            {/* WhatsApp glyph — kept as inline SVG so it never 404s. */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="white"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            </svg>
            {sdkReady ? "Connect WhatsApp Business" : "Loading…"}
          </button>
        )}

        {state === "popup_open" && (
          <div className="w-full flex items-center justify-center gap-3 bg-blue-50 border border-blue-200 text-blue-700 py-4 px-6 rounded-xl text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Complete the steps in the Meta popup window…
          </div>
        )}

        {state === "processing" && (
          <div className="w-full flex items-center justify-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 py-4 px-6 rounded-xl text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Connecting your WhatsApp account…
          </div>
        )}

        {state === "success" && (
          <div className="w-full flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 py-4 px-6 rounded-xl">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold">WhatsApp Connected!</p>
              <p className="text-sm">
                Your account is ready to send messages.
              </p>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-2">
            <div className="w-full flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 py-4 px-6 rounded-xl">
              <span className="text-xl mt-0.5">❌</span>
              <div>
                <p className="font-semibold">Connection failed</p>
                <p className="text-sm">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setState("idle");
                setErrorMessage("");
              }}
              className="text-sm text-zinc-600 underline hover:text-zinc-900"
            >
              Try again
            </button>
          </div>
        )}

        <p className="text-center text-sm text-zinc-500">
          Having trouble?{" "}
          <button
            onClick={() => router.push("/onboarding?mode=manual")}
            className="text-[#25D366] hover:underline"
          >
            Set up manually instead
          </button>
        </p>
      </div>
    </>
  );
}
