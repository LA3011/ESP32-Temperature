// Ejemplo del endpoint en Express que genera el PDF
import express from "express";
import clientesSchema from "../models/clientes.mjs";
import temperatureSchema from "../models/temperaturas.mjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const routeReports = express.Router();

// Función auxiliar para formatear la fecha/hora de la lectura
function formatTempHora(tempId) {
  // Se espera tempId en formato "YYYY-MM-DD HH:mm"
  const parts = tempId.split(" ");
  if (parts.length < 2) {
    return tempId; // en caso de formato inesperado, se devuelve sin cambios
  }
  const datePart = parts[0]; // "YYYY-MM-DD"
  const timePart = parts[1]; // "HH:mm"
  const [year, month, day] = datePart.split("-");
  // Obtener los dos últimos dígitos del año (podrías cambiar a year si prefieres 4 dígitos)
  const shortYear = year.slice(-2);
  return `${day}-${month}-${shortYear} ${timePart}`;
}

routeReports.post("/", async (req, res) => {
  try {
    const { id_ESP, id_usuario } = req.body;

    // Consulta de temperaturas cada 15 minutos, ajustando la hora a Venezuela (24hr - America/Caracas)
    const temperaturasPor15Minutos = await temperatureSchema.aggregate([
      { $match: { id_ESP } },
      { $unwind: "$temperature" },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d %H:%M", // Formato de 24 horas
              date: {
                $dateFromParts: {
                  year: { $year: "$dateTime" },
                  month: { $month: "$dateTime" },
                  day: { $dayOfMonth: "$dateTime" },
                  hour: { $hour: "$dateTime" },
                  // Redondea el minuto hacia abajo al múltiplo de 15
                  minute: {
                    $multiply: [
                      { $floor: { $divide: [{ $minute: "$dateTime" }, 15] } },
                      15,
                    ],
                  },
                  second: 0,
                },
              },
              timezone: "America/Caracas",
            },
          },
          // Se toma el primer valor de "temperature" en el intervalo
          temperatura: { $first: "$temperature" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Consulta de datos del cliente
    const infoCliente = await clientesSchema.findOne({ id_usuario: id_usuario });
    if (!infoCliente) {
      return res
        .status(404)
        .json({ mensaje: "No se encontró ningún cliente con ese id" });
    }
    if (temperaturasPor15Minutos.length === 0) {
      return res.status(404).json({
        mensaje: "No se encontraron registros de temperatura para este ESP32",
      });
    }

    // Formatear la fecha para la cabecera del reporte en formato dd-mm-aaaa
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const aaaa = now.getFullYear();
    const formattedDate = `${dd}-${mm}-${aaaa}`;

    // Crear el documento PDF y la primera página
    const pdfDoc = await PDFDocument.create();
    let currentPage = pdfDoc.addPage();
    const { width, height } = currentPage.getSize();
    const margen = 60;
    const tamanoFuente = 12;
    const lineHeight = 14;
    const fuente = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Líneas de texto alineadas a la izquierda (con la fecha formateada)
    const leftLines = [
      `Fecha del Reporte: ${formattedDate}`,
      "",
      "  - INFORMACIÓN DEL CLIENTE:",
      `      Nombre    : ${infoCliente.name} ${infoCliente.lastName}`,
      `      Dirección : ${infoCliente.address}`,
      `      Correo    : ${infoCliente.email}`,
      `      Teléfono  : ${infoCliente.tlf}`,
    ];

    // Líneas de texto centradas
    const centerLines = [
      "",
      "              REPORTE DE TEMPERATURAS DEL DÍA            ",
      "",
      "=========================================================",
      "    LECTURAS DE TEMPERATURA (cada 15 min, Venezuela)    ",
      "=========================================================",
    ];

    // Agregar lecturas de temperatura al arreglo de líneas centradas,
    // usando la función auxiliar para formatear la hora.
    temperaturasPor15Minutos.forEach((temp, index) => {
      centerLines.push(
        `${(index + 1)
          .toString()
          .padStart(2, "0")}.   Fecha/Hora: ${formatTempHora(temp._id)}  |  Temperatura: ${temp.temperatura.toFixed(2)} °C`
      );
    });

    // Posición vertical inicial
    let currentY = height - margen;

    // Dibujar las líneas alineadas a la izquierda
    leftLines.forEach((line) => {
      currentPage.drawText(line, {
        x: margen,
        y: currentY,
        size: tamanoFuente,
        font: fuente,
        color: rgb(0, 0, 0),
      });
      currentY -= lineHeight;
    });

    // Insertar la imagen del logo en la parte superior derecha
    const rutaRelativaLogo = path.join(
      __dirname,
      "..",
      "..",
      "assets",
      "img",
      "logo-report.jpg"
    );
    const imageBytes = fs.readFileSync(rutaRelativaLogo);
    const imagen = await pdfDoc.embedJpg(imageBytes);
    const imageScale = 0.5; // Factor de escala
    const { width: imgWidth, height: imgHeight } = imagen.scale(imageScale);

    const xLogo = width - imgWidth;
    const yLogo = height - imgHeight;

    currentPage.drawImage(imagen, {
      x: xLogo,
      y: yLogo,
      width: imgWidth,
      height: imgHeight,
    });

    // Dibujar las líneas centradas y verificar el margen inferior para salto de página.
    centerLines.forEach((line) => {
      if (currentY - lineHeight < margen) {
        currentPage = pdfDoc.addPage();
        currentY = height - margen;
      }
      const textWidth = fuente.widthOfTextAtSize(line, tamanoFuente);
      const centerX = (width - textWidth) / 2;
      currentPage.drawText(line, {
        x: centerX,
        y: currentY,
        size: tamanoFuente,
        font: fuente,
        color: rgb(0, 0, 0),
      });
      currentY -= lineHeight;
    });

    // Guardar el PDF y enviarlo como respuesta en formato Base64
    const pdfBytes = await pdfDoc.save();
    const base64Pdf = Buffer.from(pdfBytes).toString("base64");
    res.json({
      success: true,
      pdf: base64Pdf,
      filename: "reporte.pdf"
    });
  } catch (error) {
    console.error("Error generando el reporte:", error);
    res.status(500).json({ mensaje: "Error interno en el servidor", error });
  }
});

export default routeReports;
