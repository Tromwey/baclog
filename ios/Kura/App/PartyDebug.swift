import SwiftUI

#if DEBUG
/// DEBUG: the party captures (`-kuraScreen <name>`, mock only). Design `fiesta-app-v2` states:
///
/// party (collab, 1 of 3) · partyfull (3 of 3 → "Cambiar una canción") · partywelcome · partyreturning ·
/// partyblocked · partyempty · partyhost · partyhostempty · partyshare · partylink · partylinkoff ·
/// partyopts · partyremove · partyexport · partyedit · partysearch (`-kuraPartyQuery caifanes|thriller|error`) ·
/// partycap · partycreate · partylist · partyunavailable · invite (signed out) · invitedead · inviteunavailable
enum PartyDebug {
    @MainActor
    static func configure(_ screen: String, store: AppStore) {
        let server = MockPartyServer.shared
        let eric = MockPartyServer.ericID, mine = MockPartyServer.mineID
        func main(_ routes: [Route] = [], sheet: SheetRoute? = nil) {
            store.phase = .main
            store.tab = .collections
            store.paths[.collections] = routes
            store.pendingSheet = sheet
        }
        switch screen {
        case "party":
            server.seedMine(["afuera"])
            main([.party(eric)])
        case "partyfull":
            server.seedMine(["afuera", "negra", "nodejes"])
            main([.party(eric)])
        case "partywelcome":
            main([.party(eric)], sheet: .partyWelcome(eric, returning: false))
        case "partyreturning":
            main([.party(eric)], sheet: .partyWelcome(eric, returning: true))
        case "partyblocked":
            server.seedMine(["afuera"])
            server.mutate(eric) { $0.blocked.insert(MockData.me.handle) }
            main([.party(eric)])
        case "partyempty":
            server.mutate(eric) { $0.songs = [] }
            main([.party(eric)])
        case "partyhost":
            main([.party(mine)])
        case "partyhostempty":
            server.mutate(mine) { $0.songs = [] }
            main([.party(mine)])
        case "partyshare":
            main([.party(mine)], sheet: .partyShare(mine))
        case "partylink":
            main([.party(mine)], sheet: .partyLink(mine))
        case "partylinkoff":
            server.mutate(mine) { $0.active = false }
            main([.party(mine)], sheet: .partyLink(mine))
        case "partyopts":
            main([.party(mine)], sheet: .partyOptions(mine))
        case "partyremove":
            main([.party(mine)], sheet: .partySong(partyID: mine, titleID: MockPartyServer.catalog["toxic"]!.id))
        case "partyexport":
            main([.party(mine)], sheet: .partyExport(mine))
        case "partyedit":
            main([.party(mine)], sheet: .partyEdit(mine))
        case "partysearch":
            server.seedMine(["afuera"])
            main([.party(eric), .partySearch(eric)])
        case "partycap":
            server.seedMine(["afuera", "negra", "nodejes"])
            main([.party(eric), .partySearch(eric)], sheet: .partyCap(eric))
        case "partycreate":
            UserDefaults.standard.register(defaults: ["kuraNewParty": true])
            main(sheet: .newCollection(addingTitleID: nil))
        case "partylist":
            UserDefaults.standard.register(defaults: ["kuraCarousel": "party:\(eric)"])
            main()
        case "partyunavailable":
            UserDefaults.standard.register(defaults: ["kuraPartyUnavailable": true])
            main([.party(eric)])
        case "invite":
            // Signed out (`-kuraMockSignedOut YES` is implied): the public preview over the entrance.
            UserDefaults.standard.register(defaults: ["kuraMockSignedOut": true])
            server.leaveEric()
            store.phase = .onboarding
            store.onboardingStep = .signup
            store.inviteLanding = MockPartyServer.ericToken
        case "invitedead":
            UserDefaults.standard.register(defaults: ["kuraMockSignedOut": true])
            store.phase = .onboarding
            store.onboardingStep = .signup
            store.inviteLanding = "LinkQueYaMurio00"
        case "inviteunavailable":
            UserDefaults.standard.register(defaults: ["kuraMockSignedOut": true, "kuraPartyUnavailable": true])
            store.phase = .onboarding
            store.onboardingStep = .signup
            store.inviteLanding = MockPartyServer.ericToken
        default:
            break
        }
    }
}
#endif
