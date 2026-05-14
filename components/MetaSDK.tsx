"use client";

// Loads Meta's JavaScript SDK so we can launch the Embedded Signup
// flow (a Meta-hosted popup that hands back the user's Phone Number
// ID, WABA ID, and a permanent access token in one step — replacing
// the manual copy-paste in wizard Steps 4 + 5).
//
// Usage:
//   <MetaSDKLoader
//     appId={process.env.NEXT_PUBLIC_META_APP_ID!}
//     onLoad={() => setSdkReady(true)}
//   />
//
// The script tag is injected on mount and removed on unmount so two
// instances don't trigger double `FB.init` warnings. The `appId` value
// is public (it's the Meta App ID, not the secret) — fine to ship to
// the browser.

// Window globals (FB, fbAsyncInit, _wabaId, _phoneNumberId) are declared
// once in types/global.d.ts. Don't re-declare them here or TS will
// flag the conflict.

import { useEffect } from "react";

interface MetaSDKProps {
  appId: string;
  onLoad?: () => void;
}

export function MetaSDKLoader({ appId, onLoad }: MetaSDKProps) {
  useEffect(() => {
    // Load Meta SDK
    window.fbAsyncInit = function () {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: "v19.0",
      });
      onLoad?.();
    };

    // Inject SDK script
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);

    return () => {
      // Cleanup
      const existing = document.querySelector(
        'script[src*="connect.facebook.net"]'
      );
      if (existing) existing.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  return null;
}
