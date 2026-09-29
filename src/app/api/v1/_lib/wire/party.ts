import type {
  InvitePreview,
  PartyCard,
  PartyDetail,
  PartySong,
  PartySongHit,
} from "@/modules/party-collections/types";
import {
  isoDate,
  type PartyWire,
  type PartySongWire,
} from "../schemas";

/**
 * Colecciones de fiesta — module shapes (party-collections/types.ts) → the
 * wire (`PartySchema` & co. in `../schemas`). PURE: `scripts/check-wire.ts`
 * parses the output without a DB. Only two things change on the way out:
 * dates become `isoDate` strings and `paletteHex` becomes `palette` (never
 * null on the wire, like `Title.palette`).
 */

export function toPartySong(s: PartySong): PartySongWire {
  return {
    titleId: s.titleId,
    title: s.title,
    artist: s.artist,
    album: s.album,
    artworkUrl: s.artworkUrl,
    previewUrl: s.previewUrl,
    durationMs: s.durationMs,
    appleMusicUrl: s.appleMusicUrl,
    appleMusicId: s.appleMusicId,
    palette: s.paletteHex ?? [],
    addedAt: isoDate(s.addedAt),
    addedBy: s.addedBy,
    mine: s.mine,
    byHost: s.byHost,
    canRemove: s.canRemove,
    canBlockAuthor: s.canBlockAuthor,
  };
}

export function toParty(p: PartyDetail): PartyWire {
  return {
    id: p.id,
    name: p.name,
    perGuestLimit: p.perGuestLimit,
    createdAt: isoDate(p.createdAt),
    host: p.host,
    viewer: p.viewer,
    songs: p.songs.map(toPartySong),
    contributors: p.contributors,
    guestCount: p.guestCount,
    invite: p.invite
      ? {
          active: p.invite.active,
          token: p.invite.token,
          url: p.invite.url,
          createdAt: p.invite.createdAt ? isoDate(p.invite.createdAt) : null,
        }
      : null,
    blockedGuests: p.blockedGuests.map((g) => ({
      guestRef: g.guestRef,
      person: g.person,
      blockedAt: isoDate(g.blockedAt),
    })),
  };
}

export function toPartyCard(c: PartyCard) {
  return {
    id: c.id,
    name: c.name,
    role: c.role,
    perGuestLimit: c.perGuestLimit,
    songCount: c.songCount,
    peopleCount: c.peopleCount,
    host: c.host,
    artworkUrls: c.artworkUrls,
    palette: c.paletteHex ?? [],
    updatedAt: isoDate(c.updatedAt),
  };
}

export function toInvitePreview(p: InvitePreview) {
  return {
    token: p.token,
    party: {
      id: p.party.id,
      name: p.party.name,
      perGuestLimit: p.party.perGuestLimit,
      host: p.party.host,
      songs: p.party.songs.map(toPartySong),
      contributors: p.party.contributors,
      guestCount: p.party.guestCount,
    },
    viewer: p.viewer,
  };
}

export function toPartySongHit(h: PartySongHit) {
  return {
    titleId: h.titleId,
    title: h.title,
    artist: h.artist,
    album: h.album,
    artworkUrl: h.artworkUrl,
    previewUrl: h.previewUrl,
    durationMs: h.durationMs,
    appleMusicUrl: h.appleMusicUrl,
    palette: h.paletteHex ?? [],
    inParty: h.inParty,
  };
}
