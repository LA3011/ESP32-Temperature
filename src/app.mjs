// Importando Módulos DEV/PRODUCT
import express from "express";
import morgan from "morgan";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cron from "node-cron";

// Importando Rutas
import routeAlertas from "./routes/alertas.mjs";
import routeClientes from "./routes/clientes.mjs";
import routeEsp32 from "./routes/esp32.mjs";
import routeTemperaturas from "./routes/temperaturas.mjs";
import routeUsuarios from "./routes/usuarios.mjs";
import routeLogin from "./routes/login.mjs";
import routeNotifys from "./routes/notifys.mjs";
import routeReports from "./routes/reports.mjs";

// Importando Modelos
import usuariosSchema from "./models/usuarios.mjs";
import esp32Schema from "./models/esp32.mjs";

// Importando objeto MongoDB
import { ObjectId } from "mongodb";

// Configuración de Variables de Entorno
dotenv.config();

// Importando dependencias FIREBASE
import admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";

// Importar Chalk para colorear la salida
import chalk from "chalk";

// Definir la constante de conversión: 1 MB = 1048576 bytes
const BYTES_PER_MB = 1024 * 1024;

// ─────────────────────────────────────────────
// Variable global para almacenar el consumo diario de ancho de banda
// (se almacena internamente en bytes, pero se mostrará en MB)
// ─────────────────────────────────────────────
let dailyBandwidth = {
  incoming: 0,
  outgoing: 0,
};

// Middleware personalizado para contabilizar el ancho de banda  
// (excluye la ruta '/bandwidth' para que su propio tráfico no se contabilice)
function bandwidthCounter(req, res, next) {
  // Si la ruta es /bandwidth, no queremos sumar su tráfico:
  if (req.path === "/bandwidth") {
    return next();
  }

  let requestBytes = 0;
  let responseBytes = 0;

  // Detecta los datos entrantes
  req.on("data", (chunk) => {
    requestBytes += Buffer.byteLength(chunk);
  });

  // Fallback: Si no se reciben 'data' por que el body ya fue consumido,
  // usa el header 'content-length' como respaldo.
  req.on("end", () => {
    if (requestBytes === 0 && req.headers["content-length"]) {
      requestBytes = parseInt(req.headers["content-length"]);
    }
  });

  // Guardamos las funciones originales para la respuesta
  const originalWrite = res.write;
  const originalEnd = res.end;

  // Interceptamos res.write para capturar los bytes enviados
  res.write = function (chunk, encoding, callback) {
    if (chunk) {
      responseBytes += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(chunk, encoding);
    }
    return originalWrite.apply(res, arguments);
  };

  // Interceptamos res.end para contabilizar el último fragmento y actualizar el contador global
  res.end = function (chunk, encoding, callback) {
    if (chunk) {
      responseBytes += Buffer.isBuffer(chunk)
        ? chunk.length
        : Buffer.byteLength(chunk, encoding);
    }
    // Actualizamos el contador global justo antes de terminar la respuesta
    dailyBandwidth.incoming += requestBytes;
    dailyBandwidth.outgoing += responseBytes;

    // Convertimos a MB y mostramos con 3 decimales para mayor precisión
    console.log(
      chalk.yellow(
        `Request: ${(requestBytes / BYTES_PER_MB).toFixed(3)} MB, Response: ${(responseBytes / BYTES_PER_MB).toFixed(3)} MB`
      )
    );
    console.log(
      chalk.red(
        `Total: Entrada: ${(dailyBandwidth.incoming / BYTES_PER_MB).toFixed(3)} MB - Salida: ${(dailyBandwidth.outgoing / BYTES_PER_MB).toFixed(3)} MB`
      )
    );
    console.log("-------------------------------------------");

    return originalEnd.apply(res, arguments);
  };

  next();
}

// ─────────────────────────────────────────────
// Inicializando la aplicación Express
// ─────────────────────────────────────────────
const app = express();

// IMPORTANTE: Coloca el middleware de ancho de banda **antes** de otros middlewares que consuman el body
app.use(bandwidthCounter);

app.use(morgan("dev"));
app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// Cargar Keys de FIREBASE
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SECRET);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ─────────────────────────────────────────────
// Endpoint para consultar el consumo diario de ancho de banda
// Se agregan cabeceras para evitar caché.
// Se muestra el acumulado convertido a MB.
// ─────────────────────────────────────────────
app.get("/bandwidth", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    incomingMB: (dailyBandwidth.incoming / BYTES_PER_MB).toFixed(3),
    outgoingMB: (dailyBandwidth.outgoing / BYTES_PER_MB).toFixed(3)
  });
});

// ─────────────────────────────────────────────
// Rutas de la aplicación
// ─────────────────────────────────────────────
app.get("/api", (_req, res) => {
  res.send("API REST: ESP32-Temperatura");
});
app.use("/alertas", routeAlertas);
app.use("/clientes", routeClientes);
app.use("/esp32", routeEsp32);
app.use("/temperaturas", routeTemperaturas);
app.use("/usuarios", routeUsuarios);
app.use("/notificaciones", routeNotifys);
app.use("/login", routeLogin);
app.use("/reports", routeReports);

// ─────────────────────────────────────────────
// Función para verificación del estado del WiFi de ESP32 (MongoDB Atlas)
// ─────────────────────────────────────────────
async function verificarEstadoESP32() {
  try {
    const esp32Devices = await mongoose.connection.db
      .collection("esp32")
      .find()
      .toArray();

    if (!esp32Devices.length) {
      console.warn("⚠️ No se encontraron ESP32 en la colección.");
      return;
    }

    const tareas = esp32Devices.map(async (esp32) => {
      const { _id, lastNotification } = esp32; // Agregamos `lastNotification`
      
      const ultimoRegistro = await mongoose.connection.db
        .collection("temperature1days")
        .find({ id_ESP: _id.toString() })
        .sort({ dateTime: -1 })
        .limit(1)
        .toArray();

      if (!ultimoRegistro.length) return;

      const { dateTime } = ultimoRegistro[0];
      const tiempoTranscurrido = (new Date() - new Date(dateTime)) / (1000 * 60);
      const nuevoEstado = tiempoTranscurrido > process.env.VERIFICATION_ACTIVITY_WIFI_ESP ? false : true;

      // Actualizar estado de conexión del ESP32
      await mongoose.connection.db
        .collection("esp32")
        .updateOne(
          { _id: new mongoose.Types.ObjectId(_id) },
          { $set: { statusWifi: nuevoEstado } }
        );

      // Validar si la última notificación fue hace menos de X minutos (evita spam)
      const tiempoDesdeNotificacion = lastNotification 
        ? (new Date() - new Date(lastNotification)) / (1000 * 60) 
        : process.env.VERIFICATION_ACTIVITY_WIFI_ESP + 1;

      if (nuevoEstado === false && tiempoDesdeNotificacion > process.env.NOTIFICATION_INTERVAL) {
        const id_ESP = new ObjectId(_id).toHexString();
        const messaging = getMessaging();
        const userTokenFCM = await usuariosSchema.findOne({ id_ESP });
        const esp_typeEquipmentAsigned = await esp32Schema.findOne(
          { _id: new mongoose.Types.ObjectId(id_ESP) },
          { typeEquipmentAsigned: 1, _id: 1 }
        );

        const payloadNotify = {
          tokens: userTokenFCM.tokenFCM,
          data: { _id: esp_typeEquipmentAsigned._id.toString() },
          notification: {
            title: `${userTokenFCM.userName}, ESP32 con Inactividad`,
            body: `Observación Inusual, Mantente Alerta...`,
          },
        };

        await messaging.sendEachForMulticast(payloadNotify);

        // Guardar la nueva fecha de notificación en la BD
        await mongoose.connection.db
          .collection("esp32")
          .updateOne(
            { _id: new mongoose.Types.ObjectId(_id) },
            { $set: { lastNotification: new Date() } }
          );
      }
    });

    await Promise.all(tareas);
  } catch (error) {
    console.error("❌ Error al verificar estado de los ESP32:", error);
  }
}

// Programar verificación periódica (cada 10 minutos por defecto)
const cronTime = process.env.CRON_TIME;
cron.schedule(cronTime, verificarEstadoESP32);

// ─────────────────────────────────────────────
// Cron job para reiniciar el contador diario a medianoche
// ─────────────────────────────────────────────
cron.schedule("0 0 * * *", () => {
  dailyBandwidth.incoming = 0;
  dailyBandwidth.outgoing = 0;
  console.log(chalk.green("Daily bandwidth counter reset."));
});

// ─────────────────────────────────────────────
// Conexión a MongoDB Atlas
// ─────────────────────────────────────────────
if (process.env.KEY_MONGO) {
  mongoose
    .connect(process.env.KEY_MONGO)
    .then(() => {
      console.log("✅ Conectado a MongoDB Atlas");
      console.log("Base de datos activa:", mongoose.connection.name);
      console.log("Modelos registrados en Mongoose:", mongoose.modelNames());
    })
    .catch((e) => console.log(`❌ Error de conexión: ${e}`));
} else {
  console.error("❌ KEY_MONGO no está definido en las variables de entorno.");
}

// ─────────────────────────────────────────────
// Inicialización del servidor
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
});
