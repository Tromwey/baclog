import SwiftUI

// MARK: - Reportar (perfil o reseña)

/// Pick a reason, then Enviar. "Gracias" only arrives after the server's 204 (`AppStore.report`);
/// a failure closes the sheet into a Reintentar toast that resends the same reason.
struct ReportSheet: View {
    @Environment(AppStore.self) private var store
    let target: ReportTarget
    @State private var reason: String?
    @State private var details = ""
    @State private var sending = false
    @FocusState private var detailsFocused: Bool

    private var handle: String {
        switch target {
        case .person(let h): return h
        case .review(_, let h, _): return h
        }
    }

    private var reasons: [ReportReason] {
        switch target {
        case .person:
            return ReportReason.profile
        case .review(_, _, let titleID):
            // Albums have no spoiler switch to forget (same rule as the web's review sheet).
            let album = store.title(titleID)?.format == .album
            return ReportReason.review.filter { !(album && $0.id == "unmarked_spoiler") }
        }
    }

    private var heading: String { target.isReview ? "¿qué pasa con esta reseña?" : "¿qué pasa con @\(handle)?" }

    private var note: String {
        target.isReview ? "La revisa el equipo de kura. @\(handle) no se entera de que la reportaste."
            : "Lo revisa el equipo de kura. @\(handle) no se entera de que lo reportaste."
    }

    /// Profile reports take an optional note (≤ 500 on the wire).
    private var takesDetails: Bool { if case .person = target { return reason != nil }; return false }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SheetHeader(title: heading)
            Text(note)
                .font(.kura.ui(14))
                .foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 8)

            // Writing the note: only the chosen reason stays, so the keyboard never pushes
            // the sheet's top off screen.
            let shown = detailsFocused ? reasons.filter { $0.id == reason } : reasons
            ViewThatFits(in: .vertical) {
                reasonList(shown)
                ScrollView(showsIndicators: false) { reasonList(shown) }
                    .frame(maxHeight: 380)
            }

            if takesDetails {
                detailsField
                    .padding(.top, 6)
                    .transition(.opacity)
            }

            SolidButton(title: sending ? "Enviando…" : "Enviar reporte", enabled: reason != nil && !sending) { send() }
                .padding(.top, 12)
                .accessibilityHint(reason == nil ? "Elige una razón primero" : "")
        }
        .padding(.horizontal, 20)
        .animation(KMotion.fade, value: detailsFocused)
        .animation(KMotion.fade, value: takesDetails)
    }

    private func reasonList(_ shown: [ReportReason]) -> some View {
        VStack(spacing: 0) {
            ForEach(shown) { r in
                Button {
                    reason = r.id
                    KHaptic.select()
                } label: {
                    HStack(spacing: 14) {
                        Text(r.label).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        RadioMark(on: reason == r.id)
                    }
                    .padding(.horizontal, 8)
                    .frame(minHeight: 52)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SheetRowStyle())
                .disabled(sending)
                .accessibilityAddTraits(reason == r.id ? .isSelected : [])
            }
        }
    }

    private var detailsField: some View {
        VStack(alignment: .trailing, spacing: 4) {
            TextField("", text: $details,
                      prompt: Text("Algo más que debamos saber (opcional)").foregroundStyle(KColor.text3),
                      axis: .vertical)
                .font(.kura.ui(16))
                .foregroundStyle(KColor.text)
                .tint(KColor.text)
                .lineLimit(2...4)
                .focused($detailsFocused)
                .disabled(sending)
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.field, style: .continuous))
                .onChange(of: details) { _, v in
                    if v.count > ReportReason.detailsLimit { details = String(v.prefix(ReportReason.detailsLimit)) }
                }
                .accessibilityLabel("Algo más que debamos saber, opcional")
            if details.count > ReportReason.detailsLimit - 100 {
                Text("\(details.count)/\(ReportReason.detailsLimit)").font(.kura.mono(11)).foregroundStyle(KColor.text3)
            }
        }
    }

    private func send() {
        guard let reason, !sending else { return }
        detailsFocused = false
        sending = true
        store.sheetLocked = true
        let note = details.trimmingCharacters(in: .whitespacesAndNewlines)
        let detailsOut = takesDetails && !note.isEmpty ? note : nil
        Task {
            await store.report(target, reason: reason, details: detailsOut)
            sending = false
            store.sheetLocked = false
            // Success says "Gracias"; a failure already left a Reintentar toast with this reason.
            store.dismissSheet()
        }
    }
}

// MARK: - Bloquear (su propia hoja con lo que pasa)

struct BlockSheet: View {
    @Environment(AppStore.self) private var store
    let handle: String
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("¿bloquear a @\(handle)?")
                .font(.kura.news(26))
                .foregroundStyle(KColor.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, 8)
            VStack(alignment: .leading, spacing: 14) {
                point("person.2.slash", "Dejan de seguirse, en los dos sentidos.")
                point("eye.slash", "No verás su actividad ni sus reseñas, y @\(handle) no verá las tuyas.")
                point("bell.slash", "No se le avisa. Puedes desbloquear en su perfil o en Ajustes › Cuentas bloqueadas.")
            }
            .padding(.horizontal, 8)
            .padding(.top, 10)
            .padding(.bottom, 18)
            SolidButton(title: busy ? "Bloqueando…" : "Bloquear", enabled: !busy) { confirm() }
            Button { store.dismissSheet() } label: {
                Text("Cancelar")
                    .font(.kura.ui(16, .medium))
                    .foregroundStyle(KColor.text)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(busy)
        }
        .padding(.horizontal, 16)
    }

    private func point(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: icon).font(.system(size: 15, weight: .medium))
                .foregroundStyle(KColor.text2)
                .frame(width: 22)
                .accessibilityHidden(true)
            Text(text).font(.kura.ui(15)).foregroundStyle(KColor.text)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private func confirm() {
        guard !busy else { return }
        busy = true
        store.sheetLocked = true
        Task {
            await store.block(handle)
            busy = false
            store.sheetLocked = false
            store.dismissSheet()
        }
    }
}

// MARK: - ⋯ de una reseña ajena

/// "Reportar reseña" (and "Bloquear a @…") on someone else's review. A system `Menu`:
/// native, VoiceOver-ready, and it never covers the text it's about. No destructive role —
/// it would paint the rows red, and Kura has no red.
struct ReviewMenu: View {
    @Environment(AppStore.self) private var store
    let review: Review
    @ScaledMetric(relativeTo: .callout) private var iconSize: CGFloat = 16

    static func applies(to review: Review, me: String) -> Bool {
        !review.authorID.isEmpty && review.authorID != me
    }

    var body: some View {
        Menu {
            if !store.reportedReviews.contains(review.id) {
                Button {
                    store.present(.report(.review(id: review.id, authorHandle: review.authorID, titleID: review.titleID)))
                } label: {
                    Label("Reportar reseña", systemImage: "flag")
                }
            }
            Button { store.present(.block(review.authorID)) } label: {
                Label("Bloquear a @\(review.authorID)", systemImage: "nosign")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(KColor.text2)
                .frame(width: 32, height: 28)
                .kHitArea(horizontal: 6, vertical: 8)
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .accessibilityLabel("Opciones de la reseña de @\(review.authorID)")
    }
}

// MARK: - Ajustes › Cuentas bloqueadas

struct BlockedAccountsView: View {
    @Environment(AppStore.self) private var store
    @State private var busy: Set<String> = []

    var body: some View {
        ZStack(alignment: .top) {
            KColor.bg.ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("cuentas bloqueadas").font(.kura.screenTitle).foregroundStyle(KColor.text)
                            .accessibilityAddTraits(.isHeader)
                        Text("No ves su actividad ni sus reseñas, y esas cuentas no ven las tuyas. No se les avisa.")
                            .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 8)
                    content
                }
                .padding(.top, 124)
                .padding(.horizontal, 16)
                .padding(.bottom, 56)
            }
            TopChrome { EmptyView() }
        }
        .ignoresSafeArea(.container, edges: .top)
        .task { await store.loadBlocks() }
    }

    @ViewBuilder private var content: some View {
        if let list = store.blockedAccounts {
            if let e = store.loadError(.blocks) {
                RetryStrip(error: e) { Task { await store.loadBlocks() } }
            }
            if list.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("No has bloqueado a nadie.").font(.kura.news(22)).foregroundStyle(KColor.text)
                    Text("Para bloquear a alguien, abre su perfil › Opciones.")
                        .font(.kura.ui(14)).foregroundStyle(KColor.text2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 8)
                .padding(.top, 8)
            } else {
                GroupedList {
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, a in
                        if i > 0 { ListDivider(inset: 72) }
                        row(a)
                    }
                }
                .animation(KMotion.fade, value: list)
            }
        } else if let e = store.loadError(.blocks) {
            LoadErrorBlock(error: e, titleSize: 24) { Task { await store.loadBlocks() } }
                .padding(.horizontal, 8)
        } else {
            GroupedList {
                ForEach(0..<2, id: \.self) { i in
                    if i > 0 { ListDivider(inset: 72) }
                    HStack(spacing: 14) {
                        Skeleton(radius: 999).frame(width: 44, height: 44)
                        VStack(alignment: .leading, spacing: 8) {
                            Skeleton(radius: 6).frame(width: 130, height: 14)
                            Skeleton(radius: 5).frame(width: 90, height: 10)
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 72)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Cargando")
        }
    }

    private func row(_ a: BlockedAccount) -> some View {
        let working = busy.contains(a.id)
        return HStack(spacing: 14) {
            Seal(person: a.person, size: 44)
            VStack(alignment: .leading, spacing: 3) {
                Text(a.name).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text).lineLimit(1)
                Text(a.handle.map { "@\($0)" } ?? "ya no es público").font(.kura.mono(11)).foregroundStyle(KColor.text2).lineLimit(1)
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 8)
            GlassButton(title: working ? "…" : "Desbloquear", height: 36, fontSize: 14) {
                guard !working else { return }
                busy.insert(a.id)
                Task {
                    await store.unblock(a.id, handle: a.handle) // by id: survives a handle change or a now-private account
                    busy.remove(a.id)
                }
            }
            .disabled(working)
            .kHitArea(vertical: 4)
            .accessibilityLabel(working ? "Desbloqueando" : "Desbloquear a \(a.handle.map { "@\($0)" } ?? a.name)")
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 72)
    }
}
