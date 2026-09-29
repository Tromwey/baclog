import SwiftUI

// The pieces the party screens share (design `fiesta-app-v2`). Covers are records (1:1) drawn with
// the app's own `CoverImage` / `FanView`; seals are `Seal`; the page tint is `FeedSurface`.

/// A song's cover: the art at `size`, its palette while it loads (`CoverImage`), cover shadow.
struct SongCover: View {
    let url: URL?
    let palette: [String]
    var size: CGFloat = 56
    var radius: CGFloat = 10
    var shadow = true

    var body: some View {
        CoverImage(url: url, palette: palette.isEmpty ? [KColor.s2Hex] : palette)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .shadow(color: .black.opacity(shadow ? 0.7 : 0), radius: size >= 40 ? 9 : 4, x: 0, y: size >= 40 ? 9 : 4)
            .accessibilityHidden(true)
    }
}

/// An empty slot the size of a cover (`s2`): the slots card, the empty fan.
struct EmptySongSlot: View {
    var size: CGFloat = 44
    var radius: CGFloat = 6
    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous).fill(KColor.glassBg)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// A person's 18 pt seal + "Puso @ana" (the list line), or the 26 pt stack of contributors.
struct PartySeal: View {
    let person: PartyPerson?
    var size: CGFloat = 18

    var body: some View {
        Seal(person: person.seal, size: size)
    }
}

/// The contributors' seals (up to 6, overlapping 7) + "tuya · 8 canciones" / "de @eric · 8 canciones".
struct PartyCredits: View {
    let contributors: [PartyContributor]
    let host: PartyPerson?
    let isHost: Bool
    let songCount: Int

    var body: some View {
        HStack(spacing: 8) {
            if !contributors.isEmpty {
                HStack(spacing: -7) {
                    ForEach(Array(contributors.prefix(6).enumerated()), id: \.offset) { _, c in
                        PartySeal(person: c.person, size: 26)
                            .background(Circle().fill(Color.black.opacity(0.35)).padding(-2))
                    }
                }
                .accessibilityHidden(true)
            }
            Text(line)
                .font(.kura.ui(13))
                .foregroundStyle(KColor.text2)
        }
    }

    private var line: String {
        let n = PartyCopy.songs(songCount)
        return isHost ? "tuya · \(n)" : "de \(host.atOrSomeone) · \(n)"
    }
}

/// One row of "las canciones": cover 56, italic title, artist, "Puso @x" with the seal; "…" for
/// the host. Tapping it opens the song's sheet when there's something to do with it.
struct PartySongRow: View {
    let song: PartySong
    var showMore = false
    var onTap: (() -> Void)? = nil
    var onMore: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 12) {
            SongCover(url: song.artworkURL, palette: song.palette, size: 56, radius: 10)
            VStack(alignment: .leading, spacing: 3) {
                Text(song.title)
                    .font(.kura.newsItalic(17))
                    .foregroundStyle(KColor.text)
                    .lineLimit(1)
                if let a = song.artist {
                    Text(a).font(.kura.ui(14)).foregroundStyle(KColor.text2).lineLimit(1)
                }
                HStack(spacing: 6) {
                    PartySeal(person: song.mine ? nil : song.addedBy, size: 18)
                        .opacity(song.mine ? 0 : 1)
                        .frame(width: song.mine ? 0 : 18)
                    Text(song.byShort).font(.kura.ui(12)).foregroundStyle(KColor.text2).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if showMore, let onMore {
                Button(action: onMore) {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(KColor.text2)
                        .frame(width: 44, height: 44)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Opciones de \(song.title)")
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .contentShape(Rectangle())
        .onTapGesture { onTap?() }
        .accessibilityElement(children: .contain)
    }
}

/// The skeleton of "las canciones" (design `loading`): five rows.
struct PartyRowsSkeleton: View {
    var trailing: CGFloat = 44
    var body: some View {
        VStack(spacing: 2) {
            ForEach(0..<5, id: \.self) { i in
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(KColor.glassBg).frame(width: 56, height: 56)
                    VStack(alignment: .leading, spacing: 8) {
                        Capsule().fill(KColor.glassBg).frame(width: [140, 180, 120, 160, 110][i], height: 12)
                        Capsule().fill(Color.white.opacity(0.05)).frame(width: [90, 70, 110, 80, 100][i], height: 10)
                    }
                    Spacer()
                    Capsule().fill(Color.white.opacity(0.05)).frame(width: trailing, height: 44)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
            }
        }
        .kSkeletonPulse()
        .accessibilityHidden(true)
    }
}

/// A sheet's big lowercase title (Newsreader 34, fiesta-app-v2's sheets).
struct PartySheetTitle: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.kura.news(34))
            .tracking(-0.5)
            .foregroundStyle(KColor.text)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Body copy under a sheet title (Hanken 15, text2).
struct PartySheetBody: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.kura.ui(15))
            .lineSpacing(3)
            .foregroundStyle(KColor.text2)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A flat 52 pt pill on s2 (the sheets' secondary actions: "Quitar de la colección", "Crear link nuevo").
struct PartyFlatButton: View {
    let title: String
    var quiet = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.kura.ui(quiet ? 15 : 15, quiet ? .medium : .semibold))
                .foregroundStyle(quiet ? KColor.text2 : KColor.text)
                .frame(maxWidth: .infinity)
                .frame(height: quiet ? 48 : 52)
                .background(quiet ? Color.clear : KColor.glassBg, in: Capsule())
                .contentShape(Capsule())
        }
        .kPress()
    }
}

/// "Canciones por invitado": − value + over s1 (0 solo ver · 1…5 · ilimitadas).
struct PartyLimitStepper: View {
    @Binding var limit: Int?

    private var index: Int { PartyCopy.limits.firstIndex(of: limit) ?? 3 }

    var body: some View {
        HStack(spacing: 0) {
            step("minus", "Menos", enabled: index > 0) { limit = PartyCopy.limits[index - 1] }
            Text(PartyCopy.limitLabel(limit))
                .font(.kura.mono(15, medium: true))
                .foregroundStyle(KColor.text)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .contentTransition(.numericText())
                .animation(KMotion.snappy, value: limit)
            step("plus", "Más", enabled: index < PartyCopy.limits.count - 1) { limit = PartyCopy.limits[index + 1] }
        }
        .padding(.horizontal, 8)
        .frame(height: 60)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Canciones por invitado")
        .accessibilityValue(PartyCopy.limitLabel(limit))
        .accessibilityAdjustableAction { dir in
            switch dir {
            case .increment: if index < PartyCopy.limits.count - 1 { limit = PartyCopy.limits[index + 1] }
            case .decrement: if index > 0 { limit = PartyCopy.limits[index - 1] }
            @unknown default: break
            }
        }
    }

    private func step(_ icon: String, _ label: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button {
            KHaptic.play(.selection)
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(enabled ? KColor.text : KColor.text3)
                .frame(width: 44, height: 44)
                .background(KColor.glassBg, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}
