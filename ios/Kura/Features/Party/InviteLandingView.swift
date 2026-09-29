import SwiftUI

/// `get-kura.app/f/{token}` in the app (design `landing` · `loading` · `revoked`), over every phase:
///
///  - signed out: the public preview (`GET /invites/{token}` without a bearer) — the fan, the name,
///    who's in, the songs — with "Entrar" up top and the honey "Entra a kura para poner tus 3
///    canciones". Both go to the entrance; the link waits in `DeepLinkInbox` and, once the account
///    is ready, joins and opens the party with "ya estás dentro." (`AppStore.signInForInvite`);
///  - a dead link (revoked, unknown, malformed — or a block with the host: the server never says
///    which) → "este link ya no funciona.";
///  - the server without parties yet (`503`, `MIGRATION_0033_LIVE`) → "las fiestas llegan muy pronto.".
///
/// Signed in, a live link never shows this: it joins at once (`AppStore.openInvite`).
struct InviteLandingView: View {
    @Environment(AppStore.self) private var store
    let token: String

    var body: some View {
        ZStack {
            KColor.bg.ignoresSafeArea()
            if let preview = store.invite(token) {
                InvitePreviewPage(preview: preview, token: token)
            } else if store.inviteIsDead(token) {
                InviteMessage(title: PartyCopy.deadTitle, note: PartyCopy.deadNote, token: token)
            } else if store.partiesUnavailable {
                InviteMessage(title: PartyCopy.unavailableTitle, note: PartyCopy.unavailableNote, token: token)
            } else if let e = store.loadError(.invite(token)) {
                InviteMessage(title: e.loadCopy.title, note: e.loadCopy.note, token: token) {
                    Task { await store.loadInvite(token, force: true) }
                }
            } else {
                InviteLoading()
            }
        }
        .task(id: token) { await store.loadInvite(token) }
    }
}

/// The top row: the wordmark, and "Entrar" (signed out) or a close (signed in).
private struct InviteTopBar: View {
    @Environment(AppStore.self) private var store
    let token: String
    var dead = false

    var body: some View {
        HStack {
            Wordmark(size: 34)
            Spacer()
            if store.api.hasSession {
                IconChip44(systemName: "xmark", iconSize: 14, label: "Cerrar") { store.closeInviteLanding() }
            } else if !dead {
                GlassButton(title: "Entrar", flat: true) { store.signInForInvite(token) }
            }
        }
        .padding(.horizontal, 20)
        .frame(height: 56)
    }
}

private struct InviteLoading: View {
    var body: some View {
        VStack(spacing: 10) {
            HStack { Wordmark(size: 34); Spacer() }.padding(.horizontal, 20).frame(height: 56)
            FanView(covers: [], lead: 212, ghost: true, plus: false).padding(.top, 10)
            Capsule().fill(KColor.glassBg).frame(width: 140, height: 10).padding(.top, 8)
            RoundedRectangle(cornerRadius: 10).fill(KColor.glassBg).frame(width: 230, height: 32)
            Capsule().fill(Color.white.opacity(0.05)).frame(width: 170, height: 12)
            PartyRowsSkeleton().padding(.horizontal, 8).padding(.top, 26)
            Spacer()
        }
        .kSkeletonPulse()
        .accessibilityLabel("Cargando la invitación")
    }
}

/// Dead link / no parties yet / a failed read: the design's `revoked` shape.
private struct InviteMessage: View {
    @Environment(AppStore.self) private var store
    let title: String
    let note: String
    let token: String
    var retry: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            InviteTopBar(token: token, dead: true)
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: -36) {
                    ForEach(0..<3, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 8, style: .continuous).fill(KColor.glassBg)
                            .frame(width: 72, height: 72)
                            .rotationEffect(.degrees([-9, 0, 9][i]))
                            .offset(y: [8, 0, 8][i])
                            .zIndex(i == 1 ? 1 : 0)
                    }
                }
                .padding(.leading, 10)
                .accessibilityHidden(true)
                Text(title)
                    .font(.kura.news(36))
                    .tracking(-0.5)
                    .foregroundStyle(KColor.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 18)
                    .accessibilityAddTraits(.isHeader)
                Text(note)
                    .font(.kura.ui(16))
                    .lineSpacing(3)
                    .foregroundStyle(KColor.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 28)
            .frame(maxHeight: .infinity)
            VStack(spacing: 8) {
                if let retry {
                    SolidButton(title: "Reintentar", height: 56, honey: true, action: retry)
                }
                if store.api.hasSession {
                    PartyFlatButton(title: "Volver a kura", quiet: retry != nil) { store.closeInviteLanding() }
                } else {
                    if retry == nil {
                        SolidButton(title: "Conocer kura", height: 56, honey: true) { store.closeInviteLanding() }
                    } else {
                        PartyFlatButton(title: "Conocer kura", quiet: true) { store.closeInviteLanding() }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }
}

/// The public preview (design `landing`): read-only, the honey CTA at the bottom.
private struct InvitePreviewPage: View {
    @Environment(AppStore.self) private var store
    let preview: InvitePreview
    let token: String

    private var p: InvitePreview.Summary { preview.party }

    var body: some View {
        let tint = p.tint
        let tail = Tint.feedTail(tint)
        ZStack(alignment: .top) {
            tail.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    InviteTopBar(token: token)
                    VStack(spacing: 10) {
                        FanView(covers: p.songs.prefix(3).map(\.art), lead: 212, ghost: p.songs.isEmpty, plus: false,
                                label: "Portadas de \(p.name)")
                        Text("colección de fiesta").monoLabel(10).padding(.top, 4)
                        Text(p.name)
                            .font(.kura.news(36))
                            .foregroundStyle(KColor.text)
                            .multilineTextAlignment(.center)
                            .accessibilityAddTraits(.isHeader)
                        VibeLine(text: PartyCopy.heroLine(p.perGuestLimit))
                        PartyCredits(contributors: p.contributors, host: p.host, isHost: false, songCount: p.songs.count)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 10)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 26)
                    if p.songs.isEmpty {
                        VStack(spacing: 10) {
                            Text("la pista está vacía.").font(.kura.news(28)).foregroundStyle(KColor.text)
                            Text("Nadie ha puesto nada todavía. Alguien tiene que abrir la pista.")
                                .font(.kura.ui(15)).foregroundStyle(KColor.text2)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 290)
                        }
                        .padding(.horizontal, 32)
                    } else {
                        HStack {
                            Text("las canciones").font(.kura.news(22)).foregroundStyle(KColor.text)
                                .accessibilityAddTraits(.isHeader)
                            Spacer()
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 14)
                        VStack(spacing: 2) {
                            ForEach(p.songs) { s in PartySongRow(song: s) }
                        }
                        .padding(.horizontal, 8)
                    }
                }
                .padding(.top, 54)
                .padding(.bottom, 170)
                .kFeedSurface(tint, span: 900)
            }
            .ignoresSafeArea(.container, edges: .top)
        }
        .overlay(alignment: .bottom) { cta(tail: tail) }
    }

    @ViewBuilder private func cta(tail: Color) -> some View {
        let signedIn = store.api.hasSession
        VStack(spacing: 10) {
            SolidButton(title: signedIn ? "Entrar a la fiesta" : ctaTitle, height: 56, honey: true) {
                if signedIn { Task { await store.openInvite(token) } } else { store.signInForInvite(token) }
            }
            if !signedIn {
                Text("Con correo, Apple o Google · 1 minuto")
                    .monoLabel(11, color: KColor.text3)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 56)
        .padding(.bottom, 12)
        .background {
            LinearGradient(stops: [.init(color: tail.opacity(0), location: 0), .init(color: tail, location: 0.42)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .bottom)
                .allowsHitTesting(false)
        }
    }

    private var ctaTitle: String {
        guard let l = p.perGuestLimit else { return "Entra a kura para poner tus canciones" }
        if l == 0 { return "Entra a kura para ver la fiesta" }
        return l == 1 ? "Entra a kura para poner tu canción" : "Entra a kura para poner tus \(l) canciones"
    }
}
