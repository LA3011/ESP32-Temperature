import express from "express"
import alertas from "../models/alertas.mjs"
import esp32Schema from "../models/esp32.mjs"

const routeAlertas = express.Router()

// Ver Alertas + ESP32 (historial)
routeAlertas.get("/historial", async (req, res) => {
  try {
    // Obtener todas las alertas y los dispositivos ESP32 relacionados en una sola consulta
    const alertasEncontradas = await alertas.find().lean();
    const idsESP32 = alertasEncontradas.map(alerta => alerta.id_ESP);

    // Consultar los dispositivos ESP32 relacionados y convertirlos en un mapa para búsqueda rápida
    const dispositivosESP = await esp32Schema.find({ _id: { $in: idsESP32 } }).lean();
    const mapaDispositivosESP = new Map(dispositivosESP.map(esp => [esp._id.toString(), esp]));

    // Asociar cada alerta con su dispositivo ESP32 sin usar `.find()` dentro del `.map()`
    const alertasConESP32 = alertasEncontradas.map(alerta => ({
      ...alerta,
      esp32_info: mapaDispositivosESP.get(alerta.id_ESP) || null // 🔥 Búsqueda optimizada en `Map`
    }));

    if (alertasConESP32.length === 0) {
      return res.json(false); // "No se encontraron alertas con ESP32 relacionados"
    }

    res.status(200).json(alertasConESP32);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener alertas con ESP32", error });
  }


});

// Ver Alertas + ESP32 (actuales)
routeAlertas.get("/actuales", async (req, res) => {
  try {
    // ✅ Obtener solo las alertas activas
    const alertasEncontradas = await alertas.find({ status: true }).lean();
    
    if (alertasEncontradas.length === 0) {
      return res.json(false); // { mensaje: "No se encontraron alertas activas." }
    }

    // ✅ Obtener los IDs únicos de ESP32 relacionados
    const idsESP32 = alertasEncontradas.map(alerta => alerta.id_ESP);

    // ✅ Consultar los dispositivos ESP32 relacionados y convertirlos en un mapa
    const dispositivosESP = await esp32Schema.find({ _id: { $in: idsESP32 } }).lean();
    const mapaDispositivosESP = new Map(dispositivosESP.map(esp => [esp._id.toString(), esp]));

    // ✅ Formatear fechas y asociar ESP32 con las alertas
    const alertasConESP32 = alertasEncontradas.map(alerta => {
      const fecha = new Date(alerta.dateCreate);

      // Ajustar hora local (Venezuela UTC-4)
      const horasLocal = fecha.getUTCHours() - 4;
      const minutos = fecha.getUTCMinutes();

      // Determinar AM o PM
      const meridiam = horasLocal >= 12 ? "p.m." : "a.m.";

      // Convertir a formato 12 horas
      const horas12 = (horasLocal % 12) || 12;

      // Formatear fecha "dd/mm/yy"
      const dia = fecha.getUTCDate().toString().padStart(2, "0");
      const mes = (fecha.getUTCMonth() + 1).toString().padStart(2, "0");
      const año = fecha.getUTCFullYear().toString().slice(-2);

      const fechaFormateada = `${dia}/${mes}/${año}`;
      const horaFormateada = `${horas12}:${minutos.toString().padStart(2, "0")}`;

      return {
        ...alerta,
        esp32_info: mapaDispositivosESP.get(alerta.id_ESP) || null, // 🔥 Relación con ESP32 optimizada
        fecha: fechaFormateada, // 📆 Formato "dd/mm/yy"
        hora12: horaFormateada, // ⏰ Formato 12 horas
        meridiam: meridiam, // ✅ "a.m." o "p.m."
        timestamp: fecha.getTime() // 📌 Para ordenar por fecha más reciente
      };
    });

    // 🔥 **Ordenar de más reciente a más antiguo**
    alertasConESP32.sort((a, b) => b.timestamp - a.timestamp);

    res.status(200).json(alertasConESP32);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener alertas activas con ESP32", error });
  }
});

// Crear Alerta
routeAlertas.post("/", async (req, res) => {
  try {
    const { id_ESP, temperature } = req.body;
    const dateTime = new Date(); // Obtener la fecha actual en UTC
    const fecha = dateTime.setHours(dateTime.getHours() - 4);
    // Validar que los datos esenciales no estén vacíos
    if (!id_ESP || temperature === undefined) {
      return res.status(400).json({ mensaje: "Faltan datos obligatorios para crear la alerta." });
    }

    // Crear instancia de la nueva alerta
    const alerts = new alertas({
      id_ESP,
      dateCreate: fecha, 
      temperature,
      status: true
    });

    // Guardar alerta en la base de datos
    const alertaGuardada = await alerts.save();
    res.status(201).json({"Alerta creada correctamente": alertaGuardada});

    // Ejemplo de data
    // {
    //     "id_ESP": "6829da39a0acf31007cd184c",
    //     "dateCreate": "2025-05-18T14:30:00.000Z",
    //     "temperature": 5.5
    // }

  } catch (error) {
    res.status(500).json({ mensaje: "Error al crear alerta", error });
  }
});

// Eliminar Alerta
routeAlertas.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si la alerta existe antes de eliminar
    const alertaExistente = await alertas.findById(id);
    if (!alertaExistente) {
      return res.status(404).json({ mensaje: "Alerta no encontrada" });
    }

    // Eliminar alerta de la base de datos
    await alertas.findByIdAndDelete(id);
    res.status(200).json({ mensaje: "Alerta eliminada correctamente" });

  } catch (error) {
    res.status(500).json({ mensaje: "Error al eliminar alerta", error });
  }
});

export default routeAlertas