import fs from "fs";
import express from "express";
import temperatureSchema from "../models/temperaturas.mjs";
import alertas from "../models/alertas.mjs";
import esp32Schema from "../models/esp32.mjs";
import mongoose from "mongoose"; 
import notifys from "../models/notifys.mjs"
import usuariosSchema from "../models/usuarios.mjs"
// firebase
import admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
// Leer archivo FIREBASE
const serviceAccount = JSON.parse(
  fs.readFileSync("./keyFireBase/esp32-monitor-la-firebase-adminsdk-fbsvc-ec6089aff4.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const { ObjectId } = mongoose.Types; 
const routeTemperaturas = express.Router();


  // Crear nuevo registro de temperatura (OPTIMIZADO) (PESADA CONSULTA)
  routeTemperaturas.post("/", async (req, res) => {
    try {
      const fecha = new Date();
      const { id_ESP, temperature } = req.body;

      if (!id_ESP || !temperature?.length) {
        return res.status(400).json({ mensaje: "❌ Faltan datos para registro de temperatura." });
      }

      const ultima_Temp = temperature.at(-1);

      const alarmaESP = await esp32Schema.findOne(
        { _id: new mongoose.Types.ObjectId(id_ESP) },
        { alarma: 1, statusActivity: 1 }
      );

      if (!alarmaESP) {
        return res.status(404).json({ mensaje: "❌ ESP32 no encontrado." });
      }

      if (!alarmaESP.statusActivity) {
        return res.status(200).json({ mensaje: "🔸 ESP32 inactivo, temperatura no guardada." });
      }

      const nuevaTemperatura = new temperatureSchema({
        id_ESP,
        temperature,
        dateTime: fecha,
        unidad: process.env.UNIDAD_TEMP
      });

      const alerta = ultima_Temp > alarmaESP.alarma
        ? new alertas({ id_ESP, dateCreate: fecha, temperature: ultima_Temp, status: true }).save()
        : Promise.resolve(null);

      const alertCount = await alertas.countDocuments({ id_ESP }); // consultar numero de alertas de ese id_ESP
      const notifyInsert = alertCount >= process.env.LIMITE_ALERTAS_post_NOTIFICACION // Insertar Notificacion (condicion)
        ? new notifys({ id_ESP, dateCreate: fecha, temperature: ultima_Temp, status: true }).save()
        : Promise.resolve(null);

      const deleteAlerts = alertCount >= process.env.LIMITE_ALERTAS_post_NOTIFICACION // Eliminar todas "Alerts" 'id_ESP' (condicion)
        ? alertas.deleteMany({ id_ESP })
        : Promise.resolve(null);

      const [temperaturaGuardada, alertaGuardada, notifyGuardada, alertsDeleted] = await Promise.all([
        nuevaTemperatura.save(),
        alerta,
        notifyInsert,
        deleteAlerts
      ]);
      
      
      // Enviar notificación solo si `notifyGuardada` existe
      if (notifyGuardada) {
        try {
          const messaging = getMessaging();
          // const messaging = admin.messaging();
          // Solo devuelve `tokenFCM`, sin `_id`
          const userTokenFCM = await usuariosSchema.findOne({ id_ESP }); 
          const esp_typeEquipmentAsigned = await esp32Schema.findOne( { _id: new mongoose.Types.ObjectId(id_ESP) }, { typeEquipmentAsigned: 1, _id: 1 }); 
          const payloadNotify = {
            tokens: userTokenFCM.tokenFCM, // 📌 Debe ser un array de tokens
            data: {
              id_ESP: esp_typeEquipmentAsigned._id.toString()
            },
            notification: {
              title: `${userTokenFCM.userName}, Alerta de Temperatura`,
              body: `${esp_typeEquipmentAsigned.typeEquipmentAsigned} 🌡️${notifyGuardada.temperature}°C`
            }
          };
          // console.log(payloadNotify)

          // Envio Notificacion
          const notifySendResponse = await messaging.sendEachForMulticast(payloadNotify);
        
        } catch (error) {
          console.error("❌ Error al enviar notificación:", error);
        }
      }

      res.status(201).json({ temperaturaGuardada, alertaGuardada, notifyGuardada, alertsDeleted });

    } catch (error) {
      console.error("❌ Error en la operación:", error);
      res.status(500).json({ mensaje: "❌ Error interno del servidor", error });
    }
  });


  // Ruta para obtener temperaturas en un solo array, manteniendo el orden
  routeTemperaturas.get("/semanal/:id_ESP", async (req, res) => {
    try {
      const { id_ESP } = req.params;

      // Obtener registros ordenados por fecha y hora
      const temperaturas = await temperatureSchema.find({ id_ESP }).sort({ dateTime: 1 }).lean();

      if (temperaturas.length === 0) {
        return res.status(404).json({ mensaje: "No se encontraron registros de temperatura para este ESP32" });
      }

      // 🏗 Agrupar temperaturas en un solo array, separando objetos cuando cambia la fecha
      const datosCompactados = [];
      let ultimoRegistro = null;

      temperaturas.forEach(temp => {
        const fecha = temp.dateTime.toISOString().split("T")[0]; // ✅ Extrae solo la fecha (YYYY-MM-DD)
        const hora = temp.dateTime.toISOString().split("T")[1].split(".")[0]; // ✅ Extrae solo la hora (HH:mm:ss)

        // Si es la primera iteración o la fecha cambió, crear un nuevo objeto
        if (!ultimoRegistro || ultimoRegistro.fecha !== fecha) {
          ultimoRegistro = {
            id_ESP: temp.id_ESP,
            fecha,
            temperatura: [],
            unidad: process.env.UNIDAD_TEMP
          };
          datosCompactados.push(ultimoRegistro);
        }

        // Agregar las temperaturas dentro del objeto correspondiente
        ultimoRegistro.temperatura.push({ hora, valores: temp.temperature });
      });

      res.status(200).json( datosCompactados);

    } catch (error) {
      console.error("❌ Error al organizar temperaturas:", error);
      res.status(500).json({ mensaje: "Error al organizar temperaturas", error });
    }
  });

  // Ruta para obtener temperaturas mas actual de varios ESPs (de un solo usuario)
  routeTemperaturas.post("/actual", async (req, res) => {
    try {
        const { id_ESPs } = req.body; // 🔹 Ahora obtiene un array de IDs en el `body`

        // Validar que haya al menos un ID
        if (!id_ESPs || !Array.isArray(id_ESPs) || id_ESPs.length === 0) {
            return res.status(400).json({ mensaje: "❌ Se requiere una lista de IDs de ESPs válida." });
        }

        // Busca la última temperatura de cada `id_ESP`
        const temperaturas = await Promise.all(
            id_ESPs.map(async (id) => {
                const ultimaTemperatura = await temperatureSchema
                    .findOne({ id_ESP: id }, "temperature dateTime unidad", { sort: { dateTime: -1 } })
                    .lean();

                if (!ultimaTemperatura) {
                    return { id_ESP: id, mensaje: "No se encontraron registros." };
                }

                // Obtener el último valor del array de temperaturas
                const ultimoValor = ultimaTemperatura.temperature.at(-1);

                return {
                    id_ESP: id,
                    temperatura: ultimoValor,
                    fechaHora: ultimaTemperatura.dateTime.toISOString(),
                };
            })
        );

        res.status(200).json(temperaturas);

    } catch (error) {
        console.error("❌ Error al obtener las últimas temperaturas:", error);
        res.status(500).json({ mensaje: "Error interno en el servidor", error });
    }
  });

  // Ruta para obtener temperaturas mas actual de varios ESPs (de un solo usuario)
  routeTemperaturas.post("/actual/admin", async (req, res) => {
    try {
        // ✅ Obtener todos los ESPs sin necesidad de IDs específicos
        const espData = await esp32Schema.find()
            .select("_id modelo codigo alarma statusActivity typeEquipmentAsigned statusWifi details dateCreate usuario")
            .lean();

        if (!espData || espData.length === 0) {
            return res.status(404).json({ mensaje: "❌ No se encontraron ESPs registrados." });
        }

        // ✅ Obtener la última temperatura de cada `id_ESP`
        const temperaturas = await Promise.all(
            espData.map(async (esp) => {
                const ultimaTemperatura = await temperatureSchema
                    .findOne({ id_ESP: esp._id }, "temperature dateTime unidad", { sort: { dateTime: -1 } })
                    .lean();

                if (!ultimaTemperatura) {
                    return { id_ESP: esp._id, mensaje: "No hay registros de temperatura." };
                }

                // ✅ Extraer el último valor del array de temperaturas
                const ultimoValor = ultimaTemperatura.temperature.at(-1);

                return {
                    id_ESP: esp._id,
                    temperatura: ultimoValor,
                    fechaHora: ultimaTemperatura.dateTime.toISOString(),
                    unidad: ultimaTemperatura.unidad
                };
            })
        );

        // ✅ Fusionar datos de ESPs con sus temperaturas
        const datosCombinados = espData.map(esp => {
            const tempData = temperaturas.find(t => t.id_ESP === esp._id) || {};

            return {
                _id: esp._id,
                modelo: esp.modelo,
                codigo: esp.codigo,
                alarma: esp.alarma?.$numberDecimal || null,
                statusActivity: esp.statusActivity,
                typeEquipmentAsigned: esp.typeEquipmentAsigned,
                statusWifi: esp.statusWifi,
                details: esp.details,
                dateCreate: esp.dateCreate,
                usuario: {
                    _id: esp.usuario?._id || null,
                    userName: esp.usuario?.userName || "No disponible",
                    status: esp.usuario?.status || false
                },
                temperatura: tempData.temperatura || null,
                fechaHora: tempData.fechaHora || null,
                unidad: tempData.unidad || null
            };
        });

        res.status(200).json(datosCombinados);

    } catch (error) {
        console.error("❌ Error al obtener los ESPs y sus temperaturas:", error);
        res.status(500).json({ mensaje: "Error interno en el servidor", error });
    }
  });

  // Ruta para obtener temperaturas mas actual
  routeTemperaturas.get("/actual/:id_ESP", async (req, res) => {
    try {
      const { id_ESP } = req.params;

      // Optimización: Obtener solo los campos necesarios y usar `.lean()` para rapidez
      const ultimaTemperatura = await temperatureSchema
        .findOne({ id_ESP }, "temperature dateTime unidad", { sort: { dateTime: -1 } }) 
        .lean();

      if (!ultimaTemperatura) {
        return res.status(404).json({ mensaje: "No se encontraron registros de temperatura para este ESP32" });
      }

      // Ultima Temperatura de la lista
      const temperaturas = ultimaTemperatura.temperature
      // Obtener el último valor del array
      const ultimoValor = temperaturas[temperaturas.length - 1];

      // Respuesta con formato ISO 8601
      res.status(200).json({
        temperatura: ultimoValor,
        fechaHora: ultimaTemperatura.dateTime.toISOString(), 
      });

    } catch (error) {
      console.error("❌ Error al obtener la última temperatura:", error);
      res.status(500).json({ mensaje: "Error al obtener la última temperatura", error });
    }
  });

  routeTemperaturas.get("/diaria/:id_ESP", async (req, res) => {
    try {
    const { id_ESP } = req.params;
    const temperaturas = await temperatureSchema.find({ id_ESP }, { temperature: 1, dateTime: 1, _id: 0 }).lean();

    res.status(200).json(temperaturas);
    } catch (error) {
      res.status(500).json({ mensaje: "Error al obtener Temperaturas del día", error });
    }
  });



export default routeTemperaturas;
