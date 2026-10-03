import Foundation

/// The generations of the optimistic writes of one session (`AppStore.sync(gen:)`), with no UI and
/// no API in it — `KuraTests` compiles this file alone.
///
/// A write key ("the mark of this title", "this membership", "this field of `PATCH /me`") has at
/// most one CURRENT write: the newest one. A failed write only puts its optimistic change back
/// (`revert`) while it's the current one; the revert of a failure a newer write superseded waits
/// (`stale`) and runs only if that newer write fails too — its own `revert` puts back the value
/// the superseded write had painted, which the server never had either.
///
/// Nothing here grows without bound: `current` loses its entry when the write settles (landed, or
/// failed and reverted), `stale` is emptied by the landing or the failure of the write that
/// superseded it, `failed` is capped, and `reset` drops everything at the end of the session.
@MainActor
final class WriteGenerations {
    typealias Revert = @MainActor () -> Void

    /// `failed` only feeds a hint ("resend the add on Deshacer"): past this many keys the oldest go.
    static let failedCap = 256

    /// One counter for every key: a generation is never reused, so dropping a settled key's entry
    /// can't make an old closure look current again (ABA).
    private var seq = 0
    private(set) var current: [String: Int] = [:]
    private(set) var stale: [String: [Revert]] = [:]
    /// Keys whose last answered write failed → the generation counter when it did (for the cap).
    private(set) var failed: [String: Int] = [:]
    /// Keys whose write the server took → the counter when it did (`landedSince`). Capped like
    /// `failed`: it only has to outlive the reads that were in flight when the write landed.
    private(set) var landedAt: [String: Int] = [:]

    /// Where the counter stands: a READ takes this when it leaves (`AppStore.applyMe(_:readAt:)`).
    var stamp: Int { seq }

    /// A write of `key` landed AFTER a read stamped `stamp` left: that read may carry the value
    /// from before the write (it raced it to the server), and no write is pending any more to
    /// hold it off — its copy of this field is dropped. A read that leaves after the landing has
    /// a stamp at or past it and paints freely.
    func landedSince(_ key: String, _ stamp: Int) -> Bool { (landedAt[key] ?? 0) > stamp }

    func begin(_ key: String) -> Int {
        seq += 1
        current[key] = seq
        return seq
    }

    func isCurrent(_ key: String, _ gen: Int) -> Bool { current[key] == gen }

    /// A write of `key` is still out (queued, in flight, or waiting behind its "Reintentar"): the
    /// screen shows ITS value, and a read of the same thing must not paint over it (`applyMe`).
    func isPending(_ key: String) -> Bool { current[key] != nil }

    /// The server has this write: whatever older failures wanted to put back is moot, and the key
    /// is confirmed. Its entry leaves unless a newer write is still out.
    func landed(_ key: String, _ gen: Int) {
        stale[key] = nil
        failed[key] = nil
        seq += 1
        landedAt[key] = seq
        if landedAt.count > Self.failedCap {
            for k in landedAt.sorted(by: { $0.value < $1.value }).prefix(landedAt.count - Self.failedCap) { landedAt[k.key] = nil }
        }
        settle(key, gen)
    }

    /// A failed write of `key` was answered. Returns whether it's still the current one: when it
    /// isn't, its `revert` waits behind the write that superseded it (and nothing else happens).
    func failure(_ key: String, _ gen: Int, revert: Revert?) -> Bool {
        seq += 1
        failed[key] = seq
        if failed.count > Self.failedCap {
            for k in failed.sorted(by: { $0.value < $1.value }).prefix(failed.count - Self.failedCap) { failed[k.key] = nil }
        }
        if isCurrent(key, gen) { return true }
        if let revert { pushStale(key, revert) }
        return false
    }

    func lastFailed(_ key: String) -> Bool { failed[key] != nil }

    /// Only while a write of `key` is still out (or its "Reintentar" is up): with none, the write
    /// that superseded this one already landed — the server has ITS value, nothing goes back.
    func pushStale(_ key: String, _ revert: @escaping Revert) {
        guard current[key] != nil else { return }
        stale[key, default: []].append(revert)
    }

    /// The current write failed for good and its own change is already back: the superseded
    /// failures put theirs back (newest first, each behind its own state guard) and the key settles.
    func settleFailure(_ key: String, _ gen: Int) {
        for r in (stale.removeValue(forKey: key) ?? []).reversed() { r() }
        settle(key, gen)
    }

    /// The write is over (nothing of it can act any more): its generation leaves.
    func settle(_ key: String, _ gen: Int) {
        if current[key] == gen { current[key] = nil }
    }

    /// `adopt`: everything keyed by a collection's local id follows it to the server id.
    func rekey(suffix: String, serverID: String) {
        func moved(_ k: String) -> String { String(k.dropLast(suffix.count)) + "|\(serverID)" }
        for (k, g) in current where k.hasSuffix(suffix) { current[k] = nil; current[moved(k)] = max(g, current[moved(k)] ?? 0) }
        for (k, r) in stale where k.hasSuffix(suffix) { stale[k] = nil; stale[moved(k), default: []] += r }
        for (k, g) in failed where k.hasSuffix(suffix) { failed[k] = nil; failed[moved(k)] = max(g, failed[moved(k)] ?? 0) }
        for (k, g) in landedAt where k.hasSuffix(suffix) { landedAt[k] = nil; landedAt[moved(k)] = max(g, landedAt[moved(k)] ?? 0) }
    }

    func reset() {
        current = [:]
        stale = [:]
        failed = [:]
        landedAt = [:]
    }
}
