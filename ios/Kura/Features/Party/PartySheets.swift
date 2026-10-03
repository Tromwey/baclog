import SwiftUI
import UIKit

// The party's sheets (design `fiesta-app-v2` · welcome · cap · remove · share · opts · link ·
// export · create). All compact, in `SheetHost` like every other sheet of the app.

/// "ya estás dentro." (design `welcome`) — or "ya estás dentro, @mau." when the account already
/// existed (`returning`). Buscar mi primera canción · Ver la colección primero.
struct PartyWelcomeSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String
    let returning: Bool

    var body: some View {
        let p = store.party(partyID)
        let host = p?.host.atOrSomeone ?? "alguien"
        let limit = p?.perGuestLimit
        VStack(alignment: .leading, spacing: 0) {
            if let p, !p.songs.isEmpty {
                FanView(covers: p.songs.prefix(3).map(\.art), lead: 56)
                    .padding(.bottom, 18)
            }
            PartySheetTitle(text: returning && !store.me.handle.isEmpty ? "ya estás dentro, @\(store.me.handle)." : "ya estás dentro.")
            PartySheetBody(text: message(host: host, limit: limit)).padding(.top, 10)
            if limit != 0 {
                SolidButton(title: "Buscar mi primera canción", height: 56, honey: true) {
                    store.dismissSheet()
                    store.push(.partySearch(partyID))
                }
                .padding(.top, 24)
                PartyFlatButton(title: "Ver la colección primero", quiet: true) { store.dismissSheet() }
                    .padding(.top, 4)
            } else {
                SolidButton(title: "Ver la colección", height: 56, honey: true) { store.dismissSheet() }
                    .padding(.top, 24)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func message(host: String, limit: Int?) -> String {
        let put: String = {
            guard let limit else { return "Agrega las canciones que quieras" }
            return limit == 1 ? "Agrega tu canción" : "Agrega hasta \(limit) canciones"
        }()
        if limit == 0 { return "Eres parte de la fiesta de \(host). Aquí se escucha la playlist que creó; todos ven quién agregó cuál." }
        if returning { return "Entraste con tu cuenta de kura. \(put) en la fiesta de \(host); todos ven quién agregó cuál." }
        return "Eres parte de la fiesta de \(host). \(put); todos ven quién agregó cuál y las escuchan esa noche."
    }
}

/// "ya pusiste tus 3." (design `cap`): your songs with Quitar, then Listo.
struct PartyCapSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String
    @State private var busy: String?

    var body: some View {
        let p = store.party(partyID)
        let mine = p?.mySongs ?? []
        let limit = max(1, p?.perGuestLimit ?? mine.count)
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: limit == 1 ? "ya agregaste tu canción." : "ya agregaste tus \(limit).")
            PartySheetBody(text: "Si quieres cambiar una, quítala aquí y busca otra. Las demás siguen en la colección.")
                .padding(.top, 10)
            VStack(spacing: 2) {
                ForEach(mine) { s in
                    HStack(spacing: 12) {
                        SongCover(url: s.artworkURL, palette: s.palette, size: 48, radius: 8)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.title).font(.kura.newsItalic(17)).foregroundStyle(KColor.text).lineLimit(1)
                            if let a = s.artist { Text(a).font(.kura.ui(13)).foregroundStyle(KColor.text2).lineLimit(1) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Button {
                            Task { await remove(s) }
                        } label: {
                            ZStack {
                                Text("Quitar").opacity(busy == s.id ? 0 : 1)
                                if busy == s.id { ProgressView().tint(KColor.text) }
                            }
                            .font(.kura.ui(14, .medium))
                            .foregroundStyle(KColor.text)
                            .padding(.horizontal, 16)
                            .frame(height: 44)
                            .background(KColor.glassBg, in: Capsule())
                        }
                        .kPress()
                        .disabled(busy != nil)
                        .accessibilityLabel("Quitar \(s.title)")
                    }
                    .padding(8)
                }
            }
            .padding(.horizontal, -8)
            .padding(.top, 18)
            SolidButton(title: "Listo", height: 56, honey: true) {
                store.dismissSheet()
                if store.path(store.tab).last == .partySearch(partyID) { store.pop() }
            }
            .padding(.top, 18)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .task { await store.loadParty(partyID) }
    }

    /// Design: quitar closes the sheet and leaves you in the search, to pick another. A failed
    /// Quitar (the toast said why) keeps the sheet up with the song still in it.
    private func remove(_ s: PartySong) async {
        busy = s.id
        let ok = await store.removePartySong(partyID, s)
        busy = nil
        guard ok else { return }
        store.dismissSheet()
        if store.path(store.tab).last != .partySearch(partyID) { store.push(.partySearch(partyID)) }
    }
}

/// A song's sheet (design `remove`): the song, who put it, Quitar de la colección, and for the host
/// "Quitar y bloquear a @x" on a guest's song.
struct PartySongSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String
    let titleID: String
    @State private var busy = false

    var body: some View {
        let p = store.party(partyID)
        if let p, let s = p.songs.first(where: { $0.titleID == titleID }) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 14) {
                    SongCover(url: s.artworkURL, palette: s.palette, size: 64, radius: 8)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.title).font(.kura.newsItalic(20)).foregroundStyle(KColor.text).lineLimit(2)
                        if let a = s.artist { Text(a).font(.kura.ui(14)).foregroundStyle(KColor.text2).lineLimit(1) }
                        HStack(spacing: 6) {
                            if !s.mine { PartySeal(person: s.addedBy, size: 18) }
                            Text(s.byLong).font(.kura.ui(12, .medium)).foregroundStyle(KColor.text3)
                        }
                        .padding(.top, 2)
                    }
                }
                VStack(spacing: 8) {
                    if s.canRemove || s.mine {
                        PartyFlatButton(title: "Quitar de la colección") { run { await store.removePartySong(partyID, s) } }
                    }
                    if s.canBlockAuthor, let by = s.addedBy {
                        PartyFlatButton(title: "Quitar y bloquear a \(by.at)") { run { await store.removeAndBlockPartyGuest(partyID, s) } }
                    }
                    PartyFlatButton(title: "Cancelar", quiet: true) { store.dismissSheet() }
                }
                .disabled(busy)
                .padding(.top, 22)
                Text(s.canBlockAuthor && s.addedBy != nil
                     ? "\(s.addedBy.atOrSomeone) no recibe aviso. Si lo bloqueas, ya no podrá agregar canciones."
                     : "La canción sale de la colección para todos.")
                    .font(.kura.ui(12))
                    .foregroundStyle(KColor.text3)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        } else {
            // Gone meanwhile (someone else removed it): nothing left to do here.
            Color.clear.frame(height: 40).onAppear { store.dismissSheet() }
        }
    }

    /// Closes only when it worked; a failure leaves the sheet up (the toast said why).
    private func run(_ op: @escaping () async -> Bool) {
        busy = true
        Task {
            let ok = await op()
            busy = false
            if ok { store.dismissSheet() }
        }
    }
}

/// "invita a la fiesta." (design `share`): the link with Copiar, Compartir link (the system share
/// sheet with `get-kura.app/f/{token}`), Gestionar link. A dead link offers a new one instead.
struct PartyShareSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String
    @State private var copied = false

    var body: some View {
        let p = store.party(partyID)
        let invite = p?.invite
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: "invita a la fiesta.")
            PartySheetBody(text: note(p?.perGuestLimit)).padding(.top, 10)
            if let invite, invite.active, let url = invite.url {
                HStack {
                    Text(invite.display)
                        .font(.kura.mono(14, medium: true))
                        .foregroundStyle(KColor.text)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: 8)
                    Button {
                        UIPasteboard.general.url = url
                        KHaptic.play(.success)
                        withAnimation(KMotion.fade) { copied = true }
                    } label: {
                        Text(copied ? "Copiado" : "Copiar")
                            .font(.kura.ui(13, .medium))
                            .foregroundStyle(KColor.text)
                            .padding(.horizontal, 14)
                            .frame(height: 40)
                            .background(Color.white.opacity(0.14), in: Capsule())
                    }
                    .kPress()
                }
                .padding(.leading, 16)
                .padding(.trailing, 8)
                .frame(height: 56)
                .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.field, style: .continuous))
                .padding(.top, 18)
                ShareLink(item: url, message: Text("Agrega tus canciones en \(p?.name ?? "la fiesta")")) {
                    Text("Compartir link")
                        .font(.kura.ui(16, .semibold))
                        .foregroundStyle(KColor.onAccent)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(KColor.accent, in: Capsule())
                        .contentShape(Capsule())
                }
                .kPress()
                .padding(.top, 12)
                PartyFlatButton(title: "Gestionar link", quiet: true) { store.present(.partyLink(partyID)) }
                    .padding(.top, 4)
            } else {
                Text("El link está desactivado: nadie más puede entrar con él.")
                    .font(.kura.ui(14))
                    .foregroundStyle(KColor.text2)
                    .padding(.top, 16)
                SolidButton(title: "Crear link nuevo", height: 56, honey: true) {
                    Task { await store.rotatePartyInvite(partyID) }
                }
                .padding(.top, 18)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func note(_ l: Int?) -> String {
        let tail: String = {
            guard let l else { return "Con cuenta en kura, agrega las canciones que quiera." }
            if l == 0 { return "Es solo para escuchar: nadie más agrega canciones." }
            return l == 1 ? "Con cuenta en kura, agrega 1 canción." : "Con cuenta en kura, agrega hasta \(l) canciones."
        }()
        return "Quien abra el link ve la colección en vivo. \(tail)"
    }
}

/// Opciones. The host's (design `opts`): Gestionar link · Llevar a otra app · Editar, plus
/// Bloqueados (when there are) and Borrar fiesta. A guest's: Llevar a otra app · Salir de la fiesta.
struct PartyOptionsSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String

    var body: some View {
        let p = store.party(partyID)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(p?.name ?? "").font(.kura.news(24)).foregroundStyle(KColor.text).lineLimit(2)
                Spacer(minLength: 0)
                Text(PartyCopy.songs(p?.songs.count ?? 0)).monoLabel(11)
            }
            .padding(.bottom, 10)
            if p?.isHost == false {
                VStack(spacing: 2) {
                    SheetRow(systemImage: "arrow.right", label: "Llevar a otra app") { store.present(.partyExport(partyID)) }
                    SheetRow(systemImage: "rectangle.portrait.and.arrow.right", label: "Salir de la fiesta") {
                        store.present(.partyLeave(partyID))
                    }
                }
                .padding(.horizontal, -8)
            } else {
                hostRows(p)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func hostRows(_ p: Party?) -> some View {
        VStack(spacing: 2) {
            SheetRow(systemImage: "link", label: "Gestionar link", action: { store.present(.partyLink(partyID)) }) {
                Text(p?.invite?.active == true ? "activo" : "desactivado").monoLabel(11, color: KColor.text3)
            }
            SheetRow(systemImage: "arrow.right", label: "Llevar a otra app") { store.present(.partyExport(partyID)) }
            SheetRow(systemImage: "pencil", label: "Editar") { store.present(.partyEdit(partyID)) }
            if let n = p?.blockedGuests.count, n > 0 {
                SheetRow(systemImage: "hand.raised", label: "Bloqueados", action: { store.present(.partyBlocked(partyID)) }) {
                    Text("\(n)").monoLabel(11, color: KColor.text3)
                }
            }
            SheetDivider()
            SheetRow(systemImage: "trash", label: "Borrar fiesta") { store.present(.partyDelete(partyID)) }
        }
        .padding(.horizontal, -8)
    }
}

/// "¿salir de la fiesta?" (a guest, C3): you stop seeing it and it leaves your collections; your
/// songs stay. Coming back takes the link again.
struct PartyLeaveSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String
    @State private var busy = false

    var body: some View {
        let p = store.party(partyID)
        let host = p?.host.atOrSomeone ?? "alguien"
        let mine = p?.mySongs.count ?? 0
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: "¿salir de la fiesta?")
            PartySheetBody(text: note(host: host, mine: mine)).padding(.top, 10)
            VStack(spacing: 8) {
                PartyFlatButton(title: "Salir de la fiesta") {
                    busy = true
                    Task { await store.leaveParty(partyID); busy = false }
                }
                PartyFlatButton(title: "Cancelar", quiet: true) { store.dismissSheet() }
            }
            .disabled(busy)
            .padding(.top, 22)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func note(host: String, mine: Int) -> String {
        let songs = mine == 0 ? "" : mine == 1 ? " La canción que agregaste se queda." : " Las \(mine) canciones que agregaste se quedan."
        return "Deja de aparecer en tus colecciones.\(songs) Para volver, pídele el link a \(host)."
    }
}

/// "el link." (design `link` · `link-revoked`).
struct PartyLinkSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String
    @State private var busy = false

    private static let day: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "d MMM"
        return f
    }()

    var body: some View {
        let invite = store.party(partyID)?.invite
        let active = invite?.active == true
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: "el link.")
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Circle().fill(active ? KColor.completed : KColor.text3).frame(width: 7, height: 7)
                    Text(status(invite)).font(.kura.ui(15, .semibold)).foregroundStyle(KColor.text)
                }
                if let invite, !invite.display.isEmpty {
                    Text(active ? invite.display : "\(invite.display) · ya no abre")
                        .font(.kura.mono(12, medium: true))
                        .foregroundStyle(KColor.text2)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
            .padding(.top, 16)
            Text(active
                 ? "Si creas uno nuevo, el anterior deja de funcionar. Quien ya entró sigue como colaborador."
                 : "Nadie más puede entrar con este link. Quien ya entró sigue como colaborador; crea uno nuevo para seguir invitando.")
                .font(.kura.ui(14))
                .lineSpacing(3)
                .foregroundStyle(KColor.text2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
            VStack(spacing: 8) {
                if active {
                    PartyFlatButton(title: "Crear link nuevo") { run { await store.rotatePartyInvite(partyID) } }
                    PartyFlatButton(title: "Desactivar link") { run { await store.revokePartyInvite(partyID) } }
                } else {
                    SolidButton(title: "Crear link nuevo", height: 56, honey: true) { run { await store.rotatePartyInvite(partyID) } }
                }
                PartyFlatButton(title: "Cerrar", quiet: true) { store.dismissSheet() }
            }
            .disabled(busy)
            .padding(.top, 18)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func status(_ i: PartyInvite?) -> String {
        guard let i, i.active else { return "Desactivado" }
        guard let d = i.createdAt else { return "Activo" }
        return "Activo · creado el \(Self.day.string(from: d).replacingOccurrences(of: ".", with: "").lowercased())"
    }

    private func run(_ op: @escaping () async -> Void) {
        busy = true
        Task { await op(); busy = false }
    }
}

/// "llévala a otra app." (design `shExport`): Apple Music · TIDAL, for the host AND the guests
/// (founder), each into their own account. `GET /music/services` decides each button: `available:
/// false` (or the 503 of `MIGRATION_0034_LIVE`) → dimmed with "Próximamente", never a flow that
/// fails half-way. A linked TIDAL can be unlinked here.
struct PartyExportSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String

    var body: some View {
        let n = store.party(partyID)?.songs.count ?? 0
        let sv = store.musicServices
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: "llévala a otra app.")
            PartySheetBody(text: n == 0
                           ? "La fiesta todavía no tiene canciones. Cuando tenga, la pasas a tu cuenta."
                           : "Creamos una playlist con \(n == 1 ? "la canción" : "las \(n) canciones") en tu cuenta. La colección sigue viva en kura.")
                .padding(.top, 10)
            VStack(spacing: 8) {
                ForEach(MusicProvider.allCases, id: \.self) { p in
                    service(p, state: sv.map { $0[p].available ? (n > 0 ? .ready : .empty) : .soon } ?? (store.musicServicesError == nil ? .loading : .soon))
                }
            }
            .padding(.top, 18)
            if let e = store.musicServicesError {
                RetryStrip(error: e, text: "No pudimos revisar los servicios.") { Task { await store.loadMusicServices() } }
                    .padding(.top, 12)
            } else if sv?.tidal.connected == true {
                PartyFlatButton(title: "Desconectar TIDAL", quiet: true) { Task { await store.disconnectTidal() } }
                    .padding(.top, 8)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .task { await store.loadMusicServices() }
    }

    private enum RowState { case loading, ready, soon, empty }

    private func service(_ p: MusicProvider, state: RowState) -> some View {
        let label = "Llévala a \(p.label)"
        return Button { store.startPartyExport(partyID, p) } label: {
            HStack {
                Text(label).font(.kura.ui(16, .semibold))
                Spacer()
                switch state {
                case .soon: Text("Próximamente").monoLabel(10, color: KColor.text3)
                case .loading: ProgressView().controlSize(.small).tint(KColor.text3)
                case .ready, .empty: Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold))
                }
            }
            .foregroundStyle(state == .ready ? KColor.text : KColor.text3)
            .padding(.horizontal, 18)
            .frame(height: 60)
            .background(KColor.glassBg, in: RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: KRadius.surface, style: .continuous))
        }
        .kPress()
        .disabled(state != .ready)
        .accessibilityLabel(state == .soon ? "\(label), próximamente" : label)
    }
}

/// Editar: the name and "Canciones por invitado" (`PATCH /parties/{id}`). Lowering the cap never
/// deletes songs: a guest over it just stays at "Quita una para cambiarla".
struct PartyEditSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String
    @State private var name = ""
    @State private var limit: Int? = 3
    @State private var seeded = false
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: "editar fiesta.")
            Text("Nombre").font(.kura.ui(14, .semibold)).foregroundStyle(KColor.text).padding(.top, 20)
            GlassField(placeholder: "la fiesta de…", text: $name, serif: true)
                .padding(.top, 8)
                .onChange(of: name) { _, v in if v.count > 60 { name = String(v.prefix(60)) } }
            Text("Canciones por invitado").font(.kura.ui(14, .semibold)).foregroundStyle(KColor.text).padding(.top, 22)
            PartyLimitStepper(limit: $limit).padding(.top, 8)
            SolidButton(title: "Guardar", height: 56, enabled: !busy && !name.trimmingCharacters(in: .whitespaces).isEmpty) {
                Task { await save() }
            }
            .padding(.top, 20)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .onAppear {
            guard !seeded, let p = store.party(partyID) else { return }
            seeded = true
            name = p.name
            limit = p.perGuestLimit
        }
    }

    private func save() async {
        guard let p = store.party(partyID) else { return }
        busy = true
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let ok = await store.updateParty(partyID, name: n == p.name ? nil : n,
                                         perGuestLimit: limit == p.perGuestLimit ? nil : .some(limit))
        busy = false
        if ok { store.dismissSheet() }
    }
}

/// Bloqueados: the guests the host removed and blocked, with Desbloquear.
struct PartyBlockedSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String

    var body: some View {
        let list = store.party(partyID)?.blockedGuests ?? []
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: "bloqueados.")
            PartySheetBody(text: "Siguen viendo la colección y pueden quitar las suyas, pero ya no agregan canciones.").padding(.top, 10)
            VStack(spacing: 2) {
                ForEach(list, id: \.guestRef) { g in
                    HStack(spacing: 12) {
                        PartySeal(person: g.person, size: 36)
                        Text(g.person.atOrSomeone).font(.kura.ui(16, .medium)).foregroundStyle(KColor.text)
                        Spacer()
                        GlassButton(title: "Desbloquear", fontSize: 14, flat: true) {
                            Task { await store.unblockPartyGuest(partyID, g) }
                        }
                    }
                    .padding(.vertical, 6)
                }
                if list.isEmpty {
                    Text("Nadie bloqueado.").font(.kura.ui(15)).foregroundStyle(KColor.text2).padding(.vertical, 12)
                }
            }
            .padding(.top, 14)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }
}

/// "¿borrar la fiesta?" — for everyone, songs and who put them; the link stops working.
struct PartyDeleteSheet: View {
    @Environment(AppStore.self) private var store
    let partyID: String
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PartySheetTitle(text: "¿borrar la fiesta?")
            PartySheetBody(text: "Se borra para todos: las canciones y quién agregó cuál. El link deja de funcionar.").padding(.top, 10)
            VStack(spacing: 8) {
                PartyFlatButton(title: "Borrar fiesta") {
                    busy = true
                    Task { await store.deleteParty(partyID); busy = false }
                }
                PartyFlatButton(title: "Cancelar", quiet: true) { store.dismissSheet() }
            }
            .disabled(busy)
            .padding(.top, 22)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }
}
