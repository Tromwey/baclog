import Foundation

/// Everything the mock app shows. "Today" is Thursday 24 Sep 2026, 10:00 in
/// Mexico City, so Showgirl (25 sep) is "14 h" away.
enum MockData {

    // MARK: Clock

    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Mexico_City") ?? .current
        c.locale = Locale(identifier: "es_MX")
        return c
    }()

    static func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h)) ?? Date()
    }

    static let now = date(2026, 9, 24, 10)

    static func hoursAgo(_ h: Double) -> Date { now.addingTimeInterval(-h * 3600) }

    // MARK: People

    static let me = Person(handle: "mariel.ok", name: "mariel ortega", initials: "mo",
                           hexes: ["#c53e42", "#794244"], featuredTitleID: "chihiro",
                           followers: 204, followingCount: 187)

    static let people: [Person] = [
        me,
        Person(handle: "tono_v", name: "toño vega", initials: "tv", hexes: ["#b57a56", "#685746"], featuredTitleID: "mindofmine",
               followers: 88, followingCount: 120, stats: PersonStats(obsessed: 7, completed: 51, liked: 22, reviews: 3),
               obsessions: ["mindofmine", "eduardo", "nube"], common: ["mindofmine", "eduardo", "ma"],
               collections: [PersonCollection(name: "música 2026", titleIDs: ["eduardo", "mindofmine", "nube"])],
               why: "le obsesiona Mind of Mine"),
        Person(handle: "luciarrr", name: "lucía rivas", initials: "lr", hexes: ["#b4562f", "#9b5832"], featuredTitleID: "mala",
               followers: 318, followingCount: 142, stats: PersonStats(obsessed: 12, completed: 64, liked: 40, reviews: 9),
               obsessions: ["mala", "chihiro", "ma", "pearl", "severance"],
               common: ["ma", "chihiro", "eduardo", "pearl", "mindofmine"],
               collections: [
                PersonCollection(name: "música 2026", titleIDs: ["mala", "ma", "eduardo", "mindofmine"]),
                PersonCollection(name: "ghibli completo", titleIDs: ["chihiro", "mononoke", "totoro", "garza"]),
                PersonCollection(name: "para correr", titleIDs: ["nube", "ma", "mindofmine"], privacy: .followers)
               ],
               why: "le obsesiona Mala"),
        Person(handle: "danpix", name: "dan pix", initials: "dp", hexes: ["#c33d3b", "#ae4c69"], featuredTitleID: "chihiro",
               followers: 512, followingCount: 201, stats: PersonStats(obsessed: 18, completed: 140, liked: 61, reviews: 22),
               obsessions: ["chihiro", "ma", "odyssey"], common: ["chihiro", "odyssey", "pearl"],
               collections: [PersonCollection(name: "estrenos", titleIDs: ["odyssey", "doomsday", "ycse"])],
               why: "le obsesiona El viaje de Chihiro"),
        Person(handle: "nico.ve", name: "nico velasco", initials: "nv", hexes: ["#5ca6cb", "#33566e"], featuredTitleID: "chihiro",
               followers: 144, followingCount: 98, stats: PersonStats(obsessed: 9, completed: 77, liked: 30, reviews: 4),
               obsessions: ["chihiro", "severance", "pearl"], common: ["chihiro", "pearl"],
               collections: [PersonCollection(name: "series", titleIDs: ["severance"])],
               why: "le obsesiona El viaje de Chihiro"),
        Person(handle: "mili.v", name: "mili vargas", initials: "mv", hexes: [],
               followers: 61, followingCount: 70, obsessions: ["ma"], common: ["ma", "pearl"],
               why: "le obsesiona Ma"),
        Person(handle: "ghibli.club", name: "ghibli club", initials: "gc", hexes: [],
               followers: 2400, followingCount: 12, obsessions: ["chihiro", "totoro", "mononoke"], common: ["chihiro", "totoro", "mononoke", "garza"],
               collections: [PersonCollection(name: "ghibli completo", titleIDs: ["chihiro", "mononoke", "totoro", "garza"])],
               why: "4 obsesiones en común"),
        Person(handle: "tomasv", name: "tomás vidal", initials: "tv", hexes: [], isPrivate: true,
               followers: 96, followingCount: 110),
        Person(handle: "anaso", name: "ana sofía", initials: "as", hexes: [], common: ["pearl", "ma"]),
        Person(handle: "rafam", name: "rafa m.", initials: "rm", hexes: [])
    ]

    /// Who mariel already follows (nico.ve is the feed's suggestion).
    static let following: Set<String> = ["tono_v", "luciarrr", "danpix", "mili.v"]

    /// Who follows a given profile (20e) — for the mock, lucía's.
    static let followersOf: [String: [String]] = [
        "luciarrr": ["danpix", "nico.ve", "mili.v", "ghibli.club", "anaso", "rafam"],
        "mariel.ok": ["danpix", "luciarrr", "mili.v", "nico.ve", "anaso"]
    ]
    static let followingOf: [String: [String]] = [
        "luciarrr": ["danpix", "tono_v", "ghibli.club", "mariel.ok"],
        "mariel.ok": ["tono_v", "luciarrr", "danpix", "mili.v"]
    ]

    /// What people you follow did with a title (ficha · "gente que sigues").
    static let peopleMarks: [String: [PeopleMark]] = [
        "chihiro": [PeopleMark(personID: "danpix", mark: .obsessed), PeopleMark(personID: "luciarrr", mark: .liked), PeopleMark(personID: "nico.ve", mark: .liked)],
        "severance": [PeopleMark(personID: "nico.ve", mark: .obsessed), PeopleMark(personID: "danpix", mark: .completed)],
        "mindofmine": [PeopleMark(personID: "tono_v", mark: .obsessed)],
        "ma": [PeopleMark(personID: "luciarrr", mark: .completed), PeopleMark(personID: "danpix", mark: .obsessed)],
        "mala": [PeopleMark(personID: "luciarrr", mark: .obsessed)],
        "pearl": [PeopleMark(personID: "danpix", mark: .liked)],
        "eduardo": [PeopleMark(personID: "tono_v", mark: .liked)],
        "odyssey": [PeopleMark(personID: "danpix", mark: .obsessed)],
        "garza": [PeopleMark(personID: "danpix", mark: .obsessed)],
        "ycse": [PeopleMark(personID: "danpix", mark: .obsessed, suffix: "Telluride"), PeopleMark(personID: "mili.v", mark: nil)]
    ]

    /// Creators with more work than the catalog shows (O7).
    static let creators: [String: Creator] = [
        "Hayao Miyazaki": Creator(name: "Hayao Miyazaki", role: "director", works: 12),
        "Devendra Banhart": Creator(name: "Devendra Banhart", role: "artista", works: 11),
        "Ed Maverick": Creator(name: "Ed Maverick", role: "artista", works: 5)
    ]
    /// Extra works by a creator that aren't in the catalog (row only, no ficha).
    static let otherWorks: [String: [(String, String)]] = [
        "Hayao Miyazaki": [("El castillo ambulante", "Cine · 2004"), ("Ponyo", "Cine · 2008"), ("Kiki: entregas a domicilio", "Cine · 1989")]
    ]

    static let recentSearches = ["miyazaki", "severance", "devendra", "@luciarrr"]

    static let notifications: [KNotification] = [
        KNotification(id: "n1", kind: .followRequest(personID: "tomasv"), age: "hace 12 min", unread: true, thisWeek: false),
        KNotification(id: "n2", kind: .release(titleID: "odyssey", text: "llegó a streaming. Sigue en no puedo esperar hasta que la completes."), age: "hace 2 h", unread: true, thisWeek: false),
        KNotification(id: "n3", kind: .newFollower(personID: "nico.ve"), age: "hace 5 h", unread: false, thisWeek: false),
        KNotification(id: "n4", kind: .recap(text: "está listo: 14 completos y 6 obsesiones."), age: "lun", unread: false, thisWeek: true),
        KNotification(id: "n5", kind: .followers(ids: ["mili.v", "danpix"], more: 3), age: "dom", unread: false, thisWeek: true)
    ]

    // MARK: Titles

    private static func tmdb(_ path: String) -> URL? { URL(string: "https://image.tmdb.org/t/p/w500/\(path)") }
    private static func apple(_ path: String) -> URL? { URL(string: "https://is1-ssl.mzstatic.com/image/thumb/\(path)/600x600bb.jpg") }

    static let titles: [Title] = [
        Title(id: "chihiro", name: "El viaje de Chihiro", format: .film, year: 2001, creator: "Hayao Miyazaki",
              detail: "125 min", palette: ["#c53e42", "#794244"], coverURL: tmdb("2RcxjDykOssx4SfqshewyI9vfSl.jpg"),
              synopsis: "Chihiro, de diez años, queda atrapada en un mundo de espíritus después de que sus padres se transforman en cerdos. Para salvarlos entra a trabajar en una casa de baños y tiene que recordar su propio nombre.",
              counts: TitleCounts(obsessed: "12,4 k", liked: "30,1 k", completed: "48,7 k", saved: "21,3 k"),
              watch: [WatchOption(short: "max", name: "Max", kind: "Incluido"),
                      WatchOption(short: "tv", name: "Apple TV", kind: "Renta"),
                      WatchOption(short: "pv", name: "Prime Video", kind: "Renta")]),
        Title(id: "odyssey", name: "The Odyssey", format: .film, year: 2026, creator: "Christopher Nolan",
              palette: ["#5ca6cb", "#33566e"], coverURL: tmdb("mKPGRRyXIwN8JOLhAbWnxV1gNrS.jpg"),
              synopsis: "Odiseo vuelve a casa después de la guerra de Troya. El viaje dura diez años y le cuesta a casi toda su tripulación.",
              release: .day(date(2026, 7, 15)),
              counts: TitleCounts(obsessed: "5,4 k", liked: "11,2 k", completed: "16,9 k", waiting: "2,3 k", saved: "19,5 k"),
              watch: [WatchOption(short: "cine", name: "En cines", kind: "")],
              watchNote: "Todavía no está en streaming en México."),
        Title(id: "pearl", name: "Pearl", format: .film, year: 2022, creator: "Ti West", detail: "102 min",
              palette: ["#c45a4a", "#785d53"], coverURL: tmdb("orYlKu8i5NRdbdhSXWg1cbRn3eB.jpg"),
              synopsis: "1918. Pearl vive en una granja aislada con sus padres y sueña con ser estrella. La espera se le vuelve peligrosa.",
              counts: TitleCounts(obsessed: "3,1 k", liked: "7,4 k", completed: "12,2 k", saved: "8,8 k"),
              watchElsewhere: "Está en Max en Estados Unidos."),
        Title(id: "spiderman3", name: "Spider-Man 3", format: .film, year: 2007, creator: "Sam Raimi", detail: "139 min",
              palette: ["#74524d", "#3b3235"], coverURL: tmdb("etRvHz9ElAP0TMwltAZV1ufyfnW.jpg"),
              synopsis: "Peter Parker por fin tiene la vida en orden, hasta que un traje negro empieza a cambiarlo.",
              counts: TitleCounts(obsessed: "1,4 k", liked: "8,8 k", completed: "22,5 k", saved: "3,0 k"),
              watch: [WatchOption(short: "tv", name: "Apple TV", kind: "Renta")]),
        Title(id: "severance", name: "Severance", format: .series, year: 2022, creator: "Dan Erickson", detail: "2 temporadas",
              palette: ["#7f95a5", "#2b3a44"], coverURL: tmdb("1sylo2yeVyJ8KMZgcZLSopR66DA.jpg"),
              synopsis: "Los empleados de Lumon se sometieron a un procedimiento que separa sus recuerdos del trabajo de los de su vida.",
              release: .unknown, upcomingSeason: 3,
              seasons: [
                Season(number: 1, episodes: ["Good News About Hell", "Half Loop", "In Perpetuity", "The You You Are", "The Grim Barbarity of Optics and Design", "Hide and Seek", "Defiant Jazz", "What's for Dinner?", "The We We Are"]),
                Season(number: 2, episodes: ["Hello, Ms. Cobel", "Goodbye, Mrs. Selvig", "Who Is Alive?", "Woe's Hollow", "Trojan's Horse", "Attila", "Chikhai Bardo", "Sweet Vitriol", "The After Hours", "Cold Harbor"])
              ],
              counts: TitleCounts(obsessed: "8,2 k", liked: "14,6 k", completed: "9,1 k", waiting: "6,3 k", saved: "17,8 k"),
              watch: [WatchOption(short: "tv+", name: "Apple TV+", kind: "Incluido")]),
        Title(id: "mononoke", name: "La princesa Mononoke", format: .film, year: 1997, creator: "Hayao Miyazaki", detail: "134 min",
              palette: ["#5b6b4a", "#2f3a2a"], coverURL: tmdb("7fUjg7jky5FnnNSiSbWyOlxVYGU.jpg"),
              synopsis: "Ashitaka viaja al oeste buscando la cura de una maldición y termina en medio de una guerra entre el bosque y una ciudad de hierro.",
              counts: TitleCounts(obsessed: "7,9 k", liked: "18,2 k", completed: "26,0 k", saved: "9,4 k"),
              watch: [WatchOption(short: "max", name: "Max", kind: "Incluido")]),
        Title(id: "totoro", name: "Mi vecino Totoro", format: .film, year: 1988, creator: "Hayao Miyazaki", detail: "86 min",
              palette: ["#5c8a78", "#2e4a40"], coverURL: tmdb("uu6RaEAfkIQaolf20axWaRU4h3w.jpg"),
              synopsis: "Dos hermanas se mudan al campo para estar cerca de su madre enferma y descubren a los espíritus del bosque.",
              counts: TitleCounts(obsessed: "6,1 k", liked: "21,7 k", completed: "31,3 k", saved: "8,8 k"),
              watch: [WatchOption(short: "max", name: "Max", kind: "Incluido")]),
        Title(id: "garza", name: "El niño y la garza", format: .film, year: 2023, creator: "Hayao Miyazaki", detail: "124 min",
              palette: ["#6f8a9a", "#3a4a52"], coverURL: tmdb("8KqWfVuKP7aBt3XVrDUN6irqwZm.jpg"),
              synopsis: "Mahito pierde a su madre en la guerra. Una garza que habla lo lleva a un mundo donde los vivos y los muertos se cruzan.",
              counts: TitleCounts(obsessed: "3,3 k", liked: "9,0 k", completed: "12,8 k", saved: "5,5 k"),
              watch: [WatchOption(short: "max", name: "Max", kind: "Incluido")]),
        Title(id: "doomsday", name: "Avengers: Doomsday", format: .film, year: 2026, creator: "Joe y Anthony Russo",
              palette: ["#6a4a8a", "#2a2238"], coverURL: tmdb("7WU8xhLhiCYuRB2VcBnUMvo6kST.jpg"),
              release: .day(date(2026, 12, 18)),
              counts: TitleCounts(obsessed: "—", liked: "—", completed: "—", waiting: "88,4 k", saved: "91,2 k")),
        Title(id: "ycse", name: "You Can See Everything", format: .film, year: 2026, creator: "Nathan Fielder · Lance Oppenheim",
              palette: ["#6d6660", "#35312e"], coverURL: tmdb("qhFWz1BsEMg5rcs6TAstmGQggMT.jpg"),
              synopsis: "Un documental de A24 sobre lo que la gente ve cuando nadie más está mirando.",
              release: .day(date(2026, 10, 16)),
              counts: TitleCounts(obsessed: "214", liked: "486", completed: "1,2 k", waiting: "9,8 k", saved: "12,1 k"),
              watch: [WatchOption(short: "cine", name: "En cines", kind: "")]),
        Title(id: "mindofmine", name: "Mind of Mine", format: .album, year: 2016, creator: "ZAYN", detail: "18 canciones",
              palette: ["#b57a56", "#685746"], coverURL: apple("Music125/v4/8b/73/a1/8b73a1fe-27eb-ef0d-535b-950b29769f9d/886445750782.jpg"),
              tracks: ["MIND OF MINE (Intro)", "PILLOWTALK", "iT's YoU", "BeFoUr", "sHe", "dRuNk", "INTERMISSION: fLoWer", "rEaR vIeW", "wRoNg", "fOoL fOr YoU", "BoRdErSz", "tRuTh", "lUcOzAdE", "TiO", "BLUE", "BRIGHT", "LIKE I WOULD", "SHE DON'T LOVE ME"]
                .enumerated().map { Track(number: $0.offset + 1, name: $0.element) },
              trackCount: 18,
              counts: TitleCounts(obsessed: "4,9 k", liked: "9,3 k", completed: "11,5 k", saved: "7,2 k"),
              musicLink: "Apple Music"),
        Title(id: "ma", name: "Ma", format: .album, year: 2019, creator: "Devendra Banhart", detail: "14 canciones",
              palette: ["#c33d3b", "#ae4c69"], coverURL: apple("Music123/v4/b3/84/c8/b384c84d-b4a8-8f05-a37e-8aab02ba698d/075597924053.jpg"),
              tracks: ["Is This Nice?", "Kantori Ongaku", "Abre las Manos", "Carolina", "Love Song", "Now All Is Well", "Memorial", "Taking a Page", "Will I See You Tonight?", "Ami", "My Boyfriend's in the Band", "Theme for a Taiwanese Woman in Lime Green", "Kinney"]
                .enumerated().map { Track(number: $0.offset + 1, name: $0.element) },
              trackCount: 14,
              counts: TitleCounts(obsessed: "1,8 k", liked: "3,9 k", completed: "5,2 k", saved: "2,4 k"),
              musicLink: "Apple Music"),
        Title(id: "eduardo", name: "eduardo", format: .album, year: 2021, creator: "Ed Maverick", detail: "12 canciones",
              palette: ["#997541", "#5d4629"], coverURL: apple("Music115/v4/1e/45/20/1e452034-12e8-a346-3b4a-f1661c115808/21UMGIM35580.rgb.jpg"),
              trackCount: 12,
              counts: TitleCounts(obsessed: "2,6 k", liked: "5,1 k", completed: "6,7 k", saved: "3,3 k"),
              musicLink: "Apple Music"),
        Title(id: "nube", name: "LA NUBE EN EL JARDÍN", format: .album, year: 2025, creator: "Ed Maverick", detail: "12 canciones",
              palette: ["#78774a", "#535841"], coverURL: apple("Music211/v4/43/d9/34/43d9342e-119d-31ef-17ac-e5cb5a8dc230/24UMGIM84395.rgb.jpg"),
              trackCount: 12,
              counts: TitleCounts(obsessed: "1,2 k", liked: "2,8 k", completed: "3,9 k", saved: "2,0 k"),
              musicLink: "Apple Music"),
        Title(id: "mala", name: "Mala", format: .album, year: 2013, creator: "Devendra Banhart", detail: "15 canciones",
              palette: ["#b4562f", "#9b5832"], coverURL: apple("Music115/v4/f4/71/c1/f471c1db-528f-bd53-3eee-2a2d078780d5/075597958836.jpg"),
              trackCount: 15,
              counts: TitleCounts(obsessed: "2,0 k", liked: "4,4 k", completed: "6,1 k", saved: "2,7 k"),
              musicLink: "Apple Music"),
        Title(id: "showgirl", name: "The Life of a Showgirl: The Encore", format: .album, year: 2026, creator: "Taylor Swift", detail: "16 canciones",
              palette: ["#e1844d", "#774934"], coverURL: apple("Music221/v4/f1/a3/c7/f1a3c711-ff60-caee-2314-37c0dd3f7616/26UM1IM21436.rgb.jpg"),
              release: .day(date(2026, 9, 25)),
              tracks: (["The Fate of Ophelia", "Elizabeth Taylor", "Opalite", "Father Figure", "Eldest Daughter", "Ruin the Friendship", "Actually Romantic", "Wi$h Li$t", "Wood", "CANCELLED!", "Honey", "The Life of a Showgirl"]
                        .enumerated().map { Track(number: $0.offset + 1, name: $0.element) })
                    + (["Patient Zero", "Cleveland!", "Pink Clouding", "Babylon"]
                        .enumerated().map { Track(number: $0.offset + 13, name: $0.element, isNew: true, available: false) }),
              trackCount: 16,
              counts: TitleCounts(obsessed: "—", liked: "—", completed: "—", waiting: "41,2 k", saved: "56,7 k"),
              musicLink: "Apple Music")
    ]

    // MARK: Collections

    static let collections: [KCollection] = [
        KCollection(id: "musica-2026", name: "música 2026", titleIDs: ["ma", "mindofmine", "eduardo", "nube"],
                    privacy: .followers, pinned: true, coverTitleID: "ma", createdAt: date(2026, 1, 3)),
        KCollection(id: "ghibli", name: "ghibli completo", titleIDs: ["chihiro", "mononoke", "totoro"],
                    privacy: .publicAccess, coverTitleID: "chihiro", createdAt: date(2025, 11, 12)),
        KCollection(id: "pendientes", name: "pendientes", titleIDs: ["pearl", "spiderman3", "odyssey", "severance", "ycse", "doomsday"],
                    privacy: .onlyMe, coverTitleID: "pearl", createdAt: date(2026, 2, 20)),
        KCollection(id: "hermana", name: "con mi hermana", titleIDs: ["chihiro", "odyssey", "pearl", "mala", "showgirl"],
                    privacy: .publicAccess, coverTitleID: "mala", createdAt: date(2026, 4, 2)),
        KCollection(id: "correr", name: "para correr", titleIDs: [],
                    privacy: .publicAccess, createdAt: date(2026, 9, 20))
    ]

    /// mariel's state per title.
    static let userTitles: [String: UserTitleState] = {
        var d: [String: UserTitleState] = [:]
        let saved: [(String, Mark?, Double)] = [
            ("chihiro", .obsessed, 24 * 300), ("mononoke", .completed, 24 * 290), ("totoro", .liked, 24 * 280),
            ("pearl", .liked, 24 * 20), ("spiderman3", nil, 24 * 6), ("odyssey", nil, 24 * 6),
            ("severance", nil, 24 * 6), ("ycse", nil, 24 * 6), ("doomsday", nil, 24 * 2),
            ("ma", nil, 24 * 200), ("mindofmine", nil, 24 * 190), ("eduardo", nil, 24 * 30), ("nube", nil, 24 * 12),
            ("mala", nil, 24 * 60), ("showgirl", nil, 24 * 40)
        ]
        for (id, mark, h) in saved {
            d[id] = UserTitleState(mark: mark, savedAt: hoursAgo(h))
        }
        d["pearl"]?.reviewID = "r-pearl"
        d["severance"]?.watchedEpisodes = Set((1...9).map { "T1E\($0)" } + ["T2E1", "T2E2", "T2E3"])
        return d
    }()

    // MARK: Reviews

    static let reviews: [Review] = [
        Review(id: "r-chihiro", authorID: "danpix", titleID: "chihiro",
               text: "La volví a ver veinte años después y cambió de película. Lo que antes era una aventura ahora es sobre el trabajo, el nombre que te sacan y lo que cuesta recuperarlo. La secuencia del tren sigue siendo lo más cerca que estuvo el cine de un sueño real.",
               mark: .obsessed, spoiler: true, date: hoursAgo(72)),
        Review(id: "r-pearl", authorID: "mariel.ok", titleID: "pearl",
               text: "Mia Goth sostiene una toma de seis minutos que debería estar en cualquier clase de actuación. El technicolor falso hace todo el trabajo de contraste: cuanto más bonito el campo, peor lo que pasa adentro de la casa.",
               mark: .liked, spoiler: false, date: hoursAgo(13 * 24))
    ]

    // MARK: Feed

    static let feed: [FeedEvent] = [
        FeedEvent(id: "f1", authorID: "luciarrr", kind: .obsessed, titleID: "mala", ageHours: 2),
        FeedEvent(id: "f2", authorID: "tono_v", kind: .completed(.liked), titleID: "mindofmine", ageHours: 27),
        FeedEvent(id: "f3", authorID: "danpix", kind: .reviewed, titleID: "chihiro", ageHours: 72, reviewID: "r-chihiro"),
        FeedEvent(id: "f4", authorID: "mariel.ok", kind: .burst(collection: "pendientes", titleIDs: ["pearl", "spiderman3", "odyssey", "severance", "ycse"]), ageHours: 6 * 24),
        FeedEvent(id: "f5", authorID: "nico.ve", kind: .suggestion(personID: "nico.ve", reason: "También le obsesiona El viaje de Chihiro", social: "Siguen a @danpix y @luciarrr", titleIDs: ["chihiro", "pearl", "ma"]), ageHours: 7 * 24),
        FeedEvent(id: "f6", authorID: "danpix", kind: .waitingAdd(collection: "estrenos", label: "sale el 17 jul"), titleID: "odyssey", ageHours: 10 * 24),
        FeedEvent(id: "f7", authorID: "tono_v", kind: .obsessed, titleID: "mindofmine", ageHours: 12 * 24),
        FeedEvent(id: "f8", authorID: "mariel.ok", kind: .reviewed, titleID: "pearl", ageHours: 13 * 24, reviewID: "r-pearl"),
        FeedEvent(id: "f9", authorID: "luciarrr", kind: .completed(nil), titleID: "ma", ageHours: 15 * 24),
        FeedEvent(id: "f10", authorID: "tono_v", kind: .added(collection: "música 2026"), titleID: "eduardo", ageHours: 16 * 24)
    ]

    // MARK: Onboarding

    /// "Elige 3": the masonry grid, in column order.
    static let onboardingGrid: [String] = ["chihiro", "ma", "severance", "mindofmine", "pearl", "totoro",
                                          "mala", "odyssey", "eduardo", "mononoke", "nube", "spiderman3", "garza"]

    /// "Tu gente": who shows up and why.
    static let onboardingPeople: [(String, String)] = [
        ("danpix", "Le obsesiona El viaje de Chihiro"),
        ("luciarrr", "Le obsesiona Mala"),
        ("nico.ve", "Le obsesiona El viaje de Chihiro"),
        ("tono_v", "Le obsesiona Mind of Mine")
    ]
}
