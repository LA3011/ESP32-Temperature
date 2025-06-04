import mongoose from "mongoose";

// Esquema del ESP32
const notifys = new mongoose.Schema({
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
  },
  status: {
    type: Boolean,
    require: true,
    default: true
  },
  id_ESP: {
    type: String,
    require: true,
  }
});

// Exportando el modelo
export default mongoose.model("notifys", notifys);
