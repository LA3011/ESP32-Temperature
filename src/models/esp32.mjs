import mongoose from "mongoose";

// Esquema de equipos ESP32
const esp32Schema = new mongoose.Schema({
  alarma: {
    type: mongoose.Types.Decimal128, 
    required: true,
  },
  modelo: {
    type: String,
    required: true,
  },
  codigo: {
    type: String,
    required: true,
  },
  typeEquipmentAsigned: {
    type: String,
    required: true,
  },
  statusWifi: {
    type: Boolean,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  dateCreate: {
    type: Date, 
    required: true,
  },
  statusActivity: {
    type: Boolean, 
    default: true,
  }
});

// Exportando el modelo
export default mongoose.model("esp32", esp32Schema);
