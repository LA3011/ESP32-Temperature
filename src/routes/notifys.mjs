import express from "express"
import notifys from "../models/notifys.mjs"
import mongoose from "mongoose";
import esp32Schema from '../models/esp32.mjs'

const routeNotifys = express.Router()

  // Ver Notificaciones + ESP32 (historial)
  routeNotifys.get("/historial", async (req, res) => {
     try {
    // ✅ Obtener solo las alertas con `status: false`
    const alertasEncontradas = await notifys.find({ status: false }).lean();
    
    if (alertasEncontradas.length === 0) {
      return res.json(false); // 🔸 No hay alertas inactivas
    }

    // ✅ Filtrar IDs válidos antes de convertirlos en `ObjectId`
    const idsESP32 = alertasEncontradas
      .filter(alerta => mongoose.Types.ObjectId.isValid(alerta.id_ESP)) // ✅ Solo IDs válidos
      .map(alerta => new mongoose.Types.ObjectId(alerta.id_ESP));

    // ✅ Consultar los dispositivos ESP32 relacionados y convertirlos en un mapa
    const dispositivosESP = await esp32Schema.find({ _id: { $in: idsESP32 } }).lean();
    const mapaDispositivosESP = new Map(dispositivosESP.map(esp => [esp._id.toString(), esp]));

    // ✅ Formatear fechas y asociar ESP32 con las alertas
    const alertasConESP32 = alertasEncontradas.map(alerta => {
      const fecha = new Date(alerta.dateCreate);

      // 📌 Ajustar hora local a Venezuela (UTC-4) sin modificar el objeto original
      fecha.setHours(fecha.getUTCHours() - 4);

      // 📌 Obtener formato de hora 12h con AM/PM
      const horas12 = (fecha.getHours() % 12) || 12;
      const minutos = fecha.getMinutes().toString().padStart(2, "0");
      const meridiam = fecha.getHours() >= 12 ? "p.m." : "a.m.";

      // 📌 Formatear fecha en "dd/mm/yy"
      const dia = fecha.getDate().toString().padStart(2, "0");
      const mes = (fecha.getMonth() + 1).toString().padStart(2, "0");
      const año = fecha.getFullYear().toString().slice(-2);

      return {
        ...alerta,
        esp32_info: mapaDispositivosESP.get(alerta.id_ESP) || null, // 🔥 Relación con ESP32 optimizada
        fecha: `${dia}/${mes}/${año}`, // 📆 Formato "dd/mm/yy"
        hora12: `${horas12}:${minutos}`, // ⏰ Formato 12 horas
        meridiam: meridiam, // ✅ "a.m." o "p.m."
        timestamp: fecha.getTime() // 📌 Para ordenar por fecha más reciente
      };
    });

    // 🔥 **Ordenar de más reciente a más antiguo**
    alertasConESP32.sort((a, b) => b.timestamp - a.timestamp);

    res.status(200).json(alertasConESP32);
  } catch (error) {
    console.error("❌ Error al obtener alertas inactivas con ESP32:", error);
    res.status(500).json({ mensaje: "❌ Error interno del servidor", error });
  }
  });

  // Ver Notificaciones + ESP32 (actuales)
  routeNotifys.get("/actuales", async (req, res) => {
  try {
    // ✅ Obtener solo las alertas activas
    const alertasEncontradas = await notifys.find({ status: true }).lean();
    
    if (alertasEncontradas.length === 0) {
      return res.json(false); // 🔸 No hay alertas activas
    }

    // ✅ Obtener los IDs únicos de ESP32 relacionados
    const idsESP32 = alertasEncontradas.map(alerta => new mongoose.Types.ObjectId(alerta.id_ESP));

    // ✅ Consultar los dispositivos ESP32 relacionados y convertirlos en un mapa
    const dispositivosESP = await esp32Schema.find({ _id: { $in: idsESP32 } }).lean();
    const mapaDispositivosESP = new Map(dispositivosESP.map(esp => [esp._id.toString(), esp]));

    // ✅ Formatear fechas y asociar ESP32 con las alertas
    const alertasConESP32 = alertasEncontradas.map(alerta => {
      const fecha = new Date(alerta.dateCreate);

      // 📌 Ajustar hora local a Venezuela (UTC-4) sin modificar el objeto original
      fecha.setHours(fecha.getUTCHours() - 4);

      // 📌 Obtener formato de hora 12h con AM/PM
      const horas12 = (fecha.getHours() % 12) || 12;
      const minutos = fecha.getMinutes().toString().padStart(2, "0");
      const meridiam = fecha.getHours() >= 12 ? "p.m." : "a.m.";

      // 📌 Formatear fecha en "dd/mm/yy"
      const dia = fecha.getDate().toString().padStart(2, "0");
      const mes = (fecha.getMonth() + 1).toString().padStart(2, "0");
      const año = fecha.getFullYear().toString().slice(-2);

      return {
        ...alerta,
        esp32_info: mapaDispositivosESP.get(alerta.id_ESP) || null, // 🔥 Relación con ESP32 optimizada
        fecha: `${dia}/${mes}/${año}`, // 📆 Formato "dd/mm/yy"
        hora12: `${horas12}:${minutos}`, // ⏰ Formato 12 horas
        meridiam: meridiam, // ✅ "a.m." o "p.m."
        timestamp: fecha.getTime() // 📌 Para ordenar por fecha más reciente
      };
    });

    // 🔥 **Ordenar de más reciente a más antiguo**
    alertasConESP32.sort((a, b) => b.timestamp - a.timestamp);

    res.status(200).json(alertasConESP32);
  } catch (error) {
    console.error("❌ Error al obtener alertas activas con ESP32:", error);
    res.status(500).json({ mensaje: "❌ Error interno del servidor", error });
  }

  });

  // Actualiza Notificaciones (Status 'false' en base IDs ESP)
  routeNotifys.put("/", async (req, res) => {
    try {
      const { id_ESPs } = req.body;

      console.log(id_ESPs)

      if (!Array.isArray(id_ESPs) || id_ESPs.length === 0) {
        return res.json({ mensaje: "❌ Se requiere un array válido de id_ESP." });
      }

      // Actualizar todos los documentos con los `id_ESP` recibidos
      const resultado = await notifys.updateMany(
        { id_ESP: { $in: id_ESPs } }, // Filtrar por todos los IDs en el array
        { $set: { status: false } }  // 🔹 Cambia `status` a `false`
      );

      if (resultado.modifiedCount === 0) {
        return res.json({ mensaje: "🔸 No se encontraron documentos para actualizar." });
      }

      // console.log(`${resultado.modifiedCount} documentos actualizados con id_ESP:`, id_ESP);
      res.status(200).json({ mensaje: `Actualizados ${resultado.modifiedCount} documentos.` });

    } catch (error) {
      console.error("❌ Error al actualizar documentos:", error);
      res.status(500).json({ mensaje: "❌ Error interno del servidor", error });
    }
  });

  // Eliminar Notificaciones (ROOT)
  routeNotifys.delete("/historial", async (req, res) => {
  try {
    // 📌 Eliminar solo documentos donde `status` es `false`
    const resultado = await notifys.deleteMany({ status: false });

    if (resultado.deletedCount === 0) {
      return res.json({ mensaje: "🔸 No hay documentos con `status: false` para eliminar." });
    }

    res.status(200).json({ mensaje: `✅ Eliminados ${resultado.deletedCount} documentos con status false.` });
  } catch (error) {
    console.error("❌ Error al eliminar documentos con status false:", error);
    res.status(500).json({ mensaje: "❌ Error interno del servidor", error });
  }
});


export default routeNotifys