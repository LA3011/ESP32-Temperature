import mongoose from "mongoose";
import dotenv from 'dotenv';
// dotenv.config();

// Esquema para registros de temperatura de ESP32
const temperatureSchema = new mongoose.Schema({
  id_ESP: {
    type: String,
    required: true,
  },
  temperature: {
    type: [Number], 
    required: true,
  },
  dateTime: {
    type: Date, 
    required: true,
    index: { expires: process.env.timeTemperature } // ⏳ Configura el TTL correctamente en `index`
  },
  unidad: {
    type: String, 
    required: true,
    default: process.env.UNIDAD_TEMP, 
  }
});

// Asegurar que el índice TTL esté activo
temperatureSchema.index({ dateTime: 1 }, { expireAfterSeconds: process.env.timeTemperature });

// Exportando el modelo basado en el esquema
export default mongoose.model("temperature1days", temperatureSchema); // 7637 documentos (10.6 hrs)


// crear coleccion
// db.temperaturetest24hrs.createIndex({ dateTime: 1 }, { expireAfterSeconds: 86400 }) --> 7637 documentos (10.6 hrs)
// ver indice en la coleccion 
// db.temperaturetest5ms.getIndexes()

