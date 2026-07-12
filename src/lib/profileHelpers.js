import { ls } from "./storage.js";

export function normalizeProfile(user) {
  if (!user) return null;
  const groups = Array.isArray(user.favorite_groups) ? user.favorite_groups : Array.isArray(user.fandoms) ? user.fandoms : [];
  const handle = user.handle || user.username || user.name || user.stanName || "";
  const backstageName = user.backstage_name || user.display_name || user.displayName || user.name || user.stanName || user.username || "";
  const complete = Boolean((backstageName || user.display_name) && handle);
  return {
    ...user,
    handle,
    username:user.username || handle,
    backstage_name:backstageName,
    display_name:user.display_name || backstageName,
    favorite_groups:groups,
    fandoms:groups,
    bias:user.bias || "",
    bias_wrecker:user.bias_wrecker || user.biasWrecker || "",
    onboarding_complete:user.onboarding_complete === true || complete,
    profile_complete:user.profile_complete === true || complete,
    showCity: user.show_city ?? user.showCity ?? true,
  };
}

// ─── VIP HELPER ──────────────────────────────────────────────────────────────
// Single source of truth for VIP access. Handles two sources:
//   1. Paid VIP — set by Stripe webhook (user.is_vip === true)
//   2. Comped VIP — admin-granted (user.vip_source === "comped")
//      vip_expires_at: null = permanent, ISO string = time-limited
// Both sources unlock identical VIP features. Stripe is not bypassed for paid.
export function isVipActive(user) {
  if (!user) return false;
  if (user.vip_active === true) return true;
  if (user.is_vip === true) return true;
  if (user.vip_source === "founder" || user.vip_source === "stripe") return true;
  if (user.vip_source === "comped") {
    if (!user.vip_expires_at) return true;
    return new Date(user.vip_expires_at) > new Date();
  }
  return false;
}

export function hasVipEntitlement(user) {
  return isVipActive(user) || user?.vip_source === "founder" || user?.vip_source === "stripe";
}

export function isFounderVip(user) {
  return user?.vip_source === "founder" || user?.plan === "founder";
}

// ─── FREE TIER LIMITS ────────────────────────────────────────────────────────
// Central source of truth for free vs VIP feature limits.
// VIP users bypass all limits. Reference FREE_LIMITS.* in components.
export const FREE_LIMITS = {
  askBackstageDaily: 5,          // successful AI answers per UTC day
  stageFonts: 3,                 // first 3 font moods free (classic, softpop, poster)
  stageEffects: 3,               // none + sparkles + hearts free
  savedCapsules: 2,              // capsules saved to My World
  capsulePostsPerConcert: 3,     // enforced in ConcertCapsule via FREE_CAP
  fanCirclesCreated: 1,          // user-created circles (id starts "uc-")
  scrapbookMemories: 5,          // per scrapbook book (enforced in ScrapbookTab)
  activeTradeListings: 3,        // active listings at once
};

export const onboardingCompleteKey = userId => `backstage_onboarding_complete_${userId}`;
export const vipCacheKey = userId => `backstage_is_vip_${userId}`;

export function hasCompletedOnboarding(user) {
  if (!user) return false;
  if (user.onboarding_complete === true || user.profile_complete === true || user.onboarding_skipped === true) return true;
  if (!user.id) return false;
  if (ls.get(onboardingCompleteKey(user.id), false)) return true;
  const cachedUserId = ls.get("backstage_session")?.user?.id;
  return cachedUserId === user.id && ls.get("backstage_onboarding_complete", false) === true;
}

export function markOnboardingComplete(user) {
  if (user?.id) ls.set(onboardingCompleteKey(user.id), true);
  ls.set("backstage_onboarding_complete", true);
}

export function getCachedVip(user) {
  if (!user?.id) return false;
  if (ls.get(vipCacheKey(user.id), false) === true) return true;
  const cachedUserId = ls.get("backstage_session")?.user?.id;
  return cachedUserId === user.id && ls.get("backstage_is_vip", false) === true;
}

export function setCachedVip(user, active) {
  if (user?.id) ls.set(vipCacheKey(user.id), active);
  ls.set("backstage_is_vip", active);
}

export function isProfileComplete(user) {
  const profile = normalizeProfile(user);
  return Boolean(
    hasCompletedOnboarding(profile) ||
    ((profile?.display_name || profile?.backstage_name || profile?.username) &&
      (profile?.handle || profile?.username))
  );
}

export function canEnterApp(user) {
  return hasCompletedOnboarding(user) || isProfileComplete(user);
}

export function mergeStoredProfile(localProfile, remoteProfile, fallbackProfile = null) {
  const local = normalizeProfile(localProfile);
  const remote = normalizeProfile(remoteProfile);
  const fallback = normalizeProfile(fallbackProfile);
  if (canEnterApp(local) && !canEnterApp(remote)) {
    // Local profile has richer onboarding data (fandoms, handle) — prefer it.
    // BUT: VIP/payment fields are backend-authoritative. Always take them from
    // the remote (public.users SELECT *) so stale localStorage never hides
    // a paid VIP status. Only patch when remote is available.
    if (remote) {
      return normalizeProfile({
        ...local,
        is_vip:            remote.is_vip,
        vip_source:        remote.vip_source,
        vip_expires_at:    remote.vip_expires_at,
        vip_since:         remote.vip_since,
        stripe_customer_id: remote.stripe_customer_id,
      });
    }
    return local;
  }
  const merged = normalizeProfile({ ...(fallback || {}), ...(local || {}), ...(remote || {}) });
  // Fandoms rescue: remote spread wins on all fields, but an empty DB fandoms array
  // must not erase real local fandoms. This happens when the onboarding PATCH fires
  // without a session token (email confirmation pending) — the 401 is silently
  // discarded by fetch(), local keeps the selection, DB stays at default [].
  if (!merged.fandoms?.length && local?.fandoms?.length > 0) {
    merged.fandoms = [...local.fandoms];
    merged.favorite_groups = [...local.fandoms];
  }
  // Bias rescue: normalizeProfile converts undefined bias to "", so remote's empty
  // string would erase a real local bias if the onboarding PATCH didn't reach the DB.
  if (!merged.bias && local?.bias) {
    merged.bias = local.bias;
  }
  // City rescue: don't let null/empty DB location fields erase values the user
  // already set locally. Covers the window between saveCity() and the next DB sync.
  if (!merged.city       && local?.city)       merged.city       = local.city;
  if (!merged.city_key   && local?.city_key)   merged.city_key   = local.city_key;
  if (!merged.country_code && local?.country_code) merged.country_code = local.country_code;
  if (!merged.continent  && local?.continent)  merged.continent  = local.continent;
  if (canEnterApp(local) && !canEnterApp(merged)) return local;
  return merged;
}
