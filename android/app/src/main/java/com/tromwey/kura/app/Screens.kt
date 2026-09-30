package com.tromwey.kura.app

import androidx.compose.runtime.Composable
import com.tromwey.kura.data.models.Route
import com.tromwey.kura.data.models.Tab
import com.tromwey.kura.designsystem.components.KuraSheetScope
import com.tromwey.kura.features.add.AddTitlesSheet
import com.tromwey.kura.features.collectiondetail.CollectionDetailScreen
import com.tromwey.kura.features.collectiondetail.CollectionMoreSheet
import com.tromwey.kura.features.collectiondetail.CollectionQuickSheet
import com.tromwey.kura.features.collectiondetail.DeleteCollectionSheet
import com.tromwey.kura.features.collectiondetail.EditCollectionSheet
import com.tromwey.kura.features.collectiondetail.MoveToSheet
import com.tromwey.kura.features.collectiondetail.PrivacySheet
import com.tromwey.kura.features.collectiondetail.ReorderSheet
import com.tromwey.kura.features.collectiondetail.ShareCollectionSheet
import com.tromwey.kura.features.collectiondetail.SortSheet
import com.tromwey.kura.features.collectiondetail.TitleActionsSheet
import com.tromwey.kura.features.collectiondetail.WaitingCollectionScreen
import com.tromwey.kura.features.collections.CollectionsScreen
import com.tromwey.kura.features.collections.NewCollectionSheet
import com.tromwey.kura.features.discover.DiscoverScreen
import com.tromwey.kura.features.feed.FeedScreen
import com.tromwey.kura.features.feed.NotificationsScreen
import com.tromwey.kura.features.people.BlockSheet
import com.tromwey.kura.features.people.BlockedAccountsScreen
import com.tromwey.kura.features.people.CreatorScreen
import com.tromwey.kura.features.people.FollowersScreen
import com.tromwey.kura.features.people.PersonOptionsSheet
import com.tromwey.kura.features.people.PersonScreen
import com.tromwey.kura.features.people.ProfileAsStrangerScreen
import com.tromwey.kura.features.people.PublicCollectionScreen
import com.tromwey.kura.features.people.ReportSheet
import com.tromwey.kura.features.profile.EditProfileScreen
import com.tromwey.kura.features.profile.ProfileScreen
import com.tromwey.kura.features.settings.DeleteAccountSheet
import com.tromwey.kura.features.settings.MergeAccountScreen
import com.tromwey.kura.features.settings.MergeCodeScreen
import com.tromwey.kura.features.settings.MergeConfirmScreen
import com.tromwey.kura.features.settings.MusicAppScreen
import com.tromwey.kura.features.settings.NotificationsAskSheet
import com.tromwey.kura.features.settings.RevokeSessionSheet
import com.tromwey.kura.features.settings.SessionsScreen
import com.tromwey.kura.features.settings.SettingsPrivacyScreen
import com.tromwey.kura.features.settings.SettingsScreen
import com.tromwey.kura.features.settings.UnlinkIdentitySheet
import com.tromwey.kura.features.title.CompleteSheet
import com.tromwey.kura.features.title.SaveToSheet
import com.tromwey.kura.features.title.TitleMoreSheet
import com.tromwey.kura.features.title.TitleScreen
import com.tromwey.kura.state.AppStore
import com.tromwey.kura.state.SheetRoute

// THE contract between the shell and the screen lanes (iOS `RouteView` / `SheetContent` + each
// tab's root). One composable per screen/sheet, in its feature package, with a uniform signature:
//
//   @Composable fun XxxScreen(store: AppStore, route: Route.Xxx)          (no `route` for objects)
//   @Composable fun KuraSheetScope.XxxSheet(store: AppStore, sheet: SheetRoute.Xxx)
//
// A sheet runs inside `KuraSheet` (a `ColumnScope`): `close()` slides it down and then clears
// `store.sheet`; `store.dismissSheet()` also works (no slide). A screen navigates with
// `store.push(route)` / `store.pop()` and opens sheets with `store.present(sheet)`.
// Both `when`s are exhaustive: a new Route/SheetRoute case doesn't compile until it has a screen.

/** A tab's root screen (index 0 of its stack). */
@Composable
fun TabRootScreen(tab: Tab, store: AppStore) {
    when (tab) {
        Tab.Collections -> CollectionsScreen(store)
        Tab.Discover -> DiscoverScreen(store)
        Tab.Feed -> FeedScreen(store)
        Tab.Profile -> ProfileScreen(store)
    }
}

/** A pushed screen. Its background must be opaque (the push slides it over the one below). */
@Composable
fun RouteScreen(route: Route, store: AppStore) {
    when (route) {
        is Route.Collection -> CollectionDetailScreen(store, route)
        is Route.TitleRoute -> TitleScreen(store, route)
        Route.Automatic -> WaitingCollectionScreen(store)
        is Route.PersonRoute -> PersonScreen(store, route)
        is Route.PublicCollection -> PublicCollectionScreen(store, route)
        is Route.Followers -> FollowersScreen(store, route)
        is Route.CreatorRoute -> CreatorScreen(store, route)
        Route.Notifications -> NotificationsScreen(store)
        Route.Settings -> SettingsScreen(store)
        Route.SettingsPrivacy -> SettingsPrivacyScreen(store)
        Route.MusicApp -> MusicAppScreen(store)
        Route.EditProfile -> EditProfileScreen(store)
        Route.ProfileAsStranger -> ProfileAsStrangerScreen(store)
        Route.BlockedAccounts -> BlockedAccountsScreen(store)
        Route.Sessions -> SessionsScreen(store)
        Route.MergeAccount -> MergeAccountScreen(store)
        Route.MergeCode -> MergeCodeScreen(store)
        Route.MergeConfirm -> MergeConfirmScreen(store)
        // Fase 2 on Android: one placeholder until recap and parties land.
        is Route.Recap, Route.RecapHistory, is Route.RecapShare, is Route.PartyRoute, is Route.PartySearch ->
            PhaseTwoScreen(store, route)
    }
}

/** Every sheet body, by route (the host picks the style and the grabber from the route). */
@Composable
fun KuraSheetScope.SheetContent(sheet: SheetRoute, store: AppStore) {
    when (sheet) {
        is SheetRoute.NewCollection -> NewCollectionSheet(store, sheet)
        is SheetRoute.CollectionQuick -> CollectionQuickSheet(store, sheet)
        is SheetRoute.More -> CollectionMoreSheet(store, sheet)
        is SheetRoute.Sort -> SortSheet(store, sheet)
        is SheetRoute.Rename -> EditCollectionSheet(store, sheet)
        is SheetRoute.Privacy -> PrivacySheet(store, sheet)
        is SheetRoute.Share -> ShareCollectionSheet(store, sheet)
        is SheetRoute.DeleteCollection -> DeleteCollectionSheet(store, sheet)
        is SheetRoute.TitleActions -> TitleActionsSheet(store, sheet)
        is SheetRoute.MoveTo -> MoveToSheet(store, sheet)
        is SheetRoute.Complete -> CompleteSheet(store, sheet)
        is SheetRoute.SaveTo -> SaveToSheet(store, sheet)
        is SheetRoute.TitleMore -> TitleMoreSheet(store, sheet)
        is SheetRoute.PersonOptions -> PersonOptionsSheet(store, sheet)
        is SheetRoute.Report -> ReportSheet(store, sheet)
        is SheetRoute.Block -> BlockSheet(store, sheet)
        SheetRoute.DeleteAccount -> DeleteAccountSheet(store)
        is SheetRoute.AddTitles -> AddTitlesSheet(store, sheet)
        is SheetRoute.Reorder -> ReorderSheet(store, sheet)
        is SheetRoute.RevokeSession -> RevokeSessionSheet(store, sheet)
        is SheetRoute.UnlinkIdentity -> UnlinkIdentitySheet(store, sheet)
        SheetRoute.NotificationsAsk -> NotificationsAskSheet(store)
    }
}
