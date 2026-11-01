import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, CheckCircle2 } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const scanHandled = useRef(false);

  useEffect(() => {
    let html5QrCode: Html5Qrcode;

    const timer = setTimeout(() => {
      html5QrCode = new Html5Qrcode('reader');
      
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
      };

      html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (!scanHandled.current) {
            scanHandled.current = true;
            setSuccess(true);
            
            // Haptic feedback if supported
            if (navigator.vibrate) {
              navigator.vibrate(200);
            }
            
            // Pause slightly to show success UI, then trigger callback
            setTimeout(() => {
              onScan(decodedText);
            }, 600);
          }
        },
        () => {
          // Ignore frequent "not found" frame errors
        }
      ).catch((err) => {
        console.error("Camera start error:", err);
        setError('Impossibile accedere alla telecamera. Verifica i permessi o assicurati di usare HTTPS/localhost.');
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col relative">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Tocca lo schermo per mettere a fuoco</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="relative p-0 bg-gray-100" style={{ minHeight: '300px' }}>
          {error ? (
            <div className="text-red-500 text-center p-8">{error}</div>
          ) : (
            <>
              <div id="reader" className="w-full h-full"></div>
              
              {success && (
                <div className="absolute inset-0 bg-green-500/90 flex flex-col items-center justify-center text-white z-10 transition-opacity">
                  <CheckCircle2 className="w-16 h-16 animate-bounce" />
                  <p className="font-bold mt-4 text-xl">Codice Rilevato!</p>
                </div>
              )}
              
              {!success && (
                <div className="absolute top-0 left-0 right-0 p-3 bg-black/50 text-white text-center text-sm z-10">
                  Avvicina la fotocamera al codice a barre ed attendi. La sfocatura si risolverà da sola o toccando lo schermo.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
