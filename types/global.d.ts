// Global window augmentations used by the Meta Embedded Signup flow.
//
// `FB` + `fbAsyncInit` come from the connect.facebook.net SDK script
// loaded by <MetaSDKLoader>. The `_wabaId` + `_phoneNumberId` slots
// are how the embedded-signup popup hands the WABA id and phone
// number id to the parent page: Meta fires a `WA_EMBEDDED_SIGNUP`
// postMessage with the ids while the popup is open, and the parent
// captures them on `window` so the `FB.login` callback (which fires
// AFTER the popup closes) can read them. There's no other reliable
// way to thread that state through Meta's flow.
//
// The leading underscore is the conventional marker for "this is a
// transient page-level coordination slot, not actual app state."

export {};

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    FB: any;
    fbAsyncInit: () => void;
    _wabaId?: string;
    _phoneNumberId?: string;
  }
}
