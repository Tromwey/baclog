import assert from "node:assert/strict";
import test from "node:test";
import {
  buildServiceRows,
  HBO_RESOLVE_HOSTS,
  hboLegacyResolveUrls,
  parseHboRedirectLocation,
  parseWikidataIds,
  streamingServices,
  watchServiceUrl,
  wikidataIdsQuery,
  WATCH_SERVICES,
} from "./watch-services";

const p = (provider_id: number, provider_name = "x") => ({ provider_id, provider_name });
const binding = (prop: string, value: string) => ({
  p: { type: "uri", value: `http://www.wikidata.org/prop/direct/${prop}` },
  v: { type: "literal", value },
});
const sparql = (...bindings: unknown[]) => ({ results: { bindings } });

const SEVERANCE_APPLE = "umc.cmc.1srk2goyh2q2zdxcx605w8vtx";
const TLOU_HBO = "show/93ba22b1-833e-47ba-ae94-8ee7b9eefa9a";
const GOT_LEGACY = "series/urn:hbo:series:GVU2cggagzYNJjhsJATwo";
const GOT_HBO = "show/4f6b4985-2dc9-4ab6-ac79-d60f0860b0ac";
const FILM_LEGACY = "feature/urn:hbo:feature:GZDaHTAHoeJfDVQEAABSi";
const FILM_HBO = "movie/482e78d8-d00e-41d4-a709-ca4fb341dd47";
const base = { title: "Severance", mediaType: "series" as const, region: "MX", ids: {} };

test("streamingServices: solo servicios conocidos, por id, en el orden de la tabla", () => {
  const got = streamingServices([p(1899), p(119), p(8), p(350)]);
  assert.deepEqual(got, ["apple_tv", "netflix", "prime_video", "hbo_max"]);
});

test("streamingServices: los canales y las tiendas no generan fila", () => {
  const channels = [
    p(1825, "HBO Max Amazon Channel"),
    p(2243, "Apple TV Amazon Channel"),
    p(201, "MUBI Amazon Channel"),
    p(2, "Apple TV Store"),
    p(10, "Amazon Video"),
    p(337, "Disney Plus"),
  ];
  assert.deepEqual(streamingServices(channels), []);
  assert.deepEqual(streamingServices([...channels, p(1899, "HBO Max")]), ["hbo_max"]);
});

test("streamingServices: los planes con anuncios caen en la misma fila", () => {
  assert.deepEqual(streamingServices([p(8), p(1796)]), ["netflix"]);
  assert.deepEqual(streamingServices([p(9), p(2100), p(119)]), ["prime_video"]);
});

test("streamingServices: entrada malformada = sin filas", () => {
  assert.deepEqual(streamingServices(undefined), []);
  assert.deepEqual(streamingServices({ provider_id: 8 }), []);
  assert.deepEqual(streamingServices([null, "8", { provider_id: "8" }, {}]), []);
});

test("ningún provider_id pertenece a dos servicios", () => {
  const all = WATCH_SERVICES.flatMap((s) => s.providerIds);
  assert.equal(new Set(all).size, all.length);
});

test("wikidataIdsQuery: propiedades por formato y solo ids numéricos", () => {
  const series = wikidataIdsQuery("95396", "series")!;
  assert.match(series, /wdt:P4983 "95396"/);
  assert.match(series, /wdt:P9751/);
  assert.doesNotMatch(series, /P9586|P8055/);
  const film = wikidataIdsQuery("27205", "film")!;
  assert.match(film, /wdt:P4947 "27205"/);
  assert.match(film, /wdt:P9586/);
  assert.doesNotMatch(film, /P9751/);
  for (const bad of ["", "12a", '1" } DROP', "1 2", "-1", "12345678901"]) {
    assert.equal(wikidataIdsQuery(bad, "series"), null, bad);
  }
});

test("parseWikidataIds: ids válidos de los tres servicios", () => {
  const ids = parseWikidataIds(
    sparql(binding("P9751", SEVERANCE_APPLE), binding("P1874", "80057281"), binding("P8298", TLOU_HBO)),
    "series",
  );
  assert.deepEqual(ids, { appleTv: SEVERANCE_APPLE, netflix: "80057281", hboMax: TLOU_HBO });
});

test("parseWikidataIds: Apple TV usa P9751 en serie y P9586 en película", () => {
  const body = sparql(binding("P9751", "umc.cmc.serieserieserie"), binding("P9586", "umc.cmc.pelipelipelipeli"));
  assert.equal(parseWikidataIds(body, "series").appleTv, "umc.cmc.serieserieserie");
  assert.equal(parseWikidataIds(body, "film").appleTv, "umc.cmc.pelipelipelipeli");
});

test("parseWikidataIds: descarta todo id que no tenga la forma exacta", () => {
  const bad = [
    binding("P9751", "umc.cmc.abc/../../evil"),
    binding("P9751", "umc.cmc.ABCDEFGHIJ"),
    binding("P9751", "https://evil.example/umc.cmc.1srk2goyh2q2zdxcx605w8vtx"),
    binding("P1874", "80057281?x=1"),
    binding("P1874", "80057281/../login"),
    binding("P1874", "abc"),
    binding("P8298", "feature/urn:hbo:series:GXdu2ZAglVJuAuwEAADbA"),
    binding("P8298", "series/urn:hbo:series:GYyofRQHeuJ6fiQEAAAEy/../x"),
    binding("P8298", "series/urn:hbo:series:short"),
    binding("P8298", "show/93ba22b1-833e-47ba-ae94-8ee7b9eefa9a/../x"),
    binding("P8298", "//evil.example/show/93ba22b1-833e-47ba-ae94-8ee7b9eefa9a"),
    binding("P8055", "0ABCDEF"),
  ];
  assert.deepEqual(parseWikidataIds(sparql(...bad), "series"), {});
});

test("parseWikidataIds: un id antiguo de HBO no tapa al vivo, y el resultado no depende del orden", () => {
  const dead = binding("P8298", "series/urn:hbo:series:GYyofRQHeuJ6fiQEAAAEy");
  const live = binding("P8298", TLOU_HBO);
  assert.deepEqual(parseWikidataIds(sparql(dead, live), "series"), { hboMax: TLOU_HBO });
  assert.deepEqual(parseWikidataIds(sparql(live, dead), "series"), { hboMax: TLOU_HBO });
  const a = binding("P1874", "80057281");
  const b = binding("P1874", "70131314");
  assert.deepEqual(parseWikidataIds(sparql(a, b), "series"), parseWikidataIds(sparql(b, a), "series"));
});

test("parseWikidataIds: cuerpo inesperado = sin ids", () => {
  for (const body of [null, undefined, "x", {}, { results: {} }, { results: { bindings: "x" } }, sparql(null, {}, { p: {} })]) {
    assert.deepEqual(parseWikidataIds(body, "film"), {});
  }
});

test("watchServiceUrl: links exactos", () => {
  assert.equal(
    watchServiceUrl("apple_tv", { ...base, ids: { appleTv: SEVERANCE_APPLE } }),
    `https://tv.apple.com/show/${SEVERANCE_APPLE}`,
  );
  assert.equal(
    watchServiceUrl("apple_tv", { ...base, mediaType: "film", ids: { appleTv: SEVERANCE_APPLE } }),
    `https://tv.apple.com/movie/${SEVERANCE_APPLE}`,
  );
  assert.equal(
    watchServiceUrl("netflix", { ...base, ids: { netflix: "80057281" } }),
    "https://www.netflix.com/title/80057281",
  );
  assert.equal(watchServiceUrl("hbo_max", { ...base, ids: { hboMax: TLOU_HBO } }), `https://play.hbomax.com/${TLOU_HBO}`);
});

test("watchServiceUrl: piso de búsqueda con el título codificado", () => {
  const input = { ...base, title: "Cómo entrenar a tu dragón & más?" };
  const q = "C%C3%B3mo%20entrenar%20a%20tu%20drag%C3%B3n%20%26%20m%C3%A1s%3F";
  assert.equal(watchServiceUrl("apple_tv", input), `https://tv.apple.com/mx/search?term=${q}`);
  assert.equal(watchServiceUrl("netflix", input), `https://www.netflix.com/search?q=${q}`);
  assert.equal(watchServiceUrl("prime_video", input), `https://www.primevideo.com/search?phrase=${q}`);
});

test("watchServiceUrl: la región de Apple TV va en minúsculas y solo si son dos letras", () => {
  assert.equal(watchServiceUrl("apple_tv", { ...base, region: "US" }), "https://tv.apple.com/us/search?term=Severance");
  for (const region of ["", "MEX", "m/", "../", "m.x"]) {
    assert.equal(watchServiceUrl("apple_tv", { ...base, region }), null, region);
  }
});

test("watchServiceUrl: HBO Max sin id exacto no tiene fila; Prime nunca usa id", () => {
  assert.equal(watchServiceUrl("hbo_max", base), null);
  assert.equal(
    watchServiceUrl("prime_video", { ...base, ids: { appleTv: SEVERANCE_APPLE, netflix: "1", hboMax: TLOU_HBO } }),
    "https://www.primevideo.com/search?phrase=Severance",
  );
});

test("watchServiceUrl: un id inválido que se cuele NO se interpola (cae al piso)", () => {
  assert.equal(
    watchServiceUrl("netflix", { ...base, ids: { netflix: "1/../../evil" } }),
    "https://www.netflix.com/search?q=Severance",
  );
  assert.equal(
    watchServiceUrl("apple_tv", { ...base, ids: { appleTv: "@evil.example/x" } }),
    "https://tv.apple.com/mx/search?term=Severance",
  );
  assert.equal(watchServiceUrl("hbo_max", { ...base, ids: { hboMax: "feature/urn:hbo:feature:X" } }), null);
  assert.equal(watchServiceUrl("hbo_max", { ...base, ids: { hboMax: GOT_LEGACY } }), null);
});

test("watchServiceUrl: el host siempre es el del servicio, con cualquier título", () => {
  const hosts = Object.fromEntries(WATCH_SERVICES.map((s) => [s.key, s.host]));
  const titles = ["@evil.example/", "//evil.example", "https://evil.example", "a#b", "a/../b", "a\\b", "x\n y", "%2e%2e"];
  for (const title of titles) {
    for (const key of ["apple_tv", "netflix", "prime_video"] as const) {
      const url = new URL(watchServiceUrl(key, { ...base, title })!);
      assert.equal(url.protocol, "https:");
      assert.equal(url.hostname, hosts[key]);
      assert.equal(url.hash, "");
    }
  }
});

test("watchServiceUrl: título vacío = sin piso", () => {
  assert.equal(watchServiceUrl("netflix", { ...base, title: "   " }), null);
});

test("buildServiceRows: orden de la tabla, nombres y forma de la fila", () => {
  const rows = buildServiceRows([p(1899), p(1825), p(119), p(1796), p(8), p(350), p(2243)], {
    title: "The Last of Us",
    mediaType: "series",
    region: "MX",
    ids: { hboMax: TLOU_HBO },
  });
  assert.deepEqual(rows, [
    { short: "ver", name: "Apple TV", kind: "streaming", url: "https://tv.apple.com/mx/search?term=The%20Last%20of%20Us" },
    { short: "ver", name: "Netflix", kind: "streaming", url: "https://www.netflix.com/search?q=The%20Last%20of%20Us" },
    { short: "ver", name: "Prime Video", kind: "streaming", url: "https://www.primevideo.com/search?phrase=The%20Last%20of%20Us" },
    { short: "ver", name: "HBO Max", kind: "streaming", url: `https://play.hbomax.com/${TLOU_HBO}` },
  ]);
});

test("buildServiceRows: sin Wikidata quedan los pisos y HBO Max desaparece", () => {
  const rows = buildServiceRows([p(1899), p(8)], { ...base, title: "X", ids: {} });
  assert.deepEqual(rows.map((r) => r.name), ["Netflix"]);
});

test("buildServiceRows: sin proveedores conocidos no hay filas", () => {
  assert.deepEqual(buildServiceRows([], base), []);
  assert.deepEqual(buildServiceRows([p(1825), p(337)], base), []);
});

// ── HBO Max: id antiguo → id actual ────────────────────────────────────────

test("parseWikidataIds: el id antiguo de HBO se conserva aparte, solo si no hay uno actual", () => {
  assert.deepEqual(parseWikidataIds(sparql(binding("P8298", GOT_LEGACY)), "series"), { hboMaxLegacy: GOT_LEGACY });
  assert.deepEqual(parseWikidataIds(sparql(binding("P8298", FILM_LEGACY)), "film"), { hboMaxLegacy: FILM_LEGACY });
  // Varios antiguos: gana el menor, sin importar el orden.
  const other = binding("P8298", "series/urn:hbo:series:GYyofRQHeuJ6fiQEAAAEy");
  const got = binding("P8298", GOT_LEGACY);
  assert.deepEqual(parseWikidataIds(sparql(other, got), "series"), parseWikidataIds(sparql(got, other), "series"));
});

test("un id antiguo solo NO es un link: sin conversión, HBO Max no tiene fila", () => {
  assert.equal(watchServiceUrl("hbo_max", { ...base, ids: { hboMaxLegacy: GOT_LEGACY } }), null);
  assert.deepEqual(buildServiceRows([p(1899)], { ...base, ids: { hboMaxLegacy: GOT_LEGACY } }), []);
});

test("hboLegacyResolveUrls: solo los dos hosts fijos de HBO, con el id tal cual", () => {
  assert.deepEqual([...HBO_RESOLVE_HOSTS], ["redirector.hbomax.com", "www.hbomax.com"]);
  assert.deepEqual(hboLegacyResolveUrls(GOT_LEGACY), [
    `https://redirector.hbomax.com/${GOT_LEGACY}`,
    `https://www.hbomax.com/${GOT_LEGACY}`,
  ]);
  for (const url of hboLegacyResolveUrls(FILM_LEGACY)) {
    const u = new URL(url);
    assert.equal(u.protocol, "https:");
    assert.ok((HBO_RESOLVE_HOSTS as readonly string[]).includes(u.hostname));
    assert.equal(u.pathname, `/${FILM_LEGACY}`);
    assert.equal(u.search + u.hash + u.username + u.password + u.port, "");
  }
});

test("hboLegacyResolveUrls: lo que no es exactamente un id antiguo no sale a la red", () => {
  const bad = [
    "",
    GOT_HBO,
    "series/urn:hbo:series:",
    "series/urn:hbo:series:short",
    "series/urn:hbo:feature:GVU2cggagzYNJjhsJATwo",
    "feature/urn:hbo:series:GVU2cggagzYNJjhsJATwo",
    "episode/urn:hbo:episode:GVU2cggagzYNJjhsJATwo",
    `${GOT_LEGACY}/../../x`,
    `${GOT_LEGACY}?next=https://evil.example`,
    `${GOT_LEGACY}#x`,
    `${GOT_LEGACY}\n`,
    ` ${GOT_LEGACY}`,
    `/${GOT_LEGACY}`,
    `//evil.example/${GOT_LEGACY}`,
    `@evil.example/${GOT_LEGACY}`,
    "series/urn:hbo:series:GVU2cggagzYN%2F..%2Fx",
    "series/urn:hbo:series:GVU2cggagzYNJjhs.ATwo",
    `series/urn:hbo:series:${"A".repeat(33)}`,
    "SERIES/urn:hbo:series:GVU2cggagzYNJjhsJATwo",
  ];
  for (const id of bad) assert.deepEqual(hboLegacyResolveUrls(id), [], JSON.stringify(id));
});

test("parseHboRedirectLocation: el Location de HBO → id actual, por cualquiera de sus dos hosts", () => {
  assert.equal(parseHboRedirectLocation(GOT_LEGACY, `https://www.hbomax.com/${GOT_HBO}`), GOT_HBO);
  assert.equal(parseHboRedirectLocation(GOT_LEGACY, `https://play.hbomax.com/${GOT_HBO}`), GOT_HBO);
  assert.equal(parseHboRedirectLocation(FILM_LEGACY, `https://www.hbomax.com/${FILM_HBO}`), FILM_HBO);
});

test("parseHboRedirectLocation: de punta a punta el link final es play.hbomax.com/{show|movie}/{uuid}", () => {
  const hboMax = parseHboRedirectLocation(GOT_LEGACY, `https://www.hbomax.com/${GOT_HBO}`)!;
  const rows = buildServiceRows([p(1899)], { title: "Juego de Tronos", mediaType: "series", region: "MX", ids: { hboMax } });
  assert.deepEqual(rows, [
    { short: "ver", name: "HBO Max", kind: "streaming", url: "https://play.hbomax.com/show/4f6b4985-2dc9-4ab6-ac79-d60f0860b0ac" },
  ]);
  const film = parseHboRedirectLocation(FILM_LEGACY, `https://www.hbomax.com/${FILM_HBO}`)!;
  assert.equal(
    watchServiceUrl("hbo_max", { ...base, mediaType: "film", ids: { hboMax: film } }),
    "https://play.hbomax.com/movie/482e78d8-d00e-41d4-a709-ca4fb341dd47",
  );
});

test("parseHboRedirectLocation: cualquier otro Location = sin id", () => {
  const uuid = "4f6b4985-2dc9-4ab6-ac79-d60f0860b0ac";
  const bad: unknown[] = [
    null,
    undefined,
    42,
    "",
    // HBO's "no conozco ese id": la portada.
    "https://www.hbomax.com",
    "https://www.hbomax.com/",
    // otro host
    `https://evil.example/show/${uuid}`,
    `https://www.hbomax.com.evil.example/show/${uuid}`,
    `https://evil.example/www.hbomax.com/show/${uuid}`,
    `https://www.hbomax.com@evil.example/show/${uuid}`,
    `https://user:pw@www.hbomax.com/show/${uuid}`,
    `https://redirector.hbomax.com/show/${uuid}`,
    `https://auth.hbomax.com/show/${uuid}`,
    `https://www.hbomax.com:8443/show/${uuid}`,
    `https://WWW.HBOMAX.COM/show/${uuid}`,
    // otro esquema / relativo
    `http://www.hbomax.com/show/${uuid}`,
    `//www.hbomax.com/show/${uuid}`,
    `/show/${uuid}`,
    `javascript:alert(1)//www.hbomax.com/show/${uuid}`,
    // path que no es exactamente /(show|movie)/{uuid}
    `https://www.hbomax.com/show/../show/${uuid}`,
    `https://www.hbomax.com/x/../show/${uuid}`,
    `https://www.hbomax.com/show/${uuid}/..`,
    `https://www.hbomax.com/show/${uuid}/`,
    `https://www.hbomax.com/show/${uuid}/extra`,
    `https://www.hbomax.com/show/${uuid}?next=https://evil.example`,
    `https://www.hbomax.com/show/${uuid}#x`,
    `https://www.hbomax.com/mx/es/show/${uuid}`,
    `https://www.hbomax.com/episode/${uuid}`,
    `https://www.hbomax.com/show/%2e%2e/show/${uuid}`,
    `https://www.hbomax.com/show/${uuid}\n`,
    ` https://www.hbomax.com/show/${uuid}`,
    // uuid mal formado
    "https://www.hbomax.com/show/4f6b4985-2dc9-4ab6-ac79-d60f0860b0a",
    "https://www.hbomax.com/show/4f6b4985-2dc9-4ab6-ac79-d60f0860b0acc",
    "https://www.hbomax.com/show/4F6B4985-2DC9-4AB6-AC79-D60F0860B0AC",
    "https://www.hbomax.com/show/4f6b49852dc94ab6ac79d60f0860b0ac",
    "https://www.hbomax.com/show/zf6b4985-2dc9-4ab6-ac79-d60f0860b0ac",
    "https://www.hbomax.com/show/urn:hbo:series:GVU2cggagzYNJjhsJATwo",
  ];
  for (const location of bad) {
    assert.equal(parseHboRedirectLocation(GOT_LEGACY, location), null, JSON.stringify(location));
  }
});

test("parseHboRedirectLocation: el tipo debe ser el que anunciaba el id antiguo", () => {
  assert.equal(parseHboRedirectLocation(GOT_LEGACY, `https://www.hbomax.com/${FILM_HBO}`), null);
  assert.equal(parseHboRedirectLocation(FILM_LEGACY, `https://www.hbomax.com/${GOT_HBO}`), null);
  // Y sin un id antiguo válido no hay nada que convertir.
  assert.equal(parseHboRedirectLocation("x", `https://www.hbomax.com/${GOT_HBO}`), null);
});
