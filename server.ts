import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // Gemini API Initialization
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/extract-invoice", async (req, res) => {
    try {
      if (!ai) {
        return res.status(500).json({ error: "GEMINI_API_KEY non configurata." });
      }

      const { image, mimeType } = req.body;
      if (!image || !mimeType) {
        return res.status(400).json({ error: "Nessun file caricato." });
      }

      const base64Data = image;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: "Analizza questa fattura o scontrino ed estrai tutti gli articoli elencati. Per ogni articolo, fornisci il nome del prodotto, la quantità acquistata, il costo totale (o unitario se preferisci, ma specificando), l'unità di misura (se presente, es. kg, litri, pezzi) e il codice a barre/EAN se visibile. L'output deve essere strettamente conforme allo schema JSON fornito.",
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  description: "Nome o descrizione del prodotto",
                },
                quantity: {
                  type: Type.NUMBER,
                  description: "Quantità acquistata",
                },
                price: {
                  type: Type.NUMBER,
                  description: "Costo totale o unitario dell'articolo",
                },
                unit: {
                  type: Type.STRING,
                  description: "Unità di misura (es. pz, kg, L)",
                },
                barcode: {
                  type: Type.STRING,
                  description: "Codice a barre o SKU se presente, altrimenti stringa vuota",
                },
                category: {
                  type: Type.STRING,
                  description: "Suggerisci una categoria (es. Pulizia, Biancheria, Dispensa, Altro)",
                }
              },
              required: ["name", "quantity", "price"],
            },
          },
        },
      });

      let responseText = response.text || "[]";
      // Rimuovi eventuali blocchi markdown ```json ... ```
      if (responseText.match(/```(?:json)?/)) {
        responseText = responseText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      
      const extractedItems = JSON.parse(responseText);
      res.json({ items: extractedItems });

    } catch (error) {
      console.error("Errore analisi fattura:", error);
      res.status(500).json({ error: "Errore durante l'analisi dell'immagine.", details: String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    
    // Su Vercel non eseguiamo app.listen ma esportiamo l'app
    if (!process.env.VERCEL) {
      app.use(express.static(distPath));
      app.get("*all", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
      
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }

  return app;
}

const appPromise = startServer();
// Esporta la promise/app per i runtime serverless (es. Vercel)
export default async function (req: any, res: any) {
  const app = await appPromise;
  app(req, res);
}

