/**
 * Colecciones de fiesta — the shapes the module returns (web server actions
 * hand them to the client as-is; the API v1 serializes them with
 * `api/v1/_lib/wire/party.ts`). PURE: no DB, no `server-only`, so scripts and
 * the wire check import it.
 *
 * Identity rule (every shape here): a person is NAMED (`handle`, `name`,
 * `avatarUrl`) only while they pass `publicAuthor` (`users.isPublic AND
 * username IS NOT NULL`) and — when there is a viewer — `notBlockedWith`
 * the viewer. Otherwise the person is `null` = "alguien". User ids never
 * leave the module.
 */

export type PartyRole = "host" | "guest";

/** A named person, or null = "alguien" (private, no handle, blocked either
 *  way with the viewer, or the account was deleted). */
export interface PartyPerson {
  handle: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PartySong {
  /** `catalog_item.id` of the song (media_type `track`). */
  titleId: string;
  title: string;
  artist: string | null;
  album: string | null;
  /** 600×600 mzstatic hotlink. */
  artworkUrl: string | null;
  /** iTunes 30 s preview (m4a); null when iTunes has none. */
  previewUrl: string | null;
  durationMs: number | null;
  /** The song on Apple Music (trackViewUrl). */
  appleMusicUrl: string | null;
  /** Shared cover palette (catalog_item.palette_hex); null until extracted. */
  paletteHex: string[] | null;
  addedAt: Date;
  /** Who put it — null = "Puso alguien". */
  addedBy: PartyPerson | null;
  /** The viewer put it ("Pusiste"). Independent of `addedBy` (a private
   *  viewer still sees their own songs as theirs). */
  mine: boolean;
  /** The host put it. */
  byHost: boolean;
  /** The viewer may remove it: host → any; guest → own, while not blocked. */
  canRemove: boolean;
  /** The viewer (host) may "Quitar y bloquear" its author: a guest who
   *  still exists (not the host, not a deleted account). */
  canBlockAuthor: boolean;
}

/** One line of "quién puso qué" (`@ana · 2`). `person` null = the
 *  anonymous bucket ("alguien · 1"), always last. */
export interface PartyContributor {
  person: PartyPerson | null;
  isYou: boolean;
  songCount: number;
}

export interface PartyViewer {
  role: PartyRole;
  /** The host blocked this guest (or a user block exists either way with the
   *  host): can see, cannot add or remove. Always false for the host. */
  blocked: boolean;
  /** Songs this viewer put. */
  mineCount: number;
  /** Songs still allowed: null = no cap (host, or party without a cap). */
  remaining: number | null;
  /** Can add right now (not blocked, not view-only, cap not reached). */
  canAdd: boolean;
}

export interface PartyInvite {
  /** false = desactivado (no active link). */
  active: boolean;
  /** Only while active. */
  token: string | null;
  /** `https://get-kura.app/f/{token}` — only while active. */
  url: string | null;
  /** When the active link was created — only while active. */
  createdAt: Date | null;
}

/** A guest the host blocked, for "Desbloquear". `guestRef` is an opaque,
 *  per-party reference (never a user id). */
export interface PartyBlockedGuest {
  guestRef: string;
  person: PartyPerson | null;
  blockedAt: Date;
}

/** The member view: host and guests (blocked guests included). */
export interface PartyDetail {
  id: string;
  name: string;
  /** Songs per guest: 0 = solo ver, 1..5, null = ilimitadas. */
  perGuestLimit: number | null;
  createdAt: Date;
  /** Null = "alguien" (host not public). */
  host: PartyPerson | null;
  viewer: PartyViewer;
  /** Playlist order: first added first. */
  songs: PartySong[];
  /** Distinct authors, named first by song count, then "alguien". */
  contributors: PartyContributor[];
  /** Members who joined through the link (blocked ones excluded). */
  guestCount: number;
  /** Host only (null for guests). */
  invite: PartyInvite | null;
  /** Host only ([] for guests). */
  blockedGuests: PartyBlockedGuest[];
}

/** /f/{token} — what anyone holding an ACTIVE link sees, signed in or not. */
export interface InvitePreview {
  token: string;
  party: {
    id: string;
    name: string;
    perGuestLimit: number | null;
    host: PartyPerson | null;
    songs: PartySong[];
    contributors: PartyContributor[];
    guestCount: number;
  };
  /** Null when anonymous. */
  viewer: {
    role: PartyRole | null;
    /** Already a member (host counts as member). */
    joined: boolean;
    blocked: boolean;
  } | null;
}

/** For /party ("8 canciones · @ana, @rodri y 2 más ya están dentro"). */
export interface PartySummary {
  name: string;
  songCount: number;
  guestCount: number;
  /** Up to 2 public handles of guests, in join order. */
  named: string[];
  /** guestCount − named.length. */
  othersCount: number;
  /** Up to 5 artwork URLs, playlist order (for the /party fan). */
  artworkUrls: string[];
}

/** Lists ("Tus colecciones" · filtro "De fiesta"). */
export interface PartyCard {
  id: string;
  name: string;
  role: PartyRole;
  perGuestLimit: number | null;
  songCount: number;
  /** Distinct authors (named or not). */
  peopleCount: number;
  host: PartyPerson | null;
  /** First 3 songs' artwork, playlist order. */
  artworkUrls: (string | null)[];
  /** First song's palette (the party's aura), null when none. */
  paletteHex: string[] | null;
  updatedAt: Date;
}

/** A song search hit, annotated against the party. */
export interface PartySongHit {
  titleId: string;
  title: string;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  durationMs: number | null;
  appleMusicUrl: string | null;
  paletteHex: string[] | null;
  /** Null = not in the party yet. */
  inParty: {
    mine: boolean;
    addedBy: PartyPerson | null;
  } | null;
}
