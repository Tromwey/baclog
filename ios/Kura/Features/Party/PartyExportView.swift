import SwiftUI
import UIKit

/// "Llévala a otra app" — the screen (design `fiesta-app-v2` · `isExport`), over everything
/// (`RootView`), one step at a time:
///
///  - connect: "conecta tidal." / "conecta apple music." + what kura does in your account,
///    "Conectar {svc}" (honey) — a line under it when something stopped it (permission, TIDAL said
///    no, no subscription), and "Abrir Ajustes" when iOS won't ask again;
///  - progress: "pasando la colección.", "Buscando {title} en {svc}…", the bar (processed/total),
///    "N de M" · "No cierres esta pantalla". ✕ asks first (`PartyExportLeaveSheet`);
///  - done: "lista.", "N de M canciones ya están en tu playlist de {svc}.", "No están en {svc}" with
///    cover, title, "artista · Puso @x", and "Abrir en {svc}" (honey) when there's a playlist URL;
///  - failed: "no se pudo exportar." + the server's copy, "Reintentar" (honey).
///
/// "Volver a la colección" on every step but progress.
struct PartyExportView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let flow = store.partyExport {
            content(flow)
                .onChange(of: flow.step, initial: true) { _, step in
                    // The screen stays on while it passes the songs (the steps run from here).
                    UIApplication.shared.isIdleTimerDisabled = step == .progress
                }
                .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        }
    }

    private func content(_ f: PartyExportFlow) -> some View {
        let party = store.party(f.partyID)
        return ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Button { store.closePartyExport() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(KColor.text)
                            .frame(width: 44, height: 44)
                            .contentShape(Circle())
                    }
                    .kPress()
                    .accessibilityLabel(f.step == .progress ? "Salir" : "Cerrar")
                    Spacer()
                }
                .frame(height: 56)
                .padding(.horizontal, -8)

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        FanView(covers: (party?.songs ?? []).prefix(3).map(\.art), lead: 72,
                                ghost: party?.songs.isEmpty ?? true, plus: false)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityHidden(true)
                        Text("\(f.playlistName) → \(f.provider.label)")
                            .monoLabel(11, tracking: 0.1, color: KColor.text3)
                            .padding(.top, 26)
                        Text(MusicExportCopy.title(f.step, f.provider))
                            .font(.kura.news(36))
                            .tracking(-0.5)
                            .foregroundStyle(KColor.text)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 8)
                            .accessibilityAddTraits(.isHeader)
                        Text(body(f))
                            .font(.kura.ui(15))
                            .lineSpacing(3)
                            .foregroundStyle(KColor.text2)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 10)
                            .contentTransition(.opacity)
                            .animation(KMotion.fade, value: f.current)
                        if f.step == .connect, let note = f.note {
                            Text(note)
                                .font(.kura.ui(14, .medium))
                                .lineSpacing(2)
                                .foregroundStyle(KColor.text)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 14)
                        }
                        if f.step == .progress { progress(f) }
                        if f.step == .done { missing(f) }
                    }
                    .padding(.bottom, 24)
                }
                buttons(f)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 30)
        }
    }

    private func body(_ f: PartyExportFlow) -> String {
        switch f.step {
        case .connect: return MusicExportCopy.connectBody(f.playlistName)
        case .progress:
            if let p = f.pause { return p }
            return f.current.map { MusicExportCopy.searching($0, f.provider) } ?? "Preparando la playlist…"
        case .done:
            let st = f.state
            return MusicExportCopy.done(f.provider, exported: st?.exported ?? f.total, total: st?.total ?? f.total)
        case .failed: return f.failure ?? MusicExportCopy.serviceFailed(f.provider)
        }
    }

    private func progress(_ f: PartyExportFlow) -> some View {
        let frac = f.total > 0 ? Double(f.processed) / Double(f.total) : 0
        return VStack(spacing: 10) {
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(KColor.s2)
                    Capsule().fill(KColor.text).frame(width: g.size.width * min(1, max(0, frac)))
                        .animation(.easeOut(duration: 0.3), value: frac)
                }
            }
            .frame(height: 6)
            HStack {
                Text("\(f.processed) de \(f.total)")
                Spacer()
                Text("No cierres esta pantalla")
            }
            .monoLabel(11, color: KColor.text3)
        }
        .padding(.top, 28)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Progreso")
        .accessibilityValue("\(f.processed) de \(f.total) canciones")
    }

    @ViewBuilder
    private func missing(_ f: PartyExportFlow) -> some View {
        let list = f.state?.missing ?? []
        if !list.isEmpty {
            let palettes = Dictionary((store.party(f.partyID)?.songs ?? []).map { ($0.titleID, $0.palette) }, uniquingKeysWith: { a, _ in a })
            VStack(alignment: .leading, spacing: 0) {
                Text("No están en \(f.provider.label)")
                    .monoLabel(11, tracking: 0.1, color: KColor.text3)
                    .padding(.bottom, 4)
                ForEach(list) { s in
                    HStack(spacing: 12) {
                        SongCover(url: s.artworkURL, palette: palettes[s.titleID] ?? [], size: 48, radius: 6)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.title).font(.kura.newsItalic(17)).foregroundStyle(KColor.text).lineLimit(1)
                            Text([s.artist, s.byLine].compactMap { $0 }.joined(separator: " · "))
                                .font(.kura.ui(13)).foregroundStyle(KColor.text2).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 10)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.top, 24)
        }
    }

    @ViewBuilder
    private func buttons(_ f: PartyExportFlow) -> some View {
        VStack(spacing: 8) {
            switch f.step {
            case .connect:
                if f.needsSettings {
                    SolidButton(title: "Abrir Ajustes", height: 56, honey: true) {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                } else {
                    SolidButton(title: f.busy ? "Conectando…" : "Conectar \(f.provider.label)", height: 56,
                                enabled: !f.busy, honey: true) { store.connectPartyExport() }
                }
            case .done:
                if let url = f.state?.playlist?.url {
                    SolidButton(title: "Abrir en \(f.provider.label)", height: 56, honey: true) { openURL(url) }
                }
            case .failed:
                SolidButton(title: "Reintentar", height: 56, honey: true) { store.retryPartyExport() }
            case .progress:
                EmptyView()
            }
            if f.step != .progress {
                PartyFlatButton(title: "Volver a la colección") { store.closePartyExport() }
            }
        }
    }
}

/// "¿salir ahora?" — ✕ while the songs are passing. What already passed stays in the playlist;
/// exporting again picks up where it stopped (nothing is duplicated).
struct PartyExportLeaveSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String

    var body: some View {
        let svc = store.partyExport?.provider.label ?? "la otra app"
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: "¿salir ahora?")
            PartySheetBody(text: "Las canciones que ya pasaron se quedan en tu playlist de \(svc). Si vuelves a exportar, seguimos donde quedamos.")
                .padding(.top, 10)
            VStack(spacing: 8) {
                PartyFlatButton(title: "Seguir pasándola") { store.dismissSheet() }
                PartyFlatButton(title: "Salir", quiet: true) { store.closePartyExport(force: true) }
            }
            .padding(.top, 22)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }
}
