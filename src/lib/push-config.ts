// Web Push configuration.
// The VAPID PUBLIC key is not secret — it's the applicationServerKey browsers
// use to subscribe. The matching private key lives only as the VAPID_PRIVATE_KEY
// Worker secret. Regenerate the pair with `npx @pushforge/builder vapid`.
export const VAPID_PUBLIC_KEY =
  'BEM8aDqFu8k3BNSOTATOZvKrWJEOMoTnQqmKnwGiSuYRmaVL-NXsP_-TCU8cN3tpyCSB5UVHmUUUaOl3OOzPYtg';

// How far ahead of a deadline to nudge.
export const REMIND_BEFORE_MS = 3 * 60 * 60 * 1000; // 3 hours
