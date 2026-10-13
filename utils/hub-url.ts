// Where "back to Platinum Hub" goes. Set NEXT_PUBLIC_PLATINUM_HUB_URL on the host
// (for example https://platinum-hub.vercel.app); without it we fall back to sign-in.
export const HUB_URL = process.env.NEXT_PUBLIC_PLATINUM_HUB_URL || '/login'
