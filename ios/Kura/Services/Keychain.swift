import Foundation
import Security

/// Thin wrapper over the Security framework for one generic-password item.
/// The bearer token lives here (service `com.tromwey.kura`, account `bearer`)
/// and never in `UserDefaults`.
struct Keychain: Sendable {
    let service: String
    let account: String

    static let bearer = Keychain(service: "com.tromwey.kura", account: "bearer")

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func read() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    func write(_ value: String) -> Bool {
        let data = Data(value.utf8)
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        var q = query
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    @discardableResult
    func delete() -> Bool {
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

/// iOS keeps Keychain items when the app is deleted, so without this a reinstall (or the next
/// owner of a handed-down iPhone where only the app was deleted) would come back signed in with
/// the previous bearer. UserDefaults, on the other hand, IS deleted with the app — so a marker
/// there tells "this install has run before" apart from "fresh install".
///
/// The rule, run once per launch BEFORE anything reads the bearer (`KuraApp.init`, before
/// `Session`/`APIClient` exist):
/// 1. Marker present → nothing to do.
/// 2. No marker, but this app's persistent UserDefaults domain already holds one of OUR keys
///    (prefix `kura` or `com.tromwey`: `kura.welcomeSeen` — written by every `applyMe`, so any
///    install that ever signed in has it —, `com.tromwey.kura.local`, `kuraPushToken`,
///    `kuraNotifOffered`…) → an UPGRADE from a build without the marker: keep the bearer, write
///    the marker. This is what keeps the update that ships this from signing everyone out.
/// 3. No marker and none of our keys → FRESH install: delete the Keychain bearer, write the marker.
///
/// Only our own prefixes count (not "any key"): system frameworks may write their own keys into
/// the app's domain, and counting those would read a fresh install as an upgrade. Launch
/// arguments (`-kuraMock YES`…) live in the argument domain, not the persistent one, so they
/// don't count either. `Session.store` also writes the marker, so a signed-in install always has
/// it. A restore from backup brings UserDefaults (and the marker) back but not the bearer
/// (`…ThisDeviceOnly` never leaves the device): nothing to delete there.
enum InstallMarker {
    static let key = "kura.installMarker"

    /// Returns true when rule 3 fired (the bearer was deleted).
    @discardableResult
    static func reconcile(defaults: UserDefaults = .standard,
                          keychain: Keychain = .bearer,
                          bundleID: String? = Bundle.main.bundleIdentifier) -> Bool {
        guard !defaults.bool(forKey: key) else { return false }
        let domain = bundleID.flatMap { defaults.persistentDomain(forName: $0) } ?? [:]
        let fresh = !isUpgrade(domainKeys: Array(domain.keys))
        if fresh { keychain.delete() }
        defaults.set(true, forKey: key)
        return fresh
    }

    /// Pure half of the rule (rule 2), shared with the scratch test.
    static func isUpgrade(domainKeys: [String]) -> Bool {
        domainKeys.contains { k in k != key && (k.hasPrefix("kura") || k.hasPrefix("com.tromwey")) }
    }

    static func markPresent(defaults: UserDefaults = .standard) {
        if !defaults.bool(forKey: key) { defaults.set(true, forKey: key) }
    }
}
