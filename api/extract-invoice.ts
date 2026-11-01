import { GoogleGenAI } from "@google/genai";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY non configurata. Devi aggiungere questa variabile nelle impostazioni (Environment Variables) del tuo progetto su Vercel e fare un Redeploy." });
    }

    const { image, mimeType } = req.body || {};
    if (!image || !mimeType) {
      return res.status(400).json({ error: "Nessun file caricato (image o mimeType mancante)." });
    }

    const base64Data = image;

    const prompt = `Analizza questa fattura (o scontrino) ed estrai in modo PRECISISSIMO tutte le righe del documento.
Regole fondamentali:
1. Devi includere TUTTE le voci, anche i costi di spedizione, consegna o servizi (es. "CONSEGNA IN VIA...", "TRASPORTO", ecc).
2. Se la quantità indicata nel documento è 0, devi impostare quantity: 0. Non ignorarla e non inventare valori.
3. Devi estrarre e parsare il prezzo UNITARIO nel campo "price" convertendolo in formato numerico "10.00" (se non c'è, metti "0.00").
4. Output strettamente in JSON come array di oggetti. NESSUN TESTo PRECEDENTE, SOLO JSON.

Struttura JSON:
[{ "name": "Nome Prodotto esatto", "price": 10.50, "quantity": 0, "unit": "pz", "barcode": "", "category": "Categoria" }]`;

    const maxRetries = 3;
    let response;
    let responseText = "[]";
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType,
                },
              },
              { text: prompt },
            ],
          },
        });
        responseText = await response.text;
        break; // Usciamo dal loop se la chiamata ha successo
      } catch (genAiError: any) {
        console.error(`Errore GenAI tentativo ${attempt}:`, genAiError);
        const errorMessage = genAiError.message || genAiError.toString();
        
        // Se è un errore 503 (sovraccarico) e abbiamo ancora tentativi, aspettiamo
        if ((errorMessage.includes("503") || errorMessage.includes("UNAVAILABLE") || errorMessage.includes("Overloaded")) && attempt < maxRetries) {
          const delay = attempt * 1500; // 1.5s, 3.0s aspettare
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Se l'errore è un 429 (Quota exceeded logica)
        if (errorMessage.includes("429") || errorMessage.includes("Quota exceeded") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
           throw new Error(`Limite utilizzo IA superato. Il server Google ha risposto: ${errorMessage}. Attendi o verifica il tuo piano API.`);
        }
        
        // Altrimenti lanciamo l'errore per gestirlo nel blocco catch esterno
        throw genAiError;
      }
    }
    if (!responseText) responseText = "[]";
    
    // Rimuovi eventuali blocchi markdown
    if (responseText.match(/```(?:json)?/)) {
      responseText = responseText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    
    // pulizia finale in caso ci sia testo prima o dopo l'array
    const startIndex = responseText.indexOf('[');
    const endIndex = responseText.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
        responseText = responseText.substring(startIndex, endIndex + 1);
    }

    const extractedItems = JSON.parse(responseText);
    return res.status(200).json({ items: extractedItems });

  } catch (error: any) {
    console.error("Errore GenAI:", error);
    let errorMessage = error.message || error.toString();
    if (errorMessage.includes("503") || errorMessage.includes("UNAVAILABLE")) {
       errorMessage = "Servizio temporaneamente sovraccarico (503). Riprova tra qualche istante.";
    }
    return res.status(500).json({ error: "Errore durante l'elaborazione", details: errorMessage });
  }
}
