// ─── LS HELPERS ───────────────────────────────────────────────────────────────
export const ls = {
  get: (k, fb=null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k)   => { try { localStorage.removeItem(k); } catch {} },
};

// ─── ACCOUNT-SCOPED STORAGE BOUNDARY ──────────────────────────────────────────
// Reviewed list of localStorage keys that hold account-specific content with no
// user-id in the key name — i.e. keys that would silently leak account A's data
// into account B's session if a second account signs in on the same device.
// Deliberately excludes: device-level prefs (theme, GIF media-type toggle, one-time
// install/notif prompt dismissals, the last concerts sub-tab), and keys already
// suffixed with a user identifier (handled separately below — no leak possible).
// See docs/STORAGE_BOUNDARY_AUDIT.md §2/§3 for the full per-key classification.
export const USER_SCOPED_STORAGE_KEYS = [
  // mock auth
  'backstage_mock_user',
  // VIP / founder
  'backstage_founder_profile', 'backstage_has_binder',
  // profile / My Stage
  'backstage_top5', 'backstage_top_biases', 'backstage_top_group_details',
  'backstage_profile_style', 'backstage_privacy_settings', 'backstage_section_styles',
  // onboarding / tutorial state (affects the NEXT account's onboarding on this device)
  'backstage_onboarding_complete', 'backstage_tour_shown', 'backstage_first_action_done',
  'backstage_open_studio', 'backstage_my_binders_notice_dismissed', 'backstage_open_create_meetup',
  'backstage_open_pass_id', 'backstage_open_pass_composer', 'backstage_capsule_context',
  // My World / collections
  'backstage_photocard_sets', 'backstage_tracked_photocard_sets', 'backstage_custom_photocard_sets',
  'backstage_era_saves', 'backstage_card_wishlist', 'backstage_my_world_theme',
  'backstage_featured_shelf', 'backstage_saved_capsules', 'backstage_saved_shop_outfits',
  'backstage_card_photos', 'backstage_era_boards_v2', 'backstage_era_boards',
  'backstage_binders', 'backstage_folder_meta', 'backstage_concert_capsules',
  'backstage_scrapbook_items', 'backstage_afterglow_entries', 'backstage_afterglow_recovery',
  // wishlist / trades
  'backstage_active_trades', 'backstage_trade_passport', 'backstage_trade_history',
  'backstage_inventory_items',
  // concerts / shows / memories
  'backstage_going', 'backstage_rsvped', 'backstage_custom_meetups', 'backstage_concert_resume',
  'backstage_myshows', 'backstage_scrapbooks', 'backstage_fan_projects', 'backstage_prep_list',
  'backstage_kdramas', 'backstage_tickets', 'backstage_passes', 'backstage_concertday_active',
  // friends / social
  'backstage_friends', 'backstage_friend_requests', 'backstage_circle', 'backstage_circle_statuses',
  'backstage_circle_requests', 'backstage_fan_circles', 'backstage_joined_circles',
  'backstage_buddy_requests', 'backstage_discovery_on', 'backstage_discovery_preferences',
  'backstage_proximity_sharing', 'backstage_blocked_users', 'backstage_reports',
  // messages / DMs
  'backstage_dms', 'backstage_dm_target', 'backstage_groups', 'backstage_message_gifs',
  // GIFs — recent searches/reactions expose the previous account's activity
  'backstage_gif_recent_searches', 'backstage_gif_recent_reactions',
  // feed / posts
  'backstage_stories', 'backstage_memes', 'backstage_saved_chants', 'backstage_chant_practice_history',
  // music
  'backstage_music_connected', 'backstage_apple_recent',
  // notifications
  'backstage_notif_inbox',
  // misc
  'backstage_fan_identity', 'backstage_fan_anniversaries', 'backstage_concert_budget',
];

// Entity-scoped keys (per-concert/per-book/per-story, not per-user) that still hold
// this account's own relationship to that entity (saved/arrived/reacted/etc.) and so
// still leak between accounts sharing a device. Cleared by prefix since the entity id
// is unbounded. NOT included: backstage_venue_tips_/backstage_cdm_timeline_ (ambiguous
// — may be shared/generic content, not purely personal; see docs/STORAGE_BOUNDARY_AUDIT.md).
export const USER_SCOPED_STORAGE_PREFIXES = [
  'backstage_saved_capsule_',
  'backstage_scrapbook_memories_',
  'backstage_cdm_arrived_',
  'backstage_setlist_moment_',
  'backstage_capsule_count_',
  'backstage_story_reaction_',
];

// Keys already scoped by a specific identifier — never swept across every stored
// key (that would delete every account's entries on this device), only removed
// for the identifier actually supplied to clearUserScopedStorage below.
const USER_ID_SCOPED_PREFIXES = [
  'backstage_profile_',
  'backstage_pending_patch_',
  'backstage_is_vip_',
  'backstage_onboarding_complete_',
  'backstage_city_',
  'backstage_city_meta_',
  'backstage_now_playing_',
];
const USER_KEY_SCOPED_PREFIXES = [
  'backstage_notification_settings_',
  'backstage_push_enabled_',
  'backstage_push_token_',
  'backstage_push_prompted_',
  'backstage_push_test_',
];
const USERNAME_SCOPED_PREFIXES = [
  'backstage_pending_tags_',
];

// Clears every reviewed account-specific key/prefix (unconditionally — these never
// carry a safe "other account" value) plus, when the caller supplies the outgoing
// user's identifiers, that user's exact id-/key-/username-scoped entries. Any
// identifier-scoped group whose identifier is missing is left untouched rather
// than guessed at or swept for every account — returns the list of prefixes that
// were skipped so the caller can report it. Never throws; safe if localStorage is
// unavailable (private browsing, SSR, etc).
export function clearUserScopedStorage({ userId, userKey, username } = {}) {
  const skipped = [];
  try {
    USER_SCOPED_STORAGE_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });

    let allKeys = [];
    try { allKeys = Object.keys(localStorage); } catch {}
    USER_SCOPED_STORAGE_PREFIXES.forEach(prefix => {
      allKeys.filter(k => k.startsWith(prefix)).forEach(k => { try { localStorage.removeItem(k); } catch {} });
    });

    if (userId) {
      USER_ID_SCOPED_PREFIXES.forEach(prefix => { try { localStorage.removeItem(`${prefix}${userId}`); } catch {} });
    } else {
      skipped.push(...USER_ID_SCOPED_PREFIXES.map(p => `${p}\${userId}`));
    }

    if (userKey) {
      USER_KEY_SCOPED_PREFIXES.forEach(prefix => { try { localStorage.removeItem(`${prefix}${userKey}`); } catch {} });
    } else {
      skipped.push(...USER_KEY_SCOPED_PREFIXES.map(p => `${p}\${userKey}`));
    }

    if (username) {
      USERNAME_SCOPED_PREFIXES.forEach(prefix => { try { localStorage.removeItem(`${prefix}${username}`); } catch {} });
    } else {
      skipped.push(...USERNAME_SCOPED_PREFIXES.map(p => `${p}\${username}`));
    }
  } catch (e) {}
  return skipped;
}
