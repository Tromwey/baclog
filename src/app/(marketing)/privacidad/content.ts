/**
 * El texto del aviso de privacidad integral de Kura (LFPDPPP, México) y la
 * política que App Store Connect pide por URL (App Review 5.1.1). Vive aparte
 * de `page.tsx` para que se pueda revisar y corregir sin tocar el layout.
 *
 * ⚠️ Esto se publica tal cual. Cada frase describe lo que el código hace HOY
 * (inventario: src/db/schema.ts, modules/account/delete.ts, modules/analytics,
 * auth/mailer.ts, modules/recs/crossmedia-provider.ts, ios/Kura/PrivacyInfo
 * .xcprivacy). Si cambias qué se guarda, a quién se manda o qué sobrevive al
 * borrado de cuenta, cambia este archivo en el mismo PR y sube
 * `PRIVACY_EFFECTIVE_DATE`.
 *
 * Los `[ENTRE CORCHETES]` son placeholders que el founder tiene que rellenar
 * antes de mandar la URL a App Store Connect.
 */

export const PRIVACY_EFFECTIVE_DATE = "24 de septiembre de 2026";

export const CONTACT_EMAIL = "ericbriseno@baclog.app";
const RESPONSIBLE = "Tromwey";
const ADDRESS = "Querétaro, Querétaro, México";

/** True while any founder placeholder is still unfilled: `page.tsx` answers
 *  404 instead of publishing an aviso with `[CORCHETES]` in it (an App
 *  Review or a user reading "[RAZÓN SOCIAL]" is worse than no page yet). */
export const PRIVACY_HAS_PLACEHOLDERS = [CONTACT_EMAIL, RESPONSIBLE, ADDRESS].some((v) => v.includes("["));

/** A run of text; `{ text, href }` renders as a link. */
export type Inline = string | { text: string; href: string };
export type Rich = string | Inline[];

export type DataItem = {
  name: string;
  what: Rich;
  why: Rich;
  seen: Rich;
  kept: Rich;
};

export type Block =
  | { kind: "p"; text: Rich }
  | { kind: "list"; items: Rich[] }
  | { kind: "data"; items: DataItem[] };

export type Section = { id: string; title: string; blocks: Block[] };

export const INTRO: Rich[] = [
  "Aquí está lo que guardamos de ti, para qué, quién más lo ve y cómo lo borras. Es el aviso de privacidad integral de Kura (antes Baclog) y aplica a la web baclog.app y a la app de iOS.",
  "Resumen: no te pedimos contraseña, no mostramos publicidad, no vendemos tus datos y no te rastreamos en otras apps ni sitios. Tu perfil es privado hasta que tú lo hagas público, y puedes borrar tu cuenta desde Ajustes cuando quieras.",
];

export const SECTIONS: Section[] = [
  {
    id: "responsable",
    title: "quién es responsable",
    blocks: [
      {
        kind: "p",
        text: `Kura es operado por ${RESPONSIBLE}, con domicilio en ${ADDRESS}, que es responsable del tratamiento de tus datos personales (tratamiento = cualquier cosa que hacemos con ellos: guardarlos, usarlos, mostrarlos o borrarlos).`,
      },
      {
        kind: "p",
        text: `Para cualquier tema de privacidad, escríbenos a ${CONTACT_EMAIL}.`,
      },
    ],
  },
  {
    id: "datos",
    title: "qué datos guardamos",
    blocks: [
      {
        kind: "p",
        text: "Solo lo que Kura necesita para funcionar. No te pedimos datos sensibles (salud, religión, origen, orientación sexual, datos financieros o biométricos), ni contraseña, contactos, ubicación precisa o datos de pago.",
      },
      {
        kind: "data",
        items: [
          {
            name: "Correo electrónico",
            what: "El correo con el que entras.",
            why: "Crear tu cuenta, mandarte el código para entrar y los correos que se describen abajo.",
            seen: "Nadie más. Nunca se muestra a otras personas.",
            kept: "Mientras tengas cuenta.",
          },
          {
            name: "Código de acceso",
            what: "El código de 6 dígitos que te mandamos. Lo guardamos cifrado con un hash (una huella de la que no se puede recuperar el código).",
            why: "Confirmar que el correo es tuyo.",
            seen: "Nadie.",
            kept: "Vale 10 minutos. Se borra al usarlo, al pedir otro o tras 5 intentos fallidos; si no lo usas, se borra a más tardar al día siguiente.",
          },
          {
            name: "Año de nacimiento",
            what: "Solo el año, no la fecha.",
            why: "Confirmar que tienes 13 años o más. No lo usamos para nada más.",
            seen: "Nadie. Nunca se muestra.",
            kept: "Mientras tengas cuenta (ver «menores de 13» si la cuenta se bloquea).",
          },
          {
            name: "Nombre, @usuario y foto de perfil",
            what: "El nombre que eliges, tu @usuario y, si subes una, tu foto. La foto se recorta y se reduce en tu dispositivo antes de subirse.",
            why: "Identificarte dentro de Kura.",
            seen: "Solo tú, hasta que haces público tu perfil (ver «qué es público»).",
            kept: "Mientras tengas cuenta. Si cambias o quitas la foto, la anterior se borra.",
          },
          {
            name: "Tu biblioteca",
            what: "Tus colecciones (nombre, descripción y visibilidad), los títulos que guardas en ellas, tus marcas (por ver, viendo, completado, me gusta, obsesión) y sus fechas.",
            why: "Es el servicio: guardar y organizar películas, series y álbumes.",
            seen: "Depende de tu perfil y de cada colección (ver «qué es público»).",
            kept: "Mientras tengas cuenta o hasta que lo borres.",
          },
          {
            name: "Reseñas",
            what: "El texto, si marcaste que tiene spoilers y sus fechas.",
            why: "Publicar tu opinión sobre un título.",
            seen: "Si tu perfil es público, cualquiera. Si es privado, solo tú.",
            kept: "Mientras tengas cuenta o hasta que la borres.",
          },
          {
            name: "A quién sigues",
            what: "Las personas que sigues y quién te sigue.",
            why: "Armar tu feed y tu lista de gente.",
            seen: "Tus listas solo las ves tú. Los totales (cuántos sigues, cuántos te siguen) salen en tu perfil público.",
            kept: "Mientras tengas cuenta o hasta que dejes de seguir.",
          },
          {
            name: "Preferencias",
            what: "Tu app de música preferida, si tu perfil es público, si quieres avisos de estreno y cuál fue el último anuncio de novedades que viste.",
            why: "Que Kura funcione como elegiste.",
            seen: "Nadie más.",
            kept: "Mientras tengas cuenta.",
          },
          {
            name: "Recomendaciones",
            what: "Qué recomendaciones te mostramos, cuáles descartaste, lo que nos dijiste de ellas y cuántas pediste en el mes (hay un tope mensual).",
            why: "Recomendarte cosas nuevas y no repetirte lo que ya viste.",
            seen: "Nadie más.",
            kept: "Mientras tengas cuenta.",
          },
          {
            name: "Reportes",
            what: "Si reportas un perfil o una reseña: el motivo, el detalle que escribas y, si tenías sesión, que fuiste tú.",
            why: "Moderar contenido y atender abusos.",
            seen: "Solo quien modera Kura. La persona reportada no sabe quién la reportó.",
            kept: "Mientras hagan falta para moderar. Si borras tu cuenta, el reporte se queda sin tu nombre.",
          },
          {
            name: "Estadísticas de uso",
            what: "Cuando alguien abre una página pública de Kura: qué tipo de página, el @usuario de esa página, la fecha, el país (dos letras, que calcula nuestro proveedor de hosting a partir de la conexión) y el tipo de dispositivo (iPhone, Android, computadora u otro). Cuando compartes una tarjeta o un link desde la web: ese evento, ligado a tu cuenta, con país y tipo de dispositivo. Nunca guardamos tu dirección IP ni quién visitó una página.",
            why: "Saber cuánto se usa Kura y qué mejorar.",
            seen: "Solo quien opera Kura, en conteos agregados.",
            kept: "Sin plazo fijo. Si cambias tu @usuario, pasan al nuevo; si borras tu cuenta, se desligan de ella y les quitamos tu @usuario.",
          },
          {
            name: "Lista de espera",
            what: "Si te anotaste antes de tener cuenta: tu correo, tu código de invitación, quién te invitó y tu lugar en la fila.",
            why: "Darte acceso y reconocer a quien invita.",
            seen: "Nadie más.",
            kept: [
              "Si creaste cuenta, hasta que la borres: se borra con ella. Si no, hasta que nos pidas borrarla escribiéndonos a ",
              CONTACT_EMAIL,
              ".",
            ],
          },
          {
            name: "Registros técnicos",
            what: "Nuestro proveedor de hosting registra cada solicitud: dirección IP, fecha, página o función pedida y un identificador técnico.",
            why: "Operar el servicio, encontrar errores y protegerlo de abusos.",
            seen: "Solo quien opera Kura y el proveedor.",
            kept: "Poco tiempo, según la configuración del proveedor.",
          },
        ],
      },
    ],
  },
  {
    id: "finalidades",
    title: "para qué los usamos",
    blocks: [
      {
        kind: "p",
        text: "Finalidades necesarias. Sin estas, Kura no puede darte el servicio:",
      },
      {
        kind: "list",
        items: [
          "Crear y mantener tu cuenta y dejarte entrar sin contraseña.",
          "Guardar tu biblioteca, tus marcas y tus reseñas.",
          "Mostrar tu perfil, tus colecciones y tu actividad a quien tú elijas, y armar tu feed con la gente que sigues.",
          "Avisarte el día que sale algo que guardaste antes de su estreno: por correo (lo apagas en Ajustes › notificaciones) y, en iOS, con una notificación que tu iPhone programa solo si le das permiso.",
          "Recomendarte películas, series y álbumes a partir de lo que guardas.",
          "Moderar reseñas, atender reportes, prevenir abusos, proteger la seguridad del servicio y no admitir cuentas de menores de 13 años.",
        ],
      },
      {
        kind: "p",
        text: "Finalidades no necesarias. Puedes decirnos que no y Kura te sigue funcionando igual:",
      },
      {
        kind: "list",
        items: [
          "Mandarte un resumen mensual por correo con lo que hiciste en Kura.",
          "Hacer estadísticas agregadas para entender cómo se usa Kura y mejorarlo.",
        ],
      },
      {
        kind: "p",
        text: `El resumen mensual se desactiva en Ajustes › notificaciones; para negarte a las estadísticas, escríbenos a ${CONTACT_EMAIL}. No usamos tus datos para publicidad, no los vendemos ni los rentamos, y no armamos perfiles tuyos para terceros.`,
      },
    ],
  },
  {
    id: "publico",
    title: "qué es público y qué no",
    blocks: [
      {
        kind: "p",
        text: "Por defecto tu perfil es privado: nadie más ve nada tuyo hasta que eliges un @usuario y activas el perfil público en Ajustes › privacidad.",
      },
      {
        kind: "p",
        text: "Con el perfil público, cualquier persona, tenga cuenta o no, puede ver:",
      },
      {
        kind: "list",
        items: [
          "Tu nombre, tu @usuario, tu foto y tu sello de fundador si lo tienes.",
          "Cuántas personas sigues y cuántas te siguen.",
          "Las colecciones que marcas como «En tu perfil», con sus títulos y tus marcas.",
          "Tus reseñas, en tu perfil y en la página de cada título (salvo las que moderación haya ocultado).",
          "En el feed de quien te sigue: lo que agregas a colecciones públicas, lo que completas, lo que te obsesiona, lo que no puedes esperar a que salga y tus reseñas.",
        ],
      },
      {
        kind: "p",
        text: "Cada colección tiene su propia visibilidad: Privada (solo tú), Pública (la ve quien tenga el link, pero no sale en tu perfil) o En tu perfil. Ojo: lo que haces con un título (completarlo, obsesionarte, reseñarlo) depende de que tu perfil sea público, no de la colección donde lo guardaste; ocultar una colección no oculta esa actividad.",
      },
      {
        kind: "p",
        text: "Si sigues a alguien con tu perfil público, esa persona te ve en su lista de seguidores. Si tu perfil es privado, solo cuentas como un número. Solo puedes seguir perfiles públicos.",
      },
      {
        kind: "p",
        text: "Siempre privado: tu correo, tu año de nacimiento, tu app de música, tus preferencias y tus recomendaciones. Además, algunos títulos muestran conteos como «a 12 personas les obsesiona»: ahí cuentas aunque tu perfil sea privado, pero solo como número, nunca con tu nombre.",
      },
      {
        kind: "p",
        text: "Si vuelves privado tu perfil o una colección, deja de verse al instante. No podemos borrar lo que alguien ya haya copiado o capturado antes. Y lo que escribas en una reseña pública lo puede leer cualquiera: no pongas ahí datos personales tuyos ni de nadie más.",
      },
    ],
  },
  {
    id: "terceros",
    title: "con quién compartimos",
    blocks: [
      {
        kind: "p",
        text: "No vendemos tus datos. Estos proveedores los procesan por nuestra cuenta, solo para prestarnos su servicio:",
      },
      {
        kind: "list",
        items: [
          "Vercel (Estados Unidos): aloja la web y la API de la app; ve todo lo que pasa por ellas y guarda los registros técnicos.",
          "Neon (Estados Unidos): nuestra base de datos, en servidores de Amazon Web Services en Virginia. Ahí vive todo lo de la sección «qué datos guardamos».",
          "Resend (Estados Unidos): envía nuestros correos; recibe tu correo y el contenido del mensaje (código, aviso de estreno o resumen mensual).",
          "Google, con su API de Gemini: escribe el texto de algunas recomendaciones. Recibe solo datos de títulos (nombre, tipo, año, género, artista o estudio) y, a veces, una lista de títulos que ya tienes para no recomendártelos. Nunca recibe tu nombre, correo, @usuario ni nada que te identifique.",
        ],
      },
      {
        kind: "p",
        text: "Para el catálogo usamos TMDB (películas y series, incluidos datos de JustWatch sobre dónde verlas), Apple (música, con la API de búsqueda de iTunes) y TIDAL (links a álbumes). Nuestros servidores les preguntan por títulos y por lo que escribes en la búsqueda, sin ningún dato de tu cuenta. Las portadas, en cambio, tu navegador o la app las descarga directo de los servidores de TMDB y de Apple, así que ellos ven tu dirección IP, como con cualquier imagen en internet.",
      },
      {
        kind: "p",
        text: "Los botones para abrir un título en Spotify, Apple Music, YouTube Music, TIDAL o un servicio de streaming te llevan fuera de Kura. Desde ahí aplica la privacidad de ese servicio.",
      },
      {
        kind: "p",
        text: "Si usas la app de iOS, Apple procesa la descarga según sus propias políticas y nos comparte datos de diagnóstico solo si tú lo aceptas en los ajustes de tu iPhone.",
      },
      {
        kind: "p",
        text: "No hacemos transferencias de tus datos que requieran tu consentimiento. Solo entregaríamos datos a una autoridad cuando una ley o una orden competente nos obligue.",
      },
      {
        kind: "p",
        text: "Kura no tiene publicidad, no usa SDKs de terceros para analítica o anuncios, no usa el identificador de publicidad de tu iPhone y no te rastrea entre apps ni sitios de otras empresas.",
      },
    ],
  },
  {
    id: "transferencias",
    title: "dónde viven tus datos",
    blocks: [
      {
        kind: "p",
        text: "Nuestros servidores y proveedores están en Estados Unidos, así que tus datos se guardan y procesan fuera de México. Al usar Kura, tus datos viajan ahí para poder darte el servicio. Los proveedores de infraestructura (Vercel, Neon y Resend) solo los usan para prestarnos su servicio, según sus contratos.",
      },
    ],
  },
  {
    id: "menores",
    title: "menores de 13",
    blocks: [
      {
        kind: "p",
        text: "Kura no es para menores de 13 años. Al crear tu cuenta te pedimos tu año de nacimiento; si da menos de 13, la cuenta se bloquea y se cierra la sesión. De esa cuenta solo conservamos el correo, el año y la marca de bloqueo, para que no se pueda volver a crear con el mismo correo.",
      },
      {
        kind: "p",
        text: `Si tienes entre 13 y 17 años, usa Kura con permiso de tu madre, padre o tutor. Si eres madre, padre o tutor y crees que un menor nos dio sus datos, escríbenos a ${CONTACT_EMAIL} y los borramos.`,
      },
    ],
  },
  {
    id: "derechos",
    title: "tus derechos",
    blocks: [
      {
        kind: "p",
        text: "La ley mexicana te da los derechos ARCO sobre tus datos:",
      },
      {
        kind: "list",
        items: [
          "Acceso: saber qué datos tuyos tenemos y cómo los usamos.",
          "Rectificación: corregirlos si están mal o incompletos.",
          "Cancelación: pedir que los borremos.",
          "Oposición: negarte a que los usemos para una finalidad concreta.",
        ],
      },
      {
        kind: "p",
        text: "También puedes revocar tu consentimiento y limitar el uso de tus datos. Mucho lo haces tú mismo, al momento:",
      },
      {
        kind: "list",
        items: [
          "Ajustes › Editar perfil: cambiar tu nombre, tu @usuario y tu foto.",
          "Ajustes › privacidad: volver privado tu perfil. En tu perfil, la visibilidad de cada colección.",
          "Ajustes › notificaciones: apagar los avisos de estreno por correo.",
          "Ajustes › Borrar cuenta (en la web y en la app): borra al instante tu cuenta, tu foto, tus colecciones, marcas, reseñas, seguimientos, recomendaciones, avisos, tu registro en la lista de espera y los reportes hechos en tu contra. Quedan solo las estadísticas de uso sin ligarse a ti y los reportes que tú hiciste sin tu nombre. Las copias de seguridad técnicas de la base de datos se sobrescriben solas en un máximo de 30 días.",
        ],
      },
      {
        kind: "p",
        text: `Para todo lo demás (por ejemplo, pedir una copia de tus datos o cambiar tu correo), escríbenos a ${CONTACT_EMAIL} desde el correo de tu cuenta, di qué derecho quieres ejercer y sobre qué datos. Si no nos escribes desde ese correo, te pediremos confirmar que la cuenta es tuya. Te respondemos en un máximo de 20 días hábiles y, si procede, lo aplicamos en los 15 días hábiles siguientes.`,
      },
      {
        kind: "p",
        text: "Si crees que no atendimos bien tu solicitud o que usamos mal tus datos, puedes acudir a la autoridad mexicana de protección de datos personales.",
      },
    ],
  },
  {
    id: "conservacion",
    title: "cuánto tiempo los guardamos",
    blocks: [
      {
        kind: "list",
        items: [
          "Tu cuenta y todo lo que creas en Kura: mientras tengas cuenta. Se borra al borrarla.",
          "Código de acceso: vale 10 minutos; si no lo usas, se borra a más tardar al día siguiente.",
          "Sesión: hasta 30 días desde la última vez que usas Kura; mientras la uses se renueva sola, en la web y en la app de iOS.",
          "Estadísticas de uso: sin plazo fijo, sin ligarse a ti después de que borras tu cuenta.",
          "Cuentas bloqueadas por edad: hasta que nos pidas borrarlas.",
          "Lista de espera: si creaste cuenta, hasta que la borres; si no, hasta que nos pidas borrarla.",
          "Copias de seguridad de la base de datos: se sobrescriben en un máximo de 30 días.",
          "Registros técnicos del hosting y del envío de correos: el tiempo corto que fije cada proveedor.",
        ],
      },
    ],
  },
  {
    id: "seguridad",
    title: "cómo los protegemos",
    blocks: [
      {
        kind: "list",
        items: [
          "Todo viaja cifrado (HTTPS) entre tu dispositivo y Kura.",
          "No hay contraseñas que robar: entras con un código de un solo uso que vence en 10 minutos, que guardamos cifrado y que muere tras 5 intentos fallidos.",
          "En iOS, tu sesión se guarda en el Llavero de tu iPhone (el almacén cifrado del sistema).",
          "Cada solicitud revisa que tu cuenta siga existiendo, así que borrarla cierra tu sesión en todos lados.",
          "Cada consulta revisa quién pide qué: nadie puede leer ni cambiar lo privado de otra persona.",
          "Solo la persona que opera Kura tiene acceso a la base de datos y a los registros.",
        ],
      },
      {
        kind: "p",
        text: "Ningún sistema es infalible. Si una vulneración de seguridad afecta de forma importante tus derechos, te avisaremos por correo para que puedas protegerte.",
      },
    ],
  },
  {
    id: "cookies",
    title: "cookies y lo que se guarda en tu dispositivo",
    blocks: [
      {
        kind: "p",
        text: "En la web usamos solo cookies propias y necesarias para mantener tu sesión y proteger el inicio de sesión. No usamos cookies de terceros, de publicidad ni de analítica. Tu navegador guarda además, en su almacenamiento local, tus búsquedas recientes y algunas preferencias de vista; no salen de tu dispositivo.",
      },
      {
        kind: "p",
        text: "En la app de iOS, tu sesión vive en el Llavero y algunas preferencias (títulos fijados, orden, portada elegida, vista, episodios vistos, búsquedas y títulos recientes) se guardan solo en tu iPhone y se borran al cerrar sesión. Lo mismo pasa con la sesión web que la app abre para mostrarte la tarjeta de tu recap: se cierra cuando cierras sesión en la app. Los avisos de estreno de la app son notificaciones que tu iPhone programa por sí mismo, con tu permiso; no pasan por nuestros servidores.",
      },
    ],
  },
  {
    id: "consentimiento",
    title: "tu consentimiento",
    blocks: [
      {
        kind: "p",
        text: "Ponemos este aviso a tu alcance antes de pedirte cualquier dato. Si creas una cuenta o sigues usando Kura, entendemos que estás de acuerdo con él; como no tratamos datos sensibles, la ley permite este consentimiento tácito. Puedes retirarlo cuando quieras borrando tu cuenta o escribiéndonos.",
      },
    ],
  },
  {
    id: "cambios",
    title: "cambios a este aviso",
    blocks: [
      {
        kind: "p",
        text: "Si cambiamos este aviso, publicamos la versión nueva en esta misma página con su fecha. Si el cambio es importante (una finalidad nueva o un proveedor nuevo que reciba tus datos), te avisamos en Kura o por correo antes de que aplique.",
      },
    ],
  },
  {
    id: "contacto",
    title: "contacto",
    blocks: [
      {
        kind: "p",
        text: `${RESPONSIBLE} · ${ADDRESS} · ${CONTACT_EMAIL}`,
      },
    ],
  },
];
