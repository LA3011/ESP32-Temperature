// Importando Modulos
import express from "express";
import morgan from "morgan";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cron from "node-cron";
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// Importando Rutas
import routeAlertas from "./routes/alertas.mjs";
import routeClientes from "./routes/clientes.mjs";
import routeEsp32 from "./routes/esp32.mjs";
import routeTemperaturas from "./routes/temperaturas.mjs";
import routeUsuarios from "./routes/usuarios.mjs";
import routeLogin from "./routes/login.mjs";
import routeNotifys from "./routes/notifys.mjs";
import routeReports from "./routes/reports.mjs";
// modelos 
import usuariosSchema from "./models/usuarios.mjs";
import esp32Schema from "./models/esp32.mjs";
// mongo
import { ObjectId } from 'mongodb';
// var environment
dotenv.config();
// firebase
import admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
// rutas relativas server
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar Keys de FIREBASE
if (!admin.apps.length) {// Verifica si ya existe la app; si no, la inicializa
  // const keyFilePath = join(__dirname, '..', 'keyFireBase', 'esp32-monitor-la-firebase-adminsdk-fbsvc-ec6089aff4.json');
  // const serviceAccount = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
  const serviceAccount = JSON.parse(process.env.FIREBASE_SECRET);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}


// Inicializando App en express
const app = express();

// Middleware
app.use(morgan("dev"));
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

// Routing
app.get("/api", (_req, res) => { res.send("API REST: ESP32-Temperatura"); });
app.use("/alertas", routeAlertas);
app.use("/clientes", routeClientes);
app.use("/esp32", routeEsp32);
app.use("/temperaturas", routeTemperaturas);
app.use("/usuarios", routeUsuarios);
app.use("/notificaciones", routeNotifys);
app.use("/login", routeLogin);
app.use("/reports", routeReports);


// Verificación de estado WiFi ESP32 (Coleccion MongoDB ATLAS)
async function verificarEstadoESP32() {
  try {
    // Obtener todos los ESP32 registrados en la colección
    const esp32Devices = await mongoose.connection.db.collection("esp32").find().toArray();
    if (!esp32Devices.length) {
      console.warn("⚠️ No se encontraron ESP32 en la colección.");
      return;
    }

    // Procesar todos los ESP32 en paralelo
    const tareas = esp32Devices.map(async (esp32) => {
      const { _id } = esp32;

      // Buscar el último registro de temperatura
      const ultimoRegistro = await mongoose.connection.db.collection("temperature1days")
        .find({ id_ESP: _id.toString() })
        .sort({ dateTime: -1 })
        .limit(1)
        .toArray();

      if (!ultimoRegistro.length) {
        // console.warn(`⚠️ No se encontraron registros de temperatura para ESP32: ${_id}`);
        return;
      }

      const { dateTime } = ultimoRegistro[0];
      const tiempoTranscurrido = (new Date() - new Date(dateTime)) / (1000 * 60);
      // console.log(`⏳ ESP32 ${_id} - Última medición hace ${tiempoTranscurrido.toFixed(2)} minutos.`);

      const nuevoEstado = tiempoTranscurrido > process.env.VERIFICATION_ACTIVITY_WIFI_ESP ? false : true;

      // Actualizar el `statusWifi` del ESP32
      const resultado = await mongoose.connection.db.collection("esp32")
        .updateOne(
          { _id: new mongoose.Types.ObjectId(_id) },
          { $set: { statusWifi: nuevoEstado } }
        );
        
        // Notificar Estado Clientes
        if(tiempoTranscurrido > process.env.VERIFICATION_ACTIVITY_WIFI_ESP){
          const id_ESP = new ObjectId(_id).toHexString();
          // console.log(id_ESP)
          const messaging = getMessaging();
          const userTokenFCM = await usuariosSchema.findOne({ id_ESP }); 
          const esp_typeEquipmentAsigned = await esp32Schema.findOne( { _id: new mongoose.Types.ObjectId(id_ESP) }, { typeEquipmentAsigned: 1, _id: 1 }); 
          const payloadNotify = {
            tokens: userTokenFCM.tokenFCM, // array de tokens
            data: {
              _id: esp_typeEquipmentAsigned._id.toString()
            },
            notification: {
              title: `${userTokenFCM.userName}, ESP32 con Inactividad`,
              body: `Observación Inusual, Mantente Alerta...`
            }
          };
          // Envio Notificacion
          await messaging.sendEachForMulticast(payloadNotify);
        }



      if (resultado.modifiedCount > 0) {
        // console.log(`✅ ESP32 ${_id} actualizado a statusWifi: ${nuevoEstado}`);
      } else {
        // console.log(`🔹 ESP32 ${_id} no necesitó cambios.`);
      }
    });

    await Promise.all(tareas); // Ejecutar todas las actualizaciones en paralelo

  } catch (error) {
    console.error("❌ Error al verificar estado de los ESP32:", error);
  }
}
// Programar verificación cada 10 minutos (WiFi ESP32)
const cronTime = process.env.CRON_TIME || "*/60 * * * *"; // 📌 Valor por defecto si no está en .env
cron.schedule(cronTime, verificarEstadoESP32);


// Conectar a MongoDB Atlas con verificación de credenciales
if (process.env.KEY_MONGO) {
  mongoose.connect(process.env.KEY_MONGO)
    .then(() => {
      console.log("✅ Conectado a MongoDB Atlas");
      console.log("Base de datos activa:", mongoose.connection.name);
      console.log("Modelos registrados en Mongoose:", mongoose.modelNames());
    })
    .catch(e => console.log(`❌ Error de conexión: ${e}`));
} else {
  console.error("❌ KEY_MONGO no está definido en las variables de entorno.");
}

// Inicializando Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, "192.168.1.109", () => {
  console.log(`✅ Servidor escuchando en el puerto ${PORT}`);
});
