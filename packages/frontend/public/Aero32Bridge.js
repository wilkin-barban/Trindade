// Puente Aero32 · Trindade Massas · v2.1.0
//
// La web no puede hablar con el ERP desde HTTPS: el navegador bloquea el contenido mixto y la red de
// la fábrica es HTTP dentro de la LAN. Por eso la página pide un ticket de un solo uso al backend y
// abre este script, que es el único proceso que hace los POST contra la planta:
//
//   scriptable:///run/Aero32Bridge?ticket=<ticket>&ticketUrl=<url-encoded>
//
// El ticket viaja en la URL del deep link, no en este archivo. Acá sólo se canjea: el servidor
// responde el sobre { url, headers, body, bodies?, callback, steps? } y el script lo reenvía tal cual.
// Si el sobre trae `steps`, ejecuta cada paso en orden en el mismo viaje (lanzamiento y lectura del día)
// y devuelve un resultado compuesto { launch, read }. Si no trae `steps`, ejecuta el sobre simple legacy.
//
// Desde v2.1.0 el Relatório pide los dos lados del día en un solo ticket: `bodies` trae el pedido de
// entradas y el de salidas por separado, porque Aero32 no sabe leer un `ENTSAI` abierto. Cuando llegan dos
// cuerpos de movimientos, el script une las dos listas y guarda un único resultado `{ success, data, skipped }`
// que la página lee como el día entero. Un guion viejo que ignore `bodies` completa sólo las entradas y no rompe.
// No hay contraseñas, no hay estado guardado y no se registra ni se muestra nada del sobre.

const TITULO = 'Trindade';

// Scriptable mide `timeoutInterval` en SEGUNDOS, no en milisegundos: 10 son diez segundos. Sin límite propio,
// una red de fábrica que no contesta deja la pantalla «enviando» hasta que iOS decide cortar, y un lote de
// ocho cuerpos espera ese plazo ocho veces. Con el límite, el fallo llega en un plazo conocido y con veredicto.
const TIEMPO_LIMITE = 10;

// Límite de 2 MB para el cuerpo del resultado almacenado en el cofre del servidor.
const LIMITE_BYTES_RESULTADO = 2 * 1024 * 1024;

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

function normalizeBatchItem(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    const text = typeof rawText === 'string' && rawText.trim() ? rawText.trim() : 'Error al enviar al ERP';
    return { success: false, message: text };
  }
}

async function sendPostBatch(url, method, headers, bodies, callbackUrl) {
  const responses = [];
  for (let indice = 0; indice < bodies.length; indice += 1) {
    try {
      const envio = new Request(url);
      envio.method = method || 'POST';
      envio.headers = headers;
      envio.body = bodies[indice];
      envio.allowInsecureRequest = true;
      envio.timeoutInterval = TIEMPO_LIMITE;
      responses.push(await envio.loadString());
    } catch (error) {
      if (indice === 0) {
        // El primer cuerpo prueba el alcance: si no responde, no hay Wi-Fi o ERP.
        Safari.open(
          callbackUrl +
            '&aero_error=wifi_required&aero_msg=' +
            encodeURIComponent(MENSAJE_SIN_ERP),
        );
        Script.complete();
        return { aborted: true, responses: [] };
      }
      const message = error && error.message ? String(error.message) : 'Error al enviar al ERP';
      responses.push(JSON.stringify({ success: false, message }));
    }
  }
  return { aborted: false, responses };
}

function parseBatchResponses(responses) {
  if (responses.length === 1) {
    try {
      return JSON.parse(responses[0]);
    } catch (error) {
      return responses[0];
    }
  }
  return responses.map(normalizeBatchItem);
}

let datoResultado = null;

if (Array.isArray(sobre.steps) && sobre.steps.length > 0) {
  // Sobre multi-paso: ejecuta cada paso en orden en este mismo viaje a la LAN de la fábrica.
  // Paso 1 (índice 0): lanzamiento de massas (entrada o entrada_lote).
  // Paso 2 (índice 1): lectura de movimentos del día contra movimentoitem.
  const pasoLanzamiento = sobre.steps[0];
  const cuerposLanzamiento =
    Array.isArray(pasoLanzamiento.bodies) && pasoLanzamiento.bodies.length > 0
      ? pasoLanzamiento.bodies
      : [pasoLanzamiento.body];
  const batchLanzamiento = await sendPostBatch(
    pasoLanzamiento.url,
    pasoLanzamiento.method || 'POST',
    pasoLanzamiento.headers || sobre.headers,
    cuerposLanzamiento,
    sobre.callback,
  );
  if (batchLanzamiento.aborted) {
    return;
  }
  const launch = parseBatchResponses(batchLanzamiento.responses);

  let read = null;
  if (sobre.steps.length > 1) {
    const pasoLectura = sobre.steps[1];
    try {
      const envioLectura = new Request(pasoLectura.url);
      envioLectura.method = pasoLectura.method || 'POST';
      envioLectura.headers = pasoLectura.headers || sobre.headers;
      envioLectura.body = pasoLectura.body;
      envioLectura.allowInsecureRequest = true;
      envioLectura.timeoutInterval = TIEMPO_LIMITE;
      const rawLectura = await envioLectura.loadString();
      try {
        read = JSON.parse(rawLectura);
      } catch (error) {
        read = rawLectura;
      }
    } catch (error) {
      // Un fallo en la lectura no anula el resultado del lanzamiento ya registrado.
      read = {
        success: false,
        message: error && error.message ? String(error.message) : 'Error al leer movimentos del ERP',
      };
    }
  }

  datoResultado = { launch, read };

  // Guarda de 2 MB: si el cuerpo compuesto excede el límite del cofre, se preserva launch y se omite read.
  try {
    const longitudSerializada = JSON.stringify({ data: datoResultado }).length;
    if (longitudSerializada > LIMITE_BYTES_RESULTADO) {
      datoResultado = { launch };
    }
  } catch (error) {
    // Si la serialización fallara, se continúa con datoResultado
  }
} else {
  // Sobre simple legacy (o acciones sin steps como saida, test, movimentos aislados).
  const cuerpos = Array.isArray(sobre.bodies) && sobre.bodies.length > 0 ? sobre.bodies : [sobre.body];
  const batchLegacy = await sendPostBatch(sobre.url, 'POST', sobre.headers, cuerpos, sobre.callback);
  if (batchLegacy.aborted) {
    return;
  }
  datoResultado = parseBatchResponses(batchLegacy.responses);

  // Dos lados del día en un viaje: la página espera una sola lista de asientos, no una lista de listas.
  // Se unen las respuestas buenas y se suman los asientos que cada lado no pudo leer; si un lado falló, el
  // resultado es ese fallo, porque medio día presentado como el día entero es peor que un error.
  if (cuerpos.length > 1 && /movimentoitem/i.test(String(sobre.url))) {
    const partes = Array.isArray(datoResultado) ? datoResultado : [datoResultado];
    const todasListas = partes.every(function (parte) {
      return parte && parte.success === true && Array.isArray(parte.data);
    });
    if (todasListas) {
      let asientos = [];
      let saltados = 0;
      for (let indice = 0; indice < partes.length; indice += 1) {
        asientos = asientos.concat(partes[indice].data);
        if (typeof partes[indice].skipped === 'number' && isFinite(partes[indice].skipped)) {
          saltados += partes[indice].skipped;
        }
      }
      datoResultado = { success: true, data: asientos, skipped: saltados };
    } else {
      const fallado = partes.find(function (parte) {
        return !parte || parte.success !== true;
      });
      const mensaje =
        fallado && typeof fallado.message === 'string' && fallado.message.trim()
          ? fallado.message
          : 'movements_unreadable';
      datoResultado = { success: false, message: mensaje };
    }
  }
}

// Si el servidor soporta almacenar el resultado en el cofre, se envía por POST con el ticket para
// que la URL de retorno no desborde el límite de encabezados del proxy.
if (sobre.resultUrl) {
  let urlResultado = sobre.resultUrl;
  if (!/^https?:\/\//i.test(urlResultado)) {
    const origen = (ticketUrl.match(/^(https?:\/\/[^\/]+)/) || [])[1] || '';
    urlResultado = origen + (urlResultado.startsWith('/') ? '' : '/') + urlResultado;
  }

  try {
    const envioResultado = new Request(urlResultado);
    envioResultado.method = 'POST';
    envioResultado.headers = {
      'X-Trindade-Ticket': ticket,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    envioResultado.body = JSON.stringify({ data: datoResultado });
    envioResultado.allowInsecureRequest = true;
    envioResultado.timeoutInterval = TIEMPO_LIMITE;
    await envioResultado.loadString();
  } catch (error) {
    // Si el guardado falla, la página leerá el estado no disponible en el servidor.
  }

  Safari.open(sobre.callback + '&aero_result=stored');
} else {
  const resultadoTexto = typeof datoResultado === 'string' ? datoResultado : JSON.stringify(datoResultado);
  Safari.open(sobre.callback + encodeURIComponent(resultadoTexto));
}
Script.complete();
