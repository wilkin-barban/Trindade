// Puente Aero32 · Trindade Massas
//
// La web no puede hablar con el ERP desde HTTPS: el navegador bloquea el contenido mixto y la red de
// la fábrica es HTTP dentro de la LAN. Por eso la página pide un ticket de un solo uso al backend y
// abre este script, que es el único proceso que hace los POST contra la planta:
//
//   scriptable:///run/Aero32Bridge?ticket=<ticket>&ticketUrl=<url-encoded>
//
// El ticket viaja en la URL del deep link, no en este archivo. Acá sólo se canjea: el servidor
// responde el sobre { url, headers, body, bodies?, callback } y el script lo reenvía tal cual. No hay
// contraseñas, no hay estado guardado y no se registra ni se muestra nada del sobre.

const TITULO = 'Trindade';

// Scriptable mide `timeoutInterval` en SEGUNDOS, no en milisegundos: 10 son diez segundos. Sin límite propio,
// una red de fábrica que no contesta deja la pantalla «enviando» hasta que iOS decide cortar, y un lote de
// ocho cuerpos espera ese plazo ocho veces. Con el límite, el fallo llega en un plazo conocido y con veredicto.
const TIEMPO_LIMITE = 10;

// Mensaje de alcance: no se puede leer el SSID desde Scriptable, así que se prueba el host del ERP. Si no
// responde, el iPhone no está en la red de la empresa o la red de la fábrica no está disponible.
const MENSAJE_SIN_ERP =
  'No se pudo alcanzar el ERP. Verificá que el iPhone esté en la Wi-Fi Trindade Expedicao y que la red de la fábrica esté disponible.';

/** Aviso breve. Nunca incluye el ticket, los encabezados ni el cuerpo. */
function avisar(mensaje) {
  const alerta = new Alert();
  alerta.title = TITULO;
  alerta.message = mensaje;
  alerta.addAction('Cerrar');
  return alerta.present();
}

const parametros = (args && args.queryParameters) || {};
const ticket = parametros.ticket;
const ticketUrl = parametros.ticketUrl;

// Sin ticket no hay canje posible: se avisa y se termina sin abrir ningún callback inventado.
if (!ticket || !ticketUrl) {
  await avisar('Falta el ticket del puente. Volvé a la página y probá de nuevo.');
  Script.complete();
  return;
}

// Canje del ticket: una sola petición, sin cuerpo, con el ticket en su propio encabezado. El servidor
// valida, lo consume y devuelve el sobre que hay que reenviar al ERP.
let sobre = null;
try {
  const canje = new Request(ticketUrl);
  canje.method = 'POST';
  canje.headers = { 'X-Trindade-Ticket': ticket, Accept: 'application/json' };
  // El canje viaja por HTTPS, pero el ERP de la planta vive en HTTP dentro de la LAN. La misma bandera
  // habilita los dos, y es la razón por la que este script existe en lugar de un pedido del navegador:
  // iOS no aplica acá la política de contenido mixto de la web.
  canje.allowInsecureRequest = true;
  canje.timeoutInterval = TIEMPO_LIMITE;
  sobre = await canje.loadJSON();
} catch (error) {
  sobre = null;
}

// Un sobre sin URL no se puede enviar y uno sin callback no tiene a dónde volver: se avisa y se
// termina. Inventar un callback dejaría la página esperando una respuesta que nunca llega.
if (!sobre || !sobre.url || !sobre.callback) {
  await avisar('No se pudo canjear el ticket del puente. Volvé a la página y probá de nuevo.');
  Script.complete();
  return;
}

// El sobre trae uno o varios cuerpos: el lote repite el mismo endpoint una vez por producto.
const cuerpos = Array.isArray(sobre.bodies) && sobre.bodies.length > 0 ? sobre.bodies : [sobre.body];
const respuestas = [];

for (let indice = 0; indice < cuerpos.length; indice += 1) {
  try {
    const envio = new Request(sobre.url);
    envio.method = 'POST';
    envio.headers = sobre.headers;
    envio.body = cuerpos[indice];
    envio.allowInsecureRequest = true;
    envio.timeoutInterval = TIEMPO_LIMITE;
    respuestas.push(await envio.loadString());
  } catch (error) {
    // Una excepción es red o timeout: el ERP no contestó. Una respuesta HTTP 4xx/5xx no pasa por acá,
    // porque `loadString()` devuelve el cuerpo igual y ese es un veredicto del ERP, no un problema de red.
    if (indice === 0) {
      // El primer cuerpo es la prueba de alcance: si no hay respuesta, el resto del lote tampoco la va a
      // tener. Se corta acá en lugar de esperar el límite una vez por producto y se vuelve por el callback
      // que ya trae `aero_action`/`aero_data`, con un código estable que la web traduce.
      Safari.open(
        sobre.callback +
          '&aero_error=wifi_required&aero_msg=' +
          encodeURIComponent(MENSAJE_SIN_ERP),
      );
      Script.complete();
      return;
    }

    // Un producto posterior que falla no cancela el lote: la web lee la respuesta de cada uno, en el mismo
    // orden. El mensaje del error es lo único que se devuelve; nunca el ticket, los encabezados ni el cuerpo.
    respuestas.push(error && error.message ? String(error.message) : 'Error al enviar al ERP');
  }
}

// Un solo cuerpo devuelve el texto tal cual; un lote devuelve [respuesta1,respuesta2,…], que es
// exactamente lo que la página ya sabe leer.
const resultado = respuestas.length === 1 ? respuestas[0] : '[' + respuestas.join(',') + ']';

Safari.open(sobre.callback + encodeURIComponent(resultado));
Script.complete();
