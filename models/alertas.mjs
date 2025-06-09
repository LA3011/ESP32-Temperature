import mongoose from "mongoose";

// Esquema del ESP32
const alerts = new mongoose.Schema({
  id_ESP: {
    type: String,
    required: true
  },
  dateCreate: {
    type: Date, 
    required: true
  },
  temperature: {
    type: Number, 
    required: true
  }
});

// Exportando el modelo
export default mongoose.model("alerts", alerts);
